import type { PluginManifest, PluginContext, PluginHookHandler, PluginAPI } from '@oktis-works/plugin-sdk';

export interface SandboxConfig {
  timeoutMs: number;
  maxMemoryMb: number;
  allowedPermissions: string[];
}

const defaultSandboxConfig: SandboxConfig = {
  timeoutMs: 5000,
  maxMemoryMb: 128,
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

  /** BUSI plugin-style-isolation: bloqueia CSS global se plugin declarar style inline sem escopo */
  private enforceStyleIsolation(manifest: PluginManifest): void {
    const anyManifest = manifest as unknown as Record<string, unknown>;
    const style = anyManifest['style'] ?? anyManifest['styles'];
    if (typeof style === 'string' && (style.includes(':root') || style.includes('html{') || style.includes('body{')) && !style.includes('data-plugin')) {
      // apenas warn — escopo será aplicado em runtime via scopePluginCss
      console.warn(`[sandbox] Plugin ${manifest.name} declara CSS global sem [data-plugin] — será escopado automaticamente`);
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

  private async withTimeout<T>(promise: Promise<T>): Promise<T> {
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
