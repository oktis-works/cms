// @oktis-works/plugin-sdk - WordPress-style Hooks API

export interface HookRegistration {
  action: string;
  callback: (...args: unknown[]) => unknown;
  priority: number;
  acceptedArgs: number;
}

export interface PluginHooksApi {
  addAction(action: string, callback: (...args: unknown[]) => unknown, options?: { priority?: number; acceptedArgs?: number }): void;
  addFilter(filter: string, callback: (value: unknown, ...args: unknown[]) => unknown, options?: { priority?: number; acceptedArgs?: number }): void;
  removeAction(action: string, callback: (...args: unknown[]) => unknown, priority?: number): boolean;
  removeFilter(filter: string, callback: (...args: unknown[]) => unknown, priority?: number): boolean;
  hasAction(action: string): boolean;
  hasFilter(filter: string): boolean;
  didAction(action: string): number;
  currentHook(): string | null;
}

/**
 * Nomes de pontos de extensão admin disponíveis para plugins (FEAT-098).
 */
export const ADMIN_HOOK_POINTS = {
  MENU: 'okcms.admin.menu',
  DASHBOARD_WIDGETS: 'plugin.admin:dashboard:setup',
  METABOXES: 'plugin.admin:metaboxes',
  NOTICES: 'admin:notices',
  COLUMNS: 'manage:{type}:columns',
  COLUMN_CONTENT: 'manage:{type}:custom-column',
  ACTION_LINKS: 'plugin.action:links',
} as const;

/**
 * Contrato estrutural do registry (implementado por @oktis-works/plugin-runtime).
 * Evita dependência cíclica entre os pacotes.
 */
export interface HookRegistryLike {
  addAction(action: string, callback: (...args: unknown[]) => unknown, options?: { priority?: number; acceptedArgs?: number; sourceId?: string; sourceType?: 'core' | 'plugin' }): void;
  addFilter(filter: string, callback: (value: unknown, ...args: unknown[]) => unknown, options?: { priority?: number; acceptedArgs?: number; sourceId?: string; sourceType?: 'core' | 'plugin' }): void;
  removeAction(action: string, callback: (...args: unknown[]) => unknown, priority?: number): boolean;
  removeFilter(filter: string, callback: (...args: unknown[]) => unknown, priority?: number): boolean;
  hasAction(action: string, callback?: (...args: unknown[]) => unknown): boolean;
  hasFilter(filter: string, callback?: (...args: unknown[]) => unknown): boolean;
  didAction(action: string): number;
  getCurrentHook(): string | null;
}

/**
 * Fábrica da API pública de hooks exposta a um plugin específico.
 * Todos os registros são atribuídos ao sourceId do plugin (BUSI-032/BUSI-033).
 */
export function createPluginHooksApi(pluginId: string, registry: HookRegistryLike): PluginHooksApi & { registrations: HookRegistration[] } {
  const sourceId = pluginId;

  return {
    registrations: [],
    addAction(action, callback, options) {
      this.registrations.push({ action, callback, priority: options?.priority ?? 10, acceptedArgs: options?.acceptedArgs ?? callback.length });
      registry.addAction(action, callback, { ...options, sourceId, sourceType: 'plugin' });
    },
    addFilter(filter, callback, options) {
      this.registrations.push({ action: filter, callback: callback as (...args: unknown[]) => unknown, priority: options?.priority ?? 10, acceptedArgs: options?.acceptedArgs ?? callback.length });
      registry.addFilter(filter, callback, { ...options, sourceId, sourceType: 'plugin' });
    },
    removeAction(action, callback, priority) {
      return registry.removeAction(action, callback, priority);
    },
    removeFilter(filter, callback, priority) {
      return registry.removeFilter(filter, callback, priority);
    },
    hasAction(action) {
      return registry.hasAction(action);
    },
    hasFilter(filter) {
      return registry.hasFilter(filter);
    },
    didAction(action) {
      return registry.didAction(action);
    },
    currentHook() {
      return registry.getCurrentHook();
    },
  };
}
