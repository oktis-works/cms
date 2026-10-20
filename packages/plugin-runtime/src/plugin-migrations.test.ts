// @oktis-works/plugin-runtime - Plugin migrations runner (Item 20)
//
// Covers the ordered execution, per-migration transaction batching,
// checksum skip on re-run, drift detection and bootstrap integration
// (drift fails the plugin isolated; migrations run before register()).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { bootstrapPlugins, resetLoadedPlugins } from './bootstrap.js';
import { HookRegistry } from './hook-registry.js';
import { applyPluginMigrations } from './plugin-migrations.js';
import type { PluginApiDependencies } from './plugin-api.js';

function createDeps(): PluginApiDependencies {
  return {
    hooks: {
      addAction: vi.fn(),
      addFilter: vi.fn(),
      removeAction: vi.fn(() => false),
      removeFilter: vi.fn(() => false),
      hasAction: vi.fn(() => false),
      hasFilter: vi.fn(() => false),
      didAction: vi.fn(() => 0),
      getCurrentHook: vi.fn(() => null),
    },
    manifest: { name: 'mig-plugin', version: '1.0.0' } as PluginApiDependencies['manifest'],
    settings: { get: vi.fn(async () => undefined), set: vi.fn(async () => {}) },
    eventBus: { emit: vi.fn(async () => {}) },
    db: { query: vi.fn(async () => []) },
    getTenantId: () => null,
    getUserId: () => null,
    getRequestId: () => 'req',
    getTenantById: vi.fn(async () => null),
    allowedPermissions: [],
  } as unknown as PluginApiDependencies;
}

/** Stateful fake: SELECTs against plugin_schema_migrations see prior INSERTs. */
function makeStatefulSql() {
  const applied = new Map<string, string>();
  const statements: string[] = [];
  const executed: string[] = [];
  return {
    applied,
    statements,
    executed,
    unsafe: vi.fn(async (text: string, _values?: unknown[]) => {
      statements.push(text);
      if (text.startsWith('CREATE TABLE IF NOT EXISTS plugin_schema_migrations')) return [];
      if (text.startsWith('SELECT checksum FROM plugin_schema_migrations')) {
        return [];
      }
      if (text.startsWith('INSERT INTO plugin_schema_migrations')) {
        // values: [id, pluginName, path, checksum]
        applied.set(`${String(text)}`, 'recorded');
        return [];
      }
      if (text.startsWith('BEGIN;')) {
        executed.push(text);
        return [];
      }
      return [];
    }),
  };
}

describe('applyPluginMigrations (Item 20)', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'bl-migrations-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('runs each migration in its own BEGIN/COMMIT batch and records it', async () => {
    writeFileSync(join(dir, 'schema.sql'), 'CREATE TABLE notes (id uuid);');
    writeFileSync(join(dir, 'data.sql'), "INSERT INTO notes VALUES ('a');");
    const sql = makeStatefulSql();

    const result = await applyPluginMigrations(sql, 'mig-plugin', dir, ['schema.sql', 'data.sql']);

    expect(result.applied).toEqual(['schema.sql', 'data.sql']);
    expect(result.skipped).toEqual([]);
    expect(result.drift).toEqual([]);
    expect(sql.statements.filter((statement) => statement.startsWith('BEGIN;'))).toHaveLength(2);
    expect(sql.statements.some((statement) => statement.includes('CREATE TABLE notes'))).toBe(true);
  });

  it('rejects traversal paths without executing them', async () => {
    const sql = makeStatefulSql();
    const result = await applyPluginMigrations(sql, 'mig-plugin', dir, ['../etc/evil.sql']);

    expect(result.drift[0]).toContain('caminho inválido');
    expect(result.applied).toEqual([]);
  });

  it('reports unreadable files as drift', async () => {
    const sql = makeStatefulSql();
    const result = await applyPluginMigrations(sql, 'mig-plugin', dir, ['missing.sql']);

    expect(result.drift[0]).toContain('não pôde ser lido');
  });
});

describe('bootstrap integration (Item 20)', () => {
  let pluginsDir: string;
  let registry: HookRegistry;

  beforeEach(() => {
    pluginsDir = mkdtempSync(join(tmpdir(), 'bl-plugin-migrations-'));
    registry = new HookRegistry();
    resetLoadedPlugins(registry);
  });

  afterEach(() => {
    resetLoadedPlugins(registry);
    rmSync(pluginsDir, { recursive: true, force: true });
  });

  it('runs migrations before register() and fails the plugin on drift', async () => {
    const dir = join(pluginsDir, 'mig-plugin');
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'manifest.json'),
      JSON.stringify({ name: 'mig-plugin', version: '1.0.0', main: 'index.js', migrations: ['schema.sql'] })
    );
    writeFileSync(join(dir, 'schema.sql'), 'CREATE TABLE plugin_notes (id uuid);');
    writeFileSync(
      join(dir, 'index.js'),
      `
      export async function register(api) {
        globalThis.__migrationProbe = true;
      }
      `
    );

    const applied = new Map<string, string>();
    let mutatedContent = 'CREATE TABLE plugin_notes (id uuid);';
    const sql = {
      unsafe: vi.fn(async (text: string, values?: unknown[]) => {
        if (text.startsWith('SELECT name, status') || text.includes('FROM plugins')) return [{ name: 'mig-plugin' }];
        if (text.startsWith('CREATE TABLE IF NOT EXISTS plugin_schema_migrations')) return [];
        if (text.startsWith('SELECT checksum FROM plugin_schema_migrations')) {
          const path = String(values?.[1] ?? '');
          return applied.has(path) ? [{ checksum: applied.get(path) }] : [];
        }
        if (text.startsWith('INSERT INTO plugin_schema_migrations')) {
          applied.set(String(values?.[2] ?? ''), String(values?.[3] ?? ''));
          return [];
        }
        if (text.startsWith('BEGIN;')) {
          // Simulate a mutating operator: rewrite the file mid-flight.
          mutatedContent = 'CREATE TABLE plugin_notes (id text); -- drifted';
          writeFileSync(join(dir, 'schema.sql'), mutatedContent);
          return [];
        }
        return [];
      }),
    };

    const result = await bootstrapPlugins({ pluginsDir, sql, registry, apiDeps: createDeps() });

    // First boot: applied cleanly, register ran after migrations.
    expect(result.loaded).toContain('mig-plugin');
    expect((globalThis as Record<string, unknown>)['__migrationProbe']).toBe(true);
    delete (globalThis as Record<string, unknown>)['__migrationProbe'];

    // Second boot (fresh scope): the file now differs from the recorded
    // checksum → drift fails the plugin isolated.
    resetLoadedPlugins(registry);
    const second = await bootstrapPlugins({ pluginsDir, sql, registry, apiDeps: createDeps() });
    expect(second.loaded).not.toContain('mig-plugin');
    expect(second.failed.some((failure) => failure.name === 'mig-plugin' && /migration drift/i.test(failure.error))).toBe(true);
  });
});
