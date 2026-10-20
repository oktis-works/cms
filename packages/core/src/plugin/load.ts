// @oktis-works/core - Enabled plugins runtime sync
//
// PLUGIN.md promises that `register(registry)` is called when the plugin is
// loaded — the core honors it for every process (API, web, worker, dev). Two
// scopes:
//
//   - **platform** (`syncEnabledPlugins`): plugins with `tenant_id IS NULL`,
//     enabled globally → platform registry, loaded at boot;
//   - **tenant** (`ensureTenantPluginsLoaded`): plugins linked in
//     `plugin_tenants` (ENABLED status) → tenant registry, loaded on demand
//     at that tenant's first request (TTL + LRU cache).
//
// Never throws: database failure, missing directory or a broken plugin are
// reported in the result (and persisted in `plugins.error`) without breaking
// the boot. Failures are visible in `getPluginsRuntimeState()` (the
// `/api/v1/plugins/runtime` route + admin badge) — never silenced.

import { createHash } from 'node:crypto';
import { getConnection } from '@oktis-works/database';
import { loadConfig } from '@oktis-works/config';
import { resolvePluginPermissionPolicy } from '@oktis-works/validation';
import { resolveExtensionDirectory } from '../extensions/project-directories.js';
import { settingsService } from '../settings/service.js';
import { getEventBus } from '../events/bus.js';
import { tenantService } from '../tenant/service.js';
import { userService } from '../user/service.js';
import { fieldGroupService } from '../fields/service.js';
import { postTypeRegistry } from '../content/post-types.js';
import { taxonomyService } from '../taxonomies/service.js';
import { pluginRolesService } from '../role/plugin-roles.js';
import { mailService } from '../mail/service.js';
import { auditService } from '../observability/audit.js';
import { getCache } from '../cache/index.js';
import { queueProducer } from '../queue/producer.js';
import { getCurrentTenantIdSync, getCurrentUserIdSync, getCurrentRequestIdSync } from '../tenant/context.js';
import type { RouteDefinition, PluginBootstrapResult, PluginApiDependencies } from '@oktis-works/plugin-runtime';
import type { AdminExtensionsState, PluginBlockManifest, PluginPatternManifest } from '@oktis-works/types';
import type { EnqueuedAsset, PluginHealthCheck } from '@oktis-works/plugin-sdk';

// Dynamic imports for the circular dependency with plugin-runtime
// (non-literal require so TypeScript cannot resolve it at build time)
const getPluginRuntime = async () => {
  return require('@oktis-works/plugin-runtime');
};

let _pluginRuntimeCache: ReturnType<typeof getPluginRuntime> | null = null;

const getPluginRuntimeCached = async () => {
  if (!_pluginRuntimeCache) {
    _pluginRuntimeCache = await getPluginRuntime();
  }
  return _pluginRuntimeCache;
};

const getBootstrapPlugins = async () => (await getPluginRuntimeCached()).bootstrapPlugins;
const getHookRegistryStore = async () => (await getPluginRuntimeCached()).getHookRegistryStore;
const unloadTenant = async () => (await getPluginRuntimeCached()).unloadTenant;
const getLoadedPluginRoutes = async () => (await getPluginRuntimeCached()).getLoadedPluginRoutes;
const getLoadedPluginJobHandlers = async () => (await getPluginRuntimeCached()).getLoadedPluginJobHandlers;
const getLoadedPluginAdminExtensions = async () => (await getPluginRuntimeCached()).getLoadedPluginAdminExtensions;
const getLoadedPluginBlocks = async () => (await getPluginRuntimeCached()).getLoadedPluginBlocks;
const getLoadedPluginPatterns = async () => (await getPluginRuntimeCached()).getLoadedPluginPatterns;
const getLoadedPluginAssets = async () => (await getPluginRuntimeCached()).getLoadedPluginAssets;
const getLoadedPluginHealthChecks = async () => (await getPluginRuntimeCached()).getLoadedPluginHealthChecks;

/** Plugin job handler (dispatched by the worker). */
export type PluginJobHandlerFn = (
  payload: unknown,
  context: { tenantId: string | null; plugin: string; jobName: string }
) => void | Promise<void>;

/** Deterministic plugin job id (schedules are idempotent by it). */
function pluginJobId(tenantId: string | null, pluginName: string, jobName: string): string {
  return `plugin:${tenantId ?? 'platform'}:${pluginName}:${jobName}`;
}

/**
 * Resolves the handler registered by a plugin for a job (via api.jobs.on).
 * Scope: platform (`tenantId` null) or tenant (loaded on demand).
 * Never throws — null when the plugin is disabled or the handler is absent.
 */
export async function getPluginJobHandler(
  tenantId: string | null,
  pluginName: string,
  jobName: string
): Promise<PluginJobHandlerFn | null> {
  try {
    const entries = await (await getLoadedPluginJobHandlers())(scopeKey(tenantId));
    for (const entry of entries) {
      if (entry.pluginName === pluginName) {
        return (entry.handlers.get(jobName) as PluginJobHandlerFn | undefined) ?? null;
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * `api.admin` slots loaded in a scope (platform `null` or `tenant:<id>`) —
 * feeds GET /api/v1/plugins/extensions together with `manifest.admin`.
 * Never throws: runtime unavailability becomes an empty list.
 */
export async function getPluginAdminExtensions(
  tenantId: string | null
): Promise<Array<{ pluginName: string; state: AdminExtensionsState }>> {
  try {
    return await (await getLoadedPluginAdminExtensions())(scopeKey(tenantId));
  } catch {
    return [];
  }
}

/**
 * Blocks registered at runtime by the loaded plugins of a scope — feeds
 * GET /api/v1/blocks together with `manifest.blocks`. Never throws: runtime
 * unavailability becomes an empty list.
 */
export async function getPluginBlocks(
  tenantId: string | null
): Promise<Array<{ pluginName: string; blocks: Array<PluginBlockManifest & { pluginName: string }> }>> {
  try {
    return await (await getLoadedPluginBlocks())(scopeKey(tenantId));
  } catch {
    return [];
  }
}

/**
 * Patterns registered at runtime by the loaded plugins of a scope — feeds
 * GET /api/v1/patterns together with `manifest.patterns`. Never throws:
 * runtime unavailability becomes an empty list.
 */
export async function getPluginPatterns(
  tenantId: string | null
): Promise<Array<{ pluginName: string; patterns: Array<PluginPatternManifest & { pluginName: string }> }>> {
  try {
    return await (await getLoadedPluginPatterns())(scopeKey(tenantId));
  } catch {
    return [];
  }
}

/**
 * Assets enqueued by the loaded plugins of a scope — feeds the public
 * renderer's theme:head pipeline (Item 8). Never throws: runtime
 * unavailability becomes an empty list.
 */
export async function getPluginAssets(
  tenantId: string | null
): Promise<Array<{ pluginName: string; assets: EnqueuedAsset[] }>> {
  try {
    return await (await getLoadedPluginAssets())(scopeKey(tenantId));
  } catch {
    return [];
  }
}

/**
 * Health checks registered by the loaded plugins of a scope — aggregated by
 * GET /api/v1/health (Item 14). Never throws: runtime unavailability becomes
 * an empty list.
 */
export async function getPluginHealthChecks(
  tenantId: string | null
): Promise<Array<{ pluginName: string; checks: Array<{ name: string; check: PluginHealthCheck }> }>> {
  try {
    return await (await getLoadedPluginHealthChecks())(scopeKey(tenantId));
  } catch {
    return [];
  }
}

export interface PluginsScopeState {
  /** `platform` ou `tenant:<id>`. */
  scope: string;
  tenantId: string | null;
  loadedAt: string;
  enabled: string[];
  loaded: string[];
  unloaded: string[];
  failed: Array<{ name: string; error: string }>;
}

export interface PluginsRuntimeState {
  generatedAt: string;
  scopes: PluginsScopeState[];
}

/** Registro global de rotas de plugins (coletadas durante bootstrap). */
export interface PluginRouteEntry {
  pluginName: string;
  routes: RouteDefinition[];
  /** rpm do rate limit por plugin (manifest rateLimit.rpm, Item 17). */
  rpm?: number;
}

const pluginRoutesRegistry = new Map<string, PluginRouteEntry>();

/** Registra rotas de um plugin (chamado durante bootstrap). */
export function registerPluginRoutes(pluginName: string, routes: RouteDefinition[], rpm?: number): void {
  if (routes.length === 0) return;
  pluginRoutesRegistry.set(pluginName, { pluginName, routes, ...(rpm ? { rpm } : {}) });
}

/** Remove rotas de um plugin (quando desativado/desinstalado). */
export function unregisterPluginRoutes(pluginName: string): boolean {
  return pluginRoutesRegistry.delete(pluginName);
}

/** Gets every route registered for mounting on the API router. */
export function getRegisteredPluginRoutes(): PluginRouteEntry[] {
  return [...pluginRoutesRegistry.values()];
}

interface ScopeState {
  key: string;
  tenantId: string | null;
  loadedAt: number;
  result: PluginBootstrapResult;
  /** Per-plugin failure from the last sync (avoids rewriting when unchanged). */
  errors: Map<string, string>;
}

/** Item 21: registro das consultas preparadas por hash (teto LRU). */
const PREPARED_CACHE_MAX = 200;
const preparedPluginStatements = new Map<string, { sql: string; uses: number }>();

/** Per-scope states — iteration order = LRU. */
const states = new Map<string, ScopeState>();
const inflight = new Map<string, Promise<PluginBootstrapResult>>();

const PLATFORM_KEY = 'platform';

function scopeKey(tenantId?: string | null): string {
  return tenantId ? `tenant:${tenantId}` : PLATFORM_KEY;
}

function createApiDeps(tenantId: string | null): Partial<PluginApiDependencies> {
  return {
    settings: {
      get: settingsService.get.bind(settingsService),
      set: async (key: string, value: unknown, group?: string) => {
        await settingsService.set(key, value, group);
      },
    },
    eventBus: {
      emit: async (event: { id: string; type: string; aggregateType: string; aggregateId: string; payload: Record<string, unknown>; tenantId?: string; processed: boolean; createdAt: Date }) => {
        await getEventBus().emit(event);
      },
    },
    db: {
      query: async (sql: string, params?: unknown[]) => {
        const conn = getConnection();
        // Item 21: registro de prepared statements por hash — dedupe + LRU +
        // contagem de uso por consulta (identidade da consulta preparada em
        // api.query; o driver reutiliza o plano para consultas repetidas).
        const hash = createHash('sha256').update(sql).digest('hex').slice(0, 24);
        let entry = preparedPluginStatements.get(hash);
        if (!entry) {
          entry = { sql, uses: 0 };
          preparedPluginStatements.set(hash, entry);
          if (preparedPluginStatements.size > PREPARED_CACHE_MAX) {
            const oldest = preparedPluginStatements.keys().next().value;
            if (oldest) preparedPluginStatements.delete(oldest);
          }
        }
        entry.uses += 1;
        return conn.unsafe(sql, params ?? []);
      },
    },
    // api.cache backend (Item 2) — lazy so contexts that never use the
    // plugin cache don't need it at boot.
    cache: {
      get: <T>(key: string) => getCache().get<T>(key),
      set: <T>(key: string, value: T, ttlSeconds?: number) => getCache().set(key, value, ttlSeconds),
      del: (key: string) => getCache().del(key),
    },
    getTenantId: () => tenantId ?? getCurrentTenantIdSync(),
    getUserId: () => getCurrentUserIdSync(),
    getRequestId: () => getCurrentRequestIdSync(),
    getTenantById: async (id: string) => {
      const tenant = await tenantService.getById(id);
      return tenant ? { id: tenant.id, name: tenant.name, slug: tenant.slug, domain: tenant.domain, subdomain: tenant.subdomain } : null;
    },
    getUserById: async (id: string) => {
      const user = await userService.getById(id);
      return user ? { id: user.id, email: user.email, name: user.name, roles: user.roles } : null;
    },
    registerRoutes: (routes: RouteDefinition[]) => {
      // Routes registered here are collected at bootstrap by the PluginAPI
      // itself (getLoadedPluginRoutes) — this point only logs.
      console.debug(`[PluginAPI] ${routes.length} route(s) registered — collected at bootstrap`);
    },
    registerContentFields: async (fields) => {
      // Explicit guard: with noUncheckedIndexedAccess, fields[0] is
      // T | undefined even with the length check above — checked
      // destructuring leaves the narrowing to TS with the same semantics.
      const firstField = fields[0];
      if (!firstField) return;
      try {
        // Cria/atualiza field group do plugin
        const groupKey = `plugin_${firstField.name.split('_')[0]}_fields`; // prefixo baseado no primeiro campo
        const existing = await fieldGroupService.getByKey(groupKey);
        const fieldInputs = fields.map((f, idx) => ({
          type: f.type,
          name: f.name,
          key: f.name,
          label: f.label,
          required: f.required ?? false,
          config: f.options ?? {},
          sortOrder: idx,
        }));
        if (existing) {
          await fieldGroupService.update(existing.id, { fields: fieldInputs });
        } else {
          await fieldGroupService.create({
            title: `Campos do Plugin`,
            key: groupKey,
            locationRules: [],
            position: 'normal',
            displayStyle: 'standard',
            active: true,
            fields: fieldInputs,
          });
        }
        console.debug(`[PluginAPI] ${fields.length} content field(s) registered in field group "${groupKey}"`);
      } catch (error) {
        console.error('[PluginAPI] Failed to register content fields:', error);
      }
    },
    registerFieldTypes: async (fieldTypes) => {
      try {
        // Same package — relative import (a self-import of '@oktis-works/core'
        // does not resolve on a fresh checkout, where dist/ does not exist yet).
        const { fieldTypeExtensionService } = await import('../fields/service.js');
        for (const ft of fieldTypes) {
          await fieldTypeExtensionService.register(ft as any);
        }
        await fieldTypeExtensionService.syncToRegistry();
        console.debug(`[PluginAPI] ${fieldTypes.length} tipo(s) de campo registrado(s) no registry`);
      } catch (error) {
        console.error('[PluginAPI] Falha ao registrar tipos de campo:', error);
      }
    },
    registerPostTypes: async (postTypes) => {
      // Idempotent persistence for plugin Custom Post Types (item 1 of the
      // plugin-parity-plan): existe com mesmo sourceId → atualiza; existe com
      // outra origem (CORE/ADMIN/outro plugin) → warn + skip (nunca rouba).
      try {
        for (const type of postTypes) {
          const supports: Array<'title' | 'editor' | 'revisions'> = ['title', 'editor'];
          if (type.revisions) supports.push('revisions');

          const existing = await postTypeRegistry.getBySlug(type.key);
          if (existing) {
            if (existing.source === 'PLUGIN' && existing.sourceId === type.pluginName) {
              await postTypeRegistry.update(type.key, {
                singularLabel: type.label,
                pluralLabel: type.plural ?? existing.pluralLabel,
                menuIcon: type.icon ?? existing.menuIcon,
                supports,
              });
            } else {
              console.warn(
                `[PluginAPI] Post type "${type.key}" already exists (${existing.source}) — "${type.pluginName}" cannot claim it`
              );
            }
            continue;
          }
          await postTypeRegistry.create({
            name: type.key,
            slug: type.key,
            pluralLabel: type.plural ?? `${type.label}s`,
            singularLabel: type.label,
            source: 'PLUGIN',
            sourceId: type.pluginName,
            supports,
            hasArchive: true,
            menuIcon: type.icon ?? 'box',
            singleton: false,
            public: true,
          });
        }
        console.debug(`[PluginAPI] ${postTypes.length} post type(s) de plugin persistido(s)`);
      } catch (error) {
        console.error('[PluginAPI] Falha ao registrar post types:', error);
      }
    },
    registerTaxonomies: async (taxonomies) => {
      // Idempotent persistence for plugin Custom Taxonomies — ownership
      // stored in meta.plugin (schema has no sourceId for taxonomies).
      try {
        for (const taxonomy of taxonomies) {
          const existing = await taxonomyService.getBySlug(taxonomy.key);
          if (existing) {
            const owner = (existing.meta as Record<string, unknown> | undefined)?.['plugin'];
            if (owner !== undefined && owner !== taxonomy.pluginName) {
              console.warn(
                `[PluginAPI] Taxonomy "${taxonomy.key}" belongs to plugin "${String(owner)}" — "${taxonomy.pluginName}" cannot claim it`
              );
              continue;
            }
            await taxonomyService.update(taxonomy.key, {
              name: taxonomy.label,
              hierarchical: taxonomy.hierarchical ?? false,
              attachTo: taxonomy.postTypes,
              meta: { ...((existing.meta as Record<string, unknown>) ?? {}), plugin: taxonomy.pluginName },
            });
            continue;
          }
          await taxonomyService.create({
            name: taxonomy.label,
            slug: taxonomy.key,
            hierarchical: taxonomy.hierarchical ?? false,
            attachTo: taxonomy.postTypes,
            meta: { plugin: taxonomy.pluginName },
            source: 'PLUGIN',
          });
        }
        console.debug(`[PluginAPI] ${taxonomies.length} taxonomia(s) de plugin persistida(s)`);
      } catch (error) {
        console.error('[PluginAPI] Falha ao registrar taxonomias:', error);
      }
    },
    jobs: {
      schedule: async (jobName, spec, ctx) => {
        // Recurrence on the `plugins` queue — deterministic idempotent jobId
        return queueProducer.scheduleRepeatable(
          'plugin.job',
          pluginJobId(ctx.tenantId, ctx.pluginName, jobName),
          { plugin: ctx.pluginName, job: jobName, scheduled: true },
          spec,
          { tenantId: ctx.tenantId ?? 'default' }
        );
      },
      cancel: async (jobName, ctx) => {
        return queueProducer.cancelRepeatable(
          'plugin.job',
          pluginJobId(ctx.tenantId, ctx.pluginName, jobName)
        );
      },
      enqueue: async (jobName, payload, ctx) => {
        return queueProducer.enqueue(
          'plugin.job',
          { plugin: ctx.pluginName, job: jobName, data: payload },
          { tenantId: ctx.tenantId ?? 'default' }
        );
      },
    },
    roles: {
      add: (input) => pluginRolesService.add(input),
      remove: (input) => pluginRolesService.remove(input),
      addPermission: (input) => pluginRolesService.addPermission(input),
    },
    mail: {
      send: (input) => mailService.enqueue(input),
    },
    audit: {
      record: (entry) => auditService.record({
        tenantId: entry.tenantId ?? undefined,
        action: entry.action,
        resourceType: entry.resourceType,
        resourceId: entry.resourceId,
        changes: entry.changes,
      }),
    },
  };
}

function runtimeOptions(tenantId?: string | null) {
  const config = loadConfig();
  const policy = resolvePluginPermissionPolicy(
    config.plugins.allowedPermissions.length > 0 ? config.plugins.allowedPermissions : null
  );

  // Resolve o tenantId atual
  const currentTenantId = tenantId ?? getCurrentTenantIdSync();

  return {
    pluginsDir: resolveExtensionDirectory('plugin'),
    sql: getConnection(),
    tenantId: tenantId ?? null,
    permissionPolicy: policy.allowed,
    hookTimeoutMs: config.plugins.hookTimeoutMs,
    // Deps reais da API do plugin
    apiDeps: createApiDeps(currentTenantId),
  };
}

/**
 * Persiste o resultado da carga em `plugins.error`/`status`:
 *   - falha nova → `status = LOAD_FAILED` + mensagem;
 *   - sucesso depois de falha → `ACTIVATED` + `error = NULL`.
 * Only writes when the state changed (no UPDATE per request). Never throws.
 */
async function persistScopeResult(state: ScopeState): Promise<void> {
  const sql = getConnection();
  const previous = state.errors;
  const current = new Map(state.result.failed.map((failure) => [failure.name, failure.error]));

  try {
    for (const [name, error] of current) {
      if (previous.get(name) === error) continue;
      await sql.unsafe(
        `UPDATE plugins SET status = 'LOAD_FAILED', error = $1, updated_at = NOW()
         WHERE name = $2 AND status IN ('ACTIVATED', 'RUNNING', 'LOAD_FAILED')`,
        [error, name]
      );
    }

    // Falha resolvida nesta sync → devolve ACTIVATED e limpa a mensagem
    for (const name of previous.keys()) {
      if (current.has(name)) continue;
      await sql.unsafe(
        `UPDATE plugins SET status = 'ACTIVATED', error = NULL, updated_at = NOW()
         WHERE name = $1 AND status = 'LOAD_FAILED'`,
        [name]
      );
    }
  } catch {
    // an unavailable database cannot break the load — visibility stays in the in-memory state
  }
}

async function syncScope(tenantId: string | null, force: boolean): Promise<PluginBootstrapResult> {
  const key = scopeKey(tenantId);
  const config = loadConfig();
  const ttlMs = config.plugins.tenantLoadTtlMs;
  const cached = states.get(key);

  if (!force && cached && Date.now() - cached.loadedAt < ttlMs) {
    // LRU: acesso recente sobe na ordem
    states.delete(key);
    states.set(key, cached);
    return cached.result;
  }

  const running = inflight.get(key);
  if (running) return running;

  const promise = (async (): Promise<PluginBootstrapResult> => {
    try {
      const result = await (await getBootstrapPlugins())(runtimeOptions(tenantId));
      
      // Coleta rotas registradas pelos plugins neste escopo
      const scopeKey = key; // 'platform' ou 'tenant:<id>'
      const pluginRoutes = await (await getLoadedPluginRoutes())(scopeKey);
      for (const { pluginName, routes, rpm } of pluginRoutes) {
        registerPluginRoutes(pluginName, routes, rpm);
      }

      // Remove rotas de plugins que foram descarregados (unloaded)
      for (const pluginName of result.unloaded) {
        unregisterPluginRoutes(pluginName);
      }

      const previousErrors = states.get(key)?.errors ?? new Map<string, string>();
      const state: ScopeState = {
        key,
        tenantId,
        loadedAt: Date.now(),
        result,
        errors: previousErrors,
      };
      states.set(key, state);
      await persistScopeResult(state);
      state.errors = new Map(result.failed.map((failure: { name: string; error: string }) => [failure.name, failure.error]));
      await evictOldTenants(config.plugins.maxLoadedTenants);
      return result;
    } catch (error) {
      console.warn(
        `[plugins] sync unavailable (${key}): ${error instanceof Error ? error.message : String(error)}`
      );
      const fallback: PluginBootstrapResult = { enabled: [], loaded: [], unloaded: [], failed: [] };
      if (!states.has(key)) {
        states.set(key, { key, tenantId, loadedAt: 0, result: fallback, errors: new Map() });
      }
      return fallback;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, promise);
  return promise;
}

/** Evita crescer sem limite: descarta tenants com carga mais antiga. */
async function evictOldTenants(maxTenants: number): Promise<void> {
  if (states.size <= maxTenants) return;
  for (const [key, state] of [...states.entries()]) {
    if (states.size <= maxTenants) break;
    if (state.tenantId === null) continue; // platform nunca sai
    states.delete(key);
    await (await unloadTenant())(state.tenantId);
    (await (await getHookRegistryStore())).invalidateTenant(state.tenantId);
  }
}

/**
 * Sincroniza o registry **platform** com os plugins habilitados no banco.
 * Implicit force: this is the explicit boot/activation call — reflects the
 * database immediately. Idempotent and never throws.
 */
export async function syncEnabledPlugins(options: { force?: boolean } = {}): Promise<PluginBootstrapResult> {
  try {
    return await syncScope(null, options.force ?? true);
  } catch (error) {
    console.warn(
      `[plugins] sync unavailable: ${error instanceof Error ? error.message : String(error)}`
    );
    return { enabled: [], loaded: [], unloaded: [], failed: [] };
  }
}

/**
 * Ensures the tenant's plugins are loaded into its own registry.
 * Chamado sob demanda (middleware/API, web, worker) — com cache de TTL para
 * avoids hitting the database on every request. Never throws.
 */
export async function ensureTenantPluginsLoaded(
  tenantId: string,
  options: { force?: boolean } = {}
): Promise<PluginBootstrapResult> {
  if (!tenantId) return { enabled: [], loaded: [], unloaded: [], failed: [] };
  try {
    return await syncScope(tenantId, options.force ?? false);
  } catch (error) {
    console.warn(
      `[plugins] tenant sync unavailable: ${error instanceof Error ? error.message : String(error)}`
    );
    return { enabled: [], loaded: [], unloaded: [], failed: [] };
  }
}

/**
 * Invalidates a tenant's cache/registry (after enabling/disabling a link,
 * uninstalling or changing permissions). The tenant's next request reloads.
 */
export async function invalidateTenantPlugins(tenantId: string): Promise<void> {
  if (!tenantId) return;
  const key = scopeKey(tenantId);
  states.delete(key);
  inflight.delete(key);
  await (await unloadTenant())(tenantId);
  (await (await getHookRegistryStore())).invalidateTenant(tenantId);
}

/** Invalidates the platform scope (after global changes). */
export function invalidatePlatformPlugins(): void {
  states.delete(PLATFORM_KEY);
  inflight.delete(PLATFORM_KEY);
}

/** Per-scope load state — observability surface (WP2). */
export function getPluginsRuntimeState(): PluginsRuntimeState {
  return {
    generatedAt: new Date().toISOString(),
    scopes: [...states.values()].map((state) => ({
      scope: state.key,
      tenantId: state.tenantId,
      loadedAt: new Date(state.loadedAt).toISOString(),
      enabled: state.result.enabled,
      loaded: state.result.loaded,
      unloaded: state.result.unloaded,
      failed: state.result.failed,
    })),
  };
}
