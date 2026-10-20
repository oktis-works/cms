// @oktis-works/plugin-runtime - PluginAPI: api.assets (Item 8)
//
// Covers the asset enqueue surface: assets:enqueue permission, src
// validation (http(s):// or root-relative), per-plugin URL dedupe and
// internal.getEnqueuedAssets + bootstrap scope collection.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { bootstrapPlugins, resetLoadedPlugins, getLoadedPluginAssets } from './bootstrap.js';
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
    manifest: { name: 'assets-plugin', version: '1.0.0' } as PluginApiDependencies['manifest'],
    settings: { get: vi.fn(async () => undefined), set: vi.fn(async () => {}) },
    eventBus: { emit: vi.fn(async () => {}) },
    db: { query: vi.fn(async () => []) },
    getTenantId: () => null,
    getUserId: () => 'user-123',
    getRequestId: () => 'req-456',
    getTenantById: vi.fn(async (id: string) => ({ id, name: 'T', slug: 't' })),
    allowedPermissions: ['assets:enqueue'],
    ...overrides,
  } as PluginApiDependencies;
}

beforeEach(() => {
  pluginsDir = mkdtempSync(join(tmpdir(), 'bl-assets-'));
  registry = new HookRegistry();
  resetLoadedPlugins(registry);
});

afterEach(() => {
  resetLoadedPlugins(registry);
  rmSync(pluginsDir, { recursive: true, force: true });
});

describe('api.assets (Item 8)', () => {
  it('enqueues styles and scripts with defaults and pluginName', () => {
    const { api, internal } = createPluginApi(createDeps());

    api.assets.enqueueStyle({ src: 'https://cdn.example.com/reset.css', integrity: 'sha384-abc', crossOrigin: 'anonymous' });
    api.assets.enqueueScript({ src: '/plugins/assets-plugin/tracker.js', strategy: 'defer', placement: 'footer', version: '1.2.0' });

    const assets = internal.getEnqueuedAssets();
    expect(assets).toHaveLength(2);
    expect(assets[0]).toMatchObject({ kind: 'style', src: 'https://cdn.example.com/reset.css', pluginName: 'assets-plugin' });
    expect(assets[1]).toMatchObject({ kind: 'script', strategy: 'defer', placement: 'footer', version: '1.2.0' });
  });

  it('denies enqueue without the assets:enqueue permission', () => {
    const { api } = createPluginApi(createDeps({ allowedPermissions: [] }));
    expect(() => api.assets.enqueueStyle({ src: 'https://x.example/a.css' })).toThrow(/assets:enqueue/);
    expect(() => api.assets.enqueueScript({ src: 'https://x.example/a.js' })).toThrow(/assets:enqueue/);
  });

  it('rejects invalid src values (no javascript:, no protocol-relative)', () => {
    const { api } = createPluginApi(createDeps());
    expect(() => api.assets.enqueueStyle({ src: 'javascript:alert(1)' })).toThrow(/Invalid asset src/);
    expect(() => api.assets.enqueueScript({ src: '//cdn.example/x.js' })).toThrow(/Invalid asset src/);
    expect(() => api.assets.enqueueScript({ src: '' })).toThrow(/Invalid asset src/);
  });

  it('dedupes repeated URLs inside the plugin (no-op)', () => {
    const { api, internal } = createPluginApi(createDeps());
    api.assets.enqueueStyle({ src: 'https://cdn.example.com/font.css' });
    api.assets.enqueueStyle({ src: 'https://cdn.example.com/font.css', version: '2' });
    expect(internal.getEnqueuedAssets()).toHaveLength(1);
  });

  it('reports enqueued assets per scope after bootstrap', async () => {
    writePlugin(
      'assets-plugin',
      `
      export async function register(api) {
        api.assets.enqueueStyle({ src: 'https://cdn.example.com/widget.css' });
      }
      `,
      { permissions: ['assets:enqueue'] }
    );
    const sql = sqlWith([{ name: 'assets-plugin' }]);
    const result = await bootstrapPlugins({
      pluginsDir,
      sql,
      registry,
      permissionPolicy: ['assets:enqueue'],
      apiDeps: createDeps(),
    });

    expect(result.loaded).toContain('assets-plugin');
    const entries = getLoadedPluginAssets('platform');
    expect(entries).toHaveLength(1);
    expect(entries[0]?.assets[0]?.src).toBe('https://cdn.example.com/widget.css');
    expect(getLoadedPluginAssets('tenant:missing')).toEqual([]);
  });
});
