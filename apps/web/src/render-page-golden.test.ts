// Golden coverage for the legacy string-template renderer. These snapshots
// lock the public HTML so the compiled-theme refactor cannot silently change
// template themes.

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Shared registry for mocks
const sharedRegistry = {
  addFilter: vi.fn(),
  doAction: vi.fn(),
  applyFilters: vi.fn((_hook: string, value: unknown) => value),
};

vi.mock('@oktis-works/database', () => ({
  getConnection: vi.fn(() => ({ unsafe: vi.fn(async () => []) })),
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

let themesRoot: string;
let themeDir: string;

const legacyThemeManifest = {
  name: 'legacy-template',
  version: '1.0.0',
  type: 'theme',
  compatibility: { okcms: '^0.42.0' },
  provides: {
    layouts: ['page-home', 'index', 'single', 'page', 'archive', '404'],
    assets: ['dist/theme.css'],
  },
  stylesConfig: {
    engine: 'css',
    isolation: 'manual',
    entry: 'src/theme.css',
    output: 'dist/theme.css',
  },
};

const legacyCSS = `[data-theme="legacy-template"] main{font-family:system-ui;color:#111}
[data-theme="legacy-template"] .container{max-width:720px;margin:0 auto;padding:1rem}
[data-theme="legacy-template"] h1{font-size:2rem}
[data-theme="legacy-template"] .posts-grid{display:grid;gap:1rem;grid-template-columns:repeat(auto-fill,minmax(300px,1fr))}
[data-theme="legacy-template"] .post-card{border:1px solid #ddd;padding:1rem;border-radius:8px}
[data-theme="legacy-template"] .btn{display:inline-block;padding:.5rem 1rem;background:#2563eb;color:#fff;text-decoration:none;border-radius:4px}
[data-theme="legacy-template"] .btn-primary{background:#2563eb}
[data-theme="legacy-template"] .site-header{padding:1rem;border-bottom:1px solid #eee}
[data-theme="legacy-template"] .hero{padding:2rem;text-align:center;background:#f9fafb}
[data-theme="legacy-template"] .section-header{text-align:center;margin-bottom:2rem}
[data-theme="legacy-template"] .page-header{padding:2rem 0 1rem;border-bottom:1px solid #eee}
[data-theme="legacy-template"] .archive{padding:2rem 0}
[data-theme="legacy-template"] .error-404{min-height:50vh;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}
`;

const templates = {
  'page-home.astro': `<header class="site-header">
  <div class="container">
    <h1>{{site.title}}</h1>
    <p>{{site.description}}</p>
  </div>
</header>

<section class="hero">
  <div class="hero-content">
    <h1>Welcome to {{site.title}}</h1>
    <p class="hero-subtitle">{{site.description || 'A modern CMS built with TypeScript.'}}</p>
    <a href="/blog" class="btn btn-primary">Read the Blog</a>
  </div>
</section>

<section class="about-preview">
  <div class="container">
    <div class="about-content">
      <h2>About This Site</h2>
      <p>This is the default OkCMS theme using the legacy template engine.</p>
      <a href="/about" class="btn btn-secondary">Learn More</a>
    </div>
  </div>
</section>

<section class="posts">
  <div class="container">
    <header class="section-header">
      <h2>Latest Posts</h2>
    </header>
    <div class="posts-grid">
      {{#each items}}
        <article class="post-card">
          <div class="post-card__content">
            <div class="post-card__header">
              <time class="post-card__date">{{publishedAt}}</time>
            </div>
            <h2 class="post-card__title">
              <a href="/{{slug}}">{{title}}</a>
            </h2>
            {{#if excerpt}}
              <p class="post-card__excerpt">{{excerpt}}</p>
            {{/if}}
            <a href="/{{slug}}" class="btn btn-outline">Read More</a>
          </div>
        </article>
      {{/each}}
    </div>
  </div>
</section>`,
  'index.astro': `<header class="page-header">
  <div class="container">
    <h1>{{page.title}}</h1>
    {{#if page.excerpt}}
      <p class="page-excerpt">{{page.excerpt}}</p>
    {{/if}}
  </div>
</header>

<div class="page-content">
  <div class="container">
    <div class="entry-content">{{{content.html}}}</div>
  </div>
</div>`,
  'single.astro': `<article class="post-single">
  <div class="container">
    <header class="post-header">
      <h1 class="post-title">{{page.title}}</h1>
      <div class="post-meta">
        <time class="post-date">{{publishedAt}}</time>
      </div>
    </header>
    <div class="post-body">{{{content.html}}}</div>
    <footer class="post-footer">
      <nav class="post-nav" aria-label="Post navigation">
        {{#if page.previous}}
          <a href="/{{page.previous.slug}}" class="post-nav__prev">
            <span class="post-nav__label">Previous</span>
            <span class="post-nav__title">{{page.previous.title}}</span>
          </a>
        {{/if}}
        {{#if page.next}}
          <a href="/{{page.next.slug}}" class="post-nav__next">
            <span class="post-nav__label">Next</span>
            <span class="post-nav__title">{{page.next.title}}</span>
          </a>
        {{/if}}
      </nav>
    </footer>
  </div>
</article>`,
  'page.astro': `<header class="page-header">
  <div class="container">
    <h1>{{page.title}}</h1>
    {{#if page.excerpt}}
      <p class="page-excerpt">{{page.excerpt}}</p>
    {{/if}}
  </div>
</header>

<div class="page-content">
  <div class="container">
    <div class="entry-content">{{{content.html}}}</div>
  </div>
</div>`,
  'archive.astro': `<header class="archive-header">
  <div class="container">
    <h1 class="archive-title">{{page.title}}</h1>
    {{#if page.excerpt}}
      <p class="archive-description">{{page.excerpt}}</p>
    {{/if}}
  </div>
</header>

<div class="container">
  <section class="posts">
    <div class="posts-grid">
      {{#each items}}
        <article class="post-card">
          <div class="post-card__content">
            <div class="post-card__header">
              <time class="post-card__date">{{publishedAt}}</time>
            </div>
            <h2 class="post-card__title">
              <a href="/{{slug}}">{{title}}</a>
            </h2>
            {{#if excerpt}}
              <p class="post-card__excerpt">{{excerpt}}</p>
            {{/if}}
            <a href="/{{slug}}" class="btn btn-outline">Read More</a>
          </div>
        </article>
      {{/each}}
    </div>
  </section>
</div>`,
  '404.astro': `<main class="error-404">
  <h1>404</h1>
  <h2>Page Not Found</h2>
  <p>Sorry, we couldn't find the page you're looking for.</p>
  <a href="/" class="btn btn-primary">Go Home</a>
</main>`,
};

beforeAll(() => {
  themesRoot = mkdtempSync(join(process.cwd(), '.tmp-legacy-web-'));
  themeDir = join(themesRoot, 'legacy-template');
  mkdirSync(join(themeDir, 'dist'), { recursive: true });
  writeFileSync(join(themeDir, 'theme.json'), JSON.stringify(legacyThemeManifest));
  writeFileSync(join(themeDir, 'dist', 'theme.css'), legacyCSS);
  for (const [file, content] of Object.entries(templates)) {
    writeFileSync(join(themeDir, file), content);
  }
});

afterAll(() => {
  rmSync(themesRoot, { recursive: true, force: true });
});

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
    activeTheme: 'legacy-template',
    themesRoot,
    ...overrides,
  });
}

describe('template theme golden HTML (legacy string-template renderer)', () => {
  it('home', async () => {
    await expect(render('page-home.astro')).toMatchFileSnapshot('__snapshots__/template-home.html');
  });

  it('single', async () => {
    await expect(render('single.astro')).toMatchFileSnapshot('__snapshots__/template-single.html');
  });

  it('archive', async () => {
    await expect(render('archive.astro')).toMatchFileSnapshot('__snapshots__/template-archive.html');
  });

  it('404', async () => {
    await expect(render('404.astro', { contentRow: null })).toMatchFileSnapshot('__snapshots__/template-404.html');
  });
});