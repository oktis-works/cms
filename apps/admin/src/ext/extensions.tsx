// @oktis-works/admin - Ilha de extensões de plugins (FEAT-098 / DECI-027)
//
// Busca o estado declarativo agregado em GET /api/v1/plugins/extensions
// (manifest.admin + api.admin.* em runtime; namespacing/dedupe feitos no
// servidor) e renderiza os slots — o admin só consome o payload pronto.

import { Show, createSignal, onMount } from '@oktis-works/ui';
import type { AdminExtensionsState } from '@oktis-works/plugin-sdk';
import { AdminSidebarSlot, DashboardWidgetsSlot, NoticesSlot } from './slots';
import { emptyExtensionsState, loadExtensions } from './store';

export { emptyExtensionsState };

/** Ilha da sidebar: páginas/subpáginas de menu + notices. */
export function PluginExtensionsSlot() {
  const [extensions, setExtensions] = createSignal<AdminExtensionsState>(emptyExtensionsState());

  onMount(async () => {
    setExtensions(await loadExtensions());
  });

  // Permissões de UI são cosméticas — a API revalida no servidor (RBAC).
  const can = (): boolean => true;

  return (
    <Show when={extensions().menuPages.length > 0 || extensions().notices.length > 0}>
      <div class="sidebar-plugins" data-extensions="sidebar">
        <NoticesSlot extensions={extensions()} />
        <AdminSidebarSlot extensions={extensions()} can={can} />
      </div>
    </Show>
  );
}

/** Ilha dos widgets de dashboard (área de widgets do DashboardLayout). */
export function PluginDashboardWidgetsSlot() {
  const [extensions, setExtensions] = createSignal<AdminExtensionsState>(emptyExtensionsState());

  onMount(async () => {
    setExtensions(await loadExtensions());
  });

  return <Show when={extensions().dashboardWidgets.length > 0}><DashboardWidgetsSlot extensions={extensions()} /></Show>;
}
