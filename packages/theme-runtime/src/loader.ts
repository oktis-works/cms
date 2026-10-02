// @oktis-works/theme-runtime - Theme Loader (descoberta via node_modules / diretório)

import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { ThemeManifest } from '@oktis-works/theme-sdk';
import { validateStyleManifest } from './style-engine.js';

export interface DiscoveredTheme {
  manifest: ThemeManifest;
  path: string;
}

export class ThemeLoader {
  private themesDir: string;

  constructor(themesDir: string) {
    this.themesDir = resolve(themesDir);
  }

  /** Varre o diretório e retorna temas com theme.json válido. */
  async discoverThemes(): Promise<DiscoveredTheme[]> {
    const entries = await readdir(this.themesDir, { withFileTypes: true });
    const themes: DiscoveredTheme[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const themePath = join(this.themesDir, entry.name);
      const manifest = await this.loadManifest(themePath);
      if (manifest) themes.push({ manifest, path: themePath });
    }

    return themes;
  }

  /** Carrega um único tema a partir do caminho contendo theme.json. */
  async loadTheme(themeName: string): Promise<DiscoveredTheme | null> {
    const themePath = join(this.themesDir, themeName);
    const manifest = await this.loadManifest(themePath);
    return manifest ? { manifest, path: themePath } : null;
  }

  /**
   * Ordena temas respeitando a cadeia de herança (`parent`):
   * pais antes dos filhos — mesmo contrato do PluginLoader.resolveDependencies.
   */
  orderInheritanceChain(themes: DiscoveredTheme[]): DiscoveredTheme[] {
    const byName = new Map(themes.map((theme) => [theme.manifest.name, theme]));
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const ordered: DiscoveredTheme[] = [];

    const visit = (theme: DiscoveredTheme): void => {
      const name = theme.manifest.name;
      if (visited.has(name)) return;
      if (visiting.has(name)) return; // ciclo: ignora

      visiting.add(name);

      const parent = theme.manifest.parent ? byName.get(theme.manifest.parent) : undefined;
      if (parent) visit(parent);

      visiting.delete(name);
      visited.add(name);
      ordered.push(theme);
    };

    for (const theme of themes) visit(theme);
    return ordered;
  }

  private async loadManifest(themePath: string): Promise<ThemeManifest | null> {
    try {
      const raw = await readFile(join(themePath, 'theme.json'), 'utf-8');
      const manifest = JSON.parse(raw) as Partial<ThemeManifest>;

      if (!manifest.name || !manifest.version) return null;

      // validação de estilo exclusiva (avisa em erro, mas não bloqueia descoberta)
      const errors = validateStyleManifest(manifest as ThemeManifest, themePath);
      if (errors.length) {
        console.warn(`[ThemeLoader] ${manifest.name}: ${errors.join('; ')}`);
      }

      return manifest as ThemeManifest;
    } catch {
      return null;
    }
  }
}
