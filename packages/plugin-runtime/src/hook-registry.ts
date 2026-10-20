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
  /** Minimum trust level required by the extension point. */
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
  /** Official hook names (core catalog) — always accepted in dev. */
  private readonly knownHooks = new Set<string>();
  /** Prefixos de hooks oficiais parametrizados (terminam em '*'). */
  private readonly knownPrefixes: string[] = [];

  setDevMode(enabled: boolean): void {
    this.devMode = enabled;
  }

  /**
   * Registers the core's official hook catalog. In dev mode the naming rule
   * prefixo (`okcms.`/`plugin.`) continua exigida para hooks customizados,
   * but official names (`content:query`, `theme:data:*`, ...) are accepted —
   * without this the core's own catalog would fail in dev.
   *
   * Entradas terminadas em `*` viram prefixos (ex.: `theme:data:*`,
   * `manage:*`, `before_publish_content_*`).
   *
   * The runtime does not depend on the core (it would be a cycle): whoever
   * o chamador (bootstrap do core) e injeta aqui.
   */
  setKnownHooks(names: Iterable<string>): void {
    for (const name of names) {
      if (name.endsWith('*')) this.knownPrefixes.push(name.slice(0, -1));
      else this.knownHooks.add(name);
    }
  }

  clearKnownHooks(): void {
    this.knownHooks.clear();
    this.knownPrefixes.length = 0;
  }

  /** True when the name belongs to the official catalog (exact or by prefix). */
  isKnownHook(action: string): boolean {
    if (this.knownHooks.has(action)) return true;
    return this.knownPrefixes.some((prefix) => action.startsWith(prefix));
  }

  setTrustLevel(sourceId: string, level: number): void {
    this.trustLevels.set(sourceId, level);
  }

  /**
   * Catalog of registered hooks (REQ-REQU-035-002): lists each hook with type,
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
   * Registers an action callback (run for side effects).
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
   * Runs every callback registered for an action.
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
          // Failing callbacks do not interrupt the others (BUSI-031).
          console.error(`[hooks] Error in action callback "${action}" (${entry.sourceId}):`, error);
        }
      }
    } finally {
      this.currentHook = previous;
    }
  }

  /**
   * Aplica filtros em cadeia: cada callback recebe o valor transformado pelo anterior.
   * WordPress-style synchronous semantics (DECI-026).
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
   * Async version of the filter pipeline — callbacks returning a Promise
   * are resolved before feeding the next link in the chain.
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

    if (this.devMode && !isPrefixed(action) && !this.isKnownHook(action)) {
      throw new Error(
        `[hooks] In dev mode custom hooks must be prefixed ("${CORE_PREFIX}..." or "plugin.<id>....") or belong to the official catalog. Received: "${action}"`
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
        reason: `trust level ${sourceLevel} insufficient (minimum ${requiredLevel})`,
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

/** Core catalog names injected via the store — applied to new registries. */
const pendingKnownHooks: string[] = [];

function createDefaultRegistry(): HookRegistry {
  const registry = new HookRegistry();
  registry.setDevMode(process.env['NODE_ENV'] !== 'production');
  if (pendingKnownHooks.length > 0) registry.setKnownHooks(pendingKnownHooks);
  return registry;
}

/**
 * Synchronous resolution of the active tenant. Injected by the core (tenant ALS);
 * sem contexto → registry platform (hooks do core).
 */
let hookTenantResolver: () => string | null = () => null;

export function setHookTenantResolver(resolver: () => string | null): void {
  hookTenantResolver = resolver;
}

export function getCurrentHookTenantId(): string | null {
  try {
    return hookTenantResolver();
  } catch {
    return null;
  }
}

/**
 * Store de registries por tenant (isolamento de plugins por tenant).
 *
 * - `platform`: hooks do core (`okcms.*`) — compartilhado por todo o processo;
 * - `tenant(tenantId)`: hooks dos plugins habilitados daquele tenant, criado
 *   on demand and unloadable (invalidate/drop).
 *
 * The contract is `tenant(id)` so it can evolve to per-tenant vm/worker
 * without changing callers (`getHookRegistry()` stays synchronous).
 */
export class HookRegistryStore {
  private platformRegistry: HookRegistry;
  private readonly byTenant = new Map<string, HookRegistry>();

  constructor(platform?: HookRegistry) {
    this.platformRegistry = platform ?? createDefaultRegistry();
  }

  platform(): HookRegistry {
    return this.platformRegistry;
  }

  setPlatform(registry: HookRegistry): void {
    this.platformRegistry = registry;
  }

  /** Tenant registry (created on demand with devMode + the core catalog). */
  tenant(tenantId: string): HookRegistry {
    let registry = this.byTenant.get(tenantId);
    if (!registry) {
      registry = createDefaultRegistry();
      this.byTenant.set(tenantId, registry);
    }
    return registry;
  }

  hasTenant(tenantId: string): boolean {
    return this.byTenant.has(tenantId);
  }

  tenantIds(): string[] {
    return [...this.byTenant.keys()];
  }

  /**
   * Unloads a tenant's hooks (enable/disable, LRU, shutdown).
   * Retorna true quando havia um registry carregado.
   */
  invalidateTenant(tenantId: string): boolean {
    return this.byTenant.delete(tenantId);
  }

  clearTenants(): void {
    this.byTenant.clear();
  }

  /** Propagates the core catalog to every registry (current and future). */
  setKnownHooks(names: Iterable<string>): void {
    const list = [...names];
    pendingKnownHooks.length = 0;
    pendingKnownHooks.push(...list);
    this.platformRegistry.setKnownHooks(list);
    for (const registry of this.byTenant.values()) registry.setKnownHooks(list);
  }

  get size(): number {
    return this.byTenant.size;
  }
}

let globalStore: HookRegistryStore | null = null;

export function getHookRegistryStore(): HookRegistryStore {
  if (!globalStore) globalStore = new HookRegistryStore();
  return globalStore;
}

/**
 * Current scope registry: tenant when there is a tenant context (per-tenant
 * plugins), platform when there is none (core hooks).
 */
export function getHookRegistry(): HookRegistry {
  const store = getHookRegistryStore();
  const tenantId = getCurrentHookTenantId();
  return tenantId ? store.tenant(tenantId) : store.platform();
}

/**
 * Substitui o registry platform. Uso interno: testes e hot-reload de plugins.
 */
export function setHookRegistry(registry: HookRegistry): void {
  getHookRegistryStore().setPlatform(registry);
}

/** Troca o store inteiro (testes). */
export function setHookRegistryStore(store: HookRegistryStore | null): void {
  globalStore = store;
  if (store === null) pendingKnownHooks.length = 0;
}
