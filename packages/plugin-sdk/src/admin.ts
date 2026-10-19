// @oktis-works/plugin-sdk - Admin UI Extension Points (declarative slots)
//
// Os tipos canônicos vivem em `@oktis-works/types` (o barrel é a fonte única
// do wire format servido por GET /api/v1/plugins/extensions). Aqui
// re-exportamos os nomes históricos do SDK (API pública estável) e mantemos a
// fábrica de estado usada pelo runtime (`api.admin`).

import type {
  AdminExtensionsState,
  AdminMenuPage,
  AdminSubmenuPage,
  DashboardWidget,
  AdminMetaBox,
  AdminNotice,
  AdminColumnDefinition,
} from '@oktis-works/types';

export type {
  AdminExtensionsState,
  AdminMenuPage,
  AdminSubmenuPage,
  DashboardWidget,
  DashboardWidgetDeclaration,
  AdminMetaBox,
  AdminMetaBoxDeclaration,
  AdminNotice,
  AdminColumnDefinition,
  AdminActionLink,
  AdminColumnDeclaration,
  AdminColumnRendererDeclaration,
  PluginManifestAdmin,
} from '@oktis-works/types';

/** Nome histórico do SDK — canônico em types como `AdminMetaBox`. */
export type MetaBox = AdminMetaBox;
/** Nome histórico do SDK — canônico em types como `AdminColumnDefinition`. */
export type ColumnDefinition = AdminColumnDefinition;

export interface PluginAdminApi {
  addMenuPage(page: AdminMenuPage): void;
  addSubmenuPage(page: AdminSubmenuPage): void;
  addDashboardWidget(widget: DashboardWidget): void;
  addMetaBox(box: AdminMetaBox): void;
  addNotice(notice: Omit<AdminNotice, 'id'> & { id?: string }): void;
  removeNotice(noticeId: string): void;
  manageColumns(contentType: string, column: AdminColumnDefinition): void;
  renderColumn(contentType: string, columnKey: string, componentId: string): void;
  addActionLinks(links: Array<{ label: string; url: string }>): void;
}

export function createPluginAdminApi(pluginId: string, state: AdminExtensionsState = emptyState()): PluginAdminApi & { state: AdminExtensionsState } {
  const api: PluginAdminApi & { state: AdminExtensionsState } = {
    state,
    addMenuPage(page) {
      if (!page.capability || page.capability.length === 0) {
        throw new Error(`[${pluginId}] addMenuPage exige uma capability explícita`);
      }
      state.menuPages.push(page);
    },
    addSubmenuPage(page) {
      if (!page.capability || page.capability.length === 0) {
        throw new Error(`[${pluginId}] addSubmenuPage exige uma capability explícita`);
      }
      state.submenuPages.push(page);
    },
    addDashboardWidget(widget) {
      state.dashboardWidgets.push(widget);
    },
    addMetaBox(box) {
      state.metaBoxes.push(box);
    },
    addNotice(notice) {
      state.notices.push({ ...notice, id: notice.id ?? `${pluginId}:${Date.now().toString(36)}:${state.notices.length}` });
    },
    removeNotice(noticeId) {
      state.notices = state.notices.filter((notice) => notice.id !== noticeId);
    },
    manageColumns(contentType, column) {
      const list = state.columns[contentType] ?? [];
      list.push(column);
      state.columns[contentType] = list;
    },
    renderColumn(contentType, columnKey, componentId) {
      state.columnRenderers[contentType] = { ...(state.columnRenderers[contentType] ?? {}), [columnKey]: componentId };
    },
    addActionLinks(links) {
      state.actionLinks.push(...links);
    },
  };

  return api;
}

export function emptyState(): AdminExtensionsState {
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
