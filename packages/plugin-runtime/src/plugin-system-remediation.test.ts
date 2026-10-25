import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { bootstrapPlugins, getLoadedPluginAssets, resetLoadedPlugins, unloadScope } from './bootstrap.js';
import { HookRegistry } from './hook-registry.js';
import { createPluginApi, normalizePluginRoutePath, type PluginApiDependencies } from './plugin-api.js';
import { PluginLoader, type DiscoveredPlugin } from './loader.js';

function dependencies(overrides: Partial<PluginApiDependencies> = {}): PluginApiDependencies {
  return {
    hooks: {
      addAction: vi.fn(), addFilter: vi.fn(), removeAction: vi.fn(), removeFilter: vi.fn(),
      hasAction: vi.fn(() => false), hasFilter: vi.fn(() => false), didAction: vi.fn(() => 0),
      getCurrentHook: vi.fn(() => null),
    },
    manifest: { name: 'remediation-plugin', version: '1.0.0' },
    settings: { get: vi.fn(async () => undefined), set: vi.fn(async () => undefined) },
    eventBus: { emit: vi.fn(async () => undefined) },
    db: { query: vi.fn(async () => []) },
    getTenantId: () => 'tenant-a', getUserId: () => 'user-a', getRequestId: () => 'request-a',
    getTenantById: vi.fn(async (id: string) => ({ id, name: 'Tenant', slug: 'tenant' })),
    getUserById: vi.fn(async (id: string) => ({ id, email: 'user@example.com', name: 'User', roles: [] })),
    registerRoutes: vi.fn(), registerContentFields: vi.fn(), registerFieldTypes: vi.fn(),
    ...overrides,
  } as PluginApiDependencies;
}

describe('plugin system remediation contracts', () => {
  let pluginsDir: string;
  let registry: HookRegistry;

  beforeEach(() => {
    pluginsDir = mkdtempSync(join(tmpdir(), 'okcms-remediation-'));
    registry = new HookRegistry();
    registry.setDevMode(false);
    resetLoadedPlugins(registry);
  });

  afterEach(() => {
    resetLoadedPlugins(registry);
    rmSync(pluginsDir, { recursive: true, force: true });
  });

  function writePlugin(manifest: Record<string, unknown>, source: string): void {
    const directory = join(pluginsDir, String(manifest['name']));
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, 'manifest.json'), JSON.stringify({ main: 'index.js', version: '1.0.0', ...manifest }));
    writeFileSync(join(directory, 'index.js'), source);
  }

  it('registers content fields only with the declared field permission and passes ownership', async () => {
    const registerContentFields = vi.fn();
    writePlugin(
      { name: 'field-plugin', permissions: ['field-types:register'] },
      `export default { register(api) { api.addContentField({ name: 'subtitle', type: 'text', label: 'Subtitle' }); } };`
    );

    const result = await bootstrapPlugins({
      pluginsDir,
      registry,
      tenantId: 'tenant-a',
      sql: { unsafe: vi.fn(async () => [{ name: 'field-plugin' }]) },
      permissionPolicy: ['field-types:register'],
      apiDeps: dependencies({ registerContentFields }),
    });

    expect(result.loaded).toEqual(['field-plugin']);
    expect(registerContentFields).toHaveBeenCalledWith(
      [{ name: 'subtitle', type: 'text', label: 'Subtitle' }],
      'field-plugin'
    );
  });

  it('rolls back timed-out registrations and removes runtime assets on unload', async () => {
    writePlugin(
      { name: 'asset-plugin', permissions: ['assets:enqueue'] },
      `export default { async register(api) { api.assets.enqueueStyle({ src: '/plugins/asset-plugin/style.css' }); await new Promise(() => {}); } };`
    );

    const first = await bootstrapPlugins({
      pluginsDir,
      registry,
      hookTimeoutMs: 5,
      sql: { unsafe: vi.fn(async () => [{ name: 'asset-plugin' }]) },
      permissionPolicy: ['assets:enqueue'],
      apiDeps: dependencies(),
    });
    expect(first.failed[0]?.error).toContain('register()');
    expect(getLoadedPluginAssets('platform')).toEqual([]);

    resetLoadedPlugins(registry);
  });

  it('loads independent plugins while isolating missing, incompatible, and cyclic dependencies', () => {
    const loader = new PluginLoader(pluginsDir);
    const plugin = (name: string, dependencies?: Record<string, unknown>[]): DiscoveredPlugin => ({
      path: join(pluginsDir, name),
      manifest: { name, version: '1.0.0', main: 'index.js', dependencies } as never,
    });
    const levels = loader.resolveDependencies([
      plugin('independent'),
      plugin('missing', [{ name: 'not-installed', version: '*' }]),
      plugin('cycle-a', [{ name: 'cycle-b', version: '*' }]),
      plugin('cycle-b', [{ name: 'cycle-a', version: '*' }]),
      plugin('blocked', [{ name: 'cycle-a', version: '*' }]),
    ]);

    expect(levels.flat().map((entry) => entry.manifest.name)).toEqual(['independent']);
    expect(loader.getDependencyFailures().map((failure) => failure.name)).toEqual(
      expect.arrayContaining(['missing', 'cycle-a', 'cycle-b', 'blocked'])
    );
  });

  it('keeps the same plugin isolated across tenant scopes', async () => {
    writePlugin(
      { name: 'scoped-plugin', permissions: ['assets:enqueue'] },
      `export default { register(api) { api.assets.enqueueStyle({ src: '/tenant.css' }); } };`
    );
    const platform = new HookRegistry();
    const tenant = new HookRegistry();
    const sql = { unsafe: vi.fn(async () => [{ name: 'scoped-plugin' }]) };

    await bootstrapPlugins({ pluginsDir, registry: platform, sql, permissionPolicy: ['assets:enqueue'], apiDeps: dependencies() });
    await bootstrapPlugins({ pluginsDir, registry: tenant, tenantId: 'tenant-a', sql, permissionPolicy: ['assets:enqueue'], apiDeps: dependencies() });

    expect(getLoadedPluginAssets('platform')).toHaveLength(1);
    expect(getLoadedPluginAssets('tenant:tenant-a')).toHaveLength(1);
    expect(platform).not.toBe(tenant);
    unloadScope('platform');
    expect(getLoadedPluginAssets('tenant:tenant-a')).toHaveLength(1);
    resetLoadedPlugins(tenant);
  });

  it('normalizes route paths, enforces route permissions, and rejects collisions', () => {
    expect(normalizePluginRoutePath('/api//health')).toBe('/api/health');
    expect(() => normalizePluginRoutePath('/api/../secret')).toThrow();
    expect(() => normalizePluginRoutePath('/api?token=secret')).toThrow();

    const { api, internal } = createPluginApi(dependencies({
      manifest: { name: 'route-plugin', version: '1.0.0', main: 'index.js' },
      allowedPermissions: ['routes:register'],
    }));
    const handler = vi.fn(() => new Response('ok'));
    api.addRoute({ method: 'GET', path: '/api/health', handler });
    expect(internal.getRoutes()[0]?.path).toBe('/api/health');
    expect(() => api.addRoute({ method: 'GET', path: '/api//health', handler })).toThrow(/already registered/);
    expect(() => createPluginApi(dependencies({ allowedPermissions: [] })).api.addRoute({ method: 'GET', path: '/api/private', handler })).toThrow(/routes:register/);
  });

  it('requires crossorigin metadata when a cross-origin asset uses SRI', () => {
    const { api } = createPluginApi(dependencies({ allowedPermissions: ['assets:enqueue'] }));
    expect(() => api.assets.enqueueScript({
      src: 'https://cdn.example.com/app.js',
      integrity: 'sha384-abc',
    })).toThrow(/crossOrigin/);
  });
});
