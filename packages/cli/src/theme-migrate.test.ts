// @oktis-works/cms - Migração do manifesto de tema legado (manifest.json → theme.json)

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { migrateThemeManifests } from './theme-migrate.js';

let root: string;
let themesDir: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'okcms-theme-migrate-'));
  themesDir = join(root, 'themes');
  mkdirSync(themesDir, { recursive: true });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function writeThemeDir(name: string, files: Record<string, string>): void {
  const dir = join(themesDir, name);
  mkdirSync(dir, { recursive: true });
  for (const [file, content] of Object.entries(files)) {
    writeFileSync(join(dir, file), content);
  }
}

describe('migrateThemeManifests', () => {
  it('renomeia manifest.json legado para theme.json (projeto antigo migrado)', () => {
    writeThemeDir('default', { 'manifest.json': JSON.stringify({ name: 'default', version: '0.1.0' }) });

    const migrated = migrateThemeManifests(themesDir);

    expect(migrated).toEqual(['default']);
    expect(existsSync(join(themesDir, 'default', 'manifest.json'))).toBe(false);
    expect(JSON.parse(readFileSync(join(themesDir, 'default', 'theme.json'), 'utf-8'))).toEqual({
      name: 'default',
      version: '0.1.0',
    });
  });

  it('nunca sobrescreve um theme.json já presente (os dois arquivos ficam intactos)', () => {
    writeThemeDir('default', {
      'manifest.json': JSON.stringify({ name: 'legado' }),
      'theme.json': JSON.stringify({ name: 'canonical' }),
    });

    const migrated = migrateThemeManifests(themesDir);

    expect(migrated).toEqual([]);
    expect(JSON.parse(readFileSync(join(themesDir, 'default', 'theme.json'), 'utf-8'))).toEqual({
      name: 'canonical',
    });
    expect(existsSync(join(themesDir, 'default', 'manifest.json'))).toBe(true);
  });

  it('é idempotente: a segunda chamada não faz nada', () => {
    writeThemeDir('default', { 'manifest.json': JSON.stringify({ name: 'default' }) });

    expect(migrateThemeManifests(themesDir)).toEqual(['default']);
    expect(migrateThemeManifests(themesDir)).toEqual([]);
    expect(existsSync(join(themesDir, 'default', 'theme.json'))).toBe(true);
  });

  it('ignora diretórios sem manifesto e temas que já usam theme.json', () => {
    writeThemeDir('vazio', {});
    writeThemeDir('novo', { 'theme.json': JSON.stringify({ name: 'novo' }) });

    expect(migrateThemeManifests(themesDir)).toEqual([]);
    expect(existsSync(join(themesDir, 'novo', 'theme.json'))).toBe(true);
    expect(existsSync(join(themesDir, 'novo', 'manifest.json'))).toBe(false);
  });

  it('devolve [] quando o diretório de temas não existe', () => {
    expect(migrateThemeManifests(join(root, 'nao-existe'))).toEqual([]);
  });
});
