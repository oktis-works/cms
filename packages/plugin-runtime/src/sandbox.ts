import type { PluginManifest, PluginContext, PluginHookHandler, PluginAPI } from '@oktis-works/plugin-sdk';

export interface SandboxConfig {
  /** Timeout para callbacks de hook (ms). 0 = sem timeout. */
  timeoutMs: number;
  /**
   * **Política** de permissões concedidas (allowlist vinda de configuração /
   * catálogo). Nunca o manifesto: passar as permissões do próprio manifesto
   * aqui seria uma tautologia (aprovação garantida).
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

  /** BUSI plugin-style-isolation: CSS global sem escopo é escopado ao servir via scopePluginCss */
  private enforceStyleIsolation(manifest: PluginManifest): void {
    const anyManifest = manifest as unknown as Record<string, unknown>;
    const style = anyManifest['style'] ?? anyManifest['styles'];
    if (typeof style === 'string' && (style.includes(':root') || style.includes('html{') || style.includes('body{')) && !style.includes('data-plugin')) {
      console.warn(
        `[sandbox] Plugin ${manifest.name} declara CSS global sem [data-plugin] — será escopado via scopePluginCss ao ser servido em /style.css`
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
   * Aplica o timeout **no ponto real de execução** (registro do callback).
   *
   * - retorno síncrono → devolve o valor como está (semântica síncrona dos
   *   filtros, DECI-026 — um `applyFilters` não pode virar Promise);
   * - retorno assíncrono → corre contra o timeout (`timeoutMs`).
   *
   * Limite honesto: `Promise.race` não interrompe CPU síncrona; plugins
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

  /** Race Promise × timeout (API pública usada pelo bootstrap). */
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

  /** Política vigente (para testes/observabilidade). */
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
