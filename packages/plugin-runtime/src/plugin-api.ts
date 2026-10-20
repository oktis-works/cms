// @oktis-works/plugin-runtime - Full PluginAPI (WP7 + WP8)
//
// This module exposes a `createPluginApi` factory that the core injects with
// the real services (settings, eventBus, db, etc.). The plugin receives an
// object with typed methods; the runtime only knows the interface (avoids a
// dependency cycle).

import { randomUUID } from 'node:crypto';
import type { HookRegistryLike } from '@oktis-works/plugin-sdk';
import type { PluginManifest, PluginFieldTypeManifest, PluginPostTypeDeclaration, PluginTaxonomyDeclaration, PluginBlockManifest, PluginPatternManifest, PluginCacheApi, PluginJobsApi, PluginJobHandler, PluginHttpApi, PluginAdminApi, PluginRolesApi, PluginAssetsApi, PluginI18nApi, PluginHealthApi, PluginHealthCheck, PluginMailApi, PluginMailTemplate, PluginContentApi, EnqueuedAsset, EnqueuedStyle, EnqueuedScript, AdminExtensionsState } from '@oktis-works/plugin-sdk';
import { PERMISSIONS, createPluginAdminApi } from '@oktis-works/plugin-sdk';
import { createHttpApi } from './http.js';
import { i18nFallbackChain, i18nInterpolate } from './i18n.js';
import { ContentQueryBuilder } from './content-query.js';

/** Context available to the plugin on every hook execution. */
export interface PluginContext {
  tenantId: string;
  userId: string;
  requestId: string;
  api: PluginAPI;
}

/** Route definition registered by the plugin. */
export interface RouteDefinition {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS';
  path: string;
  handler: (c: any, api: PluginAPI) => Promise<Response> | Response;
  /** Middlewares opcionais (ex.: auth, rate-limit). */
  middleware?: Array<(c: any, next: () => Promise<void>) => Promise<void>>;
  /** Permissions required to access this route. */
  requiredPermissions?: string[];
}

/** Tenant configuration (for getTenant). */
export interface TenantInfo {
  id: string;
  name: string;
  slug: string;
  domain?: string | null;
  subdomain?: string | null;
}

/** User info (for getUser). */
export interface UserInfo {
  id: string;
  email: string;
  name: string;
  roles?: string[];
}

/** API exposed to plugins — implemented by the core and passed via the factory. */
export interface PluginAPI {
  /** Registers a lifecycle hook (onInstall, onActivate, etc.). */
  registerHook(type: string, handler: (context: PluginContext, payload: unknown) => void | Promise<void>): void;

  /** Registers an HTTP route exposed by the plugin. */
  addRoute(route: RouteDefinition): void;

  /** Registers a custom content field. */
  addContentField(field: {
    name: string;
    type: string;
    label: string;
    required?: boolean;
    options?: Record<string, unknown>;
  }): void;

  /** Registers a new custom field type. */
  addFieldType(definition: PluginFieldTypeManifest): void;

  /** Registers a Custom Post Type (permission post-types:register). */
  addPostType(declaration: PluginPostTypeDeclaration): void;

  /** Registers a Custom Taxonomy (permission taxonomies:register). */
  addTaxonomy(declaration: PluginTaxonomyDeclaration): void;

  /** Registers an editor block (permission blocks:register). Data plane: no table — lives while the plugin is active. */
  registerBlock(block: PluginBlockManifest): void;

  /** Registers an editor pattern (permission patterns:register). Data plane: no table — lives while the plugin is active. */
  registerPattern(pattern: PluginPatternManifest): void;

  /** Per-plugin cache/transient (permissions cache:read/cache:write). */
  readonly cache: PluginCacheApi;

  /** Per-plugin jobs/cron (permission jobs:schedule). */
  readonly jobs: PluginJobsApi;

  /** External HTTP protected against SSRF (permission http:outbound). */
  readonly http: PluginHttpApi;
  /** Slots declarativos do admin (FEAT-098 / DECI-027). */
  readonly admin: PluginAdminApi;

  /** Tenant role management (Item 6 — tenant scope, anti-escalation, audit). */
  readonly roles: PluginRolesApi;

  /** Public-site asset enqueue (Item 8 — permission assets:enqueue). */
  readonly assets: PluginAssetsApi;

  /** Server-side translations (Item 9 — fallback chain locale → base → en). */
  readonly i18n: PluginI18nApi;

  /** Health checks aggregated in /health (Item 14 — permission health:register). */
  readonly health: PluginHealthApi;

  /** Mail sending via the outbox (Item 12 — permission mail:send). */
  readonly mail: PluginMailApi;

  /** Typed content query builder (Item 22 — permission db:query). */
  readonly content: PluginContentApi;

  /** Reads a tenant setting (group/key). */
  getSetting(key: string, group?: string): Promise<unknown>;

  /** Writes a tenant setting. */
  setSetting(key: string, value: unknown, group?: string): Promise<void>;

  /** Current tenant info. */
  getTenant(): Promise<TenantInfo>;

  /** Current user info. */
  getUser(): Promise<UserInfo>;

  /** Executes SQL with tenant RLS (WP8). */
  query(sql: string, params?: unknown[]): Promise<unknown[]>;

  /** Emits an event on the internal bus. */
  emit(eventType: string, payload: Record<string, unknown>): Promise<void>;

  /** WordPress-style hooks (actions/filters) — kept for compatibility. */
  addAction(action: string, callback: (...args: unknown[]) => unknown, options?: { priority?: number; acceptedArgs?: number }): void;
  addFilter(filter: string, callback: (value: unknown, ...args: unknown[]) => unknown, options?: { priority?: number; acceptedArgs?: number }): void;
  removeAction(action: string, callback: (...args: unknown[]) => unknown, priority?: number): boolean;
  removeFilter(filter: string, callback: (value: unknown, ...args: unknown[]) => unknown, priority?: number): boolean;
  hasAction(action: string, callback?: (...args: unknown[]) => unknown): boolean;
  hasFilter(filter: string, callback?: (...args: unknown[]) => unknown): boolean;
  didAction(action: string): number;
  currentHook(): string | null;
}

/** Dependencies the core must provide to create the real API. */
export interface PluginApiDependencies {
  /** Hook registry of the scope (tenant or platform). */
  hooks: HookRegistryLike;
  /** Plugin manifest (to validate permissions on query). */
  manifest: PluginManifest;
  /** Settings service (get/set by group/key). */
  settings: {
    get(key: string, group?: string): Promise<unknown>;
    set(key: string, value: unknown, group?: string): Promise<void>;
  };
  /** Internal event bus. */
  eventBus: {
    emit(event: { id: string; type: string; aggregateType: string; aggregateId: string; payload: Record<string, unknown>; tenantId?: string; processed: boolean; createdAt: Date }): Promise<void>;
  };
  /** PostgreSQL connection with RLS already configured for the tenant. */
  db: {
    query(sql: string, params?: unknown[]): Promise<unknown[]>;
  };
  /** Current tenantId resolver (ALS). */
  getTenantId: () => string | null;
  /** Current userId resolver (ALS). */
  getUserId: () => string | null;
  /** Current requestId resolver (ALS). */
  getRequestId: () => string | null;
  /** Tenant lookup by id (for getTenant). */
  getTenantById: (id: string) => Promise<TenantInfo | null>;
  /** User lookup by id (for getUser). */
  getUserById: (id: string) => Promise<UserInfo | null>;
  /** Registers plugin routes (the core mounts them on the API router). */
  registerRoutes: (routes: RouteDefinition[]) => void;
  /** Registers plugin content fields (the core exposes them via field groups). */
  registerContentFields: (fields: Array<{ name: string; type: string; label: string; required?: boolean; options?: Record<string, unknown> }>) => void;
  /** Registers plugin field types (the core exposes them via the registry). */
  registerFieldTypes: (fieldTypes: PluginFieldTypeManifest[]) => void;
  /** Registers plugin Custom Post Types (the core persists via postTypeRegistry). */
  registerPostTypes?: (postTypes: Array<PluginPostTypeDeclaration & { pluginName: string }>) => void;
  /** Registers plugin Custom Taxonomies (the core persists via taxonomyService). */
  registerTaxonomies?: (taxonomies: Array<PluginTaxonomyDeclaration & { pluginName: string }>) => void;
  /**
   * Core cache backend (Redis/memory) — RAW operations, no namespace (the
   * plugin/tenant namespace and tags belong to the PluginAPI).
   * Absent → per-process memory fallback (dev/legacy, never throws).
   */
  cache?: {
    get<T>(key: string): Promise<T | null>;
    set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;
    del(key: string): Promise<void>;
  };
  /**
   * Core jobs backend (`plugins` queue). Absent → schedule/enqueue/cancel
   * return false (optional queue, never throws — degradation A3).
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
  /** Permissions granted to the plugin (already-resolved policy). */
  allowedPermissions: string[];
  /**
   * Backend de roles do core (Item 6 — persiste + audita com anti-escalada).
   * Absent → api.roles throws a clear error (backend not wired).
   */
  roles?: {
    add(input: { tenantId: string; pluginName: string; name: string; slug?: string; permissions?: string[] }): Promise<{ id: string; name: string; slug: string; permissions: string[] }>;
    remove(input: { tenantId: string; pluginName: string; slug: string }): Promise<boolean>;
    addPermission(input: { tenantId: string; pluginName: string; slug: string; permission: string }): Promise<boolean>;
  };
  /**
   * Backend de mail do core (Item 12 — outbox + rate limit + audit).
   * Absent → api.mail.send returns false (queue unavailable, like jobs).
   */
  mail?: {
    send(input: {
      tenantId: string | null;
      pluginName: string;
      to: string;
      subject: string;
      html?: string;
      text?: string;
      template?: string;
      params?: Record<string, unknown>;
    }): Promise<boolean>;
  };
  /**
   * Audit backend (Item 18 — sensitive plugin operations → audit_log).
   * Ausente → sem auditoria (degrada silenciosamente, nunca bloqueia).
   */
  audit?: {
    record(entry: {
      tenantId?: string | null;
      action: string;
      resourceType: string;
      resourceId?: string;
      changes?: Record<string, unknown>;
    }): Promise<void>;
  };
}

/**
 * Creates the real PluginAPI from the core dependencies.
 * Called by the core at bootstrap (not by plugin-runtime directly).
 * Returns { api: PluginAPI, internal: PluginApiInternal } to separate the
 * public API from the internal details.
 */
/**
 * In-memory cache fallback when the core provided no backend (dev or legacy
 * API). Always available — `api.cache` never throws for unavailability.
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

  // Validates the permission before running a query
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

  // ── api.admin (FEAT-098/DECI-027): declarative slots registered at
  // runtime; the /api/v1/plugins/extensions endpoint merges with manifest.admin.
  const adminApi = createPluginAdminApi(manifest.name);

  /** CPT/taxonomy slugs: lowercase, digits, underscore and hyphen (WP style). */
  const SLUG_PATTERN = /^[a-z][a-z0-9_-]*$/;
  /** Reserved slugs no plugin can claim. */
  const RESERVED_SLUGS = new Set(['post', 'page', 'media', 'user', 'content', 'attachment', 'category', 'tag']);

  // ── api.cache (Item 2): plugin:{tenant}:{plugin}:{key} namespace + tags ──
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

  // ── Item 18: audit of sensitive plugin operations (write queries,
  // addRoute, jobs) → audit_log. Fire-and-forget: an audit failure never
  // blocks or breaks the plugin operation (same rule as auditService).
  const MUTATION_PATTERN = /^\s*(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE)\b/i;

  function auditPlugin(action: string, resourceType: string, changes: Record<string, unknown>): void {
    try {
      void deps.audit?.record({
        tenantId: getTenantId(),
        action,
        resourceType,
        resourceId: manifest.name,
        changes: { plugin: manifest.name, ...changes },
      });
    } catch {
      // auditing never blocks the operation
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
      // Tag → keys index (TTL tracking the value; the index expires with it
      // and orphan keys expire through their own value TTL).
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

  // ── api.jobs (Item 3): local handlers + `plugins` queue (repeat/one-shot) ──
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
      // Per-plugin ceiling — only new schedules count (re-scheduling the same name is free)
      if (!scheduledJobNames.has(jobName)) {
        if (scheduledJobNames.size >= MAX_SCHEDULED_JOBS) {
          throw new Error(`Job schedule limit reached (${MAX_SCHEDULED_JOBS} per plugin)`);
        }
        scheduledJobNames.add(jobName);
      }
      if (!deps.jobs) return false; // queue unavailable: degradation, never throws
      const scheduled = await deps.jobs.schedule(jobName, hasCron ? { cron: spec.cron } : { every: spec.every }, jobsCtx());
      if (scheduled) {
        auditPlugin('plugin.jobs.schedule', 'job', { jobName, spec: hasCron ? { cron: spec.cron } : { every: spec.every } });
      }
      return scheduled;
    },

    async cancel(jobName: string): Promise<boolean> {
      requirePermission(PERMISSIONS.JOBS_SCHEDULE);
      scheduledJobNames.delete(jobName);
      if (!deps.jobs) return false;
      const cancelled = await deps.jobs.cancel(jobName, jobsCtx());
      if (cancelled) {
        auditPlugin('plugin.jobs.cancel', 'job', { jobName });
      }
      return cancelled;
    },

    async enqueue(jobName: string, payload: Record<string, unknown> = {}): Promise<boolean> {
      requirePermission(PERMISSIONS.JOBS_SCHEDULE);
      if (!JOB_NAME_PATTERN.test(jobName)) {
        throw new Error(`Invalid job name "${jobName}" (expected ${JOB_NAME_PATTERN})`);
      }
      if (!deps.jobs) return false;
      const enqueued = await deps.jobs.enqueue(jobName, payload, jobsCtx());
      if (enqueued) {
        auditPlugin('plugin.jobs.enqueue', 'job', { jobName });
      }
      return enqueued;
    },
  };

  // ── api.http (Item 4 + Item 16): anti-SSRF with the manifest allowlist ──
  const httpApi: PluginHttpApi = createHttpApi({
    allowHosts: manifest.httpPolicy?.allowHosts,
    requirePermission,
  });

  // ── api.roles (Item 6): tenant role management, anti-escalation + audit.
  // Permission, tenant scope and backend presence are validated here; the
  // escalation rules (reserved names, wildcards, platform operations) live in
  // the core service — a single enforcement point.
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

  // ── api.assets (Item 8): asset enqueue for the public site. Per-plugin
  // URL dedupe (repeated calls are no-ops); the cross-plugin merge happens at
  // render time (first enqueue wins). SRI is declared by the plugin
  // (integrity + crossOrigin); src accepts http(s):// or root-relative (/...).
  const ASSET_SRC_PATTERN = /^(https?:\/\/|\/(?!\/))[^\s"']+$/i;
  const registeredAssets: EnqueuedAsset[] = [];

  function validateAssetSrc(src: string): string {
    if (typeof src !== 'string' || !ASSET_SRC_PATTERN.test(src)) {
      throw new Error(`Invalid asset src "${String(src)}" (expected http(s):// URL or root-relative /path)`);
    }
    return src;
  }

  const assetsApi: PluginAssetsApi = {
    enqueueStyle(style) {
      requirePermission(PERMISSIONS.ASSETS_ENQUEUE);
      const src = validateAssetSrc(style?.src);
      if (registeredAssets.some((asset) => asset.src === src)) return;
      const entry: EnqueuedStyle = {
        kind: 'style',
        src,
        version: typeof style?.version === 'string' && style.version ? style.version : undefined,
        media: typeof style?.media === 'string' && style.media ? style.media : undefined,
        integrity: typeof style?.integrity === 'string' && style.integrity ? style.integrity : undefined,
        crossOrigin: typeof style?.crossOrigin === 'string' && style.crossOrigin ? style.crossOrigin : undefined,
        pluginName: manifest.name,
      };
      registeredAssets.push(entry);
    },

    enqueueScript(script) {
      requirePermission(PERMISSIONS.ASSETS_ENQUEUE);
      const src = validateAssetSrc(script?.src);
      if (registeredAssets.some((asset) => asset.src === src)) return;
      const strategy =
        script?.strategy === 'defer' || script?.strategy === 'async' ? script.strategy : ('blocking' as const);
      const entry: EnqueuedScript = {
        kind: 'script',
        src,
        version: typeof script?.version === 'string' && script.version ? script.version : undefined,
        strategy,
        placement: script?.placement === 'footer' ? 'footer' : ('head' as const),
        integrity: typeof script?.integrity === 'string' && script.integrity ? script.integrity : undefined,
        crossOrigin: typeof script?.crossOrigin === 'string' && script.crossOrigin ? script.crossOrigin : undefined,
        pluginName: manifest.name,
      };
      registeredAssets.push(entry);
    },
  };

  // ── api.i18n (Item 9): per-plugin server-side translations. Bundles are
  // private to the plugin (namespacing is natural — each plugin owns its
  // store); fallback chain locale → base language → 'en' → the key itself.
  const i18nBundles = new Map<string, Record<string, string>>();
  let i18nDefaultLocale = 'en';

  const i18nApi: PluginI18nApi = {
    load(locale, bundle) {
      if (typeof locale !== 'string' || locale.trim().length === 0) {
        throw new Error('i18n.load requires a locale');
      }
      if (!bundle || typeof bundle !== 'object' || Array.isArray(bundle)) {
        throw new Error('i18n.load requires a flat { key: string } bundle');
      }
      const existing = i18nBundles.get(locale) ?? {};
      for (const [key, value] of Object.entries(bundle)) {
        if (typeof value !== 'string') {
          throw new Error(`i18n bundle value for "${key}" must be a string`);
        }
        existing[key] = value;
      }
      i18nBundles.set(locale, existing);
    },

    translate(key, params, locale) {
      if (typeof key !== 'string' || key.length === 0) return String(key ?? '');
      const requested = typeof locale === 'string' && locale ? locale : i18nDefaultLocale;
      for (const candidate of i18nFallbackChain(requested)) {
        const value = i18nBundles.get(candidate)?.[key];
        if (typeof value === 'string') return i18nInterpolate(value, params);
      }
      return key;
    },

    locale: () => i18nDefaultLocale,

    setDefaultLocale(locale) {
      if (typeof locale !== 'string' || locale.trim().length === 0) {
        throw new Error('i18n.setDefaultLocale requires a locale');
      }
      i18nDefaultLocale = locale;
    },
  };

  // ── api.health (Item 14): named per-plugin health checks, aggregated by
  // GET /api/v1/health with a 2s budget per check. Duplicate names reject.
  const healthChecks = new Map<string, PluginHealthCheck>();

  const healthApi: PluginHealthApi = {
    register(name, check) {
      requirePermission(PERMISSIONS.HEALTH_REGISTER);
      if (typeof name !== 'string' || name.trim().length === 0) {
        throw new Error('health.register requires a non-empty name');
      }
      if (typeof check !== 'function') {
        throw new Error('health.register requires a check function');
      }
      if (healthChecks.has(name)) {
        throw new Error(`Health check "${name}" already registered`);
      }
      healthChecks.set(name, check);
    },
  };

  // ── api.mail (Item 12): per-plugin templates + send through the core
  // outbox. Templates support {param} (same interpolation as i18n). The
  // backend is optional: absent → send returns false (queue down, like jobs).
  const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const mailTemplates = new Map<string, PluginMailTemplate>();

  function renderMailString(template: string, params?: Record<string, unknown>): string {
    return i18nInterpolate(template, params);
  }

  const mailApi: PluginMailApi = {
    registerTemplate(name, template) {
      requirePermission(PERMISSIONS.MAIL_SEND);
      if (typeof name !== 'string' || name.trim().length === 0) {
        throw new Error('mail.registerTemplate requires a non-empty name');
      }
      if (!template || typeof template.subject !== 'string' || template.subject.trim().length === 0) {
        throw new Error('mail template "subject" is required');
      }
      if (mailTemplates.has(name)) {
        throw new Error(`Mail template "${name}" already registered`);
      }
      mailTemplates.set(name, {
        subject: template.subject,
        html: typeof template.html === 'string' ? template.html : undefined,
        text: typeof template.text === 'string' ? template.text : undefined,
      });
    },

    async send(input) {
      requirePermission(PERMISSIONS.MAIL_SEND);
      if (!input || typeof input.to !== 'string' || !EMAIL_PATTERN.test(input.to)) {
        throw new Error(`Invalid recipient email "${String(input?.to)}"`);
      }

      let subject = input.subject;
      let html = input.html;
      let text = input.text;

      if (input.template !== undefined) {
        const template = mailTemplates.get(input.template);
        if (!template) {
          throw new Error(`Mail template "${input.template}" is not registered`);
        }
        subject = renderMailString(template.subject, input.params);
        html = template.html !== undefined ? renderMailString(template.html, input.params) : html;
        text = template.text !== undefined ? renderMailString(template.text, input.params) : text;
      }

      if (typeof subject !== 'string' || subject.trim().length === 0) {
        throw new Error('Mail "subject" is required (or register/use a template)');
      }
      if (!html && !text) {
        throw new Error('Mail requires html or text body');
      }

      if (!deps.mail) return false;
      return deps.mail.send({
        tenantId: getTenantId(),
        pluginName: manifest.name,
        to: input.to,
        subject,
        html,
        text,
        template: input.template,
        params: input.params,
      });
    },
  };

  // ── api.content (Item 22): typed query builder — declarative filters
  // over allowlisted columns, fully parameterized (db:query).
  const contentApi: PluginContentApi = {
    query() {
      requirePermission('db:query');
      return new ContentQueryBuilder((query: string, params?: unknown[]) => db.query(query, params));
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
        console.warn(`[PluginAPI] Hook type "${type}" not mapped — ignored`);
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
      auditPlugin('plugin.route.register', 'route', {
        method: route.method,
        path: route.path,
      });
    },

    addContentField(field: { name: string; type: string; label: string; required?: boolean; options?: Record<string, unknown> }): void {
      registeredFields.push(field);
    },

    addFieldType(definition: PluginFieldTypeManifest): void {
      if (!allowedPermissions.includes('field-types:register')) {
        throw new Error('Plugin permission denied: field-types:register');
      }
      // Validate whether the type already exists (built-in or another plugin)
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
    assets: assetsApi,
    i18n: i18nApi,
    health: healthApi,
    mail: mailApi,
    content: contentApi,

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
      // Item 18: only MUTATIONS hit the audit log (mass SELECTs would flood
      // it; reads stay in the database query logs).
      if (MUTATION_PATTERN.test(sql)) {
        auditPlugin('plugin.db.query', 'db', {
          statement: sql.slice(0, 500),
          paramsCount: Array.isArray(params) ? params.length : 0,
        });
      }
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
      getEnqueuedAssets: () => registeredAssets,
      getHealthChecks: () => [...healthChecks.entries()].map(([name, check]) => ({ name, check })),
    },
  };
}

/** Type for the core to access internally registered routes/fields. */
export interface PluginApiInternal {
  getRoutes: () => RouteDefinition[];
  getFields: () => Array<{ name: string; type: string; label: string; required?: boolean; options?: Record<string, unknown> }>;
  getFieldTypes: () => Array<PluginFieldTypeManifest & { pluginName: string; isPluginType: true }>;
  getPostTypes: () => Array<PluginPostTypeDeclaration & { pluginName: string }>;
  getTaxonomies: () => Array<PluginTaxonomyDeclaration & { pluginName: string }>;
  /** Job handlers declared via api.jobs.on (dispatched by the worker). */
  getJobHandlers: () => Map<string, PluginJobHandler>;
  /** Declarative slots registered at runtime via api.admin.*. */
  getAdminState: () => AdminExtensionsState;
  /** Blocos do editor registrados em runtime via api.registerBlock. */
  getBlocks: () => Array<PluginBlockManifest & { pluginName: string }>;
  /** Patterns do editor registrados em runtime via api.registerPattern. */
  getPatterns: () => Array<PluginPatternManifest & { pluginName: string }>;
  /** Assets enfileirados em runtime via api.assets (Item 8). */
  getEnqueuedAssets: () => EnqueuedAsset[];
  /** Health checks registrados em runtime via api.health (Item 14). */
  getHealthChecks: () => Array<{ name: string; check: PluginHealthCheck }>;
}