// @oktis-works/cms - Theme scaffolding in the runtime format (React/Solid SSR)

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

describe('scaffoldTheme (runtime web format — engine: react)', () => {
  it('generates .tsx templates at the ROOT (no templates/*.html — the web runtime does not read that)', () => {
    const { dir } = scaffoldTheme('meu-tema', baseDir, 'css', 'react');

    for (const file of [
      'home.tsx',
      'index.tsx',
      'single.tsx',
      'page.tsx',
      'archive.tsx',
      '404.tsx',
      'src/entry-server.tsx',
    ]) {
      expect(existsSync(join(dir, file)), file).toBe(true);
    }
    expect(existsSync(join(dir, 'templates'))).toBe(false);
    expect(existsSync(join(dir, 'templates', 'index.html'))).toBe(false);
  });

  it('theme.json is born with type + compatibility + provides.layouts + render config (layout editor works)', () => {
    const { manifest } = scaffoldTheme('meu-tema', baseDir, 'css', 'react');

    expect(manifest['type']).toBe('theme');
    expect(manifest['compatibility']).toEqual({ okcms: expect.stringMatching(/^\^\d+\.\d+\.\d+/) });
    expect(manifest['render']).toEqual({
      engine: 'react',
      apiVersion: 2,
      hydration: 'none',
      entry: 'src/entry-server.tsx',
    });
    expect((manifest['provides'] as Record<string, unknown>)['layouts']).toContain('home');
  });

  it('css engine delivers a servable dist/theme.css (no build)', () => {
    const { dir } = scaffoldTheme('meu-tema', baseDir, 'css', 'react');

    expect(existsSync(join(dir, 'dist', 'theme.css'))).toBe(true);
    expect(existsSync(join(dir, 'style.css'))).toBe(false);
  });

  it('css engine re-scopes the embedded stylesheet to the new theme name', () => {
    const { dir } = scaffoldTheme('meu-tema', baseDir, 'css', 'react');

    const css = readFileSync(join(dir, 'dist', 'theme.css'), 'utf-8');
    expect(css).toContain('[data-theme="meu-tema"]');
    expect(css).not.toContain('[data-theme="default"]');
    // The copied theme still ships component classes from the embedded source.
    expect(css).toContain('.site-header');
  });

  it('scss engine keeps styles/main.scss + stylesConfig pointing to dist/theme.css', () => {
    const { dir, manifest } = scaffoldTheme('meu-tema', baseDir, 'scss', 'react');

    expect(existsSync(join(dir, 'styles', 'main.scss'))).toBe(true);
    const styles = manifest['stylesConfig'] as Record<string, unknown>;
    expect(styles['engine']).toBe('scss');
    expect(styles['output']).toBe('dist/theme.css');
  });

  it('tailwind engine generates input.css + a config scanning supported theme source files', () => {
    const { dir } = scaffoldTheme('meu-tema', baseDir, 'tailwind', 'react');

    expect(existsSync(join(dir, 'src', 'input.css'))).toBe(true);
    const config = readFileSync(join(dir, 'tailwind.config.js'), 'utf-8');
    expect(config).toContain('./**/*.{html,js,jsx,ts,tsx}');
    expect(config).not.toContain('templates/**');
  });

  it('templates use items (the real context) and not posts', () => {
    const { dir } = scaffoldTheme('meu-tema', baseDir, 'css', 'react');
    const home = readFileSync(join(dir, 'home.tsx'), 'utf-8');

    expect(home).toContain('items.map');
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

  it('react engine writes render config + root TSX templates + build config', () => {
    const { dir, manifest } = scaffoldTheme('react-tema', baseDir, 'css', 'react');

    expect(manifest['render']).toEqual({
      engine: 'react',
      apiVersion: 2,
      hydration: 'none',
      entry: 'src/entry-server.tsx',
    });
    for (const file of [
      'home.tsx',
      'index.tsx',
      'single.tsx',
      'page.tsx',
      'archive.tsx',
      '404.tsx',
      'src/entry-server.tsx',
      'vite.config.ts',
      'tsconfig.json',
      'package.json',
      'dist/theme.css',
    ]) {
      expect(existsSync(join(dir, file)), file).toBe(true);
    }
    expect(existsSync(join(dir, 'home.astro'))).toBe(false);

    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf-8')) as {
      dependencies?: Record<string, string>;
    };
    expect(pkg.dependencies?.['react']).toBeTruthy();
    expect(pkg.dependencies?.['react-dom']).toBeTruthy();
  });

  it('solid engine writes render config + Solid templates', () => {
    const { dir, manifest } = scaffoldTheme('solid-tema', baseDir, 'css', 'solid');

    expect((manifest['render'] as Record<string, unknown>)['engine']).toBe('solid');
    expect(existsSync(join(dir, 'src', 'entry-server.tsx'))).toBe(true);
    expect(readFileSync(join(dir, 'src', 'entry-server.tsx'), 'utf-8')).toContain("solid-js/web");

    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf-8')) as {
      dependencies?: Record<string, string>;
    };
    expect(pkg.dependencies?.['solid-js']).toBeTruthy();
  });
});
