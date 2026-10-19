// @oktis-works/plugin-runtime - PluginAPI: Custom Post Types & Taxonomies
//
// Item 1 do plugin-parity-plan (paridade WordPress: register_post_type /
// register_taxonomy). Cobre:
//   - caminho declarativo do manifesto (postTypes[]/taxonomies[] no v2);
//   - caminho imperativo (api.addPostType / api.addTaxonomy);
//   - permissões (post-types:register / taxonomies:register);
//   - validação de slug, slugs reservados, conflito duplicado;
//   - taxonomy exige postTypes[] não vazio.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { bootstrapPlugins, resetLoadedPlugins } from './bootstrap.js';
import { HookRegistry } from './hook-registry.js';
import type { PluginApiDependencies } from './plugin-api.js';

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

function createMockDeps(): Partial<PluginApiDependencies> & {
  registerPostTypes: ReturnType<typeof vi.fn>;
  registerTaxonomies: ReturnType<typeof vi.fn>;
} {
  const registerPostTypes = vi.fn();
  const registerTaxonomies = vi.fn();
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
    manifest: { name: 'cpt-plugin', version: '1.0.0' } as any,
    settings: { get: vi.fn(async () => undefined), set: vi.fn(async () => {}) },
    eventBus: { emit: vi.fn(async () => {}) },
    db: { query: vi.fn(async () => []) },
    getTenantId: () => 'tenant-abc',
    getUserId: () => 'user-123',
    getRequestId: () => 'req-456',
    getTenantById: vi.fn(async (id: string) => ({ id, name: 'T', slug: 't' })),
    getUserById: vi.fn(async (id: string) => ({ id, email: 't@t.c', name: 'U', roles: ['ADMIN'] })),
    registerRoutes: vi.fn(),
    registerContentFields: vi.fn(),
    registerFieldTypes: vi.fn(),
    registerPostTypes,
    registerTaxonomies,
  };
}

const CPT_PERMS = ['post-types:register', 'taxonomies:register'];

beforeEach(() => {
  pluginsDir = mkdtempSync(join(tmpdir(), 'bl-cpt-'));
  registry = new HookRegistry();
  registry.setDevMode(false);
  resetLoadedPlugins(registry);
});

afterEach(() => {
  resetLoadedPlugins(registry);
  rmSync(pluginsDir, { recursive: true, force: true });
});

async function bootstrap(deps: Partial<PluginApiDependencies>) {
  return bootstrapPlugins({
    pluginsDir,
    sql: sqlWith([{ name: 'cpt-plugin' }]),
    registry,
    tenantId: 'tenant-abc',
    permissionPolicy: [...CPT_PERMS],
    apiDeps: deps,
  });
}

describe('api.addPostType / api.addTaxonomy (Item 1)', () => {
  it('declares post types and taxonomies in the manifest (v2 declarative path)', async () => {
    const deps = createMockDeps();
    writePlugin(
      'cpt-plugin',
      { 'index.js': `export default { async register() {} };` },
      {
        permissions: CPT_PERMS,
        postTypes: [{ key: 'book', label: 'Book', plural: 'Books', icon: 'book' }],
        taxonomies: [{ key: 'genre', label: 'Genre', postTypes: ['book'], hierarchical: true }],
      }
    );

    const result = await bootstrap(deps);

    expect(result.failed).toEqual([]);
    expect(deps.registerPostTypes).toHaveBeenCalledTimes(1);
    expect(deps.registerPostTypes.mock.calls[0]![0]).toEqual([
      { key: 'book', label: 'Book', plural: 'Books', icon: 'book', pluginName: 'cpt-plugin' },
    ]);
    expect(deps.registerTaxonomies).toHaveBeenCalledTimes(1);
    expect(deps.registerTaxonomies.mock.calls[0]![0]).toEqual([
      { key: 'genre', label: 'Genre', postTypes: ['book'], hierarchical: true, pluginName: 'cpt-plugin' },
    ]);
  });

  it('registers post type and taxonomy from register() via the API', async () => {
    const deps = createMockDeps();
    writePlugin(
      'cpt-plugin',
      {
        'index.js': `
          export default {
            async register(api) {
              api.addPostType({ key: 'movie', label: 'Movie', plural: 'Movies' });
              api.addTaxonomy({ key: 'studio', label: 'Studio', postTypes: ['movie'] });
            }
          };
        `,
      },
      { permissions: CPT_PERMS }
    );

    const result = await bootstrap(deps);

    expect(result.failed).toEqual([]);
    expect(deps.registerPostTypes).toHaveBeenCalledTimes(1);
    expect(deps.registerPostTypes.mock.calls[0]![0]).toEqual([
      { key: 'movie', label: 'Movie', plural: 'Movies', pluginName: 'cpt-plugin' },
    ]);
    expect(deps.registerTaxonomies.mock.calls[0]![0]).toEqual([
      { key: 'studio', label: 'Studio', postTypes: ['movie'], pluginName: 'cpt-plugin' },
    ]);
  });

  it('rejects addPostType without post-types:register (isolated failure)', async () => {
    const deps = createMockDeps();
    writePlugin(
      'cpt-plugin',
      {
        'index.js': `
          export default {
            async register(api) {
              api.addPostType({ key: 'movie', label: 'Movie' });
            }
          };
        `,
      },
      { permissions: [] }
    );

    const result = await bootstrapPlugins({
      pluginsDir,
      sql: sqlWith([{ name: 'cpt-plugin' }]),
      registry,
      tenantId: 'tenant-abc',
      permissionPolicy: [],
      apiDeps: deps,
    });

    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]!.error).toContain('Plugin permission denied: post-types:register');
    expect(deps.registerPostTypes).not.toHaveBeenCalled();
  });

  it('rejects invalid post type slug', async () => {
    const deps = createMockDeps();
    writePlugin(
      'cpt-plugin',
      {
        'index.js': `
          export default {
            async register(api) {
              api.addPostType({ key: '1bad slug', label: 'Bad' });
            }
          };
        `,
      },
      { permissions: CPT_PERMS }
    );

    const result = await bootstrap(deps);
    expect(result.failed[0]!.error).toContain('Invalid post type key');
    expect(deps.registerPostTypes).not.toHaveBeenCalled();
  });

  it('rejects reserved post type slug', async () => {
    const deps = createMockDeps();
    writePlugin(
      'cpt-plugin',
      {
        'index.js': `
          export default {
            async register(api) {
              api.addPostType({ key: 'post', label: 'Post' });
            }
          };
        `,
      },
      { permissions: CPT_PERMS }
    );

    const result = await bootstrap(deps);
    expect(result.failed[0]!.error).toContain('reserved');
    expect(deps.registerPostTypes).not.toHaveBeenCalled();
  });

  it('rejects duplicate post type registration', async () => {
    const deps = createMockDeps();
    writePlugin(
      'cpt-plugin',
      {
        'index.js': `
          export default {
            async register(api) {
              api.addPostType({ key: 'book', label: 'Book' });
              api.addPostType({ key: 'book', label: 'Book Again' });
            }
          };
        `,
      },
      { permissions: CPT_PERMS }
    );

    const result = await bootstrap(deps);
    expect(result.failed[0]!.error).toContain('already registered');
    // primeira chamada persistiu; a segunda falhou antes de re-persistir
    expect(deps.registerPostTypes).toHaveBeenCalledTimes(1);
    expect(deps.registerPostTypes.mock.calls[0]![0]).toHaveLength(1);
  });

  it('rejects taxonomy without a non-empty postTypes[]', async () => {
    const deps = createMockDeps();
    writePlugin(
      'cpt-plugin',
      {
        'index.js': `
          export default {
            async register(api) {
              api.addTaxonomy({ key: 'genre', label: 'Genre', postTypes: [] });
            }
          };
        `,
      },
      { permissions: CPT_PERMS }
    );

    const result = await bootstrap(deps);
    expect(result.failed[0]!.error).toContain('non-empty postTypes');
    expect(deps.registerTaxonomies).not.toHaveBeenCalled();
  });
});
