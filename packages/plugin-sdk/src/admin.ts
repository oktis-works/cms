// @oktis-works/plugin-sdk - Admin UI Extension Points (declarative slots)

export interface AdminMenuPage {
  slug: string;
  label: string;
  capability?: string;
  icon?: string;
  position?: number;
}

export interface AdminSubmenuPage {
  parentSlug: string;
  slug: string;
  label: string;
  capability?: string;
  position?: number;
}

export interface DashboardWidget {
  id: string;
  title: string;
  render: 'component';
  componentId: string;
  columnsSpan?: 1 | 2 | 3 | 4;
}

export interface MetaBox {
  id: string;
  title: string;
  /** Tipos de conteúdo onde a caixa aparece (ex.: ['post', 'page']). */
  screens: string[];
  context: 'normal' | 'side' | 'advanced';
  priority: 'high' | 'default' | 'low';
  componentId: string;
}

export interface AdminNotice {
  id: string;
  level: 'info' | 'success' | 'warning' | 'error';
  message: string;
  dismissible?: boolean;
}

export interface ColumnDefinition {
  key: string;
  label: string;
  position?: 'before_title' | 'after_title' | 'end';
}

export interface PluginAdminApi {
  addMenuPage(page: AdminMenuPage): void;
  addSubmenuPage(page: AdminSubmenuPage): void;
  addDashboardWidget(widget: DashboardWidget): void;
  addMetaBox(box: MetaBox): void;
  addNotice(notice: Omit<AdminNotice, 'id'> & { id?: string }): void;
  removeNotice(noticeId: string): void;
  manageColumns(contentType: string, column: ColumnDefinition): void;
  renderColumn(contentType: string, columnKey: string, componentId: string): void;
  addActionLinks(links: Array<{ label: string; url: string }>): void;
}

/**
 * Estado declarativo coletado pelos pontos de extensão e consumido
 * pelo app admin via slots nomeados (FEAT-098 / DECI-027).
 */
export interface AdminExtensionsState {
  menuPages: AdminMenuPage[];
  submenuPages: AdminSubmenuPage[];
  dashboardWidgets: DashboardWidget[];
  metaBoxes: MetaBox[];
  notices: AdminNotice[];
  columns: Record<string, ColumnDefinition[]>;
  columnRenderers: Record<string, Record<string, string>>;
  actionLinks: Array<{ label: string; url: string }>;
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

function emptyState(): AdminExtensionsState {
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
