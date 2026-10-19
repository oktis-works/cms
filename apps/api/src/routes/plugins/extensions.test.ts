// @oktis-works/api - Helpers do GET /plugins/extensions (FEAT-098 / DECI-027)
//
// Cobre o merge de manifest.admin + api.admin em AdminExtensionsState:
//   - namespacing de ids/slugs/componentIds pelo nome do plugin;
//   - caminhos de componente completos (@/...) intactos;
//   - dedupe entre manifesto e runtime (idempotência);
//   - forma flat de columns/notices do manifesto → records do estado;
//   - defensivo contra entrada malformada (endpoint nunca quebra);
//   - isPluginActive = statuses do bootstrap (ACTIVATED/RUNNING).

import { describe, it, expect } from 'vitest';
import {
  emptyAdminExtensionsState,
  isPluginActive,
  manifestAdminAsState,
  mergePluginAdminState,
} from './extensions.js';

describe('isPluginActive', () => {
  it('só considera ativos os statuses que o bootstrap carrega', () => {
    expect(isPluginActive('ACTIVATED')).toBe(true);
    expect(isPluginActive('RUNNING')).toBe(true);
    expect(isPluginActive('INSTALLED')).toBe(false);
    expect(isPluginActive('DEACTIVATED')).toBe(false);
    expect(isPluginActive(undefined)).toBe(false);
  });
});

describe('manifestAdminAsState', () => {
  it('converte a forma flat do manifesto em records do estado', () => {
    const state = manifestAdminAsState({
      menuPages: [{ slug: 'tools', label: 'Tools', capability: 'manage_options' }],
      dashboardWidgets: [{ id: 'w1', title: 'W', componentId: 'p:W' }],
      metaBoxes: [{ id: 'm1', title: 'M', componentId: 'p:M', screens: ['post'] }],
      notices: [{ level: 'warning', message: 'Atenção' }],
      columns: [
        { contentType: 'post', key: 'a', label: 'A' },
        { contentType: 'post', key: 'b', label: 'B' },
      ],
      columnRenderers: [{ contentType: 'post', key: 'a', componentId: 'p:CellA' }],
    });

    expect(state.columns['post']?.map((column) => column.key)).toEqual(['a', 'b']);
    expect(state.columnRenderers['post']?.['a']).toBe('p:CellA');
    // defaults aplicados quando omitidos
    expect(state.dashboardWidgets[0]?.render).toBe('component');
    expect(state.metaBoxes[0]?.context).toBe('normal');
    expect(state.metaBoxes[0]?.priority).toBe('default');
    // id gerado para notice sem id
    expect(state.notices[0]?.id).toMatch(/^m\d+$/);
  });

  it('drops malformed entries instead of throwing', () => {
    const state = manifestAdminAsState({
      menuPages: [{ slug: 'x', label: 'X' }], // no capability
      dashboardWidgets: [{ id: 'w1' }], // no title/componentId
      notices: [{ level: 'info' }], // no message
      columns: [{ label: 'Sem identidade' }],
    } as never);
    expect(state.menuPages).toHaveLength(0);
    expect(state.dashboardWidgets).toHaveLength(0);
    expect(state.notices).toHaveLength(0);
    expect(Object.keys(state.columns)).toHaveLength(0);
  });

  it('keeps valid editors and drops malformed ones', () => {
    const state = manifestAdminAsState({
      editors: [
        { id: 'blocks', componentId: 'p:Blocks', mode: 'replace-body', screens: ['post'], priority: 2 },
        { componentId: 'p:NoId', mode: 'below', screens: ['post'] }, // no id
        { id: 'bad', componentId: 'p:Bad', mode: 'sidebar', screens: ['post'] }, // invalid mode
        { id: 'noscreens', componentId: 'p:NS', mode: 'below', screens: [] }, // empty screens
      ],
    } as never);
    expect(state.editors).toHaveLength(1);
    expect(state.editors[0]?.id).toBe('blocks');
    expect(state.editors[0]?.mode).toBe('replace-body');
    expect(state.editors[0]?.priority).toBe(2);
  });
});

describe('mergePluginAdminState', () => {
  it('namespaces ids, slugs e componentIds pelo nome do plugin', () => {
    const target = emptyAdminExtensionsState();
    const source = manifestAdminAsState({
      menuPages: [{ slug: 'tools', label: 'Tools', capability: 'manage_options' }],
      submenuPages: [{ parentSlug: 'tools', slug: 'audit', label: 'Audit', capability: 'read' }],
      dashboardWidgets: [{ id: 'w1', title: 'W', componentId: 'p:W' }],
      notices: [{ level: 'info', message: 'Olá', id: 'hello' }],
    });

    mergePluginAdminState(target, source, 'meu-plugin');

    expect(target.menuPages[0]?.slug).toBe('meu-plugin/tools');
    expect(target.submenuPages[0]?.parentSlug).toBe('meu-plugin/tools');
    expect(target.submenuPages[0]?.slug).toBe('meu-plugin/audit');
    expect(target.dashboardWidgets[0]?.id).toBe('meu-plugin:w1');
    // componentId já namespaced ('p:W') fica intacto
    expect(target.dashboardWidgets[0]?.componentId).toBe('p:W');
    expect(target.notices[0]?.id).toBe('meu-plugin:hello');
  });

  it('preserva caminhos de componente completos (@/...)', () => {
    const target = emptyAdminExtensionsState();
    const source = manifestAdminAsState({
      dashboardWidgets: [
        { id: 'w1', title: 'W', componentId: '@/plugins/p/admin/components/W.tsx' },
      ],
    });
    mergePluginAdminState(target, source, 'p');
    expect(target.dashboardWidgets[0]?.componentId).toBe('@/plugins/p/admin/components/W.tsx');
  });

  it('mescla manifesto e runtime sem duplicar (dedupe por id)', () => {
    const target = emptyAdminExtensionsState();
    const decl = manifestAdminAsState({
      dashboardWidgets: [{ id: 'w1', title: 'W', componentId: 'p:W' }],
    });
    const runtime = emptyAdminExtensionsState();
    runtime.dashboardWidgets.push({ id: 'w1', title: 'W', render: 'component', componentId: 'p:W' });
    runtime.menuPages.push({ slug: 'tools', label: 'Tools', capability: 'manage_options' });

    mergePluginAdminState(target, decl, 'p');
    mergePluginAdminState(target, runtime, 'p');

    expect(target.dashboardWidgets).toHaveLength(1);
    expect(target.menuPages).toHaveLength(1);
  });

  it('não deixa um plugin declarar menu sem capability', () => {
    const target = emptyAdminExtensionsState();
    const runtime = emptyAdminExtensionsState();
    runtime.menuPages.push({ slug: 'x', label: 'X' }); // sem capability (estado corrompido)

    mergePluginAdminState(target, runtime, 'p');
    expect(target.menuPages).toHaveLength(0);
  });

  it('mescla colunas e renderizadores por contentType', () => {
    const target = emptyAdminExtensionsState();
    const decl = manifestAdminAsState({
      columns: [{ contentType: 'post', key: 'a', label: 'A' }],
      columnRenderers: [{ contentType: 'post', key: 'a', componentId: 'CellA' }],
    });
    mergePluginAdminState(target, decl, 'p');
    expect(target.columns['post']?.[0]?.key).toBe('a');
    // componentId relativo ganha o prefixo do plugin
    expect(target.columnRenderers['post']?.['a']).toBe('p:CellA');
  });

  it('namespaces editor ids/componentIds and dedupes manifest vs runtime', () => {
    const target = emptyAdminExtensionsState();
    const decl = manifestAdminAsState({
      editors: [{ id: 'blocks', componentId: 'BlocksEditor', mode: 'replace-body', screens: ['post'] }],
    });
    const runtime = emptyAdminExtensionsState();
    runtime.editors.push({
      id: 'blocks',
      componentId: 'BlocksEditor',
      mode: 'replace-body',
      screens: ['post'],
    });

    mergePluginAdminState(target, decl, 'p');
    mergePluginAdminState(target, runtime, 'p');

    expect(target.editors).toHaveLength(1);
    expect(target.editors[0]?.id).toBe('p:blocks');
    expect(target.editors[0]?.componentId).toBe('p:BlocksEditor');
  });
});
