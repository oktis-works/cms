// @oktis-works/plugin-runtime - Plugin i18n helpers (Item 9 do plugin-parity-plan)
//
// Server-side translations for plugins:
//   - `api.i18n.load(locale, bundle)` merges flat { key: string } bundles;
//   - `api.i18n.translate(key, params?, locale?)` resolves through the
//     fallback chain (requested locale → base language → 'en' → key) with
//     {param} interpolation;
//   - manifest `locales[]` JSON files (flat key/value) are loaded at boot.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { PluginManifest, PluginI18nApi } from '@oktis-works/plugin-sdk';

/**
 * Fallback chain for a locale: `pt-BR` → [`pt-BR`, `pt`, `en`];
 * `en` → [`en`]; `fr` → [`fr`, `en`]. Duplicates removed.
 */
export function i18nFallbackChain(locale: string): string[] {
  const chain: string[] = [];
  const push = (value: string): void => {
    if (value && !chain.includes(value)) chain.push(value);
  };
  push(locale);
  const base = locale.split('-')[0];
  if (base) push(base);
  push('en');
  return chain;
}

/** Replaces `{token}` placeholders with stringified params (missing → kept). */
export function i18nInterpolate(template: string, params?: Record<string, unknown>): string {
  if (!params || typeof params !== 'object') return template;
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, token: string) => {
    const value = params[token];
    return value === undefined || value === null ? match : String(value);
  });
}

/**
 * Loads manifest `locales[]` JSON files (flat key/value) into the plugin's
 * i18n store. The filename defines the locale (`locales/pt-BR.json` →
 * `pt-BR`). Malformed/out-of-tree files are skipped — never breaks boot.
 * Returns the number of successfully loaded files.
 */
export async function loadPluginLocales(
  pluginDir: string,
  manifest: PluginManifest,
  i18n: PluginI18nApi
): Promise<number> {
  const files = manifest.locales;
  if (!Array.isArray(files) || files.length === 0) return 0;

  let loaded = 0;
  for (const relative of files) {
    if (typeof relative !== 'string' || relative.includes('..') || relative.startsWith('/')) continue;
    try {
      const raw = await readFile(join(pluginDir, relative), 'utf8');
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) continue;
      const locale = relative.replace(/\.json$/, '').split('/').pop() ?? '';
      if (!locale) continue;
      const bundle: Record<string, string> = {};
      for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof value === 'string') bundle[key] = value;
      }
      i18n.load(locale, bundle);
      loaded += 1;
    } catch {
      // malformed locale file — skip (translation falls back to the key)
    }
  }
  return loaded;
}
