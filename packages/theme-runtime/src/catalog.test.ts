import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { findTemplateProvider, loadThemeCatalog, themeEngineOf } from './catalog.js';

let root: string;

function theme(name: string, manifest: Record<string, unknown>, templates: Record<string, string> = {}): void {
  mkdirSync(join(root, name), { recursive: true });
  const baseRender = { engine: 'react', apiVersion: 2, entry: 'src/entry-server.tsx' };
  const manifestRender = manifest['render'] as Record<string, unknown> | undefined;
  const mergedRender = manifestRender
    ? { ...baseRender, ...manifestRender }
    : baseRender;
  writeFileSync(join(root, name, 'theme.json'), JSON.stringify({
    name,
    version: '1.0.0',
    type: 'theme',
    compatibility: { okcms: '^2.0.0' },
    render: mergedRender,
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
      compatibility: { okcms: '^2.0.0' },
      ...(parent ? { parent } : {}),
      render: { engine, apiVersion: 2, hydration: 'none' },
    })
  );
  writeFileSync(
    join(root, name, 'dist', 'theme-build.json'),
    JSON.stringify({
      schemaVersion: 2,
      engine,
      apiVersion: 2,
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

function createFallbackThemes(): void {
  compiled('_shared', 'react', ['404']);
  compiled('default', 'react', ['404']);
}

describe('theme catalog', () => {
  beforeEach(() => {
    createFallbackThemes();
  });

  it('defaults to react and resolves same-engine templates', () => {
    compiled('child', 'react', ['single'], 'default');

    const catalog = loadThemeCatalog(root, 'child');
    // The project chain always includes `_shared` and `default`.
    expect(catalog.entries.map((entry) => entry.engine)).toEqual(['react', 'react', 'react']);
    expect(findTemplateProvider(catalog, 'single', 'react')?.name).toBe('child');
    expect(findTemplateProvider(catalog, '404', 'react')?.name).toBe('default');
  });

  it('does not mix engines across a parent chain', () => {
    compiled('react-child', 'react', ['home'], 'default');

    const catalog = loadThemeCatalog(root, 'react-child');
    expect(findTemplateProvider(catalog, 'home', 'react')?.name).toBe('react-child');
    expect(findTemplateProvider(catalog, 'single', 'react')).toBeNull();
    expect(findTemplateProvider(catalog, 'home', 'solid')).toBeNull();
  });

  it('rejects cross-engine parent inheritance', () => {
    compiled('solid-parent', 'solid', ['single']);
    compiled('react-child', 'react', ['home'], 'solid-parent');

    const catalog = loadThemeCatalog(root, 'react-child');
    expect(catalog.entries[0]?.problems.join(' ')).toMatch(/parent.*solid.*react/i);
    expect(findTemplateProvider(catalog, 'home', 'react')).toBeNull();
  });

  it('reports a missing artifact instead of silently falling back', () => {
    theme('broken', { render: { engine: 'solid', apiVersion: 2 } });
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
