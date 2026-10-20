import type { PluginManifest, PluginContext, PluginHookHandler, PluginAPI } from '@oktis-works/plugin-sdk';

export interface SandboxConfig {
  /** Timeout para callbacks de hook (ms). 0 = sem timeout. */
  timeoutMs: number;
  /**
   * The granted permission **policy** (allowlist from configuration /
   * catalog). Never the manifest: passing the manifest's own permissions here
   * would be a tautology (guaranteed approval).
   */
  allowedPermissions: string[];
}

const defaultSandboxConfig: SandboxConfig = {
  timeoutMs: 5000,
  allowedPermissions: [],
};

export class PluginSandbox {
  private config: SandboxConfig;

  constructor(config: Partial<SandboxConfig> = {}) {
    this.config = { ...defaultSandboxConfig, ...config };
  }

  loadPlugin(manifest: PluginManifest, api: PluginAPI): LoadedPlugin {
    this.checkPermissions(manifest.permissions ?? []);
    this.enforceStyleIsolation(manifest);
    return { manifest, api, loaded: true, loadedAt: Date.now() };
  }

  /** BUSI plugin-style-isolation: unscoped global CSS is scoped when served via scopePluginCss */
  private enforceStyleIsolation(manifest: PluginManifest): void {
    const anyManifest = manifest as unknown as Record<string, unknown>;
    const style = anyManifest['style'] ?? anyManifest['styles'];
    if (typeof style === 'string' && (style.includes(':root') || style.includes('html{') || style.includes('body{')) && !style.includes('data-plugin')) {
      console.warn(
        `[sandbox] Plugin ${manifest.name} declares global CSS without [data-plugin] — it will be scoped via scopePluginCss when served at /style.css`
      );
    }
  }

  async executeHook(
    hookName: string,
    context: PluginContext,
    handler: PluginHookHandler,
    payload: unknown,
    pluginPermissions?: string[]
  ): Promise<void> {
    if (pluginPermissions) {
      this.checkPermissions(pluginPermissions);
    }
    await this.withTimeout(Promise.resolve(handler(context, payload)));
  }

  async callHandler<T>(
    handler: (...args: unknown[]) => T | Promise<T>,
    context: PluginContext,
    ...args: unknown[]
  ): Promise<T> {
    return this.withTimeout(Promise.resolve(handler(context, ...args)));
  }

  /**
   * Applies the timeout **at the real execution point** (callback
   * registration).
   *
   * - sync return → the value is returned as-is (synchronous filter
   *   semantics, DECI-026 — an `applyFilters` cannot become a Promise);
   * - async return → races against the timeout (`timeoutMs`).
   *
   * Honest limitation: `Promise.race` does not interrupt synchronous CPU;
   * plugins
   * custosos de bloco continuam travando o processo (isolamento real seria
   * worker/processo separado).
   */
  wrapCallback<TArgs extends unknown[]>(fn: (...args: TArgs) => unknown): (...args: TArgs) => unknown {
    if (this.config.timeoutMs <= 0) return fn;
    return (...args: TArgs): unknown => {
      const result = fn(...args);
      if (result && typeof (result as PromiseLike<unknown>).then === 'function') {
        return this.withTimeout(result as Promise<unknown>);
      }
      return result;
    };
  }

  /** Promise × timeout race (public API used by the bootstrap). */
  async withTimeout<T>(promise: Promise<T>): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<T>((_, reject) => {
          timer = setTimeout(() => reject(new Error('Plugin operation timed out')), this.config.timeoutMs);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /** Current policy (for tests/observability). */
  getPolicy(): SandboxConfig {
    return { ...this.config };
  }

  private checkPermissions(permissions: string[]): void {
    for (const permission of permissions) {
      if (!this.config.allowedPermissions.includes(permission)) {
        throw new Error(`Plugin permission denied: ${permission}`);
      }
    }
  }
}

export interface LoadedPlugin {
  manifest: PluginManifest;
  api: PluginAPI;
  loaded: boolean;
  loadedAt: number;
}
