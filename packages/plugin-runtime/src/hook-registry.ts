// @oktis-works/plugin-runtime - Hook Registry (WordPress-style Actions & Filters)

export type HookCallback<TArgs extends unknown[] = unknown[]> = (...args: TArgs) => unknown;

interface HookEntry {
  id: string;
  seq: number;
  callback: HookCallback;
  priority: number;
  acceptedArgs: number;
  sourceId: string;
  sourceType: 'core' | 'plugin';
}

export interface AddHookOptions {
  priority?: number;
  acceptedArgs?: number;
  /** Identificador da origem ('okcms' para core ou id do plugin). */
  sourceId?: string;
  sourceType?: 'core' | 'plugin';
  /** Nível mínimo de confiança exigido pelo ponto de extensão. */
  requiredTrustLevel?: number;
}

export interface AuditLogEntry {
  timestamp: string;
  type: 'HOOK_BLOCKED' | 'HOOK_REJECTED';
  sourceId: string;
  sourceType: 'core' | 'plugin';
  action: string;
  reason: string;
}

const CORE_PREFIX = 'okcms.';
const PLUGIN_PREFIX = 'plugin.';

function isPrefixed(action: string): boolean {
  return action.startsWith(CORE_PREFIX) || action.startsWith(PLUGIN_PREFIX);
}

export class HookRegistry {
  private registrationSeq = 0;
  private readonly actions = new Map<string, Map<number, HookEntry[]>>();
  private readonly filters = new Map<string, Map<number, HookEntry[]>>();
  private readonly didActionCounts = new Map<string, number>();
  private currentHook: string | null = null;
  private readonly auditLog: AuditLogEntry[] = [];
  private devMode = false;
  private trustLevels = new Map<string, number>();

  setDevMode(enabled: boolean): void {
    this.devMode = enabled;
  }

  setTrustLevel(sourceId: string, level: number): void {
    this.trustLevels.set(sourceId, level);
  }

  /**
   * Catálogo de hooks registrados (REQ-REQU-035-002): lista cada hook com tipo,
   * prioridades e fontes, gerado automaticamente a partir do registry.
   */
  listRegistered(): Array<{
    hook: string;
    type: 'action' | 'filter';
    priorities: number[];
    sources: string[];
    total: number;
  }> {
    const merge = (map: Map<string, Map<number, HookEntry[]>>, type: 'action' | 'filter') => {
      const out: Array<{ hook: string; type: 'action' | 'filter'; priorities: number[]; sources: string[]; total: number }> = [];
      for (const [hook, buckets] of map) {
        const entries = [...buckets.values()].flat();
        out.push({
          hook,
          type,
          priorities: [...buckets.keys()].sort((a, b) => a - b),
          sources: [...new Set(entries.map((e) => e.sourceId))],
          total: entries.length,
        });
      }
      return out;
    };
    return [...merge(this.actions, 'action'), ...merge(this.filters, 'filter')].sort((a, b) =>
      a.hook.localeCompare(b.hook)
    );
  }

  getAuditLog(): AuditLogEntry[] {
    return [...this.auditLog];
  }

  clearAuditLog(): void {
    this.auditLog.length = 0;
  }

  /**
   * Registra um callback de ação (executado por efeitos colaterais).
   */
  addAction(action: string, callback: HookCallback, options: AddHookOptions = {}): void {
    if (!this.authorizeRegistration(action, options)) return;

    const bucket = this.actions.get(action) ?? new Map<number, HookEntry[]>();
    const priority = options.priority ?? 10;
    const entries = bucket.get(priority) ?? [];

    entries.push({
      seq: ++this.registrationSeq,
      id: `${action}:${options.sourceId ?? 'anonymous'}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`,
      callback,
      priority,
      acceptedArgs: options.acceptedArgs ?? callback.length,
      sourceId: options.sourceId ?? 'anonymous',
      sourceType: options.sourceType ?? 'plugin',
    });

    bucket.set(priority, entries);
    this.actions.set(action, bucket);
  }

  /**
   * Registra um callback de filtro (transforma e retorna o valor).
   */
  addFilter(filter: string, callback: HookCallback<[unknown, ...unknown[]]>, options: AddHookOptions = {}): void {
    if (!this.authorizeRegistration(filter, options)) return;

    const bucket = this.filters.get(filter) ?? new Map<number, HookEntry[]>();
    const priority = options.priority ?? 10;
    const entries = bucket.get(priority) ?? [];

    entries.push({
      seq: ++this.registrationSeq,
      id: `${filter}:${options.sourceId ?? 'anonymous'}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`,
      callback,
      priority,
      acceptedArgs: options.acceptedArgs ?? callback.length,
      sourceId: options.sourceId ?? 'anonymous',
      sourceType: options.sourceType ?? 'plugin',
    });

    bucket.set(priority, entries);
    this.filters.set(filter, bucket);
  }

  removeAction(action: string, callback: HookCallback, priority?: number): boolean {
    return this.removeEntry(this.actions, action, callback, priority);
  }

  removeFilter(filter: string, callback: HookCallback, priority?: number): boolean {
    return this.removeEntry(this.filters, filter, callback, priority);
  }

  hasAction(action: string, callback?: HookCallback): boolean {
    return this.hasEntry(this.actions, action, callback);
  }

  hasFilter(filter: string, callback?: HookCallback): boolean {
    return this.hasEntry(this.filters, filter, callback);
  }

  didAction(action: string): number {
    return this.didActionCounts.get(action) ?? 0;
  }

  getCurrentHook(): string | null {
    return this.currentHook;
  }

  /**
   * Executa todos os callbacks registrados para uma ação.
   * Reentrante: chamadas aninhadas preservam e restauram o hook atual.
   */
  async doAction(action: string, ...args: unknown[]): Promise<void> {
    const previous = this.currentHook;
    this.currentHook = action;
    this.didActionCounts.set(action, (this.didActionCounts.get(action) ?? 0) + 1);

    try {
      for (const entry of this.sortedEntries(this.actions, action)) {
        try {
          await entry.callback(...args.slice(0, Math.max(entry.acceptedArgs, 0)));
        } catch (error) {
          // Callbacks com falha não interrompem os demais (BUSI-031).
          console.error(`[hooks] Erro no callback de ação "${action}" (${entry.sourceId}):`, error);
        }
      }
    } finally {
      this.currentHook = previous;
    }
  }

  /**
   * Aplica filtros em cadeia: cada callback recebe o valor transformado pelo anterior.
   * Semântica síncrona estilo WordPress (DECI-026).
   */
  applyFilters(filter: string, value: unknown, ...args: unknown[]): unknown {
    const previous = this.currentHook;
    this.currentHook = filter;

    try {
      let result = value;

      for (const entry of this.sortedEntries(this.filters, filter)) {
        try {
          result = entry.callback(result, ...args.slice(0, Math.max(entry.acceptedArgs - 1, 0)));
        } catch (error) {
          console.error(`[hooks] Erro no callback de filtro "${filter}" (${entry.sourceId}):`, error);
        }
      }

      return result;
    } finally {
      this.currentHook = previous;
    }
  }

  /**
   * Versão assíncrona do pipeline de filtros — callbacks que retornam Promise
   * são resolvidos antes de alimentar o próximo da cadeia.
   */
  async applyFiltersAsync(filter: string, value: unknown, ...args: unknown[]): Promise<unknown> {
    const previous = this.currentHook;
    this.currentHook = filter;

    try {
      let result = value;

      for (const entry of this.sortedEntries(this.filters, filter)) {
        try {
          result = await entry.callback(result, ...args.slice(0, Math.max(entry.acceptedArgs - 1, 0)));
        } catch (error) {
          console.error(`[hooks] Erro no callback de filtro "${filter}" (${entry.sourceId}):`, error);
        }
      }

      return result;
    } finally {
      this.currentHook = previous;
    }
  }

  private sortedEntries(map: Map<string, Map<number, HookEntry[]>>, action: string): HookEntry[] {
    const bucket = map.get(action);
    if (!bucket) return [];

    return [...bucket.entries()]
      .sort(([a], [b]) => a - b)
      .flatMap(([, entries]) => [...entries].sort((a, b) => a.seq - b.seq));
  }

  private authorizeRegistration(action: string, options: AddHookOptions): boolean {
    const sourceId = options.sourceId ?? 'anonymous';

    if (this.devMode && !isPrefixed(action)) {
      throw new Error(
        `[hooks] Em modo dev, hooks customizados devem ser prefixados ("${CORE_PREFIX}..." ou "plugin.<id>...."). Recebido: "${action}"`
      );
    }

    const requiredLevel = options.requiredTrustLevel ?? 0;
    const sourceLevel = this.trustLevels.get(sourceId) ?? 0;

    if (sourceLevel < requiredLevel) {
      this.auditLog.push({
        timestamp: new Date().toISOString(),
        type: 'HOOK_BLOCKED',
        sourceId,
        sourceType: options.sourceType ?? 'plugin',
        action,
        reason: `trust level ${sourceLevel} insuficiente (mínimo ${requiredLevel})`,
      });
      return false;
    }

    return true;
  }

  private removeEntry(
    map: Map<string, Map<number, HookEntry[]>>,
    name: string,
    callback: HookCallback,
    priority?: number
  ): boolean {
    const bucket = map.get(name);
    if (!bucket) return false;

    let removed = false;

    const prioritiesToRemove = priority !== undefined ? [priority] : [...bucket.keys()];

    for (const p of prioritiesToRemove) {
      const entries = bucket.get(p);
      if (!entries) continue;

      const index = entries.findIndex((entry) => entry.callback === callback);
      if (index >= 0) {
        entries.splice(index, 1);
        removed = true;

        if (entries.length === 0) bucket.delete(p);
      }
    }

    if (bucket.size === 0) map.delete(name);

    return removed;
  }

  private hasEntry(map: Map<string, Map<number, HookEntry[]>>, name: string, callback?: HookCallback): boolean {
    const bucket = map.get(name);
    if (!bucket) return false;
    if (!callback) return true;

    for (const entries of bucket.values()) {
      if (entries.some((entry) => entry.callback === callback)) return true;
    }

    return false;
  }
}

let globalRegistry: HookRegistry | null = null;

export function getHookRegistry(): HookRegistry {
  if (!globalRegistry) {
    globalRegistry = new HookRegistry();
    globalRegistry.setDevMode(process.env['NODE_ENV'] !== 'production');
  }
  return globalRegistry;
}

/**
 * Substitui o registry global. Uso interno: testes e hot-reload de plugins.
 */
export function setHookRegistry(registry: HookRegistry): void {
  globalRegistry = registry;
}
