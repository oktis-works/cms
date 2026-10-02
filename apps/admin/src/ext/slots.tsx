// @oktis-works/admin - Plugin Extension Slots (renderização declarativa)
// Isolamento fino [data-plugin="nome"] — todo HTML de plugin envolvido com data-plugin

import { For, Show, type JSX } from 'solid-js';
import type { AdminExtensionsState } from '@oktis-works/plugin-sdk';

/**
 * Slots nomeados consumidos pelo shell do admin.
 * Plugins registram extensões via SDK; o admin apenas renderiza
 * os dados declarativos — sem injeção de DOM direta (DECI-027).
 */
export function AdminSidebarSlot(props: { extensions: AdminExtensionsState; can: (capability: string) => boolean }): JSX.Element {
  const allowedPages = () => props.extensions.menuPages.filter((page) => props.can(page.capability ?? 'read'));

  return (
    <For each={allowedPages()}>
      {(page) => (
        <a href={`/plugins/${page.slug}`} class="sidebar__link">
          {page.icon ? <span aria-hidden="true">{page.icon}</span> : null}
          {' '}
          {page.label}
        </a>
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
                  {/* Componente do plugin é resolvido pelo runtime de componentes — escopado via [data-plugin] */}
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
            <div class="metabox__body" data-plugin-component={box.componentId} data-plugin={pluginName} />
          </div>
        );
      }}
    </For>
  );
}

export function ColumnsHeaderSlot(props: { extensions: AdminExtensionsState; contentType: string }): JSX.Element {
  const columns = () => props.extensions.columns[props.contentType] ?? [];

  return (
    <For each={columns()}>
      {(column) => (
        <th data-column-key={column.key}>{column.label}</th>
      )}
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
