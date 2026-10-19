// @oktis-works/plugin-runtime - PluginAPI: api.cache (transient por plugin)
//
// Item 2 do plugin-parity-plan. Cobre:
//   - roundtrip set/get com namespace plugin:{tenant}:{plugin}:{chave};
//   - isolamento RLS de cache entre tenants (chave nunca cruza tenant);
//   - permissões cache:read / cache:write;
//   - wrap (produz uma vez, cacheia);
//   - invalidação por tag;
//   - fallback memória quando o core não fornece backend.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { bootstrapPlugins, resetLoadedPlugins } from './bootstrap.js';
import { HookRegistry } from './hook-registry.js';
import type { PluginApiDependencies } from './plugin-api.js';

let pluginsDir: string;
let registry: HookRegistry;

function writePlugin(name: string, registerJs: string, permissions: string[]): void {
  const dir = join(pluginsDir, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'manifest.json'),
    JSON.stringify({ name, version: '1.0.0', main: 'index.js', permissions })
  );
  writeFileSync(join(dir, 'index.js'), registerJs);
}

function sqlWith(rows: unknown[]) {
  return { unsafe: vi.fn(async (_text: string, _params?: unknown[]) => rows) };
}

/** Backend de cache em memória com registro de chamadas (observabilidade). */
function createTrackingCache() {
  const store = new Map<string, unknown>();
  const calls: Array<{ op: 'get' | 'set' | 'del'; key: string; value?: unknown; ttl?: number }> = [];
  return {
    store,
    calls,
    backend: {
      get: async <T>(key: string): Promise<T | null> => {
        calls.push({ op: 'get', key });
        return store.has(key) ? (store.get(key) as T) : null;
      },
      set: async <T>(key: string, value: T, ttl?: number): Promise<void> => {
        calls.push({ op: 'set', key, value, ttl });
        store.set(key, value);
      },
      del: async (key: string): Promise<void> => {
        calls.push({ op: 'del', key });
        store.delete(key);
      },
    },
  };
}

function createMockDeps(cache?: PluginApiDependencies['cache'], tenantId = 'tenant-abc') {
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
    manifest: { name: 'cache-plugin', version: '1.0.0' } as any,
    settings: { get: vi.fn(async () => undefined), set: vi.fn(async () => {}) },
    eventBus: { emit: vi.fn(async () => {}) },
    db: { query: vi.fn(async () => []) },
    getTenantId: () => tenantId,
    getUserId: () => 'user-123',
    getRequestId: () => 'req-456',
    getTenantById: vi.fn(async (id: string) => ({ id, name: 'T', slug: 't' })),
    getUserById: vi.fn(async (id: string) => ({ id, email: 't@t.c', name: 'U', roles: ['ADMIN'] })),
    registerRoutes: vi.fn(),
    registerContentFields: vi.fn(),
    registerFieldTypes: vi.fn(),
    cache,
  } satisfies Partial<PluginApiDependencies>;
}

const CACHE_PERMS = ['cache:read', 'cache:write'];

async function bootstrap(
  deps: Partial<PluginApiDependencies>,
  options?: { tenantId?: string; policy?: string[] }
) {
  return bootstrapPlugins({
    pluginsDir,
    sql: sqlWith([{ name: 'cache-plugin' }]),
    registry,
    tenantId: options?.tenantId ?? 'tenant-abc',
    permissionPolicy: options?.policy ?? [...CACHE_PERMS],
    apiDeps: deps,
  });
}

beforeEach(() => {
  pluginsDir = mkdtempSync(join(tmpdir(), 'bl-cache-'));
  registry = new HookRegistry();
  registry.setDevMode(false);
  resetLoadedPlugins(registry);
});

afterEach(() => {
  resetLoadedPlugins(registry);
  rmSync(pluginsDir, { recursive: true, force: true });
});

describe('api.cache (Item 2)', () => {
  it('roundtrip set/get with plugin:tenant namespace', async () => {
    const tracking = createTrackingCache();
    writePlugin(
      'cache-plugin',
      `
        export default {
          async register(api) {
            await api.cache.set('greeting', 'hello', { ttlSeconds: 60 });
            const read = await api.cache.get('greeting');
            await api.cache.set('observed', read);
          }
        };
      `,
      CACHE_PERMS
    );

    const result = await bootstrap(createMockDeps(tracking.backend));

    expect(result.failed).toEqual([]);
    const setKeys = tracking.calls.filter((c) => c.op === 'set').map((c) => c.key);
    expect(setKeys).toContain('plugin:tenant-abc:cache-plugin:greeting');
    expect(setKeys).toContain('plugin:tenant-abc:cache-plugin:observed');
    expect(tracking.store.get('plugin:tenant-abc:cache-plugin:observed')).toBe('hello');
    const greetingSet = tracking.calls.find((c) => c.key.endsWith(':greeting'));
    expect(greetingSet?.ttl).toBe(60);
  });

  it('rejects get without cache:read (isolated failure)', async () => {
    const tracking = createTrackingCache();
    writePlugin(
      'cache-plugin',
      `
        export default {
          async register(api) {
            await api.cache.get('k');
          }
        };
      `,
      []
    );

    const readDenied = await bootstrap(createMockDeps(tracking.backend), { policy: [] });
    expect(readDenied.failed[0]!.error).toContain('Plugin permission denied: cache:read');
    expect(tracking.store.size).toBe(0);
  });

  it('rejects set without cache:write (isolated failure)', async () => {
    const tracking = createTrackingCache();
    writePlugin(
      'cache-plugin',
      `
        export default {
          async register(api) {
            await api.cache.set('k', 1);
          }
        };
      `,
      []
    );

    const writeDenied = await bootstrap(createMockDeps(tracking.backend), { policy: ['cache:read'] });
    expect(writeDenied.failed[0]!.error).toContain('Plugin permission denied: cache:write');
    expect(tracking.store.size).toBe(0);
  });

  it('wrap produces once and serves from cache afterwards', async () => {
    const tracking = createTrackingCache();
    writePlugin(
      'cache-plugin',
      `
        export default {
          async register(api) {
            const first = await api.cache.wrap('expensive', 30, async () => 'computed');
            const second = await api.cache.wrap('expensive', 30, async () => 'recomputed');
            await api.cache.set('observed', first + '|' + second);
          }
        };
      `,
      CACHE_PERMS
    );

    const result = await bootstrap(createMockDeps(tracking.backend));

    expect(result.failed).toEqual([]);
    expect(tracking.store.get('plugin:tenant-abc:cache-plugin:observed')).toBe('computed|computed');
  });

  it('invalidateTags removes every key registered under the tags', async () => {
    const tracking = createTrackingCache();
    writePlugin(
      'cache-plugin',
      `
        export default {
          async register(api) {
            await api.cache.set('a', 1, { tags: ['posts'] });
            await api.cache.set('b', 2, { tags: ['posts'] });
            await api.cache.set('keep', 3);
            await api.cache.invalidateTags(['posts']);
          }
        };
      `,
      CACHE_PERMS
    );

    const result = await bootstrap(createMockDeps(tracking.backend));

    expect(result.failed).toEqual([]);
    const ns = 'plugin:tenant-abc:cache-plugin:';
    expect(tracking.store.has(ns + 'a')).toBe(false);
    expect(tracking.store.has(ns + 'b')).toBe(false);
    expect(tracking.store.has(ns + 'keep')).toBe(true);
    expect(tracking.store.has(ns + '__tag__:posts')).toBe(false);
  });

  it('isolates cache between tenants (RLS: same key, different tenant)', async () => {
    const tracking = createTrackingCache();
    writePlugin(
      'iso-plugin',
      `
        export default {
          async register(api) {
            const found = await api.cache.get('k');
            if (found === null) {
              await api.cache.set('k', 'seeded');
              await api.cache.set('probe', 'SEEDED');
            } else {
              await api.cache.set('probe', 'SEEN:' + found);
            }
          }
        };
      `,
      CACHE_PERMS
    );

    // tenant A semeia a chave no namespace dele
    const a = await bootstrapPlugins({
      pluginsDir,
      sql: sqlWith([{ name: 'iso-plugin' }]),
      registry,
      tenantId: 'tenant-A',
      permissionPolicy: [...CACHE_PERMS],
      apiDeps: createMockDeps(tracking.backend, 'tenant-A'),
    });
    expect(a.failed).toEqual([]);
    expect(tracking.store.get('plugin:tenant-A:iso-plugin:k')).toBe('seeded');
    expect(tracking.store.get('plugin:tenant-A:iso-plugin:probe')).toBe('SEEDED');

    // tenant B não enxerga o estado de A (namespace diferente → miss → seeded)
    resetLoadedPlugins(registry);
    const b = await bootstrapPlugins({
      pluginsDir,
      sql: sqlWith([{ name: 'iso-plugin' }]),
      registry,
      tenantId: 'tenant-B',
      permissionPolicy: [...CACHE_PERMS],
      apiDeps: createMockDeps(tracking.backend, 'tenant-B'),
    });
    expect(b.failed).toEqual([]);
    // Se o isolamento quebrasse, B teria lido "seeded" de A e gravado SEEN:...
    expect(tracking.store.get('plugin:tenant-B:iso-plugin:probe')).toBe('SEEDED');
    expect(tracking.store.get('plugin:tenant-B:iso-plugin:k')).toBe('seeded');
    // O valor de A permanece intacto
    expect(tracking.store.get('plugin:tenant-A:iso-plugin:k')).toBe('seeded');
  });

  it('falls back to in-process memory when core provides no backend', async () => {
    writePlugin(
      'cache-plugin',
      `
        export default {
          async register(api) {
            await api.cache.set('x', 'v');
            const got = await api.cache.get('x');
            if (got !== 'v') throw new Error('fallback cache miss: ' + got);
          }
        };
      `,
      CACHE_PERMS
    );

    const result = await bootstrap(createMockDeps(undefined));
    expect(result.failed).toEqual([]);
  });
});
