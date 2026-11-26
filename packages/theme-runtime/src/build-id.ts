import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import type { ThemeManifest } from '@oktis-works/theme-sdk';

export const THEME_BUILDER_VERSION = '0.2.0';
const SKIP_DIRS = new Set(['dist', 'node_modules', '.git', '.turbo']);
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.css', '.scss', '.json', '.html', '.md', '.svg']);
const SAFE_THEME_NAME_RE = /^[A-Za-z0-9_-]+$/;

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
  hash.update('theme-api:2\n');
  hash.update(`manifest:${JSON.stringify(manifest)}\n`);
  for (const identity of collectParentIdentities(root, manifest)) {
    hash.update(`parent:${JSON.stringify(identity)}\n`);
  }
  for (const file of files) {
    hash.update(`file:${file}\n`);
    hash.update(readFileSync(join(root, file)));
    hash.update('\n');
  }
  return `sha256:${hash.digest('hex')}`;
}

function collectParentIdentities(themeDir: string, manifest: ThemeManifest): Array<{
  name: string;
  manifest: ThemeManifest | null;
  buildId: string | null;
}> {
  const identities: Array<{ name: string; manifest: ThemeManifest | null; buildId: string | null }> = [];
  const root = resolve(themeDir, '..');
  const visited = new Set<string>();
  let parent = manifest.parent;

  while (typeof parent === 'string' && parent && SAFE_THEME_NAME_RE.test(parent) && !visited.has(parent)) {
    visited.add(parent);
    const parentDir = join(root, parent);
    const manifestFile = join(parentDir, 'theme.json');
    let parentManifest: ThemeManifest | null = null;
    let buildId: string | null = null;
    try {
      parentManifest = JSON.parse(readFileSync(manifestFile, 'utf-8')) as ThemeManifest;
    } catch {
      identities.push({ name: parent, manifest: null, buildId: null });
      break;
    }
    try {
      const build = JSON.parse(readFileSync(join(parentDir, 'dist', 'theme-build.json'), 'utf-8')) as { buildId?: unknown };
      buildId = typeof build.buildId === 'string' ? build.buildId : null;
    } catch {
      buildId = null;
    }
    identities.push({ name: parent, manifest: parentManifest, buildId });
    parent = parentManifest.parent;
  }

  return identities;
}
