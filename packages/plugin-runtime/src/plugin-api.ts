// @oktis-works/plugin-runtime - PluginAPI completa (WP7 + WP8)
//
// Este módulo expõe uma fábrica `createPluginApi` que o core injeta com os
// serviços reais (settings, eventBus, db, etc.). O plugin recebe um objeto
// com métodos tipados; o runtime só conhece a interface (evita ciclo de dep).

import { randomUUID } from 'node:crypto';
import type { HookRegistryLike } from '@oktis-works/plugin-sdk';
import type { PluginManifest, PluginFieldTypeManifest, PluginPostTypeDeclaration, PluginTaxonomyDeclaration, PluginBlockManifest, PluginPatternManifest, PluginCacheApi, PluginJobsApi, PluginJobHandler, PluginHttpApi, PluginAdminApi, PluginRolesApi, AdminExtensionsState } from '@oktis-works/plugin-sdk';
import { PERMISSIONS, createPluginAdminApi } from '@oktis-works/plugin-sdk';
import { createHttpApi } from './http.js';

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

  /** Registra um novo tipo de campo customizado. */
  addFieldType(definition: PluginFieldTypeManifest): void;

  /** Registra um Custom Post Type (permissão post-types:register). */
  addPostType(declaration: PluginPostTypeDeclaration): void;

  /** Registra uma Custom Taxonomy (permissão taxonomies:register). */
  addTaxonomy(declaration: PluginTaxonomyDeclaration): void;

  /** Registra um bloco do editor (permissão blocks:register). Data plane: sem tabela — vive enquanto o plugin está ativo. */
  registerBlock(block: PluginBlockManifest): void;

  /** Registra um pattern do editor (permissão patterns:register). Data plane: sem tabela — vive enquanto o plugin está ativo. */
  registerPattern(pattern: PluginPatternManifest): void;

  /** Cache/transient por plugin (permissões cache:read/cache:write). */
  readonly cache: PluginCacheApi;

  /** Jobs/cron por plugin (permissão jobs:schedule). */
  readonly jobs: PluginJobsApi;

  /** HTTP externo protegido contra SSRF (permissão http:outbound). */
  readonly http: PluginHttpApi;
  /** Slots declarativos do admin (FEAT-098 / DECI-027). */
  readonly admin: PluginAdminApi;

  /** Gestão de roles do tenant (Item 6 — escopo tenant, anti-escalada, audit). */
  readonly roles: PluginRolesApi;

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
  removeFilter(filter: string, callback: (value: unknown, ...args: unknown[]) => unknown, priority?: number): boolean;
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
  /** Registra tipos de campo do plugin (o core expõe via registry). */
  registerFieldTypes: (fieldTypes: PluginFieldTypeManifest[]) => void;
  /** Registra Custom Post Types do plugin (o core persiste via postTypeRegistry). */
  registerPostTypes?: (postTypes: Array<PluginPostTypeDeclaration & { pluginName: string }>) => void;
  /** Registra Custom Taxonomies do plugin (o core persiste via taxonomyService). */
  registerTaxonomies?: (taxonomies: Array<PluginTaxonomyDeclaration & { pluginName: string }>) => void;
  /**
   * Backend de cache do core (Redis/memória) — operações BRUTAS, sem
   * namespace (o namespace plugin/tenant e as tags são do PluginAPI).
   * Ausente → fallback memória por processo (dev/legado, nunca lança).
   */
  cache?: {
    get<T>(key: string): Promise<T | null>;
    set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;
    del(key: string): Promise<void>;
  };
  /**
   * Backend de jobs do core (fila `plugins`). Ausente → schedule/enqueue/
   * cancel retornam false (fila opcional, nunca lança — degradação A3).
   */
  jobs?: {
    schedule(
      jobName: string,
      spec: { every?: number; cron?: string },
      ctx: { pluginName: string; tenantId: string | null }
    ): Promise<boolean>;
    cancel(jobName: string, ctx: { pluginName: string; tenantId: string | null }): Promise<boolean>;
    enqueue(
      jobName: string,
      payload: Record<string, unknown>,
      ctx: { pluginName: string; tenantId: string | null }
    ): Promise<boolean>;
  };
  /** Permissões concedidas ao plugin (policy já resolvida). */
  allowedPermissions: string[];
  /**
   * Backend de roles do core (Item 6 — persiste + audita com anti-escalada).
   * Ausente → api.roles lança erro claro (backend não conectado).
   */
  roles?: {
    add(input: { tenantId: string; pluginName: string; name: string; slug?: string; permissions?: string[] }): Promise<{ id: string; name: string; slug: string; permissions: string[] }>;
    remove(input: { tenantId: string; pluginName: string; slug: string }): Promise<boolean>;
    addPermission(input: { tenantId: string; pluginName: string; slug: string; permission: string }): Promise<boolean>;
  };
}

/**
 * Cria a PluginAPI real a partir das dependências do core.
 * Chamado pelo core no bootstrap (não pelo plugin-runtime diretamente).
 * Retorna { api: PluginAPI, internal: PluginApiInternal } para separar a API pública dos detalhes internos.
 */
/**
 * Fallback de cache em memória quando o core não forneceu backend (dev ou
 * API legado). Sempre disponível — `api.cache` nunca lança por indisponibilidade.
 */
function createMemoryCacheBackend(): NonNullable<PluginApiDependencies['cache']> {
  const store = new Map<string, { value: unknown; expiresAt: number }>();
  return {
    get: async <T>(key: string): Promise<T | null> => {
      const entry = store.get(key);
      if (!entry) return null;
      if (Date.now() > entry.expiresAt) {
        store.delete(key);
        return null;
      }
      return entry.value as T;
    },
    set: async <T>(key: string, value: T, ttlSeconds?: number): Promise<void> => {
      store.set(key, { value, expiresAt: Date.now() + (ttlSeconds ?? 300) * 1000 });
    },
    del: async (key: string): Promise<void> => {
      store.delete(key);
    },
  };
}

export function createPluginApi(deps: PluginApiDependencies): { api: PluginAPI; internal: PluginApiInternal } {
  const { hooks, manifest, settings, eventBus, db, getTenantId, getUserId, getTenantById, getUserById, allowedPermissions, registerFieldTypes, registerPostTypes, registerTaxonomies } = deps;

  // Valida permissão antes de executar query
  function checkDbPermission(): void {
    if (!allowedPermissions.includes('db:query')) {
      throw new Error('Plugin permission denied: db:query');
    }
  }

  const registeredRoutes: RouteDefinition[] = [];
  const registeredFields: Array<{ name: string; type: string; label: string; required?: boolean; options?: Record<string, unknown> }> = [];
  // Runtime type includes pluginName and isPluginType added during registration
  const registeredFieldTypes: Array<PluginFieldTypeManifest & { pluginName: string; isPluginType: true }> = [];
  const registeredPostTypes: Array<PluginPostTypeDeclaration & { pluginName: string }> = [];
  const registeredTaxonomies: Array<PluginTaxonomyDeclaration & { pluginName: string }> = [];
  const registeredBlocks: Array<PluginBlockManifest & { pluginName: string }> = [];
  const registeredPatterns: Array<PluginPatternManifest & { pluginName: string }> = [];

  // ── api.admin (FEAT-098/DECI-027): slots declarativos registrados em
  // runtime; o endpoint /api/v1/plugins/extensions mescla com manifest.admin.
  const adminApi = createPluginAdminApi(manifest.name);

  /** Slugs de CPT/taxonomia: minúsculas, dígitos, underscore e hífen (estilo WP). */
  const SLUG_PATTERN = /^[a-z][a-z0-9_-]*$/;
  /** Slugs reservados que nenhum plugin pode reivindicar. */
  const RESERVED_SLUGS = new Set(['post', 'page', 'media', 'user', 'content', 'attachment', 'category', 'tag']);

  // ── api.cache (Item 2): namespace plugin:{tenant}:{plugin}:{chave} + tags ──
  const cacheBackend = deps.cache ?? createMemoryCacheBackend();

  function cacheKeyFor(key: string): string {
    if (typeof key !== 'string' || key.trim().length === 0) {
      throw new Error('cache key must be a non-empty string');
    }
    if (key.length > 200) {
      throw new Error('cache key too long (max 200 chars)');
    }
    return `plugin:${getTenantId() ?? 'platform'}:${manifest.name}:${key}`;
  }

  function tagIndexKeyFor(tag: string): string {
    return `plugin:${getTenantId() ?? 'platform'}:${manifest.name}:__tag__:${tag}`;
  }

  function requirePermission(permission: string): void {
    if (!allowedPermissions.includes(permission)) {
      throw new Error(`Plugin permission denied: ${permission}`);
    }
  }

  const cacheApi: PluginCacheApi = {
    async get<T>(key: string): Promise<T | null> {
      requirePermission(PERMISSIONS.CACHE_READ);
      return cacheBackend.get<T>(cacheKeyFor(key));
    },

    async set(key: string, value: unknown, options?: { ttlSeconds?: number; tags?: string[] }): Promise<void> {
      requirePermission(PERMISSIONS.CACHE_WRITE);
      const fullKey = cacheKeyFor(key);
      const ttl = options?.ttlSeconds;
      await cacheBackend.set(fullKey, value, ttl);
      // Índice tag → chaves (TTL acompanhando o valor; índice expira junto e as
      // chaves órfãs expiram sozinhas pelo TTL do próprio valor).
      for (const tag of options?.tags ?? []) {
        if (typeof tag !== 'string' || tag.trim().length === 0) {
          throw new Error('cache tag must be a non-empty string');
        }
        const indexKey = tagIndexKeyFor(tag);
        const indexed = (await cacheBackend.get<string[]>(indexKey)) ?? [];
        if (!indexed.includes(fullKey)) indexed.push(fullKey);
        await cacheBackend.set(indexKey, indexed, ttl);
      }
    },

    async delete(key: string): Promise<void> {
      requirePermission(PERMISSIONS.CACHE_WRITE);
      await cacheBackend.del(cacheKeyFor(key));
    },

    async wrap<T>(key: string, ttlSeconds: number, producer: () => Promise<T>): Promise<T> {
      requirePermission(PERMISSIONS.CACHE_WRITE);
      const fullKey = cacheKeyFor(key);
      const cached = await cacheBackend.get<T>(fullKey);
      if (cached !== null) return cached;
      const value = await producer();
      await cacheBackend.set(fullKey, value, ttlSeconds);
      return value;
    },

    async invalidateTags(tags: string[]): Promise<void> {
      requirePermission(PERMISSIONS.CACHE_WRITE);
      for (const tag of tags) {
        const indexKey = tagIndexKeyFor(tag);
        const indexed = (await cacheBackend.get<string[]>(indexKey)) ?? [];
        for (const key of indexed) {
          await cacheBackend.del(key);
        }
        await cacheBackend.del(indexKey);
      }
    },
  };

  // ── api.jobs (Item 3): handlers locais + fila `plugins` (repeat/one-shot) ──
  const JOB_NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9_.-]{0,63}$/;
  const MAX_SCHEDULED_JOBS = 10;
  const jobHandlers = new Map<string, PluginJobHandler>();
  const scheduledJobNames = new Set<string>();
  const jobsCtx = () => ({ pluginName: manifest.name, tenantId: getTenantId() });

  const jobsApi: PluginJobsApi = {
    on(jobName: string, handler: PluginJobHandler): void {
      if (!JOB_NAME_PATTERN.test(jobName)) {
        throw new Error(`Invalid job name "${jobName}" (expected ${JOB_NAME_PATTERN})`);
      }
      if (typeof handler !== 'function') {
        throw new Error(`Job handler for "${jobName}" must be a function`);
      }
      jobHandlers.set(jobName, handler);
    },

    async schedule(jobName: string, spec: { every?: number; cron?: string }): Promise<boolean> {
      requirePermission(PERMISSIONS.JOBS_SCHEDULE);
      if (!JOB_NAME_PATTERN.test(jobName)) {
        throw new Error(`Invalid job name "${jobName}" (expected ${JOB_NAME_PATTERN})`);
      }
      const hasEvery = typeof spec?.every === 'number' && spec.every > 0;
      const hasCron = typeof spec?.cron === 'string' && spec.cron.trim().length > 0;
      if (hasEvery === hasCron) {
        throw new Error(`schedule("${jobName}") requires exactly one of: every | cron`);
      }
      // Teto por plugin — só conta agendas novas (re-agendar o mesmo nome é grátis)
      if (!scheduledJobNames.has(jobName)) {
        if (scheduledJobNames.size >= MAX_SCHEDULED_JOBS) {
          throw new Error(`Job schedule limit reached (${MAX_SCHEDULED_JOBS} per plugin)`);
        }
        scheduledJobNames.add(jobName);
      }
      if (!deps.jobs) return false; // fila indisponível: degradação, nunca throw
      return deps.jobs.schedule(jobName, hasCron ? { cron: spec.cron } : { every: spec.every }, jobsCtx());
    },

    async cancel(jobName: string): Promise<boolean> {
      requirePermission(PERMISSIONS.JOBS_SCHEDULE);
      scheduledJobNames.delete(jobName);
      if (!deps.jobs) return false;
      return deps.jobs.cancel(jobName, jobsCtx());
    },

    async enqueue(jobName: string, payload: Record<string, unknown> = {}): Promise<boolean> {
      requirePermission(PERMISSIONS.JOBS_SCHEDULE);
      if (!JOB_NAME_PATTERN.test(jobName)) {
        throw new Error(`Invalid job name "${jobName}" (expected ${JOB_NAME_PATTERN})`);
      }
      if (!deps.jobs) return false;
      return deps.jobs.enqueue(jobName, payload, jobsCtx());
    },
  };

  // ── api.http (Item 4 + Item 16): anti-SSRF com allowlist do manifesto ──
  const httpApi: PluginHttpApi = createHttpApi({
    allowHosts: manifest.httpPolicy?.allowHosts,
    requirePermission,
  });

  // ── api.roles (Item 6): gestão de roles do tenant, anti-escalada + audit.
  // A permissão, o escopo tenant e a presença do backend são validados aqui;
  // as regras de escalada (nomes reservados, wildcards, ops de plataforma)
  // ficam no serviço do core — um único ponto de enforcement.
  function rolesBackend(): NonNullable<PluginApiDependencies['roles']> {
    if (!deps.roles) {
      throw new Error('api.roles is not available (roles backend not wired)');
    }
    return deps.roles;
  }

  function requireTenantScopeForRoles(): string {
    const tenantId = getTenantId();
    if (!tenantId) {
      throw new Error('api.roles requires a tenant scope (platform plugins cannot manage roles)');
    }
    return tenantId;
  }

  const rolesApi: PluginRolesApi = {
    async add(input) {
      requirePermission(PERMISSIONS.ROLES_CREATE);
      const tenantId = requireTenantScopeForRoles();
      if (!input || typeof input.name !== 'string' || input.name.trim().length === 0) {
        throw new Error('Role "name" is required');
      }
      return rolesBackend().add({
        tenantId,
        pluginName: manifest.name,
        name: input.name,
        slug: input.slug,
        permissions: input.permissions,
      });
    },

    async remove(slug) {
      requirePermission(PERMISSIONS.ROLES_CREATE);
      const tenantId = requireTenantScopeForRoles();
      if (!slug || typeof slug !== 'string') {
        throw new Error('Role "slug" is required');
      }
      return rolesBackend().remove({ tenantId, pluginName: manifest.name, slug });
    },

    async addPermission(slug, permission) {
      requirePermission(PERMISSIONS.ROLES_CREATE);
      const tenantId = requireTenantScopeForRoles();
      if (!slug || typeof slug !== 'string') {
        throw new Error('Role "slug" is required');
      }
      if (!permission || typeof permission !== 'string') {
        throw new Error('Permission must be an "action:resource" string');
      }
      return rolesBackend().addPermission({ tenantId, pluginName: manifest.name, slug, permission });
    },
  };

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

    addFieldType(definition: PluginFieldTypeManifest): void {
      if (!allowedPermissions.includes('field-types:register')) {
        throw new Error('Plugin permission denied: field-types:register');
      }
      // Validar se o tipo já existe (built-in ou outro plugin)
      const existing = registeredFieldTypes.find(f => f.type === definition.type);
      if (existing) {
        throw new Error(`Field type "${definition.type}" already registered by plugin "${existing.pluginName || 'unknown'}"`);
      }
      const withPluginName = {
        ...definition,
        pluginName: manifest.name,
        isPluginType: true as const,
      };
      registeredFieldTypes.push(withPluginName);
      registerFieldTypes(registeredFieldTypes);
    },

    addPostType(declaration: PluginPostTypeDeclaration): void {
      if (!allowedPermissions.includes(PERMISSIONS.POST_TYPES_REGISTER)) {
        throw new Error(`Plugin permission denied: ${PERMISSIONS.POST_TYPES_REGISTER}`);
      }
      if (!SLUG_PATTERN.test(declaration.key)) {
        throw new Error(`Invalid post type key "${declaration.key}" (expected ${SLUG_PATTERN})`);
      }
      if (RESERVED_SLUGS.has(declaration.key)) {
        throw new Error(`Post type key "${declaration.key}" is reserved`);
      }
      if (!declaration.label || typeof declaration.label !== 'string') {
        throw new Error('Post type "label" is required');
      }
      const existing = registeredPostTypes.find((type) => type.key === declaration.key);
      if (existing) {
        throw new Error(`Post type "${declaration.key}" already registered by plugin "${existing.pluginName || 'unknown'}"`);
      }
      const withPluginName = { ...declaration, pluginName: manifest.name };
      registeredPostTypes.push(withPluginName);
      registerPostTypes?.([...registeredPostTypes]);
    },

    addTaxonomy(declaration: PluginTaxonomyDeclaration): void {
      if (!allowedPermissions.includes(PERMISSIONS.TAXONOMIES_REGISTER)) {
        throw new Error(`Plugin permission denied: ${PERMISSIONS.TAXONOMIES_REGISTER}`);
      }
      if (!SLUG_PATTERN.test(declaration.key)) {
        throw new Error(`Invalid taxonomy key "${declaration.key}" (expected ${SLUG_PATTERN})`);
      }
      if (RESERVED_SLUGS.has(declaration.key)) {
        throw new Error(`Taxonomy key "${declaration.key}" is reserved`);
      }
      if (!declaration.label || typeof declaration.label !== 'string') {
        throw new Error('Taxonomy "label" is required');
      }
      if (!Array.isArray(declaration.postTypes) || declaration.postTypes.length === 0) {
        throw new Error(`Taxonomy "${declaration.key}" requires a non-empty postTypes[]`);
      }
      const existing = registeredTaxonomies.find((taxonomy) => taxonomy.key === declaration.key);
      if (existing) {
        throw new Error(`Taxonomy "${declaration.key}" already registered by plugin "${existing.pluginName || 'unknown'}"`);
      }
      const withPluginName = { ...declaration, pluginName: manifest.name };
      registeredTaxonomies.push(withPluginName);
      registerTaxonomies?.([...registeredTaxonomies]);
    },

    registerBlock(block: PluginBlockManifest): void {
      if (!allowedPermissions.includes(PERMISSIONS.BLOCKS_REGISTER)) {
        throw new Error(`Plugin permission denied: ${PERMISSIONS.BLOCKS_REGISTER}`);
      }
      if (!block?.type || typeof block.type !== 'string') {
        throw new Error('Block "type" is required');
      }
      if (!block.label || typeof block.label !== 'string') {
        throw new Error('Block "label" is required');
      }
      if (!block.adminComponentPath || typeof block.adminComponentPath !== 'string') {
        throw new Error('Block "adminComponentPath" is required');
      }
      const existing = registeredBlocks.find((registered) => registered.type === block.type);
      if (existing) {
        throw new Error(`Block type "${block.type}" already registered by plugin "${existing.pluginName || 'unknown'}"`);
      }
      registeredBlocks.push({ ...block, pluginName: manifest.name });
    },

    registerPattern(pattern: PluginPatternManifest): void {
      if (!allowedPermissions.includes(PERMISSIONS.PATTERNS_REGISTER)) {
        throw new Error(`Plugin permission denied: ${PERMISSIONS.PATTERNS_REGISTER}`);
      }
      if (!pattern?.name || typeof pattern.name !== 'string') {
        throw new Error('Pattern "name" is required');
      }
      if (!pattern.label || typeof pattern.label !== 'string') {
        throw new Error('Pattern "label" is required');
      }
      if (!pattern.content || typeof pattern.content !== 'string') {
        throw new Error('Pattern "content" is required');
      }
      const existing = registeredPatterns.find((registered) => registered.name === pattern.name);
      if (existing) {
        throw new Error(`Pattern name "${pattern.name}" already registered by plugin "${existing.pluginName || 'unknown'}"`);
      }
      registeredPatterns.push({ ...pattern, pluginName: manifest.name });
    },

    cache: cacheApi,
    jobs: jobsApi,
    http: httpApi,
    admin: adminApi,
    roles: rolesApi,

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
      getFieldTypes: () => registeredFieldTypes,
      getPostTypes: () => registeredPostTypes,
      getTaxonomies: () => registeredTaxonomies,
      getJobHandlers: () => jobHandlers,
      getAdminState: () => adminApi.state,
      getBlocks: () => registeredBlocks,
      getPatterns: () => registeredPatterns,
    },
  };
}

/** Tipo para o core acessar as rotas/campos registrados internamente. */
export interface PluginApiInternal {
  getRoutes: () => RouteDefinition[];
  getFields: () => Array<{ name: string; type: string; label: string; required?: boolean; options?: Record<string, unknown> }>;
  getFieldTypes: () => Array<PluginFieldTypeManifest & { pluginName: string; isPluginType: true }>;
  getPostTypes: () => Array<PluginPostTypeDeclaration & { pluginName: string }>;
  getTaxonomies: () => Array<PluginTaxonomyDeclaration & { pluginName: string }>;
  /** Handlers de jobs declarados via api.jobs.on (dispatch no worker). */
  getJobHandlers: () => Map<string, PluginJobHandler>;
  /** Slots declarativos registrados em runtime via api.admin.*. */
  getAdminState: () => AdminExtensionsState;
  /** Blocos do editor registrados em runtime via api.registerBlock. */
  getBlocks: () => Array<PluginBlockManifest & { pluginName: string }>;
  /** Patterns do editor registrados em runtime via api.registerPattern. */
  getPatterns: () => Array<PluginPatternManifest & { pluginName: string }>;
}