// @oktis-works/database - Migration Runner Tests (REQ-database-migrations)

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

type TaggedCall = { kind: 'tagged'; text: string; values: unknown[] };
type UnsafeCall = { kind: 'unsafe'; query: string };
type Call = TaggedCall | UnsafeCall;

let calls: Call[];
let selectResults: Record<string, unknown[]>;
let unsafeError: Error | null;
let client: ReturnType<typeof makeClient>;

function makeClient() {
  const respond = (text: string): unknown[] => {
    for (const [needle, rows] of Object.entries(selectResults)) {
      if (text.includes(needle)) return rows;
    }
    return [];
  };
  const tag = (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join('?');
    calls.push({ kind: 'tagged', text, values });
    return Promise.resolve(respond(text));
  };
  const c = Object.assign(tag, {
    unsafe: vi.fn(async (query: string) => {
      calls.push({ kind: 'unsafe', query });
      if (unsafeError) throw unsafeError;
      return respond(query);
    }),
    begin: vi.fn(async (fn: (tx: typeof c) => Promise<void>) => {
      calls.push({ kind: 'tagged', text: '__BEGIN__', values: [] });
      await fn(c);
    }),
  });
  return c;
}

vi.mock('../connection.js', () => ({ getConnection: vi.fn() }));

import { getConnection } from '../connection.js';
import {
  loadMigrationsFromDir,
  applyMigration,
  rollbackMigration,
  runMigrations,
  type MigrationFile,
} from './runner.js';

beforeEach(() => {
  calls = [];
  selectResults = {};
  unsafeError = null;
  client = makeClient();
  vi.mocked(getConnection).mockReturnValue(client as never);
});

const sha256 = (content: string) => createHash('sha256').update(content).digest('hex');

function withMigrations(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'bl-migrations-'));
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(dir, name), content, 'utf-8');
  }
  return dir;
}

describe('loadMigrationsFromDir', () => {
  it('carrega migrations .sql ordenadas com version/owner/checksum', () => {
    const dir = withMigrations({
      'V002__core__add_index.sql': 'CREATE INDEX idx ON t(a);',
      'V001__core__create_users.sql': 'CREATE TABLE users (id uuid);',
      'V003__plugin_seo__meta_tables.sql': 'CREATE TABLE seo_meta (id uuid);',
      'README.md': 'ignored',
    });

    const migrations = loadMigrationsFromDir(dir);

    expect(migrations.map((m) => m.version)).toEqual(['001', '002', '003']);
    expect(migrations[0]!.ownerType).toBe('CORE');
    expect(migrations[2]!.owner).toBe('plugin_seo');
    expect(migrations[2]!.ownerType).toBe('PLUGIN');
    expect(migrations[0]!.checksum).toBe(sha256('CREATE TABLE users (id uuid);'));
    rmSync(dir, { recursive: true, force: true });
  });

  it('rejeita filename fora do padrão V###__owner__name.sql', () => {
    const dir = withMigrations({ 'migrate-up.sql': 'SELECT 1;' });
    expect(() => loadMigrationsFromDir(dir)).toThrow(/Invalid migration filename/);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('applyMigration', () => {
  const migration: MigrationFile = {
    name: 'create_users',
    version: '001',
    owner: 'core',
    ownerType: 'CORE',
    sql: 'CREATE TABLE users (id uuid);',
    checksum: sha256('CREATE TABLE users (id uuid);'),
  };

  it('pula migration já aplicada (idempotência)', async () => {
    selectResults['SELECT id FROM migrations'] = [{ id: 'existing' }];

    await applyMigration('tenant-1', migration);

    expect(calls.some((c) => 'text' in c && c.text.includes('__BEGIN__'))).toBe(false);
    expect(calls.some((c) => c.kind === 'unsafe')).toBe(false);
  });

  it('executa em transação com tenant context e registra checksum/owner_type', async () => {
    await applyMigration('tenant-1', migration);

    const texts = calls.filter((c): c is TaggedCall => c.kind === 'tagged').map((c) => c.text);
    expect(texts[0]).toContain('SELECT id FROM migrations');
    expect(texts).toContain('__BEGIN__');
    expect(texts.some((t) => t.includes('SET app.current_tenant_id'))).toBe(true);

    const insert = calls.find(
      (c): c is TaggedCall => c.kind === 'tagged' && c.text.includes('INSERT INTO migrations')
    );
    expect(insert!.values).toContain(migration.owner);
    expect(insert!.values).toContain(migration.checksum);
    expect(insert!.values).toContain('CORE');

    const unsafe = calls.find((c): c is UnsafeCall => c.kind === 'unsafe');
    expect(unsafe!.query).toBe(migration.sql);
  });
});

describe('runMigrations', () => {
  it('aplica pendentes e pula já aplicadas', async () => {
    const dir = withMigrations({
      'V001__core__a.sql': 'CREATE TABLE a();',
      'V002__core__b.sql': 'CREATE TABLE b();',
    });
    selectResults['FROM migrations'] = [
      { id: '1', owner: 'core', version: '001', name: 'a', tenant_id: 'tenant-1', owner_type: 'CORE', applied_at: new Date(), checksum: 'x' },
    ];

    const result = await runMigrations('tenant-1', dir);

    expect(result.skipped).toEqual(['a']);
    expect(result.applied).toEqual(['b']);
    rmSync(dir, { recursive: true, force: true });
  });

  it('encapsula falha com nome da migration', async () => {
    const dir = withMigrations({ 'V001__core__boom.sql': 'INVALID SQL;' });
    unsafeError = new Error('syntax error');

    await expect(runMigrations('tenant-1', dir)).rejects.toThrow(
      /Migration failed: boom - syntax error/
    );
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('rollbackMigration', () => {
  it('rejeita rollback sem marcador -- +migrate Down', async () => {
    selectResults['FROM migrations'] = [{ id: 'applied' }];

    await expect(
      rollbackMigration('tenant-1', {
        name: 'no_down',
        version: '001',
        owner: 'core',
        ownerType: 'CORE',
        sql: '-- +migrate Up\nCREATE TABLE x();',
        checksum: 'c',
      })
    ).rejects.toThrow(/No rollback defined/);
  });

  it('executa bloco Down em transação e remove registro', async () => {
    selectResults['FROM migrations'] = [{ id: 'applied' }];

    await rollbackMigration('tenant-1', {
      name: 'with_down',
      version: '001',
      owner: 'core',
      ownerType: 'CORE',
      sql: '-- +migrate Up\nCREATE TABLE x();\n-- +migrate Down\nDROP TABLE x();',
      checksum: 'c',
    });

    const unsafe = calls.find((c): c is UnsafeCall => c.kind === 'unsafe');
    expect(unsafe!.query).toBe('DROP TABLE x();');
    const del = calls.find(
      (c): c is TaggedCall => c.kind === 'tagged' && c.text.includes('DELETE FROM migrations')
    );
    expect(del).toBeTruthy();
  });

  it('não faz nada se migration nunca foi aplicada', async () => {
    await rollbackMigration('tenant-1', {
      name: 'never_applied',
      version: '009',
      owner: 'core',
      ownerType: 'CORE',
      sql: '-- +migrate Up\nCREATE TABLE x();\n-- +migrate Down\nDROP TABLE x();',
      checksum: 'c',
    });

    expect(calls.some((c) => c.kind === 'unsafe')).toBe(false);
  });
});
