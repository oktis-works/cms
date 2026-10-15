// @oktis-works/plugin-runtime - Bootstrap de plugins em runtime
//
// O PLUGIN.md promete: "`register(registry)` é chamado quando o plugin é
// carregado". Este módulo cumpre a promessa: descobre os plugins habilitados
// no banco (status ACTIVATED/RUNNING), importa o entrypoint, chama
// `register(registry)` com uma API de hooks atribuída ao plugin (BUSI-032/033)
// e sincroniza o registry compartilhado.
//
// Regras:
//   - **nunca lança**: plugin quebrado, manifesto inválido, incompatibilidade
//     semântica ou banco indisponível não derrubam o boot (isolamento de falha);
//   - **sincroniza com o banco**: quem saiu da lista de habilitados tem os
//     hooks removidos do registry (unload);
//   - **idempotente**: plugin já carregado não é recarregado (sem hooks
//     duplicados) — chamadas repetidas carregam só o que é novo.

import { createPluginHooksApi, type HookRegistryLike } from '@oktis-works/plugin-sdk';
import { PluginLoader, type DiscoveredPlugin } from './loader.js';
import { PluginSandbox } from './sandbox.js';
import { getHookRegistry, type HookRegistry } from './hook-registry.js';

export interface BootstrapPluginsSql {
  unsafe(text: string, params?: unknown[]): Promise<unknown>;
}

export interface BootstrapPluginsOptions {
  /** Diretório de plugins (o chamador resolve — plugin-runtime não conhece o core). */
  pluginsDir: string;
  /** Cliente postgres para ler os habilitados; omitido = estado desconhecido (no-op). */
  sql?: BootstrapPluginsSql;
  /** Registry alvo (default: o singleton compartilhado usado por core/web). */
  registry?: HookRegistry;
  /** Statuses considerados habilitados (default: ACTIVATED, RUNNING). */
  enabledStatuses?: string[];
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
}

/** Plugins carregados neste processo (nome → registros no registry). */
const loadedPlugins = new Map<string, LoadedEntry>();

/**
 * Remove todos os hooks de um plugin do registry e limpa o estado.
 * Útil em testes e em shutdown.
 */
export function resetLoadedPlugins(registry?: HookRegistry): void {
  const target = registry ?? getHookRegistry();
  for (const [name, entry] of loadedPlugins) {
    for (const reg of entry.registrations) {
      if (reg.type === 'action') target.removeAction(reg.name, reg.callback, reg.priority);
      else target.removeFilter(reg.name, reg.callback, reg.priority);
    }
    loadedPlugins.delete(name);
  }
}

function unloadPlugin(name: string, registry: HookRegistry): boolean {
  const entry = loadedPlugins.get(name);
  if (!entry) return false;
  for (const reg of entry.registrations) {
    if (reg.type === 'action') registry.removeAction(reg.name, reg.callback, reg.priority);
    else registry.removeFilter(reg.name, reg.callback, reg.priority);
  }
  loadedPlugins.delete(name);
  return true;
}

/**
 * Registry que grava cada registro num sink (para poder descarregar depois)
 * e delega ao registry real com `sourceId` já atribuído pelo SDK.
 */
function recordingRegistry(registry: HookRegistry, sink: TrackedRegistration[]): HookRegistryLike {
  return {
    addAction(action, callback, options) {
      sink.push({ type: 'action', name: action, callback, priority: options?.priority ?? 10 });
      registry.addAction(action, callback, options);
    },
    addFilter(filter, callback, options) {
      sink.push({ type: 'filter', name: filter, callback, priority: options?.priority ?? 10 });
      registry.addFilter(filter, callback, options);
    },
    removeAction: (action, callback, priority) => registry.removeAction(action, callback, priority),
    removeFilter: (action, callback, priority) => registry.removeFilter(action, callback, priority),
    hasAction: (action, callback) => registry.hasAction(action, callback),
    hasFilter: (action, callback) => registry.hasFilter(action, callback),
    didAction: (action) => registry.didAction(action),
    getCurrentHook: () => registry.getCurrentHook(),
  };
}

/**
 * Sincroniza o registry com os plugins habilitados no banco.
 * Seguro para chamar no boot de qualquer processo e em re-syncs (ex.: logo
 * após ativar/desativar pela API).
 */
export async function bootstrapPlugins(options: BootstrapPluginsOptions): Promise<PluginBootstrapResult> {
  const registry = options.registry ?? getHookRegistry();
  const statuses = options.enabledStatuses ?? ['ACTIVATED', 'RUNNING'];
  const result: PluginBootstrapResult = { enabled: [], loaded: [], unloaded: [], failed: [] };

  // 1) Quem está habilitado no banco? Falha = estado desconhecido → não toca em nada.
  let enabled: string[] | null = null;
  if (options.sql) {
    try {
      const rows = (await options.sql.unsafe(
        'SELECT name FROM plugins WHERE status = ANY($1) AND tenant_id IS NULL',
        [statuses]
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

  // 3) Descarrega quem saiu da lista de habilitados
  for (const name of [...loadedPlugins.keys()]) {
    if (!enabled.includes(name) && unloadPlugin(name, registry)) {
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

  for (const level of levels) {
    for (const entry of level) {
      const name = entry.manifest.name;
      if (loadedPlugins.has(name)) continue;

      try {
        const loaded = await loader.loadPlugin(entry.manifest, entry.path);

        // O sandbox valida permissões declaradas e o isolamento de estilo
        const permissions = (entry.manifest.permissions ?? []) as string[];
        const sandbox = new PluginSandbox({ allowedPermissions: permissions });
        sandbox.loadPlugin(entry.manifest, loaded.api);

        // Contrato do PLUGIN.md: module.exports.register(registry)
        const register = (loaded.api as unknown as { register?: unknown }).register;
        if (typeof register !== 'function') {
          throw new Error('não exporta register(registry)');
        }

        const registrations: TrackedRegistration[] = [];
        const hooksApi = createPluginHooksApi(name, recordingRegistry(registry, registrations));
        (register as (registry: unknown) => void)(hooksApi);

        loadedPlugins.set(name, { registrations });
        result.loaded.push(name);
      } catch (error) {
        // Isolamento de falha: plugin quebrado não impede os demais nem o boot
        result.failed.push({ name, error: error instanceof Error ? error.message : String(error) });
      }
    }
  }

  return result;
}
