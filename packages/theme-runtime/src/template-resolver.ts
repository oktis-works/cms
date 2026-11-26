// @oktis-works/theme-runtime - logical theme template resolution

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Request information used to select a logical theme render key. */
export interface TemplateContext {
  type: string;
  slug?: string;
  isArchive?: boolean;
  isHome?: boolean;
  isFrontPage?: boolean;
  isPostsPage?: boolean;
  layoutOverride?: string;
}

/** A logical key selected from the active theme's compiled export map. */
export interface ResolvedTemplate {
  name: string;
  key: string;
  /** Kept as an API-compatible alias; this is never a filesystem path. */
  file: string;
  triedChain: string[];
}

/** Normalizes an externally supplied logical key. */
export function templateKeyFromFile(value: string): string {
  return value.replace(/\.(?:tsx|jsx|js|mjs)$/i, '');
}

/** Builds the engine-independent logical render-key chain. */
export function buildTemplateKeyChain(context: TemplateContext): string[] {
  const layoutHead = context.layoutOverride ? [templateKeyFromFile(context.layoutOverride)] : [];

  if (context.isHome) return [...layoutHead, 'home', 'index', '404'];

  const chain: string[] = [];
  if (context.slug) chain.push(`${context.type}-${context.slug}`);

  if (context.isArchive) {
    if (context.slug) chain.push(`taxonomy-${context.slug}`);
    chain.push('archive');
  } else {
    chain.push(context.type);
    const generic = context.type === 'page' ? 'page' : 'single';
    if (generic !== context.type) chain.push(generic);
    chain.push('index');
  }

  chain.push('404');
  if (context.isFrontPage) return [...layoutHead, 'front-page', ...chain];
  if (context.isPostsPage) return [...layoutHead, 'posts', ...chain];
  return [...layoutHead, ...chain];
}

/** Backward-compatible name for callers that only need the logical chain. */
export function buildTemplateChain(context: TemplateContext): string[] {
  return buildTemplateKeyChain(context);
}

/** Validates the active theme plus its declared parent chain. */
const SAFE_THEME_NAME_RE = /^[A-Za-z0-9_-]+$/;

export function resolveProjectThemeChain(themesRoot: string, activeTheme: string): string[] {
  const chain: string[] = [];
  const visiting = new Set<string>();

  const visit = (theme: string): void => {
    if (!theme || !SAFE_THEME_NAME_RE.test(theme) || chain.includes(theme)) return;
    if (visiting.has(theme)) throw new Error(`Theme inheritance cycle detected at "${theme}"`);
    visiting.add(theme);
    chain.push(theme);

    const manifestPath = join(themesRoot, theme, 'theme.json');
    if (existsSync(manifestPath)) {
      try {
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as { parent?: unknown };
        if (typeof manifest.parent === 'string' && manifest.parent) {
          if (!SAFE_THEME_NAME_RE.test(manifest.parent)) {
            throw new Error(`Theme "${theme}" declares an unsafe parent name`);
          }
          const parentManifestPath = join(themesRoot, manifest.parent, 'theme.json');
          if (!existsSync(parentManifestPath)) {
            throw new Error(`Theme "${theme}" declares missing parent "${manifest.parent}"`);
          }
          visit(manifest.parent);
        }
      } catch (error) {
        if (error instanceof Error && (
          error.message.startsWith('Theme "') ||
          error.message.startsWith('Theme inheritance cycle detected')
        )) throw error;
        throw new Error(`Invalid theme manifest: ${manifestPath}`, { cause: error });
      }
    }
    visiting.delete(theme);
  };

  visit(activeTheme);
  for (const fallback of ['_shared', 'default']) visit(fallback);
  return chain;
}

/** Resolves the first key declared by a valid compiled theme in the chain. */
export interface ThemeKeyChecker {
  has(key: string): Promise<boolean> | boolean;
}

export class ThemeTemplateResolver {
  constructor(private readonly keyChecker: ThemeKeyChecker) {}

  async resolve(context: TemplateContext): Promise<ResolvedTemplate> {
    const chain = buildTemplateKeyChain(context);
    for (const key of chain) {
      if (await this.keyChecker.has(key)) {
        return { name: key, key, file: key, triedChain: chain.slice(0, chain.indexOf(key) + 1) };
      }
    }
    return { name: '404', key: '404', file: '404', triedChain: chain };
  }
}
