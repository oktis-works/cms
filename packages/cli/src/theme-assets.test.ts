// @oktis-works/cms - Default theme embedded assets

import { Buffer } from 'node:buffer';
import { describe, it, expect } from 'vitest';
import { DEFAULT_THEME_FILES, DEFAULT_THEME_BINARY_FILES, DEFAULT_THEME_MANIFEST, THEME_TEMPLATE_FILES } from './theme-assets.js';

describe('DEFAULT_THEME_FILES (default theme embedded by init)', () => {
  const manifest = JSON.parse(DEFAULT_THEME_MANIFEST) as Record<string, unknown>;

  it('manifest has name/version/type readable by the service', () => {
    expect(manifest['name']).toBe('default');
    expect(manifest['version']).toBe('0.2.0');
    expect(manifest['type']).toBe('theme');
    expect((manifest['provides'] as Record<string, unknown>)['layouts']).toEqual([
      'front-page', 'home', 'index', 'single', 'page', 'archive', '404',
    ]);
  });

  it('ships the complete .astro template hierarchy at the theme root', () => {
    for (const file of ['front-page.astro', 'home.astro', 'index.astro', 'single.astro', 'page.astro', 'archive.astro', '404.astro']) {
      expect(Object.keys(THEME_TEMPLATE_FILES)).toContain(file);
      // All templates share the scoped shell: data-theme wrapper + header + footer
      expect(THEME_TEMPLATE_FILES[file]!.startsWith('<div class="site" data-theme=')).toBe(true);
      expect(THEME_TEMPLATE_FILES[file]!).toContain('site-header');
      expect(THEME_TEMPLATE_FILES[file]!).toContain('site-footer');
    }
  });

  it('renders the header menu and footer menu from the runtime menus context', () => {
    expect(THEME_TEMPLATE_FILES['front-page.astro']).toContain('{{#each menus.header.items}}');
    expect(THEME_TEMPLATE_FILES['front-page.astro']).toContain('{{#each menus.footer.items}}');
    expect(THEME_TEMPLATE_FILES['home.astro']).toContain('{{#each menus.header.items}}');
    expect(THEME_TEMPLATE_FILES['404.astro']).toContain('{{#each menus.header.items}}');
  });

  it('templates use the real runtime context (items, site, content) — never hardcoded posts', () => {
    expect(THEME_TEMPLATE_FILES['front-page.astro']).toContain('{{#each items}}');
    expect(THEME_TEMPLATE_FILES['home.astro']).toContain('{{#each items}}');
    expect(THEME_TEMPLATE_FILES['single.astro']).toContain('{{content.title}}');
    expect(THEME_TEMPLATE_FILES['page.astro']).toContain('{{{content.html}}}');
    expect(THEME_TEMPLATE_FILES['archive.astro']).toContain('{{#each items}}');
  });

  it('includes servable dist/theme.css (the path the web app links)', () => {
    expect(DEFAULT_THEME_FILES['dist/theme.css']).toContain('--brand');
    expect(Object.keys(DEFAULT_THEME_FILES)).toContain('theme.json');
  });

  it('covers exactly manifest + 7 templates + css (screenshot is separate binary)', () => {
    expect(Object.keys(DEFAULT_THEME_FILES).sort()).toEqual(
      ['404.astro', 'archive.astro', 'dist/theme.css', 'front-page.astro', 'home.astro', 'index.astro', 'theme.json', 'page.astro', 'single.astro'].sort()
    );
    expect(Object.keys(DEFAULT_THEME_BINARY_FILES)).toEqual(['screenshot.png']);
  });

  it('manifest declares compatibility.okcms (BUSI-022 — theme:install requires it)', () => {
    expect((manifest['compatibility'] as Record<string, unknown>)['okcms']).toMatch(/^\^\d+\.\d+\.\d+$/);
  });

  it('manifest declares screenshots for the admin preview and the PNG decodes valid', () => {
    expect(manifest['screenshots']).toEqual(['screenshot.png']);
    const decoded = Buffer.from(DEFAULT_THEME_BINARY_FILES['screenshot.png']!, 'base64');
    // magic number PNG + dimensions 600x400 (IHDR)/big-endian
    expect(decoded.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    expect(decoded.readUInt32BE(16)).toBe(600);
    expect(decoded.readUInt32BE(20)).toBe(400);
  });
});
