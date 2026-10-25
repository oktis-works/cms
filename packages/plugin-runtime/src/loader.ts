import { readdir, realpath } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { satisfies, validRange } from 'semver';
import { CMS_VERSION } from '@oktis-works/validation';
import type { PluginManifest } from '@oktis-works/plugin-sdk';
import type { LoadedPlugin } from './sandbox.js';
import { readPluginManifest } from './manifest.js';

export interface DiscoveredPlugin {
  manifest: PluginManifest;
  path: string;
}

export class PluginLoader {
  private pluginsDir: string;
  private dependencyFailures = new Map<string, string>();

  constructor(pluginsDir: string) {
    this.pluginsDir = resolve(pluginsDir);
  }

  async discoverPlugins(): Promise<DiscoveredPlugin[]> {
    const entries = await readdir(this.pluginsDir, { withFileTypes: true });
    const plugins: DiscoveredPlugin[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const pluginPath = join(this.pluginsDir, entry.name);
      const manifest = await this.loadManifest(pluginPath);
      if (manifest) {
        plugins.push({ manifest, path: pluginPath });
      }
    }

    return plugins;
  }

  async loadPlugin(manifest: PluginManifest, pluginPath: string): Promise<LoadedPlugin> {
    // RULE-semver-compatibility: the compatibility.okcms range must satisfy the CMS version
    const compat = (manifest as { compatibility?: { okcms?: unknown } }).compatibility?.okcms;
    if (typeof compat === 'string' && validRange(compat) && !satisfies(CMS_VERSION, compat)) {
      throw new Error(
        `Plugin "${manifest.name}" requires OkCMS ${compat}, but the current version is ${CMS_VERSION}`
      );
    }
    const entryPath = await realpath(resolve(join(pluginPath, manifest.main)));
    const pluginRoot = await realpath(this.pluginsDir);
    const relativeEntry = relative(pluginRoot, entryPath);
    if (relativeEntry.startsWith('..') || relativeEntry === '..' || relativeEntry.includes('\0')) {
      throw new Error(`Plugin entry point escapes plugins directory: ${manifest.main}`);
    }
    const mod = await import(entryPath);
    const api = mod.default ?? mod;

    return {
      manifest,
      api,
      loaded: true,
      loadedAt: Date.now(),
    };
  }

  resolveDependencies(plugins: DiscoveredPlugin[]): DiscoveredPlugin[][] {
    this.dependencyFailures.clear();
    const pluginMap = new Map(plugins.map(p => [p.manifest.name, p]));
    for (const plugin of plugins) {
      for (const dependency of plugin.manifest.dependencies ?? []) {
        const target = pluginMap.get(dependency.name);
        if (!target) {
          if (dependency.optional) continue;
          this.dependencyFailures.set(plugin.manifest.name, `Plugin "${plugin.manifest.name}" requires missing dependency "${dependency.name}"`);
          continue;
        }
        const range = dependency.versionRange ?? dependency.version;
        if (range && (!validRange(range) || !satisfies(target.manifest.version, range))) {
          this.dependencyFailures.set(plugin.manifest.name, `Plugin "${plugin.manifest.name}" requires ${dependency.name} ${range}, found ${target.manifest.version}`);
        }
      }
    }
    this.propagateDependencyFailures(plugins, pluginMap);
    const eligible = plugins.filter((plugin) => !this.dependencyFailures.has(plugin.manifest.name));
    const sorted = this.topologicalSort(eligible, new Map(eligible.map((plugin) => [plugin.manifest.name, plugin])));
    return this.groupByLevel(sorted, pluginMap);
  }

  getDependencyFailures(): Array<{ name: string; error: string }> {
    return [...this.dependencyFailures.entries()].map(([name, error]) => ({ name, error }));
  }

  private propagateDependencyFailures(plugins: DiscoveredPlugin[], pluginMap: Map<string, DiscoveredPlugin>): void {
    this.propagateBlockedDependencies(plugins);

    const state = new Map<string, 'visiting' | 'visited'>();
    const stack: string[] = [];
    const visit = (name: string): void => {
      if (this.dependencyFailures.has(name)) return;
      if (state.get(name) === 'visited') return;
      if (state.get(name) === 'visiting') {
        const start = stack.indexOf(name);
        for (const cycleName of stack.slice(start)) {
          this.dependencyFailures.set(cycleName, `Circular dependency detected: ${cycleName}`);
        }
        return;
      }
      state.set(name, 'visiting');
      stack.push(name);
      for (const dependency of pluginMap.get(name)?.manifest.dependencies ?? []) visit(dependency.name);
      stack.pop();
      state.set(name, 'visited');
    };
    for (const plugin of plugins) visit(plugin.manifest.name);
    this.propagateBlockedDependencies(plugins);
  }

  private propagateBlockedDependencies(plugins: DiscoveredPlugin[]): void {
    let changed = true;
    while (changed) {
      changed = false;
      for (const plugin of plugins) {
        if (this.dependencyFailures.has(plugin.manifest.name)) continue;
        const dependency = (plugin.manifest.dependencies ?? []).find((candidate) => {
          return !candidate.optional && this.dependencyFailures.has(candidate.name);
        });
        if (!dependency) continue;
        this.dependencyFailures.set(
          plugin.manifest.name,
          `Plugin "${plugin.manifest.name}" is blocked by failed dependency "${dependency.name}"`
        );
        changed = true;
      }
    }
  }

  private propagateDependencyFailuresOnce(plugins: DiscoveredPlugin[]): void {
    for (const plugin of plugins) {
      if (this.dependencyFailures.has(plugin.manifest.name)) continue;
      const dependency = (plugin.manifest.dependencies ?? []).find((candidate) => {
        return !candidate.optional && this.dependencyFailures.has(candidate.name);
      });
      if (dependency) {
        this.dependencyFailures.set(plugin.manifest.name, `Plugin "${plugin.manifest.name}" is blocked by failed dependency "${dependency.name}"`);
      }
    }
  }

  topologicalSort(plugins: DiscoveredPlugin[], pluginMap: Map<string, DiscoveredPlugin>): string[] {
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const result: string[] = [];

    for (const plugin of plugins) {
      if (!this.dependencyFailures.has(plugin.manifest.name)) this.visit(plugin.manifest.name, pluginMap, visited, visiting, result);
    }

    return result;
  }

  private visit(
    name: string,
    pluginMap: Map<string, DiscoveredPlugin>,
    visited: Set<string>,
    visiting: Set<string>,
    result: string[]
  ): void {
    if (visited.has(name)) return;
    if (visiting.has(name)) throw new Error(`Circular dependency detected: ${name}`);

    const plugin = pluginMap.get(name);
    if (!plugin) return;

    visiting.add(name);
    const deps = plugin.manifest.dependencies ?? [];

    for (const dep of deps) {
      this.visit(dep.name, pluginMap, visited, visiting, result);
    }

    visiting.delete(name);
    visited.add(name);
    result.push(name);
  }

  private groupByLevel(sorted: string[], pluginMap: Map<string, DiscoveredPlugin>): DiscoveredPlugin[][] {
    const levels: DiscoveredPlugin[][] = [];
    const placed = new Set<string>();

    for (const name of sorted) {
      const plugin = pluginMap.get(name);
      if (!plugin) continue;

      const deps = plugin.manifest.dependencies ?? [];
      let level = 0;

      for (const dep of deps) {
        const depIndex = sorted.indexOf(dep.name);
        const pluginIndex = sorted.indexOf(name);
        if (depIndex >= 0 && depIndex < pluginIndex) {
          level = Math.max(level, ...this.findLevelForPlugin(dep.name, levels, pluginMap));
        }
      }

      if (!levels[level]) levels[level] = [];
      levels[level]!.push(plugin);
      placed.add(name);
    }

    return levels.filter(l => l.length > 0);
  }

  private findLevelForPlugin(name: string, levels: DiscoveredPlugin[][], _pluginMap: Map<string, DiscoveredPlugin>): number[] {
    const result: number[] = [];
    for (let i = 0; i < levels.length; i++) {
      const level = levels[i];
      if (!level) continue;
      for (const p of level) {
        if (p.manifest.name === name) result.push(i);
      }
    }
    return result.length > 0 ? result : [0];
  }

  private async loadManifest(pluginPath: string): Promise<PluginManifest | null> {
    // Single source (WP6): the canonical `manifest.json` wins over `package.json` (npm).
    // Antes a ordem era inversa — um plugin com ambos os arquivos era lido de
    // um jeito no loader e de outro no sync/CLI.
    // Runtime discovery is intentionally lenient: malformed declarations are
    // allowed to reach bootstrap, where the plugin is isolated as a failed
    // load instead of silently disappearing from runtime state. Installation
    // and synchronization use strict validation separately.
    const { manifest, issues } = await readPluginManifest(pluginPath);
    if (!manifest && issues.length > 0) {
      console.warn(`[plugins] rejected manifest in ${pluginPath}: ${issues.join('; ')}`);
    }
    return manifest;
  }
}
