import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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

import {
  mergePreviewSettings,
  renderContentPageAsync,
  serializeThemeHydration,
} from './rendering.js';
import { clearCompiledThemeCache } from '@oktis-works/theme-runtime';

let themesRoot: string;
let themeDir: string;

const build = {
  schemaVersion: 1,
  engine: 'react',
  apiVersion: 1,
  buildId: 'sha256:web-test',
  entry: 'dist/server/entry.js',
  templates: ['home', 'index', 'single', 'page', 'archive', '404'],
  client: {},
  styles: ['dist/theme.css'],
  hydration: 'none',
};

function writeArtifact(overrides: Record<string, unknown> = {}): void {
  writeFileSync(
    join(themeDir, 'dist', 'theme-build.json'),
    JSON.stringify({ ...build, ...overrides })
  );
  clearCompiledThemeCache();
}

beforeAll(() => {
  themesRoot = mkdtempSync(join(process.cwd(), '.tmp-compiled-web-'));
  themeDir = join(themesRoot, 'react-theme');
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
  writeArtifact();
  writeFileSync(
    join(themeDir, 'dist', 'server', 'entry.js'),
    [
      "import { getField } from '@oktis-works/theme-sdk';",
      'export const templateKeys = ["home", "index", "single", "page", "archive", "404"];',
      'export function render(key, data) {',
      '  const als = getField("subtitle") ?? "none";',
      '  return { html: `<main data-template="${key}" data-als="${als}" data-field="${data.fields.subtitle ?? ""}"><h1>${data.page.title}</h1><p>${data.settings.siteTitle}</p></main>` };',
      '}',
      '',
    ].join('\n')
  );
});

afterAll(() => {
  rmSync(themesRoot, { recursive: true, force: true });
});

beforeEach(() => {
  sharedRegistry.applyFilters.mockImplementation((_hook: string, value: unknown) => value);
});

const baseSettings = {
  siteTitle: 'Compiled Site',
  siteDescription: 'Compiled description',
  language: 'en',
  siteUrl: 'https://example.com',
};

const contentRow = {
  id: 'c1',
  title: 'Compiled Article',
  slug: 'compiled',
  type: 'post',
  body: { subtitle: 'ALS-value' },
};

function render(template: string, overrides: Record<string, unknown> = {}) {
  return renderContentPageAsync({
    resolution: { matched: true, template, contentType: 'post', slug: 'compiled' },
    contentRow,
    data: { subtitle: 'ALS-value' },
    items: [{ title: 'First', slug: 'first' }],
    settings: baseSettings,
    activeTheme: 'react-theme',
    themesRoot,
    tenantId: 'tenant-1',
    ...overrides,
  });
}

describe('renderContentPageAsync — compiled React theme', () => {
  it('renders every route key through the normal document pipeline', async () => {
    for (const key of ['home', 'index', 'single', 'page', 'archive', '404']) {
      const html = await render(`${key}.astro`);
      expect(html, key).toContain(`data-template="${key}"`);
    }
  });

  it('keeps getField() working through AsyncLocalStorage', async () => {
    const html = await render('single.astro');
    expect(html).toContain('data-als="ALS-value"');
  });

  it('runs theme:before:render before React and theme:after:render on the final HTML', async () => {
    sharedRegistry.applyFilters.mockImplementation((hook: string, value: unknown) => {
      if (hook === 'theme:before:render') {
        return { ...(value as Record<string, unknown>), subtitle: 'HOOKED' };
      }
      if (hook === 'theme:after:render') return `${String(value)}<!--after-->`;
      return value;
    });

    const html = await render('single.astro');
    expect(html).toContain('data-field="HOOKED"');
    expect(html).toContain('data-als="HOOKED"');
    expect(html.endsWith('<!--after-->')).toBe(true);
  });

  it('applies preview settings to the compiled data contract', async () => {
    const preview = mergePreviewSettings(
      { siteTitle: 'Saved' },
      encodeURIComponent(JSON.stringify({ siteTitle: 'Preview Title', ignored: 'x' })),
      ['siteTitle']
    );
    const html = await render('home.astro', {
      settings: { ...baseSettings, ...preview },
    });

    expect(html).toContain('Preview Title');
    expect(html).not.toContain('ignored');
  });

  it('rejects an artifact whose engine does not match theme.json', async () => {
    const mismatch = join(themesRoot, 'mismatch');
    mkdirSync(join(mismatch, 'dist', 'server'), { recursive: true });
    writeFileSync(
      join(mismatch, 'theme.json'),
      JSON.stringify({
        name: 'mismatch',
        version: '1.0.0',
        type: 'theme',
        render: { engine: 'react', apiVersion: 1, hydration: 'none' },
      })
    );
    writeFileSync(
      join(mismatch, 'dist', 'theme-build.json'),
      JSON.stringify({ ...build, engine: 'solid', buildId: 'sha256:mismatch' })
    );
    writeFileSync(join(mismatch, 'dist', 'server', 'entry.js'), 'export const templateKeys=["home"]; export function render(){return {html:"x"}};');

    await expect(
      renderContentPageAsync({
        resolution: { matched: true, template: 'home.astro' },
        contentRow: null,
        data: {},
        settings: baseSettings,
        activeTheme: 'mismatch',
        themesRoot,
      })
    ).rejects.toThrow(/engine mismatch|does not match/i);
  });

  it('fails clearly when the artifact is missing', async () => {
    const broken = join(themesRoot, 'broken');
    mkdirSync(broken, { recursive: true });
    writeFileSync(
      join(broken, 'theme.json'),
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
        settings: baseSettings,
        activeTheme: 'broken',
        themesRoot,
      })
    ).rejects.toThrow(/theme-build\.json/);
  });

  it('emits no module scripts when hydration is none', async () => {
    const html = await render('home.astro');
    expect(html).not.toContain('type="module"');
  });

  it('emits a serialized payload and module entry for hydration islands', async () => {
    mkdirSync(join(themeDir, 'dist', 'client'), { recursive: true });
    writeFileSync(join(themeDir, 'dist', 'client', 'entry.js'), 'console.log("hydrate");');
    writeArtifact({ hydration: 'islands', client: { main: 'dist/client/entry.js' } });

    const html = await render('single.astro');
    expect(html).toContain('id="okcms-theme-hydration"');
    expect(html).toContain('<script type="application/json"');
    expect(html).toContain('"templateKey":"single"');
    expect(html).toContain('type="module"');
    expect(html).toContain('src="/themes/react-theme/dist/client/entry.js"');
    expect(html).not.toContain('<script>alert');
  });
});

describe('serializeThemeHydration', () => {
  it('escapes HTML-breaking sequences in the JSON payload', () => {
    const serialized = serializeThemeHydration({
      buildId: 'b1',
      templateKey: 'home',
      data: {
        site: { title: 'x', description: '', theme: 't' },
        page: {
          title: '</script><script>alert(1)</script>',
          description: '',
          template: 'home.astro',
          type: 'page',
          slug: 'x',
          url: '/x',
          hubBase: '',
          itemPath: '',
          canonicalPath: '/x',
          isPageForPosts: false,
          isFrontPage: false,
        },
        content: {},
        fields: {},
        record: {},
        items: [],
        pagination: { page: 1, perPage: 0, total: 0, pages: 0, hasPrevious: false, hasNext: false },
        menus: { all: [], bySlug: {} },
        contentTypes: [],
        taxonomies: [],
        terms: {},
        settings: {},
        themeData: { menus: { all: [], bySlug: {} }, contentTypes: [], taxonomies: [], terms: {}, settings: {} },
      },
    });

    expect(serialized).not.toContain('</script>');
    expect(serialized).toContain('\\u003c/script\\u003e');
    // Deterministic payload budget for the page-data contract.
    expect(serialized.length).toBeLessThan(50_000);
  });
});
