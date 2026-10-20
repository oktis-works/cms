// @oktis-works/cli - i18n extract (Item 9 do plugin-parity-plan)
//
// Scans a plugin's source files for server-side translation keys
// (`api.i18n.translate('key', ...)`, `__('key', ...)`) and merges them into
// `locales/<locale>.json`, preserving existing translations and adding the
// missing keys with empty strings (so translators fill them in).

import { readdirSync, readFileSync, existsSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';

const SOURCE_EXTENSIONS = new Set(['.js', '.ts', '.tsx', '.jsx', '.mjs']);
const SKIPPED_DIRS = new Set(['node_modules', 'dist', '.git', 'vendor']);
const KEY_PATTERNS = [
  /\bi18n\.translate\(\s*['"]([^'"]+)['"]/g,
  /\b__\(\s*['"]([^'"]+)['"]/g,
];

/** Recursively collects source files under a directory. */
function collectSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) {
      if (!SKIPPED_DIRS.has(entry)) collectSourceFiles(full, out);
      continue;
    }
    if (SOURCE_EXTENSIONS.has(extname(entry)) && !entry.endsWith('.d.ts')) out.push(full);
  }
  return out;
}

/** Extracts translation keys from a single source file. */
export function extractKeysFromSource(source: string): string[] {
  const keys: string[] = [];
  for (const pattern of KEY_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(source)) !== null) {
      const key = match[1];
      if (key && !keys.includes(key)) keys.push(key);
    }
  }
  return keys;
}

export interface ExtractResult {
  plugin: string;
  file: string;
  added: number;
  kept: number;
  total: number;
}

/**
 * Extracts keys from one plugin directory and merges them into
 * `locales/<locale>.json`. Existing translations are kept; missing keys are
 * added with an empty string. Returns null when the directory has no
 * manifest (not a plugin).
 */
export function extractPluginI18n(
  pluginDir: string,
  locale = 'en'
): ExtractResult | null {
  const manifestPath = join(pluginDir, 'manifest.json');
  if (!existsSync(manifestPath)) return null;

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { name?: string };
  const pluginName = manifest.name ?? pluginDir.split(/[/\\]/).pop() ?? pluginDir;

  const keys: string[] = [];
  for (const file of collectSourceFiles(pluginDir)) {
    if (file.includes(`${join('locales')}`)) continue;
    for (const key of extractKeysFromSource(readFileSync(file, 'utf8'))) {
      if (!keys.includes(key)) keys.push(key);
    }
  }

  const localesDir = join(pluginDir, 'locales');
  const targetFile = join(localesDir, `${locale}.json`);
  const existing: Record<string, string> = existsSync(targetFile)
    ? (JSON.parse(readFileSync(targetFile, 'utf8')) as Record<string, string>)
    : {};

  let added = 0;
  let kept = 0;
  const merged: Record<string, string> = {};
  for (const key of keys) {
    if (typeof existing[key] === 'string') {
      merged[key] = existing[key];
      kept += 1;
    } else {
      merged[key] = '';
      added += 1;
    }
  }
  // Preserve translations for keys no longer in the source (they may belong
  // to dynamic keys) — appended after the extracted ones.
  for (const [key, value] of Object.entries(existing)) {
    if (!(key in merged)) merged[key] = value;
  }

  mkdirSync(localesDir, { recursive: true });
  writeFileSync(targetFile, `${JSON.stringify(merged, null, 2)}\n`);

  return { plugin: pluginName, file: relative(process.cwd(), targetFile), added, kept, total: keys.length };
}

export interface ExtractOptions {
  /** Base directory containing plugins (default: ./plugins). */
  dir?: string;
  /** Single plugin name to extract (defaults to all plugins). */
  name?: string;
  /** Target locale file (default: en). */
  locale?: string;
}

export async function runI18nExtract(options: ExtractOptions = {}): Promise<number> {
  const baseDir = options.dir ?? 'plugins';
  const locale = options.locale ?? 'en';

  if (!existsSync(baseDir)) {
    console.error(`✗ Directory not found: ${baseDir}`);
    return 1;
  }

  const targets = options.name
    ? [join(baseDir, options.name)]
    : readdirSync(baseDir).map((entry) => join(baseDir, entry)).filter((path) => statSync(path).isDirectory());

  let extracted = 0;
  for (const pluginDir of targets) {
    const result = extractPluginI18n(pluginDir, locale);
    if (!result) continue;
    extracted += 1;
    console.log(
      `✓ ${result.plugin}: ${result.total} key(s) → ${result.file} (${result.added} new, ${result.kept} translated)`
    );
  }

  if (extracted === 0) {
    console.log(`No plugins with translation keys found in ${baseDir}`);
  } else {
    console.log(`\nDone: ${extracted} plugin(s) processed → locales/${locale}.json`);
  }
  return 0;
}
