import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  clearCompiledThemeCache,
  readThemeBuild,
  renderCompiledTheme,
  validateThemeBuild,
  type ThemeBuildManifest,
} from './compiled.js';
import type { ThemePageData } from '@oktis-works/theme-sdk';

let themeDir: string;

function writeBuild(overrides: Partial<ThemeBuildManifest> = {}): ThemeBuildManifest {
  const build: ThemeBuildManifest = {
    schemaVersion: 1,
    engine: 'react',
    apiVersion: 1,
    buildId: 'sha256:test',
    entry: 'dist/server/entry.js',
    templates: ['home', '404'],
    client: {},
    styles: ['dist/theme.css'],
    hydration: 'none',
    ...overrides,
  };
  mkdirSync(join(themeDir, 'dist', 'server'), { recursive: true });
  writeFileSync(join(themeDir, 'dist', 'theme.css'), '[data-theme="compiled"] main{color:red}');
  writeFileSync(join(themeDir, 'dist', 'theme-build.json'), JSON.stringify(build));
  writeFileSync(
    join(themeDir, 'dist', 'server', 'entry.js'),
    [
      'export const templateKeys = ["home", "404"];',
      'export function render(key, data) {',
      '  return { html: `<main data-key="${key}"><h1>${data.page.title}</h1></main>` };',
      '}',
      '',
    ].join('\n')
  );
  return build;
}

beforeEach(() => {
  themeDir = mkdtempSync(join(tmpdir(), 'okcms-compiled-'));
  clearCompiledThemeCache();
});

afterEach(() => {
  rmSync(themeDir, { recursive: true, force: true });
  clearCompiledThemeCache();
});

const pageData: ThemePageData = {
  site: { title: 'Site', description: '', theme: { siteTitle: 'Compiled Site' } },
  page: {
    title: 'Hello',
    description: '',
    template: 'home.tsx',
    type: 'page',
    slug: 'hello',
    url: '/hello',
    hubBase: '',
    itemPath: '',
    canonicalPath: '/hello',
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
};

describe('compiled theme artifacts', () => {
  it('reads and validates a well-formed artifact', () => {
    const build = writeBuild();
    expect(readThemeBuild(themeDir)).toEqual(build);
    expect(validateThemeBuild(themeDir, build, 'react')).toEqual([]);
  });

  it('rejects engine mismatch, unsafe entry and unsafe assets', () => {
    const build = writeBuild();
    expect(validateThemeBuild(themeDir, build, 'solid').join(' ')).toMatch(/does not match/);
    expect(validateThemeBuild(themeDir, { ...build, entry: '../outside.js' }).join(' ')).toMatch(/escapes/);
    expect(validateThemeBuild(themeDir, { ...build, styles: ['../secret.css'] }).join(' ')).toMatch(/escapes/);
  });

  it('requires a real client entry when hydration is islands', () => {
    const build = writeBuild({ hydration: 'islands', client: { main: 'dist/client/entry.js' } });
    expect(validateThemeBuild(themeDir, build, 'react').join(' ')).toMatch(/client asset does not exist/);

    mkdirSync(join(themeDir, 'dist', 'client'), { recursive: true });
    writeFileSync(join(themeDir, 'dist', 'client', 'entry.js'), 'console.log("hydrate");');
    expect(validateThemeBuild(themeDir, build, 'react')).toEqual([]);

    expect(validateThemeBuild(themeDir, { ...build, client: {} }).join(' ')).toMatch(/client\.main/);
  });

  it('caches artifact reads by mtime and refreshes after a rebuild', () => {
    writeBuild();
    const first = readThemeBuild(themeDir);
    expect(readThemeBuild(themeDir)).toBe(first);

    writeBuild({ buildId: 'sha256:changed' });
    const artifact = join(themeDir, 'dist', 'theme-build.json');
    const future = new Date(Date.now() + 2000);
    utimesSync(artifact, future, future);

    const rebuilt = readThemeBuild(themeDir);
    expect(rebuilt).not.toBe(first);
    expect(rebuilt?.buildId).toBe('sha256:changed');
  });

  it('imports the server entry and renders with ThemePageData', async () => {
    const build = writeBuild();
    const output = await renderCompiledTheme({
      themeDir,
      build,
      templateKey: 'home',
      data: pageData,
      record: { title: 'Hello' },
      context: { url: '/hello', params: {}, tenant: 't1', templateKey: 'home', buildId: build.buildId },
    });
    expect(output.html).toBe('<main data-key="home"><h1>Hello</h1></main>');
    expect(output.styles).toEqual([]);
  });

  it('rejects a full document when automatic styles or hydration are enabled', async () => {
    const build = writeBuild({ styles: ['dist/theme.css'] });
    writeFileSync(
      join(themeDir, 'dist', 'server', 'entry.js'),
      'export const templateKeys = ["home"]; export function render() { return { html: "<!doctype html><html><body>full</body></html>" }; }'
    );
    await expect(renderCompiledTheme({
      themeDir,
      build,
      templateKey: 'home',
      data: pageData,
      record: {},
      context: { url: '/', params: {}, tenant: 't1', templateKey: 'home', buildId: build.buildId },
    })).rejects.toThrow(/full document/i);
  });
});
