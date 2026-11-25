import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { findTemplateProvider, loadThemeCatalog, themeEngineOf } from './catalog.js';

let root: string;

function theme(name: string, manifest: Record<string, unknown>, templates: Record<string, string> = {}): void {
  mkdirSync(join(root, name), { recursive: true });
  writeFileSync(join(root, name, 'theme.json'), JSON.stringify({
    name,
    version: '1.0.0',
    type: 'theme',
    compatibility: { okcms: '^0.42.0' },
    ...manifest,
  }));
  for (const [file, content] of Object.entries(templates)) {
    writeFileSync(join(root, name, file), content);
  }
}

function compiled(name: string, engine: 'react' | 'solid', keys: string[], parent?: string): void {
  mkdirSync(join(root, name, 'dist', 'server'), { recursive: true });
  writeFileSync(
    join(root, name, 'theme.json'),
    JSON.stringify({
      name,
      version: '1.0.0',
      type: 'theme',
      compatibility: { okcms: '^0.42.0' },
      ...(parent ? { parent } : {}),
      render: { engine, apiVersion: 1, hydration: 'none' },
    })
  );
  writeFileSync(
    join(root, name, 'dist', 'theme-build.json'),
    JSON.stringify({
      schemaVersion: 1,
      engine,
      apiVersion: 1,
      buildId: `sha256:${name}`,
      entry: 'dist/server/entry.js',
      templates: keys,
      client: {},
      styles: [],
      hydration: 'none',
    })
  );
  writeFileSync(join(root, name, 'dist', 'server', 'entry.js'), 'export function render(){return {html:""}}');
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'okcms-catalog-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('theme catalog', () => {
  it('defaults to template and resolves same-engine templates', () => {
    theme('default', {}, { 'single.astro': 'DEFAULT', '404.astro': '404' });
    theme('child', { parent: 'default' }, { 'single.astro': 'CHILD' });

    const catalog = loadThemeCatalog(root, 'child');
    // The project chain always includes `_shared` and `default`.
    expect(catalog.entries.map((entry) => entry.engine)).toEqual(['template', 'template', 'template']);
    expect(findTemplateProvider(catalog, 'single', 'template')?.name).toBe('child');
    expect(findTemplateProvider(catalog, '404', 'template')?.name).toBe('default');
  });

  it('does not mix engines across a parent chain', () => {
    theme('default', {}, { 'home.astro': 'DEFAULT', '404.astro': '404' });
    compiled('react-child', 'react', ['home'], 'default');

    const catalog = loadThemeCatalog(root, 'react-child');
    expect(findTemplateProvider(catalog, 'home', 'react')?.name).toBe('react-child');
    expect(findTemplateProvider(catalog, 'single', 'react')).toBeNull();
    expect(findTemplateProvider(catalog, 'home', 'template')?.name).toBe('default');
  });

  it('reports a missing artifact instead of silently falling back', () => {
    theme('broken', { render: { engine: 'solid', apiVersion: 1 } });
    const catalog = loadThemeCatalog(root, 'broken');
    expect(catalog.entries[0]?.problems.join(' ')).toMatch(/theme-build\.json/);
    expect(themeEngineOf(catalog.entries[0]?.manifest ?? null)).toBe('solid');
  });

  it('falls back to a 404 provider in the same engine', () => {
    compiled('react-child', 'react', ['404']);
    const catalog = loadThemeCatalog(root, 'react-child');
    // Exact lookups do not invent a fallback; the web runtime explicitly asks
    // for `404` when the requested key has no provider.
    expect(findTemplateProvider(catalog, 'missing', 'react')).toBeNull();
    expect(findTemplateProvider(catalog, '404', 'react')?.name).toBe('react-child');
  });
});
