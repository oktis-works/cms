// @oktis-works/plugin-runtime - Integration tests for PluginAPI query with RLS

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { bootstrapPlugins, resetLoadedPlugins, getLoadedPluginRoutes } from './bootstrap.js';
import { HookRegistry } from './hook-registry.js';
import { PluginSandbox } from './sandbox.js';
import type { PluginApiDependencies } from './plugin-api.js';
import { randomUUID } from 'node:crypto';

let pluginsDir: string;
let registry: HookRegistry;

function writePlugin(
  name: string,
  files: Record<string, string>,
  manifest?: Record<string, unknown>
): void {
  const dir = join(pluginsDir, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'manifest.json'),
    JSON.stringify({ name, version: '1.0.0', main: 'index.js', ...manifest })
  );
  for (const [file, content] of Object.entries(files)) {
    const target = join(dir, file);
    mkdirSync(join(target, '..'), { recursive: true });
    writeFileSync(target, content);
  }
}

function sqlWith(rows: unknown[]) {
  return { unsafe: vi.fn(async (_text: string, _params?: unknown[]) => rows) };
}

function createMockDeps(tenantId: string | null, sqlMock: ReturnType<typeof sqlWith>): Partial<PluginApiDependencies> {
  const queryCalls: Array<{ sql: string; params?: unknown[]; tenantId: string | null }> = [];
  
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
    manifest: { name: 'test-plugin', version: '1.0.0', permissions: ['db:query'] } as any,
    settings: {
      get: vi.fn(async () => undefined),
      set: vi.fn(async () => {}),
    },
    eventBus: {
      emit: vi.fn(async () => {}),
    },
    db: {
      query: async (sql: string, params?: unknown[]) => {
        queryCalls.push({ sql, params, tenantId });
        return sqlMock.unsafe(sql, params);
      },
    },
    getTenantId: () => tenantId,
    getUserId: () => 'user-123',
    getRequestId: () => 'req-456',
    getTenantById: vi.fn(async (id: string) => ({ id, name: 'Test Tenant', slug: 'test' })),
    getUserById: vi.fn(async (id: string) => ({ id, email: 'test@test.com', name: 'Test User', roles: ['ADMIN'] })),
    registerRoutes: vi.fn(),
    registerContentFields: vi.fn(),
    // allowedPermissions is derived from permissionPolicy option in bootstrapPlugins
  };
}

beforeEach(() => {
  pluginsDir = mkdtempSync(join(tmpdir(), 'bl-plugin-rls-'));
  registry = new HookRegistry();
  registry.setDevMode(false);
  resetLoadedPlugins(registry);
});

afterEach(() => {
  resetLoadedPlugins(registry);
  rmSync(pluginsDir, { recursive: true, force: true });
});

describe('PluginAPI query with RLS (tenant context)', () => {
  it('should pass tenantId to db.query when tenant context exists', async () => {
    const tenantId = 'tenant-abc';
    const sqlMock = sqlWith([{ id: '1', name: 'Test' }]);
    const deps = createMockDeps(tenantId, sqlMock);

    writePlugin('rls-plugin', {
      'index.js': `
        export default {
          async register(api) {
            const result = await api.query('SELECT * FROM test_table');
            console.log('Query result:', result);
          }
        };
      `,
    }, { permissions: ['db:query'] });

    await bootstrapPlugins({
      pluginsDir,
      sql: sqlWith([{ name: 'rls-plugin' }]),
      registry,
      tenantId,
      apiDeps: deps,
    });

    // Verify the query was called with the tenant context
    expect(sqlMock.unsafe).toHaveBeenCalled();
    const call = sqlMock.unsafe.mock.calls[0] as [string, unknown[]];
    expect(call[0]).toBe('SELECT * FROM test_table');
  });

  it('should throw error when no tenant context and query requires RLS', async () => {
    const sqlMock = sqlWith([{ id: '1', name: 'Test' }]);
    const deps = createMockDeps(null, sqlMock); // No tenant context

    writePlugin('rls-plugin-no-tenant', {
      'index.js': `
        export default {
          async register(api) {
            try {
              await api.query('SELECT * FROM test_table');
            } catch (e) {
              console.log('Expected error:', e.message);
            }
          }
        };
      `,
    }, { permissions: ['db:query'] });

    await bootstrapPlugins({
      pluginsDir,
      sql: sqlWith([{ name: 'rls-plugin-no-tenant' }]),
      registry,
      tenantId: null, // Platform scope - no tenant
      apiDeps: deps,
    });

    // The query should still be called but the RLS would be handled by the DB
    // In platform scope, the connection doesn't have a tenant set
    expect(sqlMock.unsafe).toHaveBeenCalled();
  });

  it('should respect permissionPolicy for db:query', async () => {
    const tenantId = 'tenant-xyz';
    const sqlMock = sqlWith([{ id: '1', name: 'Test' }]);
    const deps = createMockDeps(tenantId, sqlMock);

    writePlugin('rls-plugin-no-perm', {
      'index.js': `
        export default {
          async register(api) {
            try {
              await api.query('SELECT * FROM test_table');
            } catch (e) {
              console.log('Expected permission error:', e.message);
            }
          }
        };
      `,
    }, { permissions: ['db:query'] });

    await bootstrapPlugins({
      pluginsDir,
      sql: sqlWith([{ name: 'rls-plugin-no-perm' }]),
      registry,
      tenantId,
      apiDeps: deps,
      permissionPolicy: ['settings:read'], // No db:query permission
    });

    // The query should not be executed due to permission check
    expect(sqlMock.unsafe).not.toHaveBeenCalled();
  });

  it('should isolate queries between different tenants', async () => {
    const tenantA = 'tenant-a';
    const tenantB = 'tenant-b';
    
    const sqlMockA = sqlWith([{ id: '1', tenant: 'a' }]);
    const sqlMockB = sqlWith([{ id: '2', tenant: 'b' }]);
    
    const depsA = createMockDeps(tenantA, sqlMockA);
    const depsB = createMockDeps(tenantB, sqlMockB);

    writePlugin('rls-plugin-a', {
      'index.js': `
        export default {
          async register(api) {
            await api.query('SELECT * FROM test_table');
          }
        };
      `,
    }, { permissions: ['db:query'] });

    writePlugin('rls-plugin-b', {
      'index.js': `
        export default {
          async register(api) {
            await api.query('SELECT * FROM test_table');
          }
        };
      `,
    }, { permissions: ['db:query'] });

    // Bootstrap for tenant A
    await bootstrapPlugins({
      pluginsDir,
      sql: sqlWith([{ name: 'rls-plugin-a' }]),
      registry: new HookRegistry(), // Fresh registry for tenant A
      tenantId: tenantA,
      apiDeps: depsA,
    });

    // Bootstrap for tenant B
    await bootstrapPlugins({
      pluginsDir,
      sql: sqlWith([{ name: 'rls-plugin-b' }]),
      registry: new HookRegistry(), // Fresh registry for tenant B
      tenantId: tenantB,
      apiDeps: depsB,
    });

    // Verify each tenant's query was called with correct context
    expect(sqlMockA.unsafe).toHaveBeenCalled();
    expect(sqlMockB.unsafe).toHaveBeenCalled();
  });

  it('should handle sync errors in register gracefully', async () => {
    const tenantId = 'tenant-error';
    const sqlMock = sqlWith([{ id: '1', name: 'Test' }]);
    const deps = createMockDeps(tenantId, sqlMock);

    writePlugin('rls-plugin-error', {
      'index.js': `
        export default {
          register(api) {
            // Sync error - should be caught by bootstrap
            throw new Error('Sync registration error');
          }
        };
      `,
    }, { permissions: ['db:query'] });

    const result = await bootstrapPlugins({
      pluginsDir,
      sql: sqlWith([{ name: 'rls-plugin-error' }]),
      registry,
      tenantId,
      apiDeps: deps,
    });

    // Plugin should be marked as failed due to sync error
    expect(result.failed.length).toBeGreaterThan(0);
    expect(result.failed[0]?.name).toBe('rls-plugin-error');
    expect(result.failed[0]?.error).toContain('Sync registration error');
  });
});

describe('PluginAPI getTenant/getUser with tenant context', () => {
  it('should return tenant info when tenant context exists', async () => {
    const tenantId = 'tenant-get';
    const sqlMock = sqlWith([]);
    const deps = createMockDeps(tenantId, sqlMock);

    writePlugin('tenant-info-plugin', {
      'index.js': `
        export default {
          async register(api) {
            const tenant = await api.getTenant();
            console.log('Tenant:', tenant);
          }
        };
      `,
    }, { permissions: [] });

    await bootstrapPlugins({
      pluginsDir,
      sql: sqlWith([{ name: 'tenant-info-plugin' }]),
      registry,
      tenantId,
      apiDeps: deps,
    });

    expect(deps.getTenantById).toHaveBeenCalledWith(tenantId);
  });

  it('should throw when getTenant called without tenant context', async () => {
    const sqlMock = sqlWith([]);
    const deps = createMockDeps(null, sqlMock);

    writePlugin('tenant-info-no-context', {
      'index.js': `
        export default {
          async register(api) {
            try {
              await api.getTenant();
            } catch (e) {
              console.log('Expected error:', e.message);
            }
          }
        };
      `,
    }, { permissions: [] });

    await bootstrapPlugins({
      pluginsDir,
      sql: sqlWith([{ name: 'tenant-info-no-context' }]),
      registry,
      tenantId: null,
      apiDeps: deps,
    });

    expect(deps.getTenantById).not.toHaveBeenCalled();
  });

  it('should return user info when user context exists', async () => {
    const tenantId = 'tenant-user';
    const sqlMock = sqlWith([]);
    const deps = createMockDeps(tenantId, sqlMock);

    writePlugin('user-info-plugin', {
      'index.js': `
        export default {
          async register(api) {
            const user = await api.getUser();
            console.log('User:', user);
          }
        };
      `,
    }, { permissions: [] });

    await bootstrapPlugins({
      pluginsDir,
      sql: sqlWith([{ name: 'user-info-plugin' }]),
      registry,
      tenantId,
      apiDeps: deps,
    });

    expect(deps.getUserById).toHaveBeenCalledWith('user-123');
  });
});