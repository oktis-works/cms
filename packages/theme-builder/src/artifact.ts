// @oktis-works/theme-builder - Artifact helpers

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import type { ThemeBuildManifest } from '@oktis-works/theme-runtime';
import type { ThemeManifest, ThemeRenderEngine } from '@oktis-works/theme-sdk';

export const THEME_BUILDER_VERSION = '0.1.0';
const SKIP_DIRS = new Set(['dist', 'node_modules', '.git', '.astro', '.turbo']);
const SOURCE_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.css',
  '.scss',
  '.json',
  '.html',
  '.md',
  '.svg',
]);

function collectSourceFiles(dir: string, acc: string[] = []): string[] {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') && entry.name !== '.well-known') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      collectSourceFiles(full, acc);
      continue;
    }
    if (!statSync(full).isFile()) continue;
    const dot = entry.name.lastIndexOf('.');
    const ext = dot === -1 ? '' : entry.name.slice(dot).toLowerCase();
    if (SOURCE_EXTENSIONS.has(ext)) acc.push(full);
  }
  return acc;
}

/** Stable content hash of the theme sources + render config + builder version. */
export function computeBuildId(themeDir: string, manifest: ThemeManifest): string {
  const root = resolve(themeDir);
  const files = collectSourceFiles(root)
    .map((file) => relative(root, file).split(sep).join('/'))
    .sort();

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

/** Writes `dist/theme-build.json` atomically (temp file + rename). */
export function writeThemeBuild(themeDir: string, build: ThemeBuildManifest): void {
  const target = join(themeDir, 'dist', 'theme-build.json');
  const temp = `${target}.tmp`;
  writeFileSync(temp, `${JSON.stringify(build, null, 2)}\n`, 'utf-8');
  renameSync(temp, target);
}

export function engineOf(manifest: ThemeManifest): ThemeRenderEngine {
  const engine = manifest.render?.engine;
  return engine === 'react' || engine === 'solid' ? engine : 'template';
}
