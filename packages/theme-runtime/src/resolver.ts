import type { ThemeManifest } from '@oktis-works/theme-sdk';
import { TemplateHierarchyResolver, type TemplateContext, type ResolvedTemplate } from './template-resolver.js';

interface ThemeRegistry {
  manifest: ThemeManifest;
  path: string;
  loaded: boolean;
}

export interface ResolvedComponent {
  name: string;
  file: string;
  source: 'theme' | 'plugin' | 'core';
}

export class ThemeResolver {
  private registry = new Map<string, ThemeRegistry>();
  private activeTheme: string | null = null;
  private activeThemesByTenant = new Map<string, string>();
  private inheritanceCache = new Map<string, string[]>();

  async resolveTheme(tenantId: string): Promise<ThemeManifest> {
    const name = this.activeThemesByTenant.get(tenantId) ?? this.activeTheme;
    if (name) {
      const theme = this.registry.get(name);
      if (theme) return theme.manifest;
    }
    throw new Error(`No theme resolved for tenant: ${tenantId}`);
  }

  getActiveTheme(): string | null {
    return this.activeTheme;
  }

  setActiveTheme(name: string): void {
    this.activeTheme = name;
  }

  setActiveThemeForTenant(tenantId: string, name: string): void {
    this.activeThemesByTenant.set(tenantId, name);
  }

  clearActiveThemeForTenant(tenantId: string): void {
    this.activeThemesByTenant.delete(tenantId);
  }

  getThemeManifest(name: string): ThemeManifest | null {
    const theme = this.registry.get(name);
    return theme?.manifest ?? null;
  }

  loadTheme(manifest: ThemeManifest, path: string): void {
    this.registry.set(manifest.name, {
      manifest,
      path,
      loaded: true,
    });
    this.inheritanceCache.clear();
  }

  getInheritanceChain(themeName: string): string[] {
    if (this.inheritanceCache.has(themeName)) {
      return this.inheritanceCache.get(themeName)!;
    }

    const chain: string[] = [];
    const visited = new Set<string>();
    let current: string | null = themeName;

    while (current) {
      if (visited.has(current)) break;
      visited.add(current);
      chain.push(current);

      const theme = this.registry.get(current);
      current = theme?.manifest.parent ?? null;
    }

    this.inheritanceCache.set(themeName, chain);
    return chain;
  }

  resolveComponent(name: string, overrides?: Map<string, ResolvedComponent>): ResolvedComponent {
    if (overrides?.has(name)) {
      return overrides.get(name)!;
    }

    if (!this.activeTheme) {
      return { name, file: '', source: 'core' };
    }

    const chain = this.getInheritanceChain(this.activeTheme);

    for (const themeName of chain) {
      const theme = this.registry.get(themeName);
      if (!theme?.manifest.components) continue;
      const component = theme.manifest.components.find(c => c.name === name);
      if (component) {
        return { name, file: component.file, source: 'theme' };
      }
    }

    return { name, file: '', source: 'core' };
  }

  listComponents(): ResolvedComponent[] {
    if (!this.activeTheme) return [];
    const chain = this.getInheritanceChain(this.activeTheme);
    const components = new Map<string, ResolvedComponent>();

    for (const themeName of [...chain].reverse()) {
      const theme = this.registry.get(themeName);
      if (!theme?.manifest.components) continue;
      for (const c of theme.manifest.components) {
        components.set(c.name, { name: c.name, file: c.file, source: 'theme' });
      }
    }

    return Array.from(components.values());
  }

  getThemeAssets(themeName: string): string[] {
    const theme = this.registry.get(themeName);
    return theme?.manifest.provides?.assets ?? [];
  }

  /**
   * Resolve um template da hierarquia (FEAT-094) considerando os arquivos
   * declarados no manifest do tema ativo e sua cadeia de herança.
   */
  async resolve(context: TemplateContext): Promise<ResolvedTemplate> {
    const available = new Set<string>();

    for (const themeName of this.getInheritanceChain(this.activeTheme ?? '')) {
      const theme = this.registry.get(themeName);
      if (!theme?.manifest.components) continue;

      for (const component of theme.manifest.components) {
        available.add(component.file);
        if (component.file.endsWith('.astro')) {
          available.add(component.name + '.astro');
        }
      }
    }

    const hierarchy = new TemplateHierarchyResolver({
      exists: (file) => available.has(file),
    });

    return hierarchy.resolve(context);
  }

  clearCache(): void {
    this.inheritanceCache.clear();
  }
}
