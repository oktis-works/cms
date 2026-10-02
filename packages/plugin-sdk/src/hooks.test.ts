// @oktis-works/plugin-sdk - Hooks API & Admin Extensions Tests

import { describe, it, expect } from 'vitest';
import { createPluginHooksApi, type HookRegistryLike } from './hooks.js';
import { createPluginAdminApi, type AdminExtensionsState } from './admin.js';
import { HookRegistry } from '@oktis-works/plugin-runtime';

describe('createPluginHooksApi', () => {
  interface RecordedCall {
    action: string;
    options?: { sourceId?: string; sourceType?: string; priority?: number };
  }

  function makeSpyRegistry(): { registry: HookRegistryLike; calls: RecordedCall[] } {
    const calls: RecordedCall[] = [];

    const registry: HookRegistryLike = {
      addAction: (action, _callback, options) => {
        calls.push({ action, options });
      },
      addFilter: (action, _callback, options) => {
        calls.push({ action, options });
      },
      removeAction: () => true,
      removeFilter: () => false,
      hasAction: (action) => action === 'okcms.existe',
      hasFilter: () => false,
      didAction: () => 7,
      getCurrentHook: () => 'okcms.atual',
    };

    return { registry, calls };
  }

  it('atribui sourceId e sourceType do plugin a cada registro (BUSI-032/033)', () => {
    const { registry, calls } = makeSpyRegistry();
    const api = createPluginHooksApi('meu-plugin', registry);

    api.addAction('plugin.meu-plugin.fiz_algo', () => undefined);
    api.addFilter('plugin.meu-plugin.filtra', (value) => value, { priority: 5 });

    expect(calls).toHaveLength(2);
    expect(calls[0]!.options?.sourceId).toBe('meu-plugin');
    expect(calls[0]!.options?.sourceType).toBe('plugin');
    expect(calls[1]!.options?.priority).toBe(5);
  });

  it('mantém registro local das inscrições', () => {
    const { registry } = makeSpyRegistry();
    const api = createPluginHooksApi('p', registry);

    const cb = (): void => undefined;
    api.addAction('plugin.p.a', cb);
    api.addFilter('plugin.p.b', (v) => v);

    expect(api.registrations.map((entry) => entry.action)).toEqual(['plugin.p.a', 'plugin.p.b']);
    expect(api.registrations[1]!.acceptedArgs).toBe(1);
  });

  it('delega consultas ao registry', () => {
    const { registry } = makeSpyRegistry();
    const api = createPluginHooksApi('p', registry);

    expect(api.hasAction('okcms.existe')).toBe(true);
    expect(api.hasFilter('qualquer')).toBe(false);
    expect(api.didAction('x')).toBe(7);
    expect(api.currentHook()).toBe('okcms.atual');
    expect(api.removeAction('plugin.p.a', (): void => undefined)).toBe(true);
    expect(api.removeFilter('plugin.p.b', (): void => undefined)).toBe(false);
  });
});

describe('integração com HookRegistry real', () => {
  it('filtros registrados via SDK são aplicados pelo registry', () => {
    const registry = new HookRegistry();
    registry.setDevMode(false);

    const api = createPluginHooksApi('selo', registry);
    api.addFilter('okcms.selo', (value) => `[${String(value)}]`);

    expect(registry.applyFilters('okcms.selo', 'conteúdo')).toBe('[conteúdo]');
  });

  it('ações registradas via SDK executam com prioridade customizada', async () => {
    const registry = new HookRegistry();
    registry.setDevMode(false);

    const api = createPluginHooksApi('log', registry);
    const order: string[] = [];

    registry.addAction('okcms.evento', () => order.push('core'), { priority: 0, sourceId: 'okcms', sourceType: 'core' });
    api.addAction('okcms.evento', () => order.push('plugin'), { priority: 10 });

    await registry.doAction('okcms.evento');

    expect(order).toEqual(['core', 'plugin']);
  });
});

describe('createPluginAdminApi', () => {
  let state: AdminExtensionsState;
  let api: ReturnType<typeof createPluginAdminApi>;

  function fresh(): void {
    state = undefined as unknown as AdminExtensionsState;
    api = createPluginAdminApi('meu-plugin');
    state = api.state;
  }

  it('exige capability explícita em páginas de menu', () => {
    fresh();

    expect(() =>
      api.addMenuPage({ slug: 'relatorios', label: 'Relatórios' })
    ).toThrow(/capability/i);

    api.addMenuPage({ slug: 'relatorios', label: 'Relatórios', capability: 'manage_options' });
    expect(state.menuPages).toHaveLength(1);
    expect(state.menuPages[0]!.slug).toBe('relatorios');
  });

  it('exige capability explícita em subpáginas', () => {
    fresh();

    expect(() =>
      api.addSubmenuPage({ parentSlug: 'relatorios', slug: 'detalhe', label: 'Detalhe' })
    ).toThrow(/capability/i);
  });

  it('coleta widgets, metaboxes e colunas declarativamente', () => {
    fresh();

    api.addDashboardWidget({ id: 'w1', title: 'Resumo', render: 'component', componentId: 'Comp' });
    api.addMetaBox({
      id: 'mb1',
      title: 'SEO',
      screens: ['post'],
      context: 'side',
      priority: 'high',
      componentId: 'SeoBox',
    });
    api.manageColumns('post', { key: 'views', label: 'Views' });
    api.renderColumn('post', 'views', 'ViewsCell');

    expect(state.dashboardWidgets[0]!.componentId).toBe('Comp');
    expect(state.metaBoxes[0]!.screens).toEqual(['post']);
    expect(state.columns['post']).toEqual([{ key: 'views', label: 'Views' }]);
    expect(state.columnRenderers['post']!['views']).toBe('ViewsCell');
  });

  it('notices ganham id com namespace do plugin e podem ser removidas', () => {
    fresh();

    api.addNotice({ level: 'info', message: 'Tudo certo' });
    expect(state.notices[0]!.id.startsWith('meu-plugin:')).toBe(true);

    const id = state.notices[0]!.id;
    api.removeNotice(id);
    expect(state.notices).toHaveLength(0);
  });

  it('action links são acumulados', () => {
    fresh();

    api.addActionLinks([
      { label: 'Configurar', url: '/admin/plugins/meu-plugin' },
    ]);

    expect(state.actionLinks).toEqual([{ label: 'Configurar', url: '/admin/plugins/meu-plugin' }]);
  });
});
