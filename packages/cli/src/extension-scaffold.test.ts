// @oktis-works/cms - Theme scaffolding in the runtime format (.astro at the root)

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scaffoldTheme } from './extension-scaffold.js';

let baseDir: string;

beforeEach(() => {
  baseDir = mkdtempSync(join(tmpdir(), 'okcms-theme-'));
});

afterEach(() => {
  rmSync(baseDir, { recursive: true, force: true });
});

describe('scaffoldTheme (runtime web format)', () => {
  it('generates .astro templates at the ROOT (no templates/*.html — the web runtime does not read that)', () => {
    const { dir } = scaffoldTheme('meu-tema', baseDir);

    for (const file of [
      'page-home.astro',
      'index.astro',
      'single.astro',
      'page.astro',
      'archive.astro',
      '404.astro',
    ]) {
      expect(existsSync(join(dir, file)), file).toBe(true);
    }
    expect(existsSync(join(dir, 'templates'))).toBe(false);
    expect(existsSync(join(dir, 'templates', 'index.html'))).toBe(false);
  });

  it('theme.json is born with type + compatibility + provides.layouts (layout editor works)', () => {
    const { manifest } = scaffoldTheme('meu-tema', baseDir);

    expect(manifest['type']).toBe('theme');
    expect(manifest['compatibility']).toEqual({ okcms: expect.stringMatching(/^\^\d+\.\d+\.\d+/) });
    expect((manifest['provides'] as Record<string, unknown>)['layouts']).toContain('page-home');
  });

  it('css engine delivers a servable dist/theme.css (no build)', () => {
    const { dir } = scaffoldTheme('meu-tema', baseDir, 'css');

    expect(existsSync(join(dir, 'dist', 'theme.css'))).toBe(true);
    expect(existsSync(join(dir, 'style.css'))).toBe(false);
  });

  it('css engine re-scopes the embedded stylesheet to the new theme name', () => {
    const { dir } = scaffoldTheme('meu-tema', baseDir, 'css');

    const css = readFileSync(join(dir, 'dist', 'theme.css'), 'utf-8');
    expect(css).toContain('[data-theme="meu-tema"]');
    expect(css).not.toContain('[data-theme="default"]');
    // The copied theme still ships component classes from the embedded source.
    expect(css).toContain('.site-header');
  });

  it('scss engine keeps styles/main.scss + stylesConfig pointing to dist/theme.css', () => {
    const { dir, manifest } = scaffoldTheme('meu-tema', baseDir, 'scss');

    expect(existsSync(join(dir, 'styles', 'main.scss'))).toBe(true);
    const styles = manifest['stylesConfig'] as Record<string, unknown>;
    expect(styles['engine']).toBe('scss');
    expect(styles['output']).toBe('dist/theme.css');
  });

  it('tailwind engine generates input.css + a config scanning the root .astro files', () => {
    const { dir } = scaffoldTheme('meu-tema', baseDir, 'tailwind');

    expect(existsSync(join(dir, 'src', 'input.css'))).toBe(true);
    const config = readFileSync(join(dir, 'tailwind.config.js'), 'utf-8');
    expect(config).toContain('./**/*.astro');
    expect(config).not.toContain('templates/**');
  });

  it('templates use items (the real context) and not posts', () => {
    const { dir } = scaffoldTheme('meu-tema', baseDir);
    const home = readFileSync(join(dir, 'page-home.astro'), 'utf-8');

    expect(home).toContain('{{#each items}}');
    // The runtime collection is `items` — a `posts` data variable does not
    // exist (UI copy may still contain the word, e.g. "Browse posts").
    expect(home).not.toContain('{{posts');
    expect(home).not.toContain('each posts');
  });

  it('rejects unsafe names and existing directories', () => {
    expect(() => scaffoldTheme('../fora', baseDir)).toThrow(/Invalid name/);

    scaffoldTheme('duplicado', baseDir);
    expect(() => scaffoldTheme('duplicado', baseDir)).toThrow(/already exists/);
  });
});
