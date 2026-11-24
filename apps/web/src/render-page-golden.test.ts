// Golden coverage for the legacy string-template renderer. These snapshots
// lock the public HTML so the compiled-theme refactor cannot silently change
// template themes.

import { describe, it, expect, vi } from 'vitest';
import { join } from 'node:path';

vi.mock('@oktis-works/database', () => ({
  getConnection: vi.fn(() => ({ unsafe: vi.fn(async () => []) })),
}));

const { sharedRegistry } = vi.hoisted(() => ({
  sharedRegistry: {
    addFilter: vi.fn(),
    doAction: vi.fn(),
    applyFilters: vi.fn((_hook: string, value: unknown) => value),
  },
}));

vi.mock('@oktis-works/plugin-runtime', () => ({
  getHookRegistry: vi.fn(() => sharedRegistry),
}));
vi.mock('@oktis-works/core', () => ({
  postTypeRegistry: { list: vi.fn(async () => []) },
  HOOK_POINTS: {
    THEME_HEAD: 'theme:head',
    THEME_BEFORE_RENDER: 'theme:before:render',
    THEME_AFTER_RENDER: 'theme:after:render',
  },
}));

import { renderContentPage } from './rendering.js';

const themesRoot = join(process.cwd(), 'themes');
const settings = {
  siteTitle: 'Golden Site',
  siteDescription: 'Golden description',
  language: 'en',
  siteUrl: 'https://example.com',
};
const contentRow = {
  id: 'golden-1',
  title: 'Golden Article',
  slug: 'golden',
  type: 'post',
  excerpt: 'Golden excerpt',
  body: { html: '<p>Golden body</p>' },
};

function render(template: string, overrides: Record<string, unknown> = {}): string {
  return renderContentPage({
    resolution: { matched: true, template, contentType: 'post', slug: 'golden' },
    contentRow,
    data: {},
    items: [{ title: 'First', slug: 'first' }],
    settings,
    activeTheme: 'default',
    themesRoot,
    ...overrides,
  });
}

describe('template theme golden HTML', () => {
  it('home', async () => {
    await expect(render('home.astro')).toMatchFileSnapshot('__snapshots__/template-home.html');
  });

  it('single', async () => {
    await expect(render('single.astro')).toMatchFileSnapshot('__snapshots__/template-single.html');
  });

  it('archive', async () => {
    await expect(render('archive.astro')).toMatchFileSnapshot('__snapshots__/template-archive.html');
  });

  it('404', async () => {
    await expect(render('404.astro', { contentRow: null })).toMatchFileSnapshot(
      '__snapshots__/template-404.html'
    );
  });
});
