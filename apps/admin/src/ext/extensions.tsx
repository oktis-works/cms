// @oktis-works/admin - Ilha de extensões de plugins (D1)
//
// Popula o AdminExtensionsState a partir dos plugins instalados/ativos
// (rota /api/v1/plugins) e renderiza os slots declarativamente.
// O manifest de plugin pode declarar:
//   { "admin": { "menuPages": [...], "dashboardWidgets": [...], "notices": [...] } }

import { Show, For, createSignal, onMount } from '@oktis-works/ui';
import type { AdminExtensionsState } from '@oktis-works/plugin-sdk';
import { apiClient } from '../lib/api';
import { AdminSidebarSlot } from './slots';

interface PluginRow {
  id: string;
  name: string;
  slug?: string;
  status: string;
  manifest?: {
    admin?: {
      menuPages?: AdminExtensionsState['menuPages'];
      dashboardWidgets?: AdminExtensionsState['dashboardWidgets'];
      notices?: AdminExtensionsState['notices'];
    } | null;
  } | null;
}

export function emptyExtensionsState(): AdminExtensionsState {
  return {
    menuPages: [],
    submenuPages: [],
    dashboardWidgets: [],
    metaBoxes: [],
    notices: [],
    columns: {},
    columnRenderers: {},
    actionLinks: [],
  };
}

/** Converte as rows de plugins (API) no estado declarativo dos slots. */
export function extensionsFromPlugins(plugins: PluginRow[]): AdminExtensionsState {
  const state = emptyExtensionsState();

  for (const plugin of plugins) {
    if (plugin.status !== 'ACTIVE' && plugin.status !== 'ACTIVATED') continue;
    const admin = plugin.manifest?.admin;
    if (!admin) continue;

    const pluginSlug = plugin.slug ?? plugin.name;
    state.menuPages.push(
      ...admin.menuPages?.map((page) => ({ ...page, slug: page.slug.startsWith(`${pluginSlug}/`) ? page.slug : `${pluginSlug}/${page.slug}` })) ?? []
    );
    state.dashboardWidgets.push(
      ...admin.dashboardWidgets?.map((widget) => ({
        ...widget,
        id: widget.id.includes(':') ? widget.id : `${pluginSlug}:${widget.id}`,
        componentId: widget.componentId.includes(':') ? widget.componentId : `${pluginSlug}:${widget.componentId}`,
      })) ?? []
    );
    state.notices.push(
      ...admin.notices?.map((notice) => ({ ...notice, id: notice.id.includes(':') ? notice.id : `${pluginSlug}:${notice.id}` })) ?? []
    );
  }

  return state;
}

/** Ilha client-side: busca plugins → AdminExtensionsState → slots. */
export function PluginExtensionsSlot() {
  const [extensions, setExtensions] = createSignal<AdminExtensionsState>(emptyExtensionsState());

  onMount(async () => {
    try {
      // Use o mesmo cliente da UI: em desenvolvimento a API roda na porta
      // 3000 e o admin na 3011. Um fetch relativo cairia em 3011 e retornaria
      // 404 (/api/v1/plugins não é uma rota do Astro).
      const plugins = await apiClient.getPlugins();
      setExtensions(extensionsFromPlugins(plugins as unknown as PluginRow[]));
    } catch {
      // extensões são opcionais — sidebar continua funcional sem plugins
    }
  });

  // Permissões de UI são cosméticas — a API revalida no servidor (RBAC).
  const can = (): boolean => true;

  return (
    <Show when={extensions().menuPages.length > 0}>
      <div class="sidebar-plugins" data-extensions="sidebar">
        <For each={extensions().notices}>
          {(notice) => (
            <div class={`notice notice--${notice.level}`} data-plugin={notice.id.split(':')[0]}>
              <span>{notice.message}</span>
            </div>
          )}
        </For>
        <AdminSidebarSlot extensions={extensions()} can={can} />
      </div>
    </Show>
  );
}
