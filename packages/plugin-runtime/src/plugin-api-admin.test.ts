// @oktis-works/plugin-runtime - PluginAPI: api.admin (slots declarativos)
//
// Item E1 do plugin-parity-plan (FEAT-098 / DECI-027). Cobre:
//   - api.admin registra slots e o estado fica visível em internal.getAdminState;
//   - getLoadedPluginAdminExtensions devolve o estado por escopo (platform/tenant);
//   - addMenuPage/addSubmenuPage exigem capability explícita;
//   - estado vazio não é reportado (hasEntries);
//   - plugin quebrado não derruba o bootstrap (isolamento de falha).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { bootstrapPlugins, resetLoadedPlugins, getLoadedPluginAdminExtensions } from './bootstrap.js';
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
    manifest: { name: 'admin-plugin', version: '1.0.0' } as PluginApiDependencies['manifest'],
    settings: { get: vi.fn(async () => undefined), set: vi.fn(async () => {}) },
    eventBus: { emit: vi.fn(async () => {}) },
    db: { query: vi.fn(async () => []) },
    getTenantId: () => 'tenant-abc',
    getUserId: () => 'user-123',
    getRequestId: () => 'req-456',
    getTenantById: vi.fn(async (id: string) => ({ id, name: 'T', slug: 't' })),
    ...overrides,
  } as PluginApiDependencies;
}

beforeEach(() => {
  pluginsDir = mkdtempSync(join(tmpdir(), 'bl-plugin-admin-'));
  registry = new HookRegistry();
  resetLoadedPlugins(registry);
});

afterEach(() => {
  resetLoadedPlugins(registry);
  rmSync(pluginsDir, { recursive: true, force: true });
});

describe('api.admin', () => {
  it('registra slots e expõe o estado em getAdminState', () => {
    const { api, internal } = createPluginApi(createDeps());

    api.admin.addMenuPage({ slug: 'tools', label: 'Ferramentas', capability: 'manage_options' });
    api.admin.addDashboardWidget({ id: 'stats', title: 'Stats', render: 'component', componentId: 'admin-plugin:Stats' });
    api.admin.addMetaBox({
      id: 'seo',
      title: 'SEO',
      screens: ['post'],
      context: 'side',
      priority: 'default',
      componentId: 'admin-plugin:Seo',
    });
    api.admin.addNotice({ level: 'info', message: 'Olá' });
    api.admin.manageColumns('post', { key: 'visitas', label: 'Visitas' });
    api.admin.renderColumn('post', 'visitas', 'admin-plugin:VisitasCell');
    api.admin.addActionLinks([{ label: 'Docs', url: 'https://example.com' }]);

    const state = internal.getAdminState();
    expect(state.menuPages).toHaveLength(1);
    expect(state.dashboardWidgets[0]?.componentId).toBe('admin-plugin:Stats');
    expect(state.metaBoxes[0]?.screens).toEqual(['post']);
    // id auto-gerado é namespaced pelo nome do plugin
    expect(state.notices[0]?.id).toMatch(/^admin-plugin:/);
    expect(state.columns['post']).toHaveLength(1);
    expect(state.columnRenderers['post']?.['visitas']).toBe('admin-plugin:VisitasCell');
    expect(state.actionLinks).toHaveLength(1);

    // removeNotice limpa a entrada
    api.admin.removeNotice(state.notices[0]!.id);
    expect(internal.getAdminState().notices).toHaveLength(0);
  });

  it('exige capability explícita em addMenuPage/addSubmenuPage', () => {
    const { api } = createPluginApi(createDeps());
    expect(() => api.admin.addMenuPage({ slug: 'x', label: 'X' } as never)).toThrow(/capability/);
    expect(() =>
      api.admin.addSubmenuPage({ parentSlug: 'x', slug: 'y', label: 'Y' } as never)
    ).toThrow(/capability/);
  });
});

describe('getLoadedPluginAdminExtensions', () => {
  it('devolve o estado registrado em runtime pelo plugin (após bootstrap)', async () => {
    writePlugin(
      'admin-plugin',
      `
      export async function register(api) {
        api.admin.addMenuPage({ slug: 'tools', label: 'Ferramentas', capability: 'manage_options' });
        api.admin.addDashboardWidget({ id: 'widget-1', title: 'W', render: 'component', componentId: 'admin-plugin:W' });
      }
      `
    );
    const sql = sqlWith([{ name: 'admin-plugin' }]);
    const result = await bootstrapPlugins({ pluginsDir, sql, registry, apiDeps: createDeps() });

    expect(result.loaded).toContain('admin-plugin');

    const entries = getLoadedPluginAdminExtensions('platform');
    expect(entries).toHaveLength(1);
    expect(entries[0]?.pluginName).toBe('admin-plugin');
    expect(entries[0]?.state.menuPages[0]?.slug).toBe('tools');
    expect(entries[0]?.state.dashboardWidgets[0]?.id).toBe('widget-1');
  });

  it('não reporta plugins sem nenhuma entrada de slot (estado vazio)', async () => {
    writePlugin(
      'silent-plugin',
      `
      export async function register() {}
      `
    );
    const sql = sqlWith([{ name: 'silent-plugin' }]);
    await bootstrapPlugins({ pluginsDir, sql, registry, apiDeps: createDeps() });

    expect(getLoadedPluginAdminExtensions('platform')).toHaveLength(0);
    // escopo inexistente devolve lista vazia em vez de lançar
    expect(getLoadedPluginAdminExtensions('tenant:nao-existe')).toEqual([]);
  });

  it('plugin quebrado não impede o bootstrap dos demais', async () => {
    writePlugin(
      'broken-plugin',
      `
      export async function register() {
        throw new Error('boom');
      }
      `
    );
    writePlugin(
      'ok-plugin',
      `
      export async function register(api) {
        api.admin.addMenuPage({ slug: 'ok', label: 'OK', capability: 'read' });
      }
      `
    );
    const sql = sqlWith([{ name: 'broken-plugin' }, { name: 'ok-plugin' }]);
    await bootstrapPlugins({ pluginsDir, sql, registry, apiDeps: createDeps() });

    const entries = getLoadedPluginAdminExtensions('platform');
    expect(entries.map((entry) => entry.pluginName)).toEqual(['ok-plugin']);
  });
});
