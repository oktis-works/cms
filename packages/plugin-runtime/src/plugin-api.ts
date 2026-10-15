// @oktis-works/plugin-runtime - PluginAPI completa (WP7 + WP8)
//
// Este módulo expõe uma fábrica `createPluginApi` que o core injeta com os
// serviços reais (settings, eventBus, db, etc.). O plugin recebe um objeto
// com métodos tipados; o runtime só conhece a interface (evita ciclo de dep).

import { randomUUID } from 'node:crypto';
import type { HookRegistryLike } from '@oktis-works/plugin-sdk';
import type { PluginManifest } from '@oktis-works/plugin-sdk';

/** Contexto disponível para o plugin em cada execução de hook. */
export interface PluginContext {
  tenantId: string;
  userId: string;
  requestId: string;
  api: PluginAPI;
}

/** Definição de rota registrada pelo plugin. */
export interface RouteDefinition {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS';
  path: string;
  handler: (c: any, api: PluginAPI) => Promise<Response> | Response;
  /** Middlewares opcionais (ex.: auth, rate-limit). */
  middleware?: Array<(c: any, next: () => Promise<void>) => Promise<void>>;
  /** Permissões exigidas para acessar esta rota. */
  requiredPermissions?: string[];
}

/** Configuração do tenant (para getTenant). */
export interface TenantInfo {
  id: string;
  name: string;
  slug: string;
  domain?: string | null;
  subdomain?: string | null;
}

/** Info do usuário (para getUser). */
export interface UserInfo {
  id: string;
  email: string;
  name: string;
  roles?: string[];
}

/** API exposta aos plugins — implementada pelo core e passada via factory. */
export interface PluginAPI {
  /** Registra hook de lifecycle (onInstall, onActivate, etc.). */
  registerHook(type: string, handler: (context: PluginContext, payload: unknown) => void | Promise<void>): void;

  /** Registra rota HTTP exposta pelo plugin. */
  addRoute(route: RouteDefinition): void;

  /** Registra campo de conteúdo customizado. */
  addContentField(field: {
    name: string;
    type: string;
    label: string;
    required?: boolean;
    options?: Record<string, unknown>;
  }): void;

  /** Lê setting do tenant (group/key). */
  getSetting(key: string, group?: string): Promise<unknown>;

  /** Escreve setting do tenant. */
  setSetting(key: string, value: unknown, group?: string): Promise<void>;

  /** Info do tenant atual. */
  getTenant(): Promise<TenantInfo>;

  /** Info do usuário atual. */
  getUser(): Promise<UserInfo>;

  /** Executa SQL no schema do plugin + RLS do tenant (WP8). */
  query(sql: string, params?: unknown[]): Promise<unknown[]>;

  /** Emite evento no barramento interno. */
  emit(eventType: string, payload: Record<string, unknown>): Promise<void>;

  /** Hooks WordPress-style (actions/filters) — mantido para compat. */
  addAction(action: string, callback: (...args: unknown[]) => unknown, options?: { priority?: number; acceptedArgs?: number }): void;
  addFilter(filter: string, callback: (value: unknown, ...args: unknown[]) => unknown, options?: { priority?: number; acceptedArgs?: number }): void;
  removeAction(action: string, callback: (...args: unknown[]) => unknown, priority?: number): boolean;
  removeFilter(filter: string, callback: (...args: unknown[]) => unknown, priority?: number): boolean;
  hasAction(action: string, callback?: (...args: unknown[]) => unknown): boolean;
  hasFilter(filter: string, callback?: (...args: unknown[]) => unknown): boolean;
  didAction(action: string): number;
  currentHook(): string | null;
}

/** Dependências que o core deve prover para criar a API real. */
export interface PluginApiDependencies {
  /** Registry de hooks do escopo (tenant ou platform). */
  hooks: HookRegistryLike;
  /** Manifesto do plugin (para validar permissões no query). */
  manifest: PluginManifest;
  /** Serviço de settings (get/set por grupo/key). */
  settings: {
    get(key: string, group?: string): Promise<unknown>;
    set(key: string, value: unknown, group?: string): Promise<void>;
  };
  /** Bus de eventos interno. */
  eventBus: {
    emit(event: { id: string; type: string; aggregateType: string; aggregateId: string; payload: Record<string, unknown>; tenantId?: string; processed: boolean; createdAt: Date }): Promise<void>;
  };
  /** Conexão PostgreSQL com RLS já configurado para o tenant. */
  db: {
    query(sql: string, params?: unknown[]): Promise<unknown[]>;
  };
  /** Resolvedor do tenantId atual (ALS). */
  getTenantId: () => string | null;
  /** Resolvedor do userId atual (ALS). */
  getUserId: () => string | null;
  /** Resolvedor do requestId atual (ALS). */
  getRequestId: () => string | null;
  /** Consulta tenant por id (para getTenant). */
  getTenantById: (id: string) => Promise<TenantInfo | null>;
  /** Consulta usuário por id (para getUser). */
  getUserById: (id: string) => Promise<UserInfo | null>;
  /** Registra rotas do plugin (o core monta no router da API). */
  registerRoutes: (routes: RouteDefinition[]) => void;
  /** Registra campos de conteúdo do plugin (o core expõe via field-groups). */
  registerContentFields: (fields: Array<{ name: string; type: string; label: string; required?: boolean; options?: Record<string, unknown> }>) => void;
  /** Permissões concedidas ao plugin (policy já resolvida). */
  allowedPermissions: string[];
}

/**
 * Cria a PluginAPI real a partir das dependências do core.
 * Chamado pelo core no bootstrap (não pelo plugin-runtime diretamente).
 * Retorna { api: PluginAPI, internal: PluginApiInternal } para separar a API pública dos detalhes internos.
 */
export function createPluginApi(deps: PluginApiDependencies): { api: PluginAPI; internal: PluginApiInternal } {
  const { hooks, manifest, settings, eventBus, db, getTenantId, getUserId, getTenantById, getUserById, allowedPermissions } = deps;

  // Valida permissão antes de executar query
  function checkDbPermission(): void {
    if (!allowedPermissions.includes('db:query')) {
      throw new Error('Plugin permission denied: db:query');
    }
  }

  const registeredRoutes: RouteDefinition[] = [];
  const registeredFields: Array<{ name: string; type: string; label: string; required?: boolean; options?: Record<string, unknown> }> = [];

  // Build the public API object
  const api: PluginAPI = {
    registerHook(type: string, handler: (context: PluginContext, payload: unknown) => void | Promise<void>): void {
      /**
       * Maps plugin lifecycle hook types to internal action names.
       * These actions are fired by the core at the corresponding lifecycle events.
       * 
       * @example
       * // In plugin's register function:
       * api.registerHook('onInstall', async (context, payload) => {
       *   // Runs when plugin is installed
       *   await context.api.query('CREATE TABLE IF NOT EXISTS my_plugin_data (...)');
       * });
       * api.registerHook('onActivate', async (context, payload) => {
       *   // Runs when plugin is activated for a tenant
       * });
       * api.registerHook('beforeContentCreate', async (context, payload) => {
       *   // Runs before content is created - can modify payload
       *   payload.data.custom_field = 'value';
       * });
       * 
       * Mapping:
       * - onInstall         -> plugin.install
       * - onActivate        -> plugin.activate
       * - onDeactivate      -> plugin.deactivate
       * - onUninstall       -> plugin.uninstall
       * - onSettingsPage    -> plugin.settings_page
       * - onAdminMenu       -> okcms.admin.menu
       * - beforeContentCreate  -> okcms.content.before-create
       * - afterContentCreate   -> okcms.content.after-create
       * - beforeContentUpdate  -> okcms.content.before-update
       * - afterContentUpdate   -> okcms.content.after-update
       * - beforeContentDelete  -> okcms.content.before-delete
       * - afterContentDelete   -> okcms.content.after-delete
       * - onContentPublish     -> okcms.content.published
       * - onContentUnpublish   -> okcms.content.unpublished
       */
      const hookMap: Record<string, string> = {
        'onInstall': 'plugin.install',
        'onActivate': 'plugin.activate',
        'onDeactivate': 'plugin.deactivate',
        'onUninstall': 'plugin.uninstall',
        'onSettingsPage': 'plugin.settings_page',
        'onAdminMenu': 'okcms.admin.menu',
        'beforeContentCreate': 'okcms.content.before-create',
        'afterContentCreate': 'okcms.content.after-create',
        'beforeContentUpdate': 'okcms.content.before-update',
        'afterContentUpdate': 'okcms.content.after-update',
        'beforeContentDelete': 'okcms.content.before-delete',
        'afterContentDelete': 'okcms.content.after-delete',
        'onContentPublish': 'okcms.content.published',
        'onContentUnpublish': 'okcms.content.unpublished',
      };
      const hookName = hookMap[type];
      if (!hookName) {
        console.warn(`[PluginAPI] Hook type "${type}" não mapeado — ignorado`);
        return;
      }
      hooks.addAction(hookName, async (...args: unknown[]) => {
        const [context, payload] = args as [PluginContext, unknown];
        await handler(context, payload);
      }, { sourceId: manifest.name, sourceType: 'plugin' });
    },

    addRoute(route: RouteDefinition): void {
      if (route.requiredPermissions) {
        for (const perm of route.requiredPermissions) {
          if (!allowedPermissions.includes(perm)) {
            throw new Error(`Plugin route permission denied: ${perm}`);
          }
        }
      }
      registeredRoutes.push(route);
    },

    addContentField(field: { name: string; type: string; label: string; required?: boolean; options?: Record<string, unknown> }): void {
      registeredFields.push(field);
    },

    async getSetting(key: string, group?: string): Promise<unknown> {
      if (!allowedPermissions.includes('settings:read')) {
        throw new Error('Plugin permission denied: settings:read');
      }
      const fullKey = group ? `${group}.${key}` : key;
      return settings.get(fullKey);
    },

    async setSetting(key: string, value: unknown, group?: string): Promise<void> {
      if (!allowedPermissions.includes('settings:write')) {
        throw new Error('Plugin permission denied: settings:write');
      }
      const fullKey = group ? `${group}.${key}` : key;
      return settings.set(fullKey, value);
    },

    async getTenant(): Promise<TenantInfo> {
      const tenantId = getTenantId();
      if (!tenantId) throw new Error('No tenant context');
      const tenant = await getTenantById(tenantId);
      if (!tenant) throw new Error('Tenant not found');
      return tenant;
    },

    async getUser(): Promise<UserInfo> {
      const userId = getUserId();
      if (!userId) throw new Error('No user context');
      const user = await getUserById(userId);
      if (!user) throw new Error('User not found');
      return user;
    },

    async query(sql: string, params?: unknown[]): Promise<unknown[]> {
      checkDbPermission();
      return db.query(sql, params);
    },

    async emit(eventType: string, payload: Record<string, unknown>): Promise<void> {
      if (!allowedPermissions.includes('events:emit')) {
        throw new Error('Plugin permission denied: events:emit');
      }
      return eventBus.emit({ type: eventType, payload, id: randomUUID(), aggregateType: 'plugin', aggregateId: '', processed: false, createdAt: new Date() });
    },

    // Hooks WordPress-style (delegam para o registry)
    addAction(action: string, callback: (...args: unknown[]) => unknown, options?: { priority?: number; acceptedArgs?: number }): void {
      hooks.addAction(action, callback, { ...options, sourceId: manifest.name, sourceType: 'plugin' });
    },
    addFilter(filter: string, callback: (value: unknown, ...args: unknown[]) => unknown, options?: { priority?: number; acceptedArgs?: number }): void {
      hooks.addFilter(filter, callback, { ...options, sourceId: manifest.name, sourceType: 'plugin' });
    },
    removeAction(action: string, callback: (...args: unknown[]) => unknown, priority?: number): boolean {
      return hooks.removeAction(action, callback, priority);
    },
    removeFilter(filter: string, callback: (...args: unknown[]) => unknown, priority?: number): boolean {
      return hooks.removeFilter(filter, callback, priority);
    },
    hasAction(action: string, callback?: (...args: unknown[]) => unknown): boolean {
      return hooks.hasAction(action, callback);
    },
    hasFilter(filter: string, callback?: (...args: unknown[]) => unknown): boolean {
      return hooks.hasFilter(filter, callback);
    },
    didAction(action: string): number {
      return hooks.didAction(action);
    },
    currentHook(): string | null {
      return hooks.getCurrentHook();
    },
  };

  return {
    api,
    internal: {
      getRoutes: () => registeredRoutes,
      getFields: () => registeredFields,
    },
  };
}

/** Tipo para o core acessar as rotas/campos registrados internamente. */
export interface PluginApiInternal {
  getRoutes: () => RouteDefinition[];
  getFields: () => Array<{ name: string; type: string; label: string; required?: boolean; options?: Record<string, unknown> }>;
}