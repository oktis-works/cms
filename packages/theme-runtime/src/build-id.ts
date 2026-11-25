import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import type { ThemeManifest } from '@oktis-works/theme-sdk';

export const THEME_BUILDER_VERSION = '0.2.0';
const SKIP_DIRS = new Set(['dist', 'node_modules', '.git', '.astro', '.turbo']);
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.css', '.scss', '.json', '.html', '.md', '.svg']);

function collectSourceFiles(dir: string, acc: string[] = []): string[] {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') && entry.name !== '.well-known') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) collectSourceFiles(full, acc);
      continue;
    }
    if (!statSync(full).isFile()) continue;
    const extension = entry.name.slice(entry.name.lastIndexOf('.')).toLowerCase();
    if (SOURCE_EXTENSIONS.has(extension)) acc.push(full);
  }
  return acc;
}

export function computeThemeBuildId(themeDir: string, manifest: ThemeManifest): string {
  const root = resolve(themeDir);
  const files = collectSourceFiles(root).map((file) => relative(root, file).split(sep).join('/')).sort();
  const hash = createHash('sha256');
  hash.update(`builder:${THEME_BUILDER_VERSION}\n`);
  hash.update(`manifest:${JSON.stringify(manifest)}\n`);
  for (const file of files) {
    hash.update(`file:${file}\n`);
    hash.update(readFileSync(join(root, file)));
    hash.update('\n');
  }
  return `sha256:${hash.digest('hex')}`;
}
