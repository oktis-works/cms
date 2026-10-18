// @oktis-works/plugin-runtime - Bootstrap de plugins em runtime
//
// O PLUGIN.md promete: "`register(registry)` é chamado quando o plugin é
// carregado". Este módulo cumpre a promessa: descobre os plugins habilitados
// no banco (escopo **platform** = `tenant_id IS NULL`; escopo **tenant** =
// `plugin_tenants` habilitados), importa o entrypoint, chama
// `register(registry)` com uma API de hooks atribuída ao plugin (BUSI-032/033)
// e sincroniza o registry do escopo.
//
// Regras:
//   - **nunca lança**: plugin quebrado, manifesto inválido, incompatibilidade
//     semântica ou banco indisponível não derrubam o boot (isolamento de falha);
//   - **sincroniza com o banco**: quem saiu da lista de habilitados tem os
//     hooks removidos do registry (unload);
//   - **idempotente**: plugin já carregado não é recarregado (sem hooks
//     duplicados) — chamadas repetidas carregam só o que é novo;
//   - **por escopo**: o estado de carga é indexado por escopo (platform ou um
//     tenant), então ativar/desativar num tenant não afeta outro.

import { createPluginHooksApi, type HookRegistryLike } from '@oktis-works/plugin-sdk';
import { PLUGIN_PERMISSION_DEFAULT } from '@oktis-works/validation';
import { PluginLoader, type DiscoveredPlugin } from './loader.js';
import { PluginSandbox } from './sandbox.js';
import { getHookRegistry, getHookRegistryStore, type HookRegistry } from './hook-registry.js';
import type { PluginApiDependencies, PluginApiInternal, RouteDefinition } from './plugin-api.js';

export interface BootstrapPluginsSql {
  unsafe(text: string, params?: unknown[]): Promise<unknown>;
}

export interface BootstrapPluginsOptions {
  /** Diretório de plugins (o chamador resolve — plugin-runtime não conhece o core). */
  pluginsDir: string;
  /** Cliente postgres para ler os habilitados; omitido = estado desconhecido (no-op). */
  sql?: BootstrapPluginsSql;
  /** Registry alvo (default: registry do escopo — platform ou `tenantId`). */
  registry?: HookRegistry;
  /** Statuses considerados habilitados (default: ACTIVATED, RUNNING). */
  enabledStatuses?: string[];
  /**
   * Escopo de carga: `null`/omitido → platform (`plugins.tenant_id IS NULL`);
   * string → tenant (`plugin_tenants` com status ENABLED).
   */
  tenantId?: string | null;
  /**
   * Política de permissões concedidas (allowlist). Default: catálogo completo
   * de permissões do CMS. Nunca é preenchida com as permissões do manifesto.
   */
  permissionPolicy?: string[];
  /** Timeout de callbacks de hook em ms (0 = sem timeout). Default 5000. */
  hookTimeoutMs?: number;
  /**
   * Dependências reais para a PluginAPI (settings, eventBus, db, etc.).
   * Se omitido, usa apenas o Hooks API legado (compatibilidade).
   * O core injeta isto com serviços reais.
   */
  apiDeps?: Partial<PluginApiDependencies>;
}

export interface PluginBootstrapResult {
  /** Nomes habilitados no banco (vazio quando o banco falhou = estado desconhecido). */
  enabled: string[];
  /** Registrados nesta sincronização. */
  loaded: string[];
  /** Hooks removidos nesta sincronização (saíram dos habilitados). */
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
}

interface LoadedScope {
  registry: HookRegistry;
  /** nome → registros no registry */
  plugins: Map<string, LoadedEntry>;
}

/** Estado de carga por escopo (`''` = platform, `tenant:<id>` = tenant). */
const loadedScopes = new Map<string, LoadedScope>();

function scopeKeyOf(tenantId?: string | null): string {
  return tenantId ? `tenant:${tenantId}` : '';
}

function getScope(scopeKey: string, registry: HookRegistry): LoadedScope {
  let scope = loadedScopes.get(scopeKey);
  if (!scope) {
    scope = { registry, plugins: new Map() };
    loadedScopes.set(scopeKey, scope);
  }
  return scope;
}

/** Escopo com carga registrada (para inspeção/estado de runtime). */
export function listLoadedScopes(): Array<{ scope: string; registry: HookRegistry; plugins: string[] }> {
  return [...loadedScopes.entries()].map(([scope, entry]) => ({
    scope,
    registry: entry.registry,
    plugins: [...entry.plugins.keys()],
  }));
}

/** Obtém as rotas registradas pelos plugins em um escopo. */
export function getLoadedPluginRoutes(scopeKey: string): Array<{ pluginName: string; routes: RouteDefinition[] }> {
  const scope = loadedScopes.get(scopeKey);
  if (!scope) return [];
  const result: Array<{ pluginName: string; routes: RouteDefinition[] }> = [];
  for (const [pluginName, entry] of scope.plugins) {
    if (entry.internal) {
      const routes = entry.internal.getRoutes();
      if (routes.length > 0) {
        result.push({ pluginName, routes });
      }
    }
  }
  return result;
}

/**
 * Remove todos os hooks dos escopos carregados e limpa o estado.
 * Útil em testes e em shutdown. Quando `registry` é informado, os hooks são
 * removidos dele; caso contrário, do registry em que foram registrados.
 */
export function resetLoadedPlugins(registry?: HookRegistry): void {
  for (const [scopeKey, scope] of loadedScopes) {
    const target = registry ?? scope.registry;
    for (const entry of scope.plugins.values()) {
      for (const reg of entry.registrations) {
        if (reg.type === 'action') target.removeAction(reg.name, reg.callback, reg.priority);
        else target.removeFilter(reg.name, reg.callback, reg.priority);
      }
    }
    loadedScopes.delete(scopeKey);
  }
}

/** Descarrega todos os plugins de um escopo (tenant desativado / LRU). */
export function unloadScope(scopeKey: string): boolean {
  const scope = loadedScopes.get(scopeKey);
  if (!scope) return false;
  for (const entry of scope.plugins.values()) {
    for (const reg of entry.registrations) {
      if (reg.type === 'action') scope.registry.removeAction(reg.name, reg.callback, reg.priority);
      else scope.registry.removeFilter(reg.name, reg.callback, reg.priority);
    }
  }
  loadedScopes.delete(scopeKey);
  return true;
}

/** Descarrega um tenant (chave `tenant:<id>` ou o próprio id). */
export function unloadTenant(tenantId: string): boolean {
  return unloadScope(scopeKeyOf(tenantId));
}

function unloadPlugin(scope: LoadedScope, name: string): boolean {
  const entry = scope.plugins.get(name);
  if (!entry) return false;
  for (const reg of entry.registrations) {
    if (reg.type === 'action') scope.registry.removeAction(reg.name, reg.callback, reg.priority);
    else scope.registry.removeFilter(reg.name, reg.callback, reg.priority);
  }
  scope.plugins.delete(name);
  return true;
}

/**
 * Registry que grava cada registro num sink (para poder descarregar depois),
 * delega ao registry real com `sourceId` atribuído pelo SDK e **aplica o
 * timeout do sandbox** no callback registrado (WP5 — proteção real contra hook
 * pendurado; documentada como limitada a trabalho assíncrono).
 */
function recordingRegistry(
  registry: HookRegistry,
  sink: TrackedRegistration[],
  sandbox: PluginSandbox
): HookRegistryLike {
  const acceptedArgsOf = (callback: (...args: unknown[]) => unknown, explicit?: number): number =>
    explicit ?? callback.length;

  return {
    addAction(action, callback, options) {
      const wrapped = sandbox.wrapCallback(callback);
      sink.push({ type: 'action', name: action, callback: wrapped, priority: options?.priority ?? 10 });
      registry.addAction(action, wrapped, { ...options, acceptedArgs: acceptedArgsOf(callback, options?.acceptedArgs) });
    },
    addFilter(filter, callback, options) {
      const wrapped = sandbox.wrapCallback(callback);
      sink.push({ type: 'filter', name: filter, callback: wrapped, priority: options?.priority ?? 10 });
      registry.addFilter(filter, wrapped, { ...options, acceptedArgs: acceptedArgsOf(callback, options?.acceptedArgs) });
    },
    removeAction: (action, callback, priority) => registry.removeAction(action, callback, priority),
    removeFilter: (action, callback, priority) => registry.removeFilter(action, callback, priority),
    hasAction: (action, callback) => registry.hasAction(action, callback),
    hasFilter: (action, callback) => registry.hasFilter(action, callback),
    didAction: (action) => registry.didAction(action),
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
 * após ativar/desativar pela API).
 */
export async function bootstrapPlugins(options: BootstrapPluginsOptions): Promise<PluginBootstrapResult> {
  const scopeKey = scopeKeyOf(options.tenantId);
  const registry =
    options.registry ??
    (options.tenantId ? getHookRegistryStore().tenant(options.tenantId) : getHookRegistry());
  const statuses = options.enabledStatuses ?? ['ACTIVATED', 'RUNNING'];
  const result: PluginBootstrapResult = { enabled: [], loaded: [], unloaded: [], failed: [] };

  // 1) Quem está habilitado no banco? Falha = estado desconhecido → não toca em nada.
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

  // 2) Descobre no diretório (diretório ausente = nenhum plugin, não é erro)
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
    if (!enabled.includes(name) && unloadPlugin(scope, name)) {
      result.unloaded.push(name);
    }
  }

  // 4) Carrega habilitados ainda não carregados, respeitando ordem de dependência
  const enabledDiscovered = discovered.filter((entry) => enabled.includes(entry.manifest.name));
  let levels: DiscoveredPlugin[][];
  try {
    levels = loader.resolveDependencies(enabledDiscovered);
  } catch {
    levels = enabledDiscovered.map((entry) => [entry]); // ordenação falhou: ordem arbitrária
  }

  // Política de permissões: allowlist de configuração (ou catálogo completo).
  const policy = options.permissionPolicy ?? PLUGIN_PERMISSION_DEFAULT;
  const timeoutMs = options.hookTimeoutMs ?? 5000;

  for (const level of levels) {
    for (const entry of level) {
      const name = entry.manifest.name;
      if (scope.plugins.has(name)) continue;

      try {
        const loaded = await loader.loadPlugin(entry.manifest, entry.path);

        // O sandbox valida o manifesto contra a POLÍTICA (nunca contra si mesmo)
        const sandbox = new PluginSandbox({ allowedPermissions: [...policy], timeoutMs });
        sandbox.loadPlugin(entry.manifest, loaded.api);

        // Contrato do PLUGIN.md: module.exports.register(registry)
        const register = (loaded.api as unknown as { register?: unknown }).register;
        if (typeof register !== 'function') {
          throw new Error('não exporta register(registry)');
        }

        const registrations: TrackedRegistration[] = [];

        // Se o core forneceu apiDeps, cria a API completa (hooks + settings + query + routes + ...)
        // Caso contrário, usa apenas o Hooks API legado (compatibilidade).
        let apiToPass: unknown;
        let internal: PluginApiInternal | undefined;
        if (options.apiDeps) {
          // Mescla os deps do core com os específicos do plugin/runtime
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
            allowedPermissions: [...policy],
          };
          // Cria a API completa usando a fábrica interna
          const { createPluginApi } = await import('./plugin-api.js');
          const apiResult = createPluginApi(deps);
          apiToPass = apiResult.api;
          internal = apiResult.internal;
        } else {
          apiToPass = createPluginHooksApi(name, recordingRegistry(registry, registrations, sandbox));
        }

        (register as (registry: unknown) => void)(apiToPass);

        if (internal) {
          scope.plugins.set(name, { registrations, internal });
          
          // Persist field types registered by this plugin
          if (internal.getFieldTypes && internal.getFieldTypes().length > 0) {
            const fieldTypes = internal.getFieldTypes();
            try {
              // Import fieldTypeExtensionService dynamically to avoid circular deps
              const { fieldTypeExtensionService } = await import('@oktis-works/core');
              for (const ft of fieldTypes) {
                await fieldTypeExtensionService.register(ft as any);
              }
              // Sync to in-memory registry
              await fieldTypeExtensionService.syncToRegistry();
            } catch (e) {
              console.warn(`[plugins] Failed to persist field types for ${name}:`, e);
            }
          }
        } else {
          scope.plugins.set(name, { registrations });
        }
        result.loaded.push(name);
      } catch (error) {
        // Isolamento de falha: plugin quebrado não impede os demais nem o boot
        result.failed.push({ name, error: error instanceof Error ? error.message : String(error) });
      }
    }
  }

  return result;
}
