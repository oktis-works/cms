// @oktis-works/admin - Plugin Extension Slots (renderização declarativa)
// Isolamento fino [data-plugin="nome"] — todo HTML de plugin envolvido com data-plugin

import { For, Show, Switch, Match, createSignal, onMount, type JSX } from 'solid-js';
import { Dynamic } from 'solid-js/web';
import type { AdminExtensionsState } from '@oktis-works/plugin-sdk';

const PLUGIN_ROOT = '../../../plugins';
const pluginModules = import.meta.glob('../../../plugins/**/*.{ts,tsx,js,jsx}', { eager: false }) as Record<string, () => Promise<Record<string, unknown>>>;

/**
 * Resolve o componentId declarado num caminho de import dinâmico (alias Vite
 * `@/plugins/` aponta para a raiz dos plugins; o componente vive em
 * `admin/components/`):
 *   - `plugin:Componente`              → `@/plugins/plugin/admin/components/Componente.tsx`
 *   - `plugin:admin/components/X.tsx`  → `@/plugins/plugin/admin/components/X.tsx`
 *   - `@/plugins/...` (caminho completo) → usado como está
 *   - `plugin` explícito tem prioridade sobre o prefixo do componentId.
 */
export function resolvePluginComponentPath(componentId: string, plugin?: string): string {
  if (!componentId || componentId.includes('..') || componentId.includes('://') || componentId.startsWith('/')) {
    throw new Error(`Invalid plugin component reference: ${componentId}`);
  }
  if (componentId.startsWith('@/plugins/')) return `${PLUGIN_ROOT}/${componentId.slice('@/plugins/'.length)}`;
  const separator = componentId.indexOf(':');
  if (separator === -1) {
    const owner = plugin ?? '';
    if (!/^[a-z0-9][a-z0-9._-]*$/i.test(owner)) throw new Error(`Invalid plugin name: ${owner}`);
    const relative = componentId.replace(/^\/+/, '');
    return owner ? `${PLUGIN_ROOT}/${owner}/${relative}` : componentId;
  }
  const owner = plugin ?? componentId.slice(0, separator);
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(owner)) throw new Error(`Invalid plugin name: ${owner}`);
  const rest = componentId.slice(separator + 1);
  if (rest.startsWith('@/plugins/')) return `${PLUGIN_ROOT}/${rest.slice('@/plugins/'.length)}`;
  if (rest.includes('/')) return `${PLUGIN_ROOT}/${owner}/${rest.replace(/^\/+/, '')}`;
  return `${PLUGIN_ROOT}/${owner}/admin/components/${rest}.tsx`;
}

export async function loadPluginComponent(componentId: string, plugin?: string): Promise<Record<string, unknown>> {
  const path = resolvePluginComponentPath(componentId, plugin);
  const loader = pluginModules[path];
  if (!loader) throw new Error(`Plugin component is not included in the admin build: ${componentId}`);
  return loader();
}

/**
 * Monta um componente de plugin via import dinâmico (lazy — chunk separado).
 * Erro de load vira fallback visível com o componentId (nunca derruba a slot);
 * `extraProps` são repassados ao componente (ex.: `row` para células de coluna).
 */
export function PluginComponentHost(props: {
  componentId: string;
  plugin?: string;
  extraProps?: Record<string, unknown>;
}): JSX.Element {
  const [Component, setComponent] = createSignal<((p: Record<string, unknown>) => JSX.Element) | null>(null);
  const [error, setError] = createSignal<string | null>(null);
  const [loading, setLoading] = createSignal(true);

  onMount(async () => {
    try {
      const module = await loadPluginComponent(props.componentId, props.plugin);
      const candidate = module['default'] as
        | ((p: Record<string, unknown>) => JSX.Element)
        | undefined;
      if (!candidate) throw new Error('componente default ausente no módulo');
      setComponent(() => candidate);
    } catch (err) {
      console.warn(`[PluginComponentHost] falha ao carregar ${props.componentId}:`, err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  });

  return (
    <Switch>
      <Match when={loading()}>
        <span class="muted" data-plugin-component-loading={props.componentId}>…</span>
      </Match>
      <Match when={error() || !Component()}>
        <span class="muted" data-plugin-component-error={props.componentId} title={error() ?? ''}>
          ⚙ {props.componentId}
        </span>
      </Match>
      <Match when={true}>
        <Dynamic component={Component()!} {...(props.extraProps ?? {})} />
      </Match>
    </Switch>
  );
}

/**
 * Slots nomeados consumidos pelo shell do admin.
 * Plugins registram extensões via SDK; o admin apenas renderiza
 * os dados declarativos — sem injeção de DOM direta (DECI-027).
 */
export function AdminSidebarSlot(props: { extensions: AdminExtensionsState; can: (capability: string) => boolean }): JSX.Element {
  const allowedPages = () => props.extensions.menuPages.filter((page) => props.can(page.capability ?? 'read'));
  const submenuFor = (parentSlug: string) =>
    props.extensions.submenuPages
      .filter((page) => page.parentSlug === parentSlug)
      .filter((page) => props.can(page.capability ?? 'read'))
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

  return (
    <For each={allowedPages()}>
      {(page) => (
        <div class="sidebar-plugins__group" data-plugin-menu={page.slug}>
          <a href={`/plugins/${page.slug}`} class="sidebar__link">
            {page.icon ? <span aria-hidden="true">{page.icon}</span> : null}
            {' '}
            {page.label}
          </a>
          <Show when={submenuFor(page.slug).length > 0}>
            <div class="sidebar__submenu">
              <For each={submenuFor(page.slug)}>
                {(submenu) => (
                  <a href={`/plugins/${submenu.slug}`} class="sidebar__link sidebar__link--sub">
                    {submenu.label}
                  </a>
                )}
              </For>
            </div>
          </Show>
        </div>
      )}
    </For>
  );
}

export function DashboardWidgetsSlot(props: { extensions: AdminExtensionsState }): JSX.Element {
  return (
    <Show when={props.extensions.dashboardWidgets.length > 0}>
      <div class="dashboard-widgets">
        <For each={props.extensions.dashboardWidgets}>
          {(widget) => {
            // extrai pluginName do componentId "plugin:component" ou usa widget.id
            const pluginName = widget.componentId.split(':')[0] ?? widget.id.split(':')[0] ?? 'unknown';
            return (
              <div class="card widget" data-widget-id={widget.id} data-plugin={pluginName} style={{ 'grid-column': `span ${widget.columnsSpan ?? 1}` }}>
                <h3 class="stat-label">{widget.title}</h3>
                <div data-plugin-component={widget.componentId} data-plugin={pluginName}>
                  <PluginComponentHost componentId={widget.componentId} plugin={pluginName} />
                </div>
              </div>
            );
          }}
        </For>
      </div>
    </Show>
  );
}

export function NoticesSlot(props: { extensions: AdminExtensionsState; onDismiss?: (id: string) => void }): JSX.Element {
  return (
    <div class="notices" role="status" aria-live="polite">
      <For each={props.extensions.notices}>
        {(notice) => {
          const pluginName = notice.id.split(':')[0] ?? 'unknown';
          return (
            <div class={`notice notice--${notice.level}`} data-plugin={pluginName}>
              <span>{notice.message}</span>
              <Show when={notice.dismissible !== false && props.onDismiss}>
                <button type="button" class="notice__close" onClick={() => props.onDismiss?.(notice.id)} aria-label="Dispensar">
                  ×
                </button>
              </Show>
            </div>
          );
        }}
      </For>
    </div>
  );
}

export function MetaBoxesSlot(props: {
  extensions: AdminExtensionsState;
  screen: string;
  context: 'normal' | 'side' | 'advanced';
}): JSX.Element {
  const boxes = () =>
    props.extensions.metaBoxes
      .filter((box) => box.screens.includes(props.screen) && box.context === props.context)
      .sort((a, b) => {
        const order = { high: 0, default: 1, low: 2 } as const;
        return order[a.priority] - order[b.priority];
      });

  return (
    <For each={boxes()}>
      {(box) => {
        const pluginName = box.componentId.split(':')[0] ?? box.id.split(':')[0] ?? 'unknown';
        return (
          <div class="metabox card" data-metabox-id={box.id} data-plugin={pluginName}>
            <h3 class="metabox__title">{box.title}</h3>
            <div class="metabox__body" data-plugin-component={box.componentId} data-plugin={pluginName}>
              <PluginComponentHost componentId={box.componentId} plugin={pluginName} />
            </div>
          </div>
        );
      }}
    </For>
  );
}

export function ActionLinksSlot(props: { extensions: AdminExtensionsState }): JSX.Element {
  return (
    <Show when={props.extensions.actionLinks.length > 0}>
      <div class="action-links">
        <For each={props.extensions.actionLinks}>
          {(link) => (
            <a href={link.url} class="action-link">
              {link.label}
            </a>
          )}
        </For>
      </div>
    </Show>
  );
}
