// @oktis-works/core - Sincronização de plugins habilitados em runtime
//
// O PLUGIN.md promete que `register(registry)` é chamado quando o plugin é
// carregado — aqui o core cumpre isso para todos os processos (API, web,
// worker, dev). Dois escopos:
//
//   - **platform** (`syncEnabledPlugins`): plugins `tenant_id IS NULL`,
//     habilitados globalmente → registry platform, carregado no boot;
//   - **tenant** (`ensureTenantPluginsLoaded`): plugins vinculados em
//     `plugin_tenants` (status ENABLED) → registry do tenant, carregado sob
//     demanda na primeira requisição daquele tenant (cache com TTL + LRU).
//
// Nunca lança: falha de banco, diretório ausente ou plugin quebrado são
// reportadas no resultado (e persistidas em `plugins.error`), sem derrubar o
// boot. Falhas ficam visíveis em `getPluginsRuntimeState()` (rota
// `/api/v1/plugins/runtime` + badge no admin) — não são silenciadas.

// @oktis-works/core - Sincronização de plugins habilitados em runtime
//
// O PLUGIN.md promete que `register(registry)` é chamado quando o plugin é
// carregado — aqui o core cumpre isso para todos os processos (API, web,
// worker, dev). Dois escopos:
//
//   - **platform** (`syncEnabledPlugins`): plugins `tenant_id IS NULL`,
//     habilitados globalmente → registry platform, carregado no boot;
//   - **tenant** (`ensureTenantPluginsLoaded`): plugins vinculados em
//     `plugin_tenants` (status ENABLED) → registry do tenant, carregado sob
//     demanda na primeira requisição daquele tenant (cache com TTL + LRU).
//
// Nunca lança: falha de banco, diretório ausente ou plugin quebrado são
// reportadas no resultado (e persistidas em `plugins.error`), sem derrubar o
// boot. Falhas ficam visíveis em `getPluginsRuntimeState()` (rota
// `/api/v1/plugins/runtime` + badge no admin) — não são silenciadas.

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
import { getCurrentTenantIdSync, getCurrentUserIdSync, getCurrentRequestIdSync } from '../tenant/context.js';
import type { RouteDefinition, PluginBootstrapResult, PluginApiDependencies } from '@oktis-works/plugin-runtime';

// Dynamic imports for circular dependency with plugin-runtime
// Using require with computed string to avoid TypeScript compile-time checking
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
}

const pluginRoutesRegistry = new Map<string, PluginRouteEntry>();

/** Registra rotas de um plugin (chamado durante bootstrap). */
export function registerPluginRoutes(pluginName: string, routes: RouteDefinition[]): void {
  if (routes.length === 0) return;
  pluginRoutesRegistry.set(pluginName, { pluginName, routes });
}

/** Remove rotas de um plugin (quando desativado/desinstalado). */
export function unregisterPluginRoutes(pluginName: string): boolean {
  return pluginRoutesRegistry.delete(pluginName);
}

/** Obtém todas as rotas registradas para montagem no router da API. */
export function getRegisteredPluginRoutes(): PluginRouteEntry[] {
  return [...pluginRoutesRegistry.values()];
}

interface ScopeState {
  key: string;
  tenantId: string | null;
  loadedAt: number;
  result: PluginBootstrapResult;
  /** Falha por plugin na última sync (evita regravar quando não mudou). */
  errors: Map<string, string>;
}

/** Estados por escopo — ordem de iteração = LRU. */
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
        return conn.unsafe(sql, params ?? []);
      },
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
      // As rotas registradas aqui são coletadas no bootstrap pelo próprio
      // PluginAPI (getLoadedPluginRoutes) — neste ponto só registramos o log.
      console.debug(`[PluginAPI] ${routes.length} rota(s) registrada(s) — será coletada no bootstrap`);
    },
    registerContentFields: async (fields) => {
      // Guard explícito: com noUncheckedIndexedAccess, fields[0] é T | undefined
      // mesmo com o length check acima — o desctructuring com verificação
      // deixa o narrowing para o TS e mantém a mesma semântica.
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
        console.debug(`[PluginAPI] ${fields.length} campo(s) de conteúdo registrado(s) no field group "${groupKey}"`);
      } catch (error) {
        console.error('[PluginAPI] Falha ao registrar campos de conteúdo:', error);
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
      // Persistência idempotente de Custom Post Types de plugin (Item 1 do
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
                `[PluginAPI] Post type "${type.key}" já existe (${existing.source}) — "${type.pluginName}" não pode reivindicá-lo`
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
      // Persistência idempotente de Custom Taxonomies de plugin — ownership
      // gravado em meta.plugin (schema não tem sourceId para taxonomias).
      try {
        for (const taxonomy of taxonomies) {
          const existing = await taxonomyService.getBySlug(taxonomy.key);
          if (existing) {
            const owner = (existing.meta as Record<string, unknown> | undefined)?.['plugin'];
            if (owner !== undefined && owner !== taxonomy.pluginName) {
              console.warn(
                `[PluginAPI] Taxonomy "${taxonomy.key}" pertence ao plugin "${String(owner)}" — "${taxonomy.pluginName}" não pode reivindicá-la`
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
 * Só grava quando o estado mudou (nada de UPDATE por request). Nunca lança.
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
    // banco indisponível não pode derrubar a carga — visibilidade fica no estado em memória
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
      for (const { pluginName, routes } of pluginRoutes) {
        registerPluginRoutes(pluginName, routes);
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
        `[plugins] sync indisponível (${key}): ${error instanceof Error ? error.message : String(error)}`
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
 * Force implícito: é a chamada explícita de boot/ativação — reflete o banco
 * na hora. Idempotente e nunca lança.
 */
export async function syncEnabledPlugins(options: { force?: boolean } = {}): Promise<PluginBootstrapResult> {
  try {
    return await syncScope(null, options.force ?? true);
  } catch (error) {
    console.warn(
      `[plugins] sync indisponível: ${error instanceof Error ? error.message : String(error)}`
    );
    return { enabled: [], loaded: [], unloaded: [], failed: [] };
  }
}

/**
 * Garante que os plugins do tenant estão carregados no registry dele.
 * Chamado sob demanda (middleware/API, web, worker) — com cache de TTL para
 * não bater no banco a cada requisição. Nunca lança.
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
      `[plugins] sync do tenant indisponível: ${error instanceof Error ? error.message : String(error)}`
    );
    return { enabled: [], loaded: [], unloaded: [], failed: [] };
  }
}

/**
 * Invalida o cache/registry de um tenant (após ativar/desativar vínculo,
 * desinstalar ou mudar permissões). A próxima requisição do tenant recarrega.
 */
export async function invalidateTenantPlugins(tenantId: string): Promise<void> {
  if (!tenantId) return;
  const key = scopeKey(tenantId);
  states.delete(key);
  inflight.delete(key);
  await (await unloadTenant())(tenantId);
  (await (await getHookRegistryStore())).invalidateTenant(tenantId);
}

/** Invalida o escopo platform (após mudanças globais). */
export function invalidatePlatformPlugins(): void {
  states.delete(PLATFORM_KEY);
  inflight.delete(PLATFORM_KEY);
}

/** Estado de carga por escopo — superfície de observabilidade (WP2). */
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
