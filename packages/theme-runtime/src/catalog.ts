// @oktis-works/theme-runtime - Theme catalog (engine-aware inheritance)
//
// Resolves template keys across the project chain (active → _shared → default)
// without mixing engines. A compiled theme inherits templates only from themes
// with the same engine; cross-engine parents still contribute settings, styles
// and assets elsewhere.

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { ThemeManifest, ThemeRenderEngine } from '@oktis-works/theme-sdk';
import { CMS_VERSION, checkExtensionCompatibility, validateThemeManifestRender } from '@oktis-works/validation';
import { readThemeBuild, validateThemeBuild, type ThemeBuildManifest } from './compiled.js';
import { resolveProjectThemeChain } from './template-resolver.js';
import { validateStyleManifest } from './style-engine.js';

export interface ThemeCatalogEntry {
  name: string;
  dir: string;
  manifest: ThemeManifest | null;
  engine: ThemeRenderEngine;
  build: ThemeBuildManifest | null;
  problems: string[];
}

export interface ThemeCatalog {
  chain: string[];
  entries: ThemeCatalogEntry[];
}

export function readThemeManifest(themeDir: string): ThemeManifest | null {
  const file = join(themeDir, 'theme.json');
  if (!existsSync(file)) return null;
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf-8')) as ThemeManifest;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function themeEngineOf(manifest: ThemeManifest | null): ThemeRenderEngine {
  const engine = manifest?.render?.engine;
  if (engine !== 'react' && engine !== 'solid') {
    throw new Error(`Invalid theme render engine: ${engine}. Must be 'react' or 'solid'.`);
  }
  return engine;
}

export function loadThemeCatalog(themesRoot: string, activeTheme: string): ThemeCatalog {
  const chain = resolveProjectThemeChain(themesRoot, activeTheme);
  const entries: ThemeCatalogEntry[] = chain.map((name) => {
    const dir = resolve(themesRoot, name);
    const manifest = readThemeManifest(dir);
    const engine = themeEngineOf(manifest);
    const problems: string[] = [];

    if (!manifest) {
      problems.push(`theme "${name}" has no valid theme.json`);
    } else {
      problems.push(...checkExtensionCompatibility('theme', manifest, CMS_VERSION).map((issue) => issue.message));
      problems.push(...validateThemeManifestRender(manifest));
      problems.push(...validateStyleManifest(manifest, dir));
    }

    let build: ThemeBuildManifest | null = null;
    build = readThemeBuild(dir);
    if (!build) {
      problems.push(`compiled theme "${name}" has no dist/theme-build.json (run okcms theme:build)`);
    } else {
      problems.push(...validateThemeBuild(dir, build, engine));
    }

    return { name, dir, manifest, engine, build, problems };
  });

  return { chain, entries };
}

/** True when the theme itself provides the template key. */
export function themeSupportsKey(entry: ThemeCatalogEntry, key: string): boolean {
  if (!key) return false;
  if (!entry.build || entry.problems.length > 0) return false;
  return entry.build.templates.includes(key);
}

/**
 * First theme in the chain that provides `key` for the requested engine.
 * Cross-engine parents are intentionally skipped.
 */
export function findTemplateProvider(
  catalog: ThemeCatalog,
  key: string,
  engine: ThemeRenderEngine
): ThemeCatalogEntry | null {
  for (const entry of catalog.entries) {
    if (entry.engine !== engine) continue;
    if (themeSupportsKey(entry, key)) return entry;
  }
  return null;
}

/** Primary entry (active theme) of the catalog. */
export function activeCatalogEntry(catalog: ThemeCatalog): ThemeCatalogEntry | null {
  return catalog.entries[0] ?? null;
}
