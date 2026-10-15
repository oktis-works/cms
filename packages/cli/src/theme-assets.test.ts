// @oktis-works/cms - Assets embutidos do tema default

import { describe, it, expect } from 'vitest';
import { DEFAULT_THEME_FILES, DEFAULT_THEME_MANIFEST, THEME_TEMPLATE_FILES } from './theme-assets.js';

describe('DEFAULT_THEME_FILES (tema default embutido no init)', () => {
  const manifest = JSON.parse(DEFAULT_THEME_MANIFEST) as Record<string, unknown>;

  it('manifesto tem name/version/type/compatibilidade legível pelo service', () => {
    expect(manifest['name']).toBe('default');
    expect(manifest['version']).toBe('0.1.0');
    expect(manifest['type']).toBe('theme');
    expect((manifest['provides'] as Record<string, unknown>)['layouts']).toEqual([
      'home', 'index', 'single', 'page', 'archive', '404',
    ]);
  });

  it('traz a hierarquia completa de templates .astro na raiz', () => {
    for (const file of ['home.astro', 'index.astro', 'single.astro', 'page.astro', 'archive.astro', '404.astro']) {
      expect(Object.keys(THEME_TEMPLATE_FILES)).toContain(file);
      expect(THEME_TEMPLATE_FILES[file]!.startsWith('<main')).toBe(true);
    }
  });

  it('templates usam o contexto real do runtime (items, site, content) — nunca posts', () => {
    expect(THEME_TEMPLATE_FILES['home.astro']).toContain('{{#each items}}');
    expect(THEME_TEMPLATE_FILES['home.astro']).not.toContain('posts');
    expect(THEME_TEMPLATE_FILES['single.astro']).toContain('{{content.title}}');
    expect(THEME_TEMPLATE_FILES['index.astro']).toContain('{{{content.html}}}');
  });

  it('inclui dist/theme.css servível (caminho que o web linka)', () => {
    expect(DEFAULT_THEME_FILES['dist/theme.css']).toContain('--brand');
    expect(Object.keys(DEFAULT_THEME_FILES)).toContain('manifest.json');
  });

  it('cobre exatamente manifesto + 6 templates + css', () => {
    expect(Object.keys(DEFAULT_THEME_FILES).sort()).toEqual(
      ['404.astro', 'archive.astro', 'dist/theme.css', 'home.astro', 'index.astro', 'manifest.json', 'page.astro', 'single.astro'].sort()
    );
  });
});
