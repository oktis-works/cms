// @oktis-works/plugin-runtime - Plugin runtime bootstrap
//
// PLUGIN.md promises: "`register(registry)` is called when the plugin is
// loaded". This module honors it: discovers enabled plugins in the database
// (**platform** scope = `tenant_id IS NULL`; **tenant** scope = enabled
// `plugin_tenants`), imports the entrypoint, calls `register(registry)` with
// a hook API attributed to the plugin (BUSI-032/033) and syncs the scope
// registry.
//
// Rules:
//   - **never throws**: a broken plugin, invalid manifest, semantic
//     incompatibility or an unavailable database never break the boot
//     (failure isolation);
//   - **syncs with the database**: anything that left the enabled list has
//     its hooks removed from the registry (unload);
//   - **idempotent**: an already-loaded plugin is not reloaded (no duplicate
//     hooks) — repeated calls load only what is new;
//   - **per scope**: load state is indexed by scope (platform or a tenant),
//     so enabling/disabling in one tenant does not affect another.

import { createPluginHooksApi, type HookRegistryLike, type PluginJobHandler, type AdminExtensionsState, type PluginBlockManifest, type PluginPatternManifest, type EnqueuedAsset, type PluginHealthCheck, type PluginI18nApi, type PluginManifest } from '@oktis-works/plugin-sdk';
import { PLUGIN_PERMISSION_DEFAULT } from '@oktis-works/validation';
import { PluginLoader, type DiscoveredPlugin } from './loader.js';
import { PluginSandbox } from './sandbox.js';
import { getHookRegistry, getHookRegistryStore, type HookRegistry } from './hook-registry.js';
import type { PluginApiDependencies, PluginApiInternal, PluginAPI, RouteDefinition } from './plugin-api.js';

export interface BootstrapPluginsSql {
  unsafe(text: string, params?: unknown[]): Promise<unknown>;
}

export interface BootstrapPluginsOptions {
  /** Plugins directory (the caller resolves it — plugin-runtime doesn't know the core). */
  pluginsDir: string;
  /** Postgres client to read enabled plugins; omitted = unknown state (no-op). */
  sql?: BootstrapPluginsSql;
  /** Target registry (default: the scope registry — platform or `tenantId`). */
  registry?: HookRegistry;
  /** Statuses considered enabled (default: ACTIVATED, RUNNING). */
  enabledStatuses?: string[];
  /**
   * Load scope: `null`/omitted → platform (`plugins.tenant_id IS NULL`);
   * string → tenant (`plugin_tenants` with ENABLED status).
   */
  tenantId?: string | null;
  /**
   * Granted permission policy (allowlist). Default: the full CMS permission
   * catalog. Never filled with the manifest's own permissions.
   */
  permissionPolicy?: string[];
  /** Hook callback timeout in ms (0 = no timeout). Default 5000. */
  hookTimeoutMs?: number;
  /**
   * Real dependencies for the PluginAPI (settings, eventBus, db, etc.).
   * When omitted, only the legacy Hooks API is used (compatibility).
   * The core injects this with real services.
   */
  apiDeps?: Partial<PluginApiDependencies>;
}

export interface PluginBootstrapResult {
  /** Nomes habilitados no banco (vazio quando o banco falhou = estado desconhecido). */
  enabled: string[];
  /** Loaded in this sync. */
  loaded: string[];
  /** Hooks removed in this sync (left the enabled list). */
  unloaded: string[];
  /** Falhas isoladas por plugin (nunca abortam o lote). */
  failed: Array<{ name: string; error: string }>;
}

interface TrackedRegistration {
  type: 'action' | 'filter';
  name: string;
  callback: (...args: unknown[]) => unknown;
  priority: number;
}

interface LoadedEntry {
  registrations: TrackedRegistration[];
  internal?: PluginApiInternal;
  /** Manifesto original (rpm de rate limit das rotas, Item 17). */
  manifest: PluginManifest;
}

interface LoadedScope {
  registry: HookRegistry;
  /** name → registry registrations */
  plugins: Map<string, LoadedEntry>;
}

/** Estado de carga por escopo (`''` = platform, `tenant:<id>` = tenant). */
const loadedScopes = new Map<string, LoadedScope>();
const pendingScopeCleanups = new Map<string, Promise<void>>();

/** Platform scope uses the same key as the core ('platform') — external lookups match. */
const PLATFORM_SCOPE = 'platform';

function scopeKeyOf(tenantId?: string | null): string {
  return tenantId ? `tenant:${tenantId}` : PLATFORM_SCOPE;
}

async function awaitWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  if (timeoutMs <= 0) return promise;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`register() exceeded ${timeoutMs}ms`)), timeoutMs);
        (timer as unknown as { unref?: () => void }).unref?.();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function getScope(scopeKey: string, registry: HookRegistry): LoadedScope {
  let scope = loadedScopes.get(scopeKey);
  if (!scope) {
    scope = { registry, plugins: new Map() };
    loadedScopes.set(scopeKey, scope);
  }
  return scope;
}

/** Scope with registered loads (for inspection/runtime state). */
export function listLoadedScopes(): Array<{ scope: string; registry: HookRegistry; plugins: string[] }> {
  return [...loadedScopes.entries()].map(([scope, entry]) => ({
    scope,
    registry: entry.registry,
    plugins: [...entry.plugins.keys()],
  }));
}

/** Gets the routes registered by plugins in a scope. */
export function getLoadedPluginRoutes(scopeKey: string): Array<{
  pluginName: string;
  routes: RouteDefinition[];
  api: PluginAPI;
  scope: string;
  tenantId: string | null;
  /** Route rate-limit rpm (manifest rateLimit.rpm, Item 17). */
  rpm?: number;
}> {
  const scope = loadedScopes.get(scopeKey);
  if (!scope) return [];
  const result: Array<{ pluginName: string; routes: RouteDefinition[]; api: PluginAPI; scope: string; tenantId: string | null; rpm?: number }> = [];
  for (const [pluginName, entry] of scope.plugins) {
    if (entry.internal) {
      const routes = entry.internal.getRoutes();
      if (routes.length > 0) {
        const rpm = entry.manifest?.rateLimit?.rpm;
        result.push({
          pluginName,
          routes,
          api: entry.internal.getApi(),
          scope: scopeKey,
          tenantId: scopeKey === 'platform' ? null : scopeKey.slice('tenant:'.length),
          ...(typeof rpm === 'number' && rpm > 0 ? { rpm } : {}),
        });
      }
    }
  }
  return result;
}

/**
 * Handlers de jobs dos plugins em um escopo (dispatch pelo worker:
 * `plugin:{tenant}:{plugin}:{jobName}` → handler).
 */
export function getLoadedPluginJobHandlers(scopeKey: string): Array<{
  pluginName: string;
  handlers: Map<string, PluginJobHandler>;
}> {
  const scope = loadedScopes.get(scopeKey);
  if (!scope) return [];
  const result: Array<{ pluginName: string; handlers: Map<string, PluginJobHandler> }> = [];
  for (const [pluginName, entry] of scope.plugins) {
    if (entry.internal) {
      const handlers = entry.internal.getJobHandlers?.();
      if (handlers && handlers.size > 0) {
        result.push({ pluginName, handlers });
      }
    }
  }
  return result;
}

/**
 * Runtime `api.admin` state of the plugins loaded in a scope (slots
 * registered at runtime) — consumed by GET /api/v1/plugins/extensions, which
 * merges it with `manifest.admin`. Only states with at least one entry are
 * returned.
 */
export function getLoadedPluginAdminExtensions(scopeKey: string): Array<{
  pluginName: string;
  state: AdminExtensionsState;
}> {
  const scope = loadedScopes.get(scopeKey);
  if (!scope) return [];
  const result: Array<{ pluginName: string; state: AdminExtensionsState }> = [];
  for (const [pluginName, entry] of scope.plugins) {
    const state = entry.internal?.getAdminState?.();
    if (!state) continue;
    const hasEntries =
      state.menuPages.length > 0 ||
      state.submenuPages.length > 0 ||
      state.dashboardWidgets.length > 0 ||
      state.metaBoxes.length > 0 ||
      state.notices.length > 0 ||
      state.actionLinks.length > 0 ||
      (state.editors?.length ?? 0) > 0 ||
      Object.keys(state.columns).length > 0 ||
      Object.keys(state.columnRenderers).length > 0;
    if (hasEntries) result.push({ pluginName, state });
  }
  return result;
}

/**
 * Blocks registered at runtime via `api.registerBlock` by the plugins loaded
 * in a scope — consumed by GET /api/v1/blocks, which merges them with
 * `manifest.blocks`. Only plugins with at least one block are returned.
 */
export function getLoadedPluginBlocks(scopeKey: string): Array<{
  pluginName: string;
  blocks: Array<PluginBlockManifest & { pluginName: string }>;
}> {
  const scope = loadedScopes.get(scopeKey);
  if (!scope) return [];
  const result: Array<{ pluginName: string; blocks: Array<PluginBlockManifest & { pluginName: string }> }> = [];
  for (const [pluginName, entry] of scope.plugins) {
    const blocks = entry.internal?.getBlocks?.();
    if (blocks && blocks.length > 0) result.push({ pluginName, blocks });
  }
  return result;
}

/**
 * Patterns registered at runtime via `api.registerPattern` by the plugins
 * loaded in a scope — consumed by GET /api/v1/patterns, which merges them
 * with `manifest.patterns`. Only plugins with at least one pattern are
 * returned.
 */
export function getLoadedPluginPatterns(scopeKey: string): Array<{
  pluginName: string;
  patterns: Array<PluginPatternManifest & { pluginName: string }>;
}> {
  const scope = loadedScopes.get(scopeKey);
  if (!scope) return [];
  const result: Array<{ pluginName: string; patterns: Array<PluginPatternManifest & { pluginName: string }> }> = [];
  for (const [pluginName, entry] of scope.plugins) {
    const patterns = entry.internal?.getPatterns?.();
    if (patterns && patterns.length > 0) result.push({ pluginName, patterns });
  }
  return result;
}

/**
 * Assets enqueued at runtime via `api.assets` by the plugins loaded in a
 * scope — consumed by the public renderer (theme:head pipeline, Item 8).
 * Only plugins with at least one asset are returned.
 */
export function getLoadedPluginAssets(scopeKey: string): Array<{
  pluginName: string;
  assets: EnqueuedAsset[];
}> {
  const scope = loadedScopes.get(scopeKey);
  if (!scope) return [];
  const result: Array<{ pluginName: string; assets: EnqueuedAsset[] }> = [];
  for (const [pluginName, entry] of scope.plugins) {
    const assets = entry.internal?.getEnqueuedAssets?.();
    if (assets && assets.length > 0) result.push({ pluginName, assets });
  }
  return result;
}

/**
 * Health checks registered at runtime via `api.health` by the plugins loaded
 * in a scope — aggregated by GET /api/v1/health (Item 14). Only plugins with
 * at least one check are returned.
 */
export function getLoadedPluginHealthChecks(scopeKey: string): Array<{
  pluginName: string;
  checks: Array<{ name: string; check: PluginHealthCheck }>;
}> {
  const scope = loadedScopes.get(scopeKey);
  if (!scope) return [];
  const result: Array<{ pluginName: string; checks: Array<{ name: string; check: PluginHealthCheck }> }> = [];
  for (const [pluginName, entry] of scope.plugins) {
    const checks = entry.internal?.getHealthChecks?.();
    if (checks && checks.length > 0) result.push({ pluginName, checks });
  }
  return result;
}

/**
 * Removes all hooks from the loaded scopes and clears the state.
 * Useful in tests and shutdown. When `registry` is given, hooks are removed
 * from it; otherwise from the registry where they were registered.
 */
export function resetLoadedPlugins(registry?: HookRegistry): void {
  for (const [scopeKey, scope] of loadedScopes) {
    const target = registry ?? scope.registry;
    for (const entry of scope.plugins.values()) {
      for (const reg of entry.registrations) {
        if (reg.type === 'action') target.removeAction(reg.name, reg.callback, reg.priority);
        else target.removeFilter(reg.name, reg.callback, reg.priority);
      }
      void entry.internal?.cleanup();
    }
    loadedScopes.delete(scopeKey);
  }
}

/** Descarrega todos os plugins de um escopo (tenant desativado / LRU). */
export function unloadScope(scopeKey: string): boolean {
  const scope = loadedScopes.get(scopeKey);
  if (!scope) return false;
  const cleanups: Promise<void>[] = [];
  for (const entry of scope.plugins.values()) {
    for (const reg of entry.registrations) {
      if (reg.type === 'action') scope.registry.removeAction(reg.name, reg.callback, reg.priority);
      else scope.registry.removeFilter(reg.name, reg.callback, reg.priority);
    }
    if (entry.internal) cleanups.push(entry.internal.cleanup());
  }
  loadedScopes.delete(scopeKey);
  if (cleanups.length > 0) {
    pendingScopeCleanups.set(scopeKey, Promise.all(cleanups).then(() => undefined).finally(() => pendingScopeCleanups.delete(scopeKey)));
  }
  return true;
}

/** Unloads a tenant (key `tenant:<id>` or the id itself). */
export function unloadTenant(tenantId: string): boolean {
  return unloadScope(scopeKeyOf(tenantId));
}

async function unloadPlugin(scope: LoadedScope, name: string): Promise<boolean> {
  const entry = scope.plugins.get(name);
  if (!entry) return false;
  for (const reg of entry.registrations) {
    if (reg.type === 'action') scope.registry.removeAction(reg.name, reg.callback, reg.priority);
    else scope.registry.removeFilter(reg.name, reg.callback, reg.priority);
  }
  await entry.internal?.cleanup();
  scope.plugins.delete(name);
  return true;
}

/**
 * Registry que grava cada registro num sink (para poder descarregar depois),
 * delegates to the real registry with the SDK-attributed `sourceId` and
 * **applies the sandbox timeout** to the registered callback (WP5 — real
 * protection against a hanging hook; documented as limited to async work).
 */
function recordingRegistry(
  registry: HookRegistry,
  sink: TrackedRegistration[],
  sandbox: PluginSandbox
): HookRegistryLike {
  const acceptedArgsOf = (callback: (...args: unknown[]) => unknown, explicit?: number): number =>
    explicit ?? callback.length;

  return {
    addAction(action: string, callback: (...args: unknown[]) => unknown, options?: { priority?: number; acceptedArgs?: number }) {
      const wrapped = sandbox.wrapCallback(callback);
      sink.push({ type: 'action', name: action, callback: wrapped, priority: options?.priority ?? 10 });
      registry.addAction(action, wrapped, { ...options, acceptedArgs: acceptedArgsOf(callback, options?.acceptedArgs) });
    },
    addFilter(filter: string, callback: (...args: unknown[]) => unknown, options?: { priority?: number; acceptedArgs?: number }) {
      const wrapped = sandbox.wrapCallback(callback);
      sink.push({ type: 'filter', name: filter, callback: wrapped, priority: options?.priority ?? 10 });
      registry.addFilter(filter, wrapped, { ...options, acceptedArgs: acceptedArgsOf(callback, options?.acceptedArgs) });
    },
    removeAction: (action: string, callback: (...args: unknown[]) => unknown, priority?: number) => registry.removeAction(action, callback, priority),
    removeFilter: (action: string, callback: (...args: unknown[]) => unknown, priority?: number) => registry.removeFilter(action, callback, priority),
    hasAction: (action: string, callback?: (...args: unknown[]) => unknown) => registry.hasAction(action, callback),
    hasFilter: (action: string, callback?: (...args: unknown[]) => unknown) => registry.hasFilter(action, callback),
    didAction: (action: string) => registry.didAction(action),
    getCurrentHook: () => registry.getCurrentHook(),
  };
}

/** Query de habilitados por escopo. */
function enabledQuery(tenantId?: string | null): { text: string; params?: unknown[] } {
  if (tenantId) {
    return {
      text: `SELECT p.name FROM plugins p
             JOIN plugin_tenants pt ON pt.plugin_id = p.id
             WHERE pt.tenant_id = $1 AND pt.status = 'ENABLED'
               AND p.status NOT IN ('UNINSTALLED', 'MISSING')`,
      params: [tenantId],
    };
  }
  return { text: 'SELECT name FROM plugins WHERE status = ANY($1) AND tenant_id IS NULL' };
}

/**
 * Sincroniza o registry de um escopo com os plugins habilitados no banco.
 * Seguro para chamar no boot de qualquer processo e em re-syncs (ex.: logo
 * after enabling/disabling through the API).
 */
export async function bootstrapPlugins(options: BootstrapPluginsOptions): Promise<PluginBootstrapResult> {
  const scopeKey = scopeKeyOf(options.tenantId);
  const pendingCleanup = pendingScopeCleanups.get(scopeKey);
  if (pendingCleanup) await pendingCleanup;
  const registry =
    options.registry ??
    (options.tenantId ? getHookRegistryStore().tenant(options.tenantId) : getHookRegistry());
  const statuses = options.enabledStatuses ?? ['ACTIVATED', 'RUNNING'];
  const result: PluginBootstrapResult = { enabled: [], loaded: [], unloaded: [], failed: [] };

  // 1) Who is enabled in the database? Failure = unknown state → touch nothing.
  let enabled: string[] | null = null;
  if (options.sql) {
    try {
      const query = enabledQuery(options.tenantId);
      const rows = (await options.sql.unsafe(
        query.text,
        options.tenantId ? query.params : [statuses]
      )) as Array<{ name?: string }>;
      enabled = rows
        .map((row) => row.name)
        .filter((name): name is string => typeof name === 'string' && name.length > 0);
    } catch {
      enabled = null;
    }
  }
  result.enabled = enabled ?? [];
  if (enabled === null) return result;

  // 2) Discovers in the directory (missing directory = no plugins, not an error)
  const loader = new PluginLoader(options.pluginsDir);
  let discovered: DiscoveredPlugin[] = [];
  try {
    discovered = await loader.discoverPlugins();
  } catch {
    discovered = [];
  }

  const scope = getScope(scopeKey, registry);

  // 3) Descarrega quem saiu da lista de habilitados (deste escopo)
  for (const name of [...scope.plugins.keys()]) {
    if (!enabled.includes(name) && await unloadPlugin(scope, name)) {
      result.unloaded.push(name);
    }
  }

  // 4) Loads enabled-but-not-yet-loaded plugins, honoring dependency order
  const enabledDiscovered = discovered.filter((entry) => enabled.includes(entry.manifest.name));
  let levels: DiscoveredPlugin[][];
  try {
    levels = loader.resolveDependencies(enabledDiscovered);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    for (const entry of enabledDiscovered) result.failed.push({ name: entry.manifest.name, error: message });
    return result;
  }

  for (const failure of loader.getDependencyFailures()) {
    result.failed.push(failure);
  }

  // Permission policy: configuration allowlist (or the full catalog).
  const policy = options.permissionPolicy ?? PLUGIN_PERMISSION_DEFAULT;
  const timeoutMs = options.hookTimeoutMs ?? 5000;

  for (const level of levels) {
    for (const entry of level) {
      const name = entry.manifest.name;
      if (scope.plugins.has(name)) continue;
      let registrations: TrackedRegistration[] = [];
      let internal: PluginApiInternal | undefined;

      try {
        const loaded = await loader.loadPlugin(entry.manifest, entry.path);

        // Effective permissions are the intersection of the deployment policy
        // and the permissions explicitly declared by this plugin.
        // A missing permissions field is the v1 compatibility form and means
        // the plugin has not opted into the v2 capability declaration yet.
        // An explicit empty array remains least-privilege and grants nothing.
        const declaredPermissions = new Set(entry.manifest.permissions ?? PLUGIN_PERMISSION_DEFAULT);
        const effectivePermissions = policy.filter((permission) => declaredPermissions.has(permission));
        const sandbox = new PluginSandbox({ allowedPermissions: effectivePermissions, timeoutMs });
        sandbox.loadPlugin(entry.manifest, loaded.api);

        // Contrato do PLUGIN.md: module.exports.register(registry)
        const register = (loaded.api as unknown as { register?: unknown }).register;
        if (typeof register !== 'function') {
          throw new Error('does not export register(registry)');
        }

        // Item 20: plugin schema migrations (manifest.migrations[]) run
        // BEFORE register(), once per plugin (global registry in
        // plugin_schema_migrations). Checksum drift fails the plugin isolated.
        if (options.sql && Array.isArray(entry.manifest.migrations) && entry.manifest.migrations.length > 0) {
          const { applyPluginMigrations } = await import('./plugin-migrations.js');
          const migrationResult = await applyPluginMigrations(options.sql, name, entry.path, entry.manifest.migrations);
          if (migrationResult.drift.length > 0) {
            throw new Error(`Plugin migration drift: ${migrationResult.drift.join('; ')}`);
          }
        }

        registrations = [];

        // Se o core forneceu apiDeps, cria a API completa (hooks + settings + query + routes + ...)
        // Otherwise, only the legacy Hooks API is used (compatibility).
        let apiToPass: unknown;
        internal = undefined;
        if (options.apiDeps) {
          // Merges the core deps with the plugin/runtime-specific ones
          const deps: PluginApiDependencies = {
            hooks: recordingRegistry(registry, registrations, sandbox),
            manifest: entry.manifest,
            settings: options.apiDeps.settings ?? { get: async () => undefined, set: async () => {} },
            eventBus: options.apiDeps.eventBus ?? { emit: async () => {} },
            db: options.apiDeps.db ?? { query: async () => [] },
            getTenantId: options.apiDeps.getTenantId ?? (() => options.tenantId ?? null),
            getUserId: options.apiDeps.getUserId ?? (() => null),
            getRequestId: options.apiDeps.getRequestId ?? (() => crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)),
            getTenantById: options.apiDeps.getTenantById ?? (async () => null),
            getUserById: options.apiDeps.getUserById ?? (async () => null),
            registerRoutes: options.apiDeps.registerRoutes ?? (() => {}),
            registerContentFields: options.apiDeps.registerContentFields ?? (() => {}),
            registerFieldTypes: options.apiDeps.registerFieldTypes ?? (() => {}),
            registerPostTypes: options.apiDeps.registerPostTypes ?? (() => {}),
            registerTaxonomies: options.apiDeps.registerTaxonomies ?? (() => {}),
            // Core cache backend; absent → in-memory fallback in the factory
            cache: options.apiDeps.cache,
            // Backend de jobs do core; ausente → schedule/enqueue retornam false
            jobs: options.apiDeps.jobs,
            allowedPermissions: effectivePermissions,
          };
          // Creates the full API using the internal factory
          const { createPluginApi } = await import('./plugin-api.js');
          const apiResult = createPluginApi(deps);
          apiToPass = apiResult.api;
          internal = apiResult.internal;

          // Item 9: loads the manifest `locales[]` files before register()
          // — translations already available during boot. File failure is
          // silent (fallback = the key itself).
          try {
            const { loadPluginLocales } = await import('./i18n.js');
            const i18n = (apiResult.api as { i18n?: PluginI18nApi }).i18n;
            if (i18n) await loadPluginLocales(entry.path, entry.manifest, i18n);
          } catch {
            // i18n unavailable — boot continues
          }
        } else {
          apiToPass = createPluginHooksApi(name, recordingRegistry(registry, registrations, sandbox));
        }

        // register() may be async — we await it (with the same hook timeout)
        // so rejections become an isolated failure instead of an unhandled
        // rejection: previously a throwing async register escaped the
        // try/catch and became an unhandled process error.
        await awaitWithTimeout(
          Promise.resolve((register as (registry: unknown) => unknown)(apiToPass)),
          timeoutMs
        );

        if (internal) {
          const typedApi = apiToPass as PluginAPI;

          // Declarative manifest registrations use the same validation and
          // permission checks as imperative registrations.
          for (const fieldType of entry.manifest.fieldTypes ?? []) typedApi.addFieldType(fieldType);
          for (const block of entry.manifest.blocks ?? []) typedApi.registerBlock(block);
          for (const pattern of entry.manifest.patterns ?? []) typedApi.registerPattern(pattern);
          for (const postType of entry.manifest.postTypes ?? []) typedApi.addPostType(postType);
          for (const taxonomy of entry.manifest.taxonomies ?? []) typedApi.addTaxonomy(taxonomy);
          if (internal.getFields().length > 0) {
            await options.apiDeps?.registerContentFields?.(internal.getFields(), name);
          }

          scope.plugins.set(name, { registrations, internal, manifest: entry.manifest });

          await options.apiDeps?.registerPostTypes?.(internal.getPostTypes());
          await options.apiDeps?.registerTaxonomies?.(internal.getTaxonomies());

          // Jobs declarados no manifesto (v2): agenda recorrente via api.jobs
          // (same validation/permission/ceiling as the imperative path).
          if (entry.manifest.scheduleJobs?.length) {
            const typedApi = apiToPass as PluginAPI;
            for (const job of entry.manifest.scheduleJobs) {
              try {
                await typedApi.jobs.schedule(job.name, { every: job.every, cron: job.cron });
              } catch (e) {
                console.warn(`[plugins] Failed to schedule declared job "${job.name}" for ${name}:`, e);
              }
            }
          }

          // Persist field types registered by this plugin
          if (internal.getFieldTypes && internal.getFieldTypes().length > 0) {
            const fieldTypes = internal.getFieldTypes();
            try {
              // Import fieldTypeExtensionService dynamically to avoid circular deps:
              // core depends on plugin-runtime, so plugin-runtime cannot declare core
              // as a dependency (and packages/core/dist does not exist yet when this
              // package is built). A non-literal specifier keeps TypeScript from
              // resolving the module at compile time; resolution happens at runtime.
              const coreModuleId = '@oktis-works/core';
              const core = (await import(coreModuleId)) as {
                fieldTypeExtensionService: {
                  register: (fieldType: unknown) => Promise<unknown>;
                  reconcilePlugin?: (pluginName: string, fieldTypes: unknown[]) => Promise<void>;
                  syncToRegistry: () => Promise<void>;
                };
              };
              const { fieldTypeExtensionService } = core;
              if (fieldTypeExtensionService.reconcilePlugin) {
                await fieldTypeExtensionService.reconcilePlugin(name, fieldTypes as unknown[]);
              } else {
                for (const ft of fieldTypes) await fieldTypeExtensionService.register(ft as any);
              }
              // Sync to in-memory registry
              await fieldTypeExtensionService.syncToRegistry();
            } catch (e) {
              throw new Error(`Failed to persist field types for ${name}: ${e instanceof Error ? e.message : String(e)}`);
            }
          }
        } else {
          scope.plugins.set(name, { registrations, manifest: entry.manifest });
        }
        result.loaded.push(name);
      } catch (error) {
        if (internal) await internal.cleanup();
        if (internal) internal.reset();
        for (const reg of registrations) {
          if (reg.type === 'action') registry.removeAction(reg.name, reg.callback, reg.priority);
          else registry.removeFilter(reg.name, reg.callback, reg.priority);
        }
        // Failure isolation: a broken plugin never blocks the others or the boot
        result.failed.push({ name, error: error instanceof Error ? error.message : String(error) });
      }
    }
  }

  return result;
}
