// @oktis-works/plugin-runtime - PluginAPI: api.registerPattern (E4 data plane)
//
// WordPress-parity item 13 (pattern registry, no table). Covers:
//   - registerPattern requires the patterns:register permission;
//   - required fields (name/label/content) and duplicate names;
//   - internal.getPatterns exposes registrations with pluginName;
//   - getLoadedPluginPatterns returns patterns per scope after bootstrap.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { bootstrapPlugins, resetLoadedPlugins, getLoadedPluginPatterns } from './bootstrap.js';
import { HookRegistry } from './hook-registry.js';
import { createPluginApi, type PluginApiDependencies } from './plugin-api.js';

let pluginsDir: string;
let registry: HookRegistry;

function writePlugin(name: string, registerJs: string, manifest?: Record<string, unknown>): void {
  const dir = join(pluginsDir, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'manifest.json'),
    JSON.stringify({ name, version: '1.0.0', main: 'index.js', ...manifest })
  );
  writeFileSync(join(dir, 'index.js'), registerJs);
}

function sqlWith(rows: unknown[]) {
  return { unsafe: vi.fn(async (_text: string, _params?: unknown[]) => rows) };
}

function createDeps(overrides: Partial<PluginApiDependencies> = {}): PluginApiDependencies {
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
    manifest: { name: 'patterns-plugin', version: '1.0.0' } as PluginApiDependencies['manifest'],
    settings: { get: vi.fn(async () => undefined), set: vi.fn(async () => {}) },
    eventBus: { emit: vi.fn(async () => {}) },
    db: { query: vi.fn(async () => []) },
    getTenantId: () => null,
    getUserId: () => 'user-123',
    getRequestId: () => 'req-456',
    getTenantById: vi.fn(async (id: string) => ({ id, name: 'T', slug: 't' })),
    allowedPermissions: ['patterns:register'],
    ...overrides,
  } as PluginApiDependencies;
}

const pattern = {
  name: 'hero-section',
  label: 'Hero Section',
  content: '<section class="hero"></section>',
  screens: ['*'],
};

beforeEach(() => {
  pluginsDir = mkdtempSync(join(tmpdir(), 'bl-patterns-'));
  registry = new HookRegistry();
  resetLoadedPlugins(registry);
});

afterEach(() => {
  resetLoadedPlugins(registry);
  rmSync(pluginsDir, { recursive: true, force: true });
});

describe('api.registerPattern (E4)', () => {
  it('registers a pattern and exposes it in internal.getPatterns with pluginName', () => {
    const { api, internal } = createPluginApi(createDeps());

    api.registerPattern(pattern);

    const patterns = internal.getPatterns();
    expect(patterns).toHaveLength(1);
    expect(patterns[0]?.name).toBe('hero-section');
    expect(patterns[0]?.pluginName).toBe('patterns-plugin');
  });

  it('denies registration without the patterns:register permission', () => {
    const { api } = createPluginApi(createDeps({ allowedPermissions: [] }));
    expect(() => api.registerPattern(pattern)).toThrow(/patterns:register/);
  });

  it('requires name, label and content', () => {
    const { api } = createPluginApi(createDeps());
    expect(() => api.registerPattern({ ...pattern, name: '' })).toThrow(/name/);
    expect(() => api.registerPattern({ ...pattern, label: '' })).toThrow(/label/);
    expect(() => api.registerPattern({ ...pattern, content: '' })).toThrow(/content/);
  });

  it('rejects duplicate names within the plugin', () => {
    const { api } = createPluginApi(createDeps());
    api.registerPattern(pattern);
    expect(() => api.registerPattern(pattern)).toThrow(/already registered/);
  });

  it('reports patterns per scope via getLoadedPluginPatterns after bootstrap', async () => {
    writePlugin(
      'patterns-plugin',
      `
      export async function register(api) {
        api.registerPattern({ name: 'cta', label: 'CTA', content: '<a class="cta"></a>' });
      }
      `,
      { permissions: ['patterns:register'] }
    );
    const sql = sqlWith([{ name: 'patterns-plugin' }]);
    const result = await bootstrapPlugins({
      pluginsDir,
      sql,
      registry,
      permissionPolicy: ['patterns:register'],
      apiDeps: createDeps(),
    });

    expect(result.loaded).toContain('patterns-plugin');

    const entries = getLoadedPluginPatterns('platform');
    expect(entries).toHaveLength(1);
    expect(entries[0]?.pluginName).toBe('patterns-plugin');
    expect(entries[0]?.patterns[0]?.name).toBe('cta');
    // unknown scope returns an empty list instead of throwing
    expect(getLoadedPluginPatterns('tenant:missing')).toEqual([]);
  });
});
