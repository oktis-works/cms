import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

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

import { renderContentPageAsync } from './rendering.js';

let themesRoot: string;

beforeAll(() => {
  themesRoot = mkdtempSync(join(tmpdir(), 'okcms-compiled-web-'));
  const themeDir = join(themesRoot, 'react-theme');
  mkdirSync(join(themeDir, 'dist', 'server'), { recursive: true });
  writeFileSync(
    join(themeDir, 'theme.json'),
    JSON.stringify({
      name: 'react-theme',
      version: '1.0.0',
      type: 'theme',
      render: { engine: 'react', apiVersion: 1, hydration: 'none' },
    })
  );
  writeFileSync(join(themeDir, 'dist', 'theme.css'), '[data-theme="react-theme"] main{color:red}');
  writeFileSync(
    join(themeDir, 'dist', 'theme-build.json'),
    JSON.stringify({
      schemaVersion: 1,
      engine: 'react',
      apiVersion: 1,
      buildId: 'sha256:web-test',
      entry: 'dist/server/entry.js',
      templates: ['home', '404'],
      client: {},
      styles: ['dist/theme.css'],
      hydration: 'none',
    })
  );
  writeFileSync(
    join(themeDir, 'dist', 'server', 'entry.js'),
    [
      'export const templateKeys = ["home", "404"];',
      'export function render(key, data) {',
      '  if (key === "404") return { html: "<main><h1>Not found</h1></main>" };',
      '  return { html: `<main><h1>${data.page.title}</h1><ul>${data.items.map((item) => `<li>${item.title}</li>`).join("")}</ul></main>` };',
      '}',
      '',
    ].join('\n')
  );
});

afterAll(() => {
  rmSync(themesRoot, { recursive: true, force: true });
});

const settings = {
  siteTitle: 'Compiled Site',
  siteDescription: 'Compiled description',
  language: 'en',
  siteUrl: 'https://example.com',
};

describe('renderContentPageAsync — compiled themes', () => {
  it('renders the compiled module inside the normal document pipeline', async () => {
    const html = await renderContentPageAsync({
      resolution: { matched: true, template: 'home.astro', contentType: 'post', slug: 'home' },
      contentRow: null,
      data: {},
      items: [{ title: 'First', slug: 'first' }, { title: 'Second', slug: 'second' }],
      settings,
      activeTheme: 'react-theme',
      themesRoot,
      tenantId: 'tenant-1',
    });

    expect(html).toContain('<h1>Compiled Site</h1>');
    expect(html).toContain('<li>First</li>');
    expect(html).toContain('data-theme="react-theme"');
    expect(html).toContain('/themes/react-theme/dist/theme.css');
  });

  it('fails clearly when the artifact is missing', async () => {
    mkdirSync(join(themesRoot, 'broken'), { recursive: true });
    writeFileSync(
      join(themesRoot, 'broken', 'theme.json'),
      JSON.stringify({
        name: 'broken',
        version: '1.0.0',
        type: 'theme',
        render: { engine: 'react', apiVersion: 1 },
      })
    );

    await expect(
      renderContentPageAsync({
        resolution: { matched: true, template: 'home.astro' },
        contentRow: null,
        data: {},
        settings,
        activeTheme: 'broken',
        themesRoot,
      })
    ).rejects.toThrow(/theme-build\.json/);
  });
});
