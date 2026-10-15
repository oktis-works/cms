// @oktis-works/cms - Scaffold de tema no formato do runtime (.astro na raiz)

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

describe('scaffoldTheme (formato do runtime web)', () => {
  it('gera templates .astro NA RAIZ (nada de templates/*.html — o web não lê isso)', () => {
    const { dir } = scaffoldTheme('meu-tema', baseDir);

    for (const file of ['home.astro', 'index.astro', 'single.astro', 'page.astro', 'archive.astro', '404.astro']) {
      expect(existsSync(join(dir, file))).toBe(true);
    }
    expect(existsSync(join(dir, 'templates'))).toBe(false);
    expect(existsSync(join(dir, 'templates', 'index.html'))).toBe(false);
  });

  it('theme.json nasce com type + compatibility + provides.layouts (editor de layout funciona)', () => {
    const { manifest } = scaffoldTheme('meu-tema', baseDir);

    expect(manifest['type']).toBe('theme');
    expect(manifest['compatibility']).toEqual({ okcms: expect.stringMatching(/^\^\d+\.\d+\.\d+/) });
    expect((manifest['provides'] as Record<string, unknown>)['layouts']).toContain('home');
  });

  it('engine css entrega dist/theme.css servível (sem build)', () => {
    const { dir } = scaffoldTheme('meu-tema', baseDir, 'css');

    expect(existsSync(join(dir, 'dist', 'theme.css'))).toBe(true);
    expect(existsSync(join(dir, 'style.css'))).toBe(false);
  });

  it('engine scss mantém styles/main.scss + stylesConfig apontando para dist/theme.css', () => {
    const { dir, manifest } = scaffoldTheme('meu-tema', baseDir, 'scss');

    expect(existsSync(join(dir, 'styles', 'main.scss'))).toBe(true);
    const styles = manifest['stylesConfig'] as Record<string, unknown>;
    expect(styles['engine']).toBe('scss');
    expect(styles['output']).toBe('dist/theme.css');
  });

  it('engine tailwind gera input.css + config varrendo os .astro da raiz', () => {
    const { dir } = scaffoldTheme('meu-tema', baseDir, 'tailwind');

    expect(existsSync(join(dir, 'src', 'input.css'))).toBe(true);
    const config = readFileSync(join(dir, 'tailwind.config.js'), 'utf-8');
    expect(config).toContain('./**/*.astro');
    expect(config).not.toContain('templates/**');
  });

  it('templates usam items (contexto real) e não posts', () => {
    const { dir } = scaffoldTheme('meu-tema', baseDir);
    const home = readFileSync(join(dir, 'home.astro'), 'utf-8');

    expect(home).toContain('{{#each items}}');
    expect(home).not.toContain('posts');
  });

  it('rejeita nome inseguro e diretório existente', () => {
    expect(() => scaffoldTheme('../fora', baseDir)).toThrow(/Invalid name/);

    scaffoldTheme('duplicado', baseDir);
    expect(() => scaffoldTheme('duplicado', baseDir)).toThrow(/already exists/);
  });
});
