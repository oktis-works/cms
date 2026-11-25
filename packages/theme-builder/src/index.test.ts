import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { buildTheme, verifyThemeBuild, watchTheme, type ThemeWatchEvent } from './index.js';
import type { ThemeBuildManifest } from '@oktis-works/theme-runtime';
import { readThemeBuild, validateThemeBuild } from '@oktis-works/theme-runtime';
import type { ThemePageData } from '@oktis-works/theme-sdk';

let root: string;
let dir: string;

const pageData: ThemePageData = {
  site: { title: 'Built Site', description: '', theme: { siteTitle: 'Built Site' } },
  page: {
    title: 'Built', description: '', template: 'home.tsx', type: 'page', slug: 'built',
    url: '/built', hubBase: '', itemPath: '', canonicalPath: '/built',
    isPageForPosts: false, isFrontPage: false,
  },
  content: {}, fields: {}, record: {}, items: [],
  pagination: { page: 1, perPage: 0, total: 0, pages: 0, hasPrevious: false, hasNext: false },
  menus: { all: [], bySlug: {} }, contentTypes: [], taxonomies: [], terms: {},
  settings: {},
  themeData: { menus: { all: [], bySlug: {} }, contentTypes: [], taxonomies: [], terms: {}, settings: {} },
};

function writeBase(engine: 'react' | 'solid'): void {
  dir = join(root, `${engine}-theme`);
  mkdirSync(join(dir, 'src'), { recursive: true });
  mkdirSync(join(dir, 'dist'), { recursive: true });
  writeFileSync(join(dir, 'dist', 'theme.css'), `[data-theme="${engine}-theme"] main{color:red}`);
  writeFileSync(
    join(dir, 'theme.json'),
    JSON.stringify({
      name: `${engine}-theme`,
      version: '1.0.0',
      type: 'theme',
      render: { engine, apiVersion: 1, hydration: 'none', entry: 'src/entry-server.tsx' },
    })
  );
  writeFileSync(join(dir, 'home.tsx'), `export default function Home(props: any) { return <main><h1>{props.page.title}</h1></main>; }`);
  if (engine === 'react') {
    writeFileSync(
      join(dir, 'src', 'entry-server.tsx'),
      [
        "import { renderToStaticMarkup } from 'react-dom/server';",
        "import Home from '../home';",
        'export const templateKeys = ["home"];',
        'export function render(key, data) { return { html: renderToStaticMarkup(<Home {...data} />) }; }',
        '',
      ].join('\n')
    );
  } else {
    writeFileSync(
      join(dir, 'src', 'entry-server.tsx'),
      [
        "import { renderToString } from 'solid-js/web';",
        "import Home from '../home';",
        'export const templateKeys = ["home"];',
        'export function render(key, data) { return { html: renderToString(() => <Home {...data} />) }; }',
        '',
      ].join('\n')
    );
  }
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'okcms-builder-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('buildTheme — compiled engines', () => {
  it('builds a React SSR artifact and renders it', async () => {
    writeBase('react');
    const result = await buildTheme({ themesRoot: root, themeName: 'react-theme' });

    expect(result.engine).toBe('react');
    expect(result.templates).toEqual(['home']);
    expect(existsSync(join(dir, 'dist', '.versions'))).toBe(true);
    const artifact = JSON.parse(readFileSync(join(dir, 'dist', 'theme-build.json'), 'utf-8')) as ThemeBuildManifest;
    expect(artifact.entry).toMatch(/^dist\/\.versions\/sha256_[^/]+\/server\/entry\.js$/);
    expect(artifact.styles).toEqual([]);
    expect(verifyThemeBuild(dir).ok).toBe(true);

    const module = (await import(`${pathToFileURL(join(dir, artifact.entry)).href}?t=1`)) as {
      render: (key: string, data: ThemePageData) => { html: string };
    };
    expect(module.render('home', pageData).html).toContain('<h1>Built</h1>');
  }, 60_000);

  it('builds an islands client entry when hydration is islands', async () => {
    writeBase('react');
    const manifestPath = join(dir, 'theme.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as Record<string, unknown>;
    manifest['render'] = { engine: 'react', apiVersion: 1, hydration: 'islands', entry: 'src/entry-server.tsx' };
    writeFileSync(manifestPath, JSON.stringify(manifest));
    writeFileSync(
      join(dir, 'src', 'entry-client.tsx'),
      "import { hydrateRoot } from 'react-dom/client';\nconsole.log(typeof hydrateRoot);\n"
    );

    const result = await buildTheme({ themesRoot: root, themeName: 'react-theme' });
    expect(result.engine).toBe('react');
    const artifact = JSON.parse(readFileSync(join(dir, 'dist', 'theme-build.json'), 'utf-8')) as ThemeBuildManifest;
    expect(artifact.hydration).toBe('islands');
    expect(artifact.client['main']).toMatch(/^dist\/\.versions\/sha256_[^/]+\/client\/entry\.js$/);
    expect(existsSync(join(dir, artifact.client['main']!))).toBe(true);
  }, 60_000);

  it('builds a Solid SSR artifact', async () => {
    writeBase('solid');
    const result = await buildTheme({ themesRoot: root, themeName: 'solid-theme' });
    expect(result.engine).toBe('solid');
    const artifact = JSON.parse(readFileSync(join(dir, 'dist', 'theme-build.json'), 'utf-8')) as ThemeBuildManifest;
    expect(existsSync(join(dir, artifact.entry))).toBe(true);
    expect(verifyThemeBuild(dir).ok).toBe(true);
  }, 60_000);

  it('watchTheme rebuilds after a source change', async () => {
    writeBase('react');
    const events: ThemeWatchEvent[] = [];
    const stop = await watchTheme(
      { themesRoot: root, themeName: 'react-theme', pollMs: 50, debounceMs: 20 },
      (event) => events.push(event)
    );
    try {
      expect(events.filter((event) => event.type === 'build')).toHaveLength(1);
      const builds = events.filter((event) => event.type === 'build').length;

      writeFileSync(
        join(dir, 'home.tsx'),
        'export default function Home(props: any) { return <main><h1>Changed {props.page.title}</h1></main>; }'
      );

      await vi.waitFor(
        () => expect(events.filter((event) => event.type === 'build').length).toBeGreaterThan(builds),
        { timeout: 10_000, interval: 50 }
      );
      const latest = events.filter((event) => event.type === 'build').at(-1)?.result;
      expect(latest?.buildId).toBeTruthy();
      expect(verifyThemeBuild(dir).ok).toBe(true);
    } finally {
      stop();
    }
  }, 30_000);

  it('fails startup when the initial compiled build is invalid', async () => {
    writeBase('react');
    rmSync(join(dir, 'src', 'entry-server.tsx'));
    await expect(watchTheme({ themesRoot: root, themeName: 'react-theme', pollMs: 20 })).rejects.toThrow(/entry not found/i);
  });

  it('keeps the previous valid artifact when a rebuild fails', async () => {
    writeBase('react');
    await buildTheme({ themesRoot: root, themeName: 'react-theme' });
    const artifactPath = join(dir, 'dist', 'theme-build.json');
    const previous = readFileSync(artifactPath, 'utf-8');

    rmSync(join(dir, 'src', 'entry-server.tsx'));
    await expect(buildTheme({ themesRoot: root, themeName: 'react-theme' })).rejects.toThrow(/entry not found/i);

    expect(readFileSync(artifactPath, 'utf-8')).toBe(previous);
    const artifact = readThemeBuild(dir);
    expect(artifact).not.toBeNull();
    expect(validateThemeBuild(dir, artifact!, 'react')).toEqual([]);
  }, 60_000);
});
