// @oktis-works/plugin-runtime - PluginAPI: api.registerBlock (E3 data plane)
//
// WordPress-parity item E3 (block registry, no table). Covers:
//   - registerBlock requires the blocks:register permission;
//   - required fields (type/label/adminComponentPath) and duplicate types;
//   - internal.getBlocks exposes registrations with pluginName;
//   - getLoadedPluginBlocks returns blocks per scope after bootstrap.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { bootstrapPlugins, resetLoadedPlugins, getLoadedPluginBlocks } from './bootstrap.js';
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
    manifest: { name: 'blocks-plugin', version: '1.0.0' } as PluginApiDependencies['manifest'],
    settings: { get: vi.fn(async () => undefined), set: vi.fn(async () => {}) },
    eventBus: { emit: vi.fn(async () => {}) },
    db: { query: vi.fn(async () => []) },
    getTenantId: () => null,
    getUserId: () => 'user-123',
    getRequestId: () => 'req-456',
    getTenantById: vi.fn(async (id: string) => ({ id, name: 'T', slug: 't' })),
    allowedPermissions: ['blocks:register'],
    ...overrides,
  } as PluginApiDependencies;
}

const block = {
  type: 'product-card',
  label: 'Product Card',
  icon: 'credit-card',
  adminComponentPath: 'blocks-plugin:ProductCard',
};

beforeEach(() => {
  pluginsDir = mkdtempSync(join(tmpdir(), 'bl-blocks-'));
  registry = new HookRegistry();
  resetLoadedPlugins(registry);
});

afterEach(() => {
  resetLoadedPlugins(registry);
  rmSync(pluginsDir, { recursive: true, force: true });
});

describe('api.registerBlock (E3)', () => {
  it('registers a block and exposes it in internal.getBlocks with pluginName', () => {
    const { api, internal } = createPluginApi(createDeps());

    api.registerBlock(block);

    const blocks = internal.getBlocks();
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.type).toBe('product-card');
    expect(blocks[0]?.pluginName).toBe('blocks-plugin');
  });

  it('denies registration without the blocks:register permission', () => {
    const { api } = createPluginApi(createDeps({ allowedPermissions: [] }));
    expect(() => api.registerBlock(block)).toThrow(/blocks:register/);
  });

  it('requires type, label and adminComponentPath', () => {
    const { api } = createPluginApi(createDeps());
    expect(() => api.registerBlock({ ...block, type: '' })).toThrow(/type/);
    expect(() => api.registerBlock({ ...block, label: '' })).toThrow(/label/);
    expect(() => api.registerBlock({ ...block, adminComponentPath: '' })).toThrow(/adminComponentPath/);
  });

  it('rejects duplicate types within the plugin', () => {
    const { api } = createPluginApi(createDeps());
    api.registerBlock(block);
    expect(() => api.registerBlock(block)).toThrow(/already registered/);
  });

  it('reports blocks per scope via getLoadedPluginBlocks after bootstrap', async () => {
    writePlugin(
      'blocks-plugin',
      `
      export async function register(api) {
        api.registerBlock({ type: 'hero', label: 'Hero', icon: 'layout', adminComponentPath: 'blocks-plugin:Hero' });
      }
      `,
      { permissions: ['blocks:register'] }
    );
    const sql = sqlWith([{ name: 'blocks-plugin' }]);
    const result = await bootstrapPlugins({
      pluginsDir,
      sql,
      registry,
      permissionPolicy: ['blocks:register'],
      apiDeps: createDeps(),
    });

    expect(result.loaded).toContain('blocks-plugin');

    const entries = getLoadedPluginBlocks('platform');
    expect(entries).toHaveLength(1);
    expect(entries[0]?.pluginName).toBe('blocks-plugin');
    expect(entries[0]?.blocks[0]?.type).toBe('hero');
    // unknown scope returns an empty list instead of throwing
    expect(getLoadedPluginBlocks('tenant:missing')).toEqual([]);
  });
});
