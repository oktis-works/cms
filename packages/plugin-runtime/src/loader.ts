import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { satisfies, validRange } from 'semver';
import { CMS_VERSION } from '@oktis-works/validation';
import type { PluginManifest } from '@oktis-works/plugin-sdk';
import type { LoadedPlugin } from './sandbox.js';

export interface DiscoveredPlugin {
  manifest: PluginManifest;
  path: string;
}

export class PluginLoader {
  private pluginsDir: string;

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
    // RULE-semver-compatibility: range compatibility.okcms deve satisfazer a versão do CMS
    const compat = (manifest as { compatibility?: { okcms?: unknown } }).compatibility?.okcms;
    if (typeof compat === 'string' && validRange(compat) && !satisfies(CMS_VERSION, compat)) {
      throw new Error(
        `Plugin "${manifest.name}" requer OkCMS ${compat}, mas a versão atual é ${CMS_VERSION}`
      );
    }
    const entryPath = resolve(join(pluginPath, manifest.main));
    if (!entryPath.startsWith(this.pluginsDir)) {
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
    const pluginMap = new Map(plugins.map(p => [p.manifest.name, p]));
    const sorted = this.topologicalSort(plugins, pluginMap);
    return this.groupByLevel(sorted, pluginMap);
  }

  topologicalSort(plugins: DiscoveredPlugin[], pluginMap: Map<string, DiscoveredPlugin>): string[] {
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const result: string[] = [];

    for (const plugin of plugins) {
      this.visit(plugin.manifest.name, pluginMap, visited, visiting, result);
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
    try {
      const manifestPath = join(pluginPath, 'package.json');
      const content = await readFile(manifestPath, 'utf-8');
      return JSON.parse(content) as PluginManifest;
    } catch {
      return null;
    }
  }
}
