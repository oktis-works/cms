import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, sep } from 'node:path';
import {
  DEFAULT_THEME_FILES,
  DEFAULT_THEME_BINARY_FILES,
  isBinaryThemeAsset,
} from './theme-assets.js';
import { readThemeFiles } from './scaffold.js';
import { assertCompatible, CMS_VERSION } from '@oktis-works/validation';

const THEME_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'themes',
  'default',
);

function walkThemeFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkThemeFiles(full));
    } else {
      out.push(relative(THEME_DIR, full).split(sep).join('/'));
    }
  }
  return out;
}

/**
 * Parity guard: the embedded fallback theme in the CLI must be a byte-exact
 * snapshot of the monorepo themes/default directory (the source of truth).
 * If this test fails after editing the theme, regenerate with:
 *   node packages/cli/scripts/generate-theme-assets.mjs
 */
describe('default theme assets (generated parity)', () => {
  it('embeds every file from themes/default, with no extras or omissions', () => {
    const sourceFiles = walkThemeFiles(THEME_DIR).sort();
    const embeddedFiles = [
      ...Object.keys(DEFAULT_THEME_FILES),
      ...Object.keys(DEFAULT_THEME_BINARY_FILES),
    ].sort();
    expect(embeddedFiles).toEqual(sourceFiles);
  });

  it('embeds byte-identical content for every file', () => {
    for (const [name, content] of Object.entries(DEFAULT_THEME_FILES)) {
      expect(readFileSync(join(THEME_DIR, name), 'utf8'), name).toBe(content);
    }
    for (const [name, content] of Object.entries(DEFAULT_THEME_BINARY_FILES)) {
      expect(readFileSync(join(THEME_DIR, name)), name).toEqual(
        Buffer.from(content, 'base64'),
      );
    }
  });

  it('classifies binary assets by their generated map', () => {
    expect(isBinaryThemeAsset('screenshot.png')).toBe(true);
    expect(isBinaryThemeAsset('theme.json')).toBe(false);
    expect(isBinaryThemeAsset('index.astro')).toBe(false);
  });

  it('readThemeFiles reads the real theme directory byte-exact', async () => {
    const files = await readThemeFiles(THEME_DIR);
    const sourceFiles = walkThemeFiles(THEME_DIR).sort();
    expect([...files.keys()].sort()).toEqual(sourceFiles);
    for (const [name, content] of files) {
      // Text files are read as utf-8 strings, binaries as Buffers — compare
      // each against the same representation on disk.
      const expected =
        typeof content === 'string'
          ? readFileSync(join(THEME_DIR, name), 'utf-8')
          : readFileSync(join(THEME_DIR, name));
      expect(content, name).toEqual(expected);
    }
  });

  it('exposes a complete, OkCMS-compatible manifest', () => {
    const manifest = JSON.parse(DEFAULT_THEME_FILES['theme.json'] ?? '');
    expect(manifest.name).toBe('default');
    expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(() => assertCompatible('theme', manifest, CMS_VERSION)).not.toThrow();
    for (const layout of manifest.provides.layouts) {
      expect(DEFAULT_THEME_FILES[`${layout}.astro`], layout).toBeDefined();
    }
    expect(manifest.stylesConfig.entry).toBe('src/theme.css');
    expect(manifest.stylesConfig.output).toBe('dist/theme.css');
    expect(DEFAULT_THEME_FILES['dist/theme.css']).toBeDefined();
  });

  it('ships a decodable 600x400 screenshot', () => {
    const png = Buffer.from(
      DEFAULT_THEME_BINARY_FILES['screenshot.png'] ?? '',
      'base64',
    );
    // PNG signature + IHDR: width/height are big-endian uint32 at offset 16/20.
    expect(png.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
    expect(png.subarray(12, 16).toString('ascii')).toBe('IHDR');
    expect(png.readUInt32BE(16)).toBe(600);
    expect(png.readUInt32BE(20)).toBe(400);
  });

  it('scopes the stylesheet to [data-theme="default"]', () => {
    expect(DEFAULT_THEME_FILES['dist/theme.css']).toContain(
      '[data-theme="default"]',
    );
    expect(DEFAULT_THEME_FILES['src/theme.css']).toContain(
      '[data-theme="default"]',
    );
  });

  it('regenerates the embedded assets during build and prepack', () => {
    const pkg = JSON.parse(
      readFileSync(
        join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json'),
        'utf8',
      ),
    );
    expect(pkg.scripts.build).toContain('generate-theme-assets.mjs');
    expect(pkg.scripts.prepack).toContain('generate-theme-assets.mjs');
  });
});
