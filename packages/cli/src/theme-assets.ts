// @oktis-works/cms - Default theme templates embedded in the CLI
//
// `okcms init` writes these files into the new project's `themes/default/`:
// the site renders out of the box (root-level .astro templates + dist/theme.css
// served directly). Kept as strings because the package publishes only `dist/`.
// The renderer supports: {{var}} / {{{raw}}} / {{#if x}} / {{#each path}} —
// no {{else}} and no @index, so templates are written within that syntax.

import { CMS_VERSION } from '@oktis-works/validation';

/** Default theme manifest (`theme.json` = canonical name read by runtime, service and CLI). */
export const DEFAULT_THEME_MANIFEST = `${JSON.stringify(
  {
    name: 'default',
    version: '0.2.0',
    description: 'OkCMS default theme — responsive hierarchical templates with real content interpolation',
    type: 'theme',
    author: 'Oktis Works',
    // BUSI-022 contract: required by theme:install through the API. Without the
    // range the default theme would be rejected on explicit install. Derived
    // from CMS_VERSION (single source) — never a literal.
    compatibility: { okcms: `^${CMS_VERSION}` },
    // Preview card on the admin Themes screen (served from /themes/default/).
    screenshots: ['screenshot.png'],
    provides: {
      layouts: ['front-page', 'home', 'posts', 'index', 'single', 'page', 'archive', '404'],
      assets: ['dist/theme.css'],
    },
    stylesConfig: {
      engine: 'css',
      // Committed CSS already scoped — the theme owns its isolation (BUSI-040)
      isolation: 'manual',
    },
    settings: [
      { name: 'siteTitle', type: 'text', label: 'Site title', default: 'OkCMS' },
      { name: 'siteDescription', type: 'text', label: 'Site description', default: '' },
    ],
  },
  null,
  2
)}
`;

/** Default theme design system — served straight from dist/theme.css (no build). */
export const DEFAULT_THEME_CSS = `/* OkCMS default theme — design system (served straight from dist/theme.css) */
[data-theme="default"]{
  --brand: #4f46e5;
  --brand-strong: #4338ca;
  --brand-soft: #eef2ff;
  --text: #111827;
  --muted: #6b7280;
  --surface: #ffffff;
  --bg: #f9fafb;
  --border: #e5e7eb;
  --border-strong: #d1d5db;
  --radius: 12px;
  --radius-sm: 8px;
  --shadow-sm: 0 1px 2px rgba(17,24,39,.06);
  --shadow-md: 0 6px 20px rgba(17,24,39,.08);
  --shadow-lg: 0 16px 40px rgba(17,24,39,.14);
}

[data-theme="default"] *,[data-theme="default"] *::before,[data-theme="default"] *::after{ box-sizing: border-box; }

/* Page-level reset: the UA default body margin (8px) would frame the whole
   site in white on every side (top/left/right/bottom). Scoped with :has so
   this stylesheet — also the last fallback of the project chain — never
   changes the page box of another theme. */
body:has([data-theme="default"]){ margin: 0; padding: 0; }

[data-theme="default"]{
  margin: 0;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  color: var(--text);
  background: var(--bg);
  line-height: 1.65;
  -webkit-font-smoothing: antialiased;
}

[data-theme="default"] a{ color: var(--brand); text-decoration: none; }
[data-theme="default"] a:hover{ color: var(--brand-strong); }
[data-theme="default"] img{ max-width: 100%; border-radius: var(--radius-sm); }

[data-theme="default"] .container{ max-width: 72rem; margin: 0 auto; padding: 0 1.25rem; }

/* ---------- Header ---------- */
[data-theme="default"] .site-header{
  position: sticky; top: 0; z-index: 20;
  background: rgba(255,255,255,.86);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--border);
}
[data-theme="default"] .site-header__inner{
  display: flex; align-items: center; justify-content: space-between;
  gap: 1rem; min-height: 3.75rem; flex-wrap: wrap; padding-top: .5rem; padding-bottom: .5rem;
}
[data-theme="default"] .site-brand{
  font-weight: 800; font-size: 1.15rem; letter-spacing: -.02em; color: var(--text);
  display: inline-flex; align-items: center; gap: .5rem;
}
[data-theme="default"] .site-brand::before{
  content: ""; width: .65rem; height: .65rem; border-radius: 999px;
  background: linear-gradient(135deg, var(--brand), #8b5cf6);
}
[data-theme="default"] .site-brand:hover{ color: var(--text); }
[data-theme="default"] .site-nav{ display: flex; align-items: center; gap: .25rem; flex-wrap: wrap; }
[data-theme="default"] .site-nav__link{
  padding: .45rem .85rem; border-radius: 999px; color: var(--muted); font-weight: 500; font-size: .95rem;
}
[data-theme="default"] .site-nav__link:hover{ color: var(--brand); background: var(--brand-soft); }

/* ---------- Hero ---------- */
[data-theme="default"] .hero{
  position: relative; overflow: hidden;
  background: linear-gradient(135deg, #4f46e5 0%, #6d28d9 55%, #7c3aed 100%);
  color: #fff; text-align: center;
  padding: 5rem 1.5rem 5.5rem;
}
[data-theme="default"] .hero::after{
  content: ""; position: absolute; inset: auto -10% -60% -10%; height: 70%;
  background: var(--bg); border-radius: 50% 50% 0 0;
}
[data-theme="default"] .hero > *{ position: relative; z-index: 1; }
[data-theme="default"] .hero__kicker{
  margin: 0 0 .75rem; text-transform: uppercase; letter-spacing: .18em;
  font-size: .78rem; font-weight: 700; color: rgba(255,255,255,.75);
}
[data-theme="default"] .hero__title{
  margin: 0 0 1rem; font-size: clamp(2rem, 5vw, 3.25rem); line-height: 1.12; letter-spacing: -.03em; font-weight: 800;
}
[data-theme="default"] .hero__description{
  margin: 0 auto 1.75rem; max-width: 42rem; font-size: 1.1rem; color: rgba(255,255,255,.85);
}
[data-theme="default"] .hero__actions{ display: flex; gap: .75rem; justify-content: center; flex-wrap: wrap; }
[data-theme="default"] .hero--compact{ padding: 3.25rem 1.5rem 4rem; }

/* ---------- Buttons ---------- */
[data-theme="default"] .btn{
  display: inline-flex; align-items: center; gap: .5rem;
  padding: .7rem 1.4rem; border-radius: 999px; font-weight: 600; font-size: .98rem;
  border: 1px solid transparent; cursor: pointer; transition: transform .15s ease, box-shadow .15s ease, background .15s ease;
}
[data-theme="default"] .btn:hover{ transform: translateY(-1px); }
[data-theme="default"] .btn--primary{ background: #fff; color: var(--brand-strong); box-shadow: var(--shadow-md); }
[data-theme="default"] .btn--primary:hover{ background: var(--brand-soft); color: var(--brand-strong); }
[data-theme="default"] .btn--ghost{ background: rgba(255,255,255,.12); color: #fff; border-color: rgba(255,255,255,.45); }
[data-theme="default"] .btn--ghost:hover{ background: rgba(255,255,255,.22); color: #fff; }
[data-theme="default"] .btn--outline{ background: transparent; color: var(--brand); border-color: var(--border-strong); }
[data-theme="default"] .btn--outline:hover{ background: var(--brand-soft); border-color: var(--brand); }

/* ---------- Sections ---------- */
[data-theme="default"] .site-main{ min-height: 60vh; }
[data-theme="default"] .section{ max-width: 72rem; margin: 0 auto; padding: 3.5rem 1.25rem; }
[data-theme="default"] .section__kicker{
  margin: 0 0 .5rem; text-transform: uppercase; letter-spacing: .16em;
  font-size: .74rem; font-weight: 700; color: var(--brand);
}
[data-theme="default"] .section__title{
  margin: 0 0 .75rem; font-size: clamp(1.5rem, 3vw, 2rem); letter-spacing: -.02em; font-weight: 800;
}
[data-theme="default"] .section__lead{ margin: 0 0 1rem; color: var(--muted); font-size: 1.05rem; max-width: 46rem; }
[data-theme="default"] .section__more{ font-weight: 600; }
[data-theme="default"] .section--tight{ padding: 2.25rem 1.25rem; }
[data-theme="default"] .section__head{
  display: flex; align-items: baseline; justify-content: space-between;
  gap: 1rem; flex-wrap: wrap; margin-bottom: 1.75rem;
}

/* ---------- Cards / listings ---------- */
[data-theme="default"] .cards{
  display: grid; gap: 1.25rem;
  grid-template-columns: repeat(auto-fill, minmax(17rem, 1fr));
}
[data-theme="default"] .card{
  display: flex; flex-direction: column; gap: .5rem;
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius); padding: 1.4rem 1.4rem 1.2rem; box-shadow: var(--shadow-sm);
  transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease;
}
[data-theme="default"] .card:hover{ transform: translateY(-3px); box-shadow: var(--shadow-md); border-color: var(--border-strong); }
[data-theme="default"] .card__date{ font-size: .8rem; color: var(--muted); }
[data-theme="default"] .card__title{ margin: 0; font-size: 1.12rem; line-height: 1.35; }
[data-theme="default"] .card__title a{ color: var(--text); }
[data-theme="default"] .card__title a:hover{ color: var(--brand); }
[data-theme="default"] .card__excerpt{ margin: 0; color: var(--muted); font-size: .95rem; }
[data-theme="default"] .card__more{
  margin-top: auto; padding-top: .4rem; font-weight: 600; font-size: .92rem; color: var(--brand);
}
[data-theme="default"] .listing{ display: grid; gap: 1rem; }

/* ---------- Entries (single / page) ---------- */
[data-theme="default"] .entry{
  max-width: 46rem; margin: 0 auto; padding: 3rem 1.25rem 4rem;
}
[data-theme="default"] .entry__header{ margin-bottom: 1.75rem; }
[data-theme="default"] .entry__kicker{
  margin: 0 0 .5rem; text-transform: uppercase; letter-spacing: .16em;
  font-size: .74rem; font-weight: 700; color: var(--brand);
}
[data-theme="default"] .entry__title{
  margin: 0 0 .5rem; font-size: clamp(1.75rem, 4vw, 2.5rem); letter-spacing: -.025em; line-height: 1.15; font-weight: 800;
}
[data-theme="default"] .entry__meta{ display: flex; align-items: center; gap: .75rem; flex-wrap: wrap; color: var(--muted); font-size: .9rem; }
[data-theme="default"] .entry__cover{ width: 100%; border-radius: var(--radius); margin: 1rem 0; box-shadow: var(--shadow-sm); }
[data-theme="default"] .entry__body{ font-size: 1.06rem; }
[data-theme="default"] .entry__body h2{ font-size: 1.5rem; letter-spacing: -.01em; margin: 2rem 0 .75rem; }
[data-theme="default"] .entry__body h3{ font-size: 1.2rem; margin: 1.5rem 0 .5rem; }
[data-theme="default"] .entry__body p{ margin: 0 0 1rem; color: #374151; }
[data-theme="default"] .entry__body a{ text-decoration: underline; text-underline-offset: 3px; }
[data-theme="default"] .entry__body blockquote{
  margin: 1.5rem 0; padding: .75rem 1.25rem; border-left: 3px solid var(--brand);
  background: var(--brand-soft); border-radius: 0 var(--radius-sm) var(--radius-sm) 0; color: #374151;
}
[data-theme="default"] .entry__body pre{
  background: #0f172a; color: #e2e8f0; padding: 1rem 1.25rem; border-radius: var(--radius-sm);
  overflow: auto; font-size: .9rem;
}
[data-theme="default"] .entry__body code{ background: var(--brand-soft); border-radius: 4px; padding: .1rem .35rem; }
[data-theme="default"] .entry__body pre code{ background: transparent; padding: 0; }
[data-theme="default"] .entry__terms{ display: flex; gap: .5rem; flex-wrap: wrap; margin-bottom: 1rem; }
[data-theme="default"] .badge{
  display: inline-block; padding: .25rem .7rem; border-radius: 999px;
  background: var(--brand-soft); color: var(--brand-strong); font-size: .8rem; font-weight: 600;
}
[data-theme="default"] .entry__footer{
  margin-top: 2.5rem; padding-top: 1.5rem; border-top: 1px solid var(--border);
  display: flex; justify-content: space-between; align-items: center; gap: 1rem; flex-wrap: wrap;
  color: var(--muted); font-size: .92rem;
}
[data-theme="default"] .entry__back{ font-weight: 600; }

/* ---------- Home body sections (seeded content) ---------- */
[data-theme="default"] .about-preview{
  display: grid; gap: 1.5rem; grid-template-columns: 1.2fr .8fr; align-items: start;
}
[data-theme="default"] .about-preview .section__more{ display: inline-block; }
[data-theme="default"] .contact{
  background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
  box-shadow: var(--shadow-sm);
}
[data-theme="default"] .contact .section__lead a{ font-weight: 600; }

/* ---------- Archive ---------- */
[data-theme="default"] .archive-header{
  background: linear-gradient(135deg, #4f46e5 0%, #6d28d9 60%, #7c3aed 100%);
  color: #fff; text-align: center; padding: 3.25rem 1.5rem 4rem;
}
[data-theme="default"] .archive-header__title{ margin: 0 0 .4rem; font-size: clamp(1.7rem, 4vw, 2.4rem); letter-spacing: -.02em; font-weight: 800; }
[data-theme="default"] .archive-header__description{ margin: 0; color: rgba(255,255,255,.85); }
[data-theme="default"] .archive-header + .section{ margin-top: -1.5rem; }
[data-theme="default"] .archive-header + .section .card{ background: var(--surface); }

/* ---------- Empty state ---------- */
[data-theme="default"] .empty{
  text-align: center; color: var(--muted); padding: 2.5rem 1rem;
  border: 1px dashed var(--border-strong); border-radius: var(--radius); background: var(--surface);
}

/* ---------- 404 ---------- */
[data-theme="default"] .not-found{ text-align: center; padding: 5rem 1.5rem; }
[data-theme="default"] .not-found__code{
  margin: 0 0 .5rem; font-size: 5rem; font-weight: 800; letter-spacing: -.04em;
  background: linear-gradient(135deg, var(--brand), #8b5cf6);
  -webkit-background-clip: text; background-clip: text; color: transparent;
}
[data-theme="default"] .not-found__message{ margin: 0 0 1.5rem; color: var(--muted); font-size: 1.1rem; }

/* ---------- Footer ---------- */
[data-theme="default"] .site-footer{
  background: #111827; color: #d1d5db; margin-top: 4rem;
}
[data-theme="default"] .site-footer__inner{
  display: flex; justify-content: space-between; gap: 2rem; flex-wrap: wrap;
  padding-top: 2.75rem; padding-bottom: 1.5rem;
}
[data-theme="default"] .site-footer__title{ margin: 0 0 .35rem; color: #fff; font-weight: 700; font-size: 1.05rem; }
[data-theme="default"] .site-footer__description{ margin: 0; max-width: 24rem; color: #9ca3af; font-size: .93rem; }
[data-theme="default"] .site-footer__nav{ display: flex; flex-direction: column; gap: .45rem; }
[data-theme="default"] .site-footer__link{ color: #d1d5db; font-size: .95rem; }
[data-theme="default"] .site-footer__link:hover{ color: #fff; }
[data-theme="default"] .site-footer__bottom{ border-top: 1px solid rgba(255,255,255,.1); }
[data-theme="default"] .site-footer__copyright{
  margin: 0; padding: 1.1rem 0; text-align: center; color: #9ca3af; font-size: .85rem;
}

/* ---------- Pagination ---------- */
[data-theme="default"] .pagination{ display: flex; align-items: center; justify-content: center; gap: 1rem; margin-top: 2rem; }
[data-theme="default"] .pagination a{ color: var(--brand); font-weight: 600; }

/* ---------- Responsive ---------- */
@media (max-width: 860px){
  [data-theme="default"] .about-preview{ grid-template-columns: 1fr; }
  [data-theme="default"] .hero{ padding: 4rem 1.25rem 4.5rem; }
}
@media (max-width: 560px){
  [data-theme="default"] .site-header__inner{ justify-content: center; }
  [data-theme="default"] .site-nav{ justify-content: center; }
  [data-theme="default"] .hero{ padding: 3.25rem 1rem 3.75rem; }
  [data-theme="default"] .section{ padding: 2.5rem 1rem; }
  [data-theme="default"] .cards{ grid-template-columns: 1fr; }
}
`;

/**
 * Templates of the hierarchy (runtime format: `*.astro` at the theme root,
 * syntax `{{var}}` / `{{{raw}}}` / `{{#each}}` / `{{#if}}`).
 *
 * Shared shell: every template renders the same header (brand + `menus.header`)
 * and footer (`menus.footer`) around its own content, all scoped by the
 * `[data-theme]` wrapper the stylesheet targets.
 */

/** Header shell (brand + main menu). */
const HEADER = `<header class="site-header">
  <div class="container site-header__inner">
    <a class="site-brand" href="/">{{site.title}}</a>
    {{#if menus.header}}
    <nav class="site-nav" aria-label="Main navigation">
      {{#each menus.header.items}}<a class="site-nav__link" href="{{url}}">{{label}}</a>{{/each}}
    </nav>
    {{/if}}
  </div>
</header>
`;

/** Footer shell (brand + description + footer menu + copyright). */
const FOOTER = `<footer class="site-footer">
  <div class="container site-footer__inner">
    <div class="site-footer__info">
      <p class="site-footer__title">{{site.title}}</p>
      {{#if site.description}}<p class="site-footer__description">{{site.description}}</p>{{/if}}
    </div>
    {{#if menus.footer}}
    <nav class="site-footer__nav" aria-label="Footer navigation">
      {{#each menus.footer.items}}<a class="site-footer__link" href="{{url}}">{{label}}</a>{{/each}}
    </nav>
    {{/if}}
  </div>
  <div class="container site-footer__bottom">
    <p class="site-footer__copyright">© {{site.title}} · Powered by OkCMS</p>
  </div>
</footer>
`;

/** Latest posts grid — fed by `items` (fetched for home/front-page/posts page). */
const POSTS_SECTION = `{{#if items}}
<section class="section" id="posts">
  <div class="section__head">
    <div>
      <p class="section__kicker">Blog</p>
      <h2 class="section__title">Latest posts</h2>
    </div>
  </div>
  <div class="cards">
    {{#each items}}
    <article class="card">
      {{#if published_at}}<time class="card__date" datetime="{{published_at}}">{{published_at}}</time>{{/if}}
      <h3 class="card__title"><a href="/{{slug}}">{{title}}</a></h3>
      {{#if excerpt}}<p class="card__excerpt">{{excerpt}}</p>{{/if}}
      <a class="card__more" href="/{{slug}}">Read more →</a>
    </article>
    {{/each}}
  </div>
</section>
{{/if}}
`;

const PAGINATION = `{{#if pagination.pages}}
<nav class="pagination" aria-label="Pagination">
  {{#if pagination.hasPrevious}}<a href="?page={{pagination.previousPage}}">Previous</a>{{/if}}
  <span>Page {{pagination.page}} of {{pagination.pages}}</span>
  {{#if pagination.hasNext}}<a href="?page={{pagination.nextPage}}">Next</a>{{/if}}
</nav>
{{/if}}
`;

export const THEME_TEMPLATE_FILES: Record<string, string> = {
  // Static front page (Reading Settings → homepage): renders the page body
  // (seeded hero/about/contact sections) plus the latest posts grid.
  'front-page.astro': `<div class="site" data-theme="{{site.theme}}" data-template="front-page">
${HEADER}
  <main class="site-main">
    {{#if content.html}}
    {{{content.html}}}
    {{/if}}
${POSTS_SECTION}  </main>
${FOOTER}</div>
`,
  // Non-static home (no front page configured): hero + latest posts.
  'home.astro': `<div class="site" data-theme="{{site.theme}}" data-template="home">
${HEADER}
  <main class="site-main">
    <section class="hero">
      <p class="hero__kicker">Welcome</p>
      <h1 class="hero__title">{{site.title}}</h1>
      {{#if site.description}}
      <p class="hero__description">{{site.description}}</p>
      {{/if}}
      <div class="hero__actions">
        <a class="btn btn--primary" href="#posts">Browse posts</a>
      </div>
    </section>
${POSTS_SECTION}  </main>
${FOOTER}</div>
`,
  // Generic fallback: page-ish content + items listing.
  'index.astro': `<div class="site" data-theme="{{site.theme}}" data-template="index" data-type="{{page.type}}">
${HEADER}
  <main class="site-main">
    <article class="entry">
      <header class="entry__header">
        <p class="entry__kicker">{{page.type}}</p>
        <h1 class="entry__title">{{page.title}}</h1>
        {{#if site.description}}
        <p class="entry__meta">{{site.description}}</p>
        {{/if}}
      </header>
      <div class="entry__body">
        {{#if content.html}}{{{content.html}}}{{/if}}
        {{#if content.content}}{{{content.content}}}{{/if}}
        {{#if content.text}}<p>{{content.text}}</p>{{/if}}
      </div>
    </article>
${POSTS_SECTION}  </main>
${FOOTER}</div>
`,
  // Single post: title, date, categories, cover, body, back link.
  'single.astro': `<div class="site" data-theme="{{site.theme}}" data-template="single" data-type="{{page.type}}">
${HEADER}
  <main class="site-main">
    <article class="entry">
      <header class="entry__header">
        <p class="entry__kicker">Post</p>
        <h1 class="entry__title">{{content.title}}</h1>
        <div class="entry__meta">
          {{#if content.published_at}}<time datetime="{{content.published_at}}">{{content.published_at}}</time>{{/if}}
          {{#if _terms.category}}
          <span class="entry__terms">
            {{#each _terms.category}}<span class="badge">{{name}}</span>{{/each}}
          </span>
          {{/if}}
        </div>
      </header>
      {{#if content.cover.url}}
      <img class="entry__cover" src="{{content.cover.url}}" alt="{{content.cover.alt}}" loading="lazy" />
      {{/if}}
      {{#if content.thumbnail.url}}
      <img class="entry__cover" src="{{content.thumbnail.url}}" alt="{{content.thumbnail.alt}}" loading="lazy" />
      {{/if}}
      <div class="entry__body">
        {{#if content.html}}{{{content.html}}}{{/if}}
        {{#if content.content}}{{{content.content}}}{{/if}}
        {{#if content.text}}<p>{{content.text}}</p>{{/if}}
      </div>
      <footer class="entry__footer">
        <a class="entry__back" href="/blog">← Back to the blog</a>
        {{#if content.updated_at}}<span>Updated {{content.updated_at}}</span>{{/if}}
      </footer>
    </article>
  </main>
${FOOTER}</div>
`,
  // Static page (also the front-page fallback when front-page.astro is absent).
  'page.astro': `<div class="site" data-theme="{{site.theme}}" data-template="page" data-type="{{page.type}}">
${HEADER}
  <main class="site-main">
    <article class="entry">
      <header class="entry__header">
        <p class="entry__kicker">Page</p>
        <h1 class="entry__title">{{content.title}}</h1>
      </header>
      <div class="entry__body">
        {{#if content.html}}{{{content.html}}}{{/if}}
        {{#if content.content}}{{{content.content}}}{{/if}}
        {{#if content.text}}<p>{{content.text}}</p>{{/if}}
      </div>
    </article>
  </main>
${FOOTER}</div>
`,
  // Posts page (Reading Settings → posts page, WP `home.php`): title + intro
  // from the page body, then the latest posts grid fed by `items`.
  'posts.astro': `<div class="site" data-theme="{{site.theme}}" data-template="posts">
${HEADER}
  <main class="site-main">
    <header class="archive-header">
      <h1 class="archive-header__title">{{page.title}}</h1>
      {{#if content.html}}
      <div class="archive-header__description">{{{content.html}}}</div>
      {{/if}}
    </header>

    <section class="section section--tight">
      {{#if items}}
      <div class="cards">
        {{#each items}}
        <article class="card">
          {{#if published_at}}<time class="card__date" datetime="{{published_at}}">{{published_at}}</time>{{/if}}
          <h2 class="card__title"><a href="/{{slug}}">{{title}}</a></h2>
          {{#if excerpt}}<p class="card__excerpt">{{excerpt}}</p>{{/if}}
          <a class="card__more" href="/{{slug}}">Read more →</a>
        </article>
        {{/each}}
      </div>
      {{/if}}
${PAGINATION}
    </section>
  </main>
${FOOTER}</div>
`,
  // Archive (post type listing — e.g. /post when the type has an archive).
  'archive.astro': `<div class="site" data-theme="{{site.theme}}" data-template="archive" data-type="{{page.type}}">
${HEADER}
  <main class="site-main">
    <header class="archive-header">
      <h1 class="archive-header__title">{{page.title}}</h1>
      {{#if site.description}}
      <p class="archive-header__description">{{site.description}}</p>
      {{/if}}
    </header>

    <section class="section section--tight">
      {{#if items}}
      <div class="cards">
        {{#each items}}
        <article class="card">
          {{#if published_at}}<time class="card__date" datetime="{{published_at}}">{{published_at}}</time>{{/if}}
          <h2 class="card__title"><a href="/{{slug}}">{{title}}</a></h2>
          {{#if excerpt}}<p class="card__excerpt">{{excerpt}}</p>{{/if}}
          <a class="card__more" href="/{{slug}}">Read more →</a>
        </article>
        {{/each}}
      </div>
      {{/if}}
${PAGINATION}
    </section>
  </main>
${FOOTER}</div>
`,
  '404.astro': `<div class="site" data-theme="{{site.theme}}" data-template="404">
${HEADER}
  <main class="site-main">
    <section class="not-found">
      <h1 class="not-found__code">404</h1>
      <p class="not-found__message">Page not found. It may have been moved or deleted.</p>
      <a class="btn btn--outline" href="/">{{site.title}}</a>
    </section>
  </main>
${FOOTER}</div>
`,
};

/** Real default theme screenshot (PNG 600×400 — preview card in the admin). */
const DEFAULT_THEME_SCREENSHOT_BASE64 =
  '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' +
  'AACxXxc1EEhePb4DAAAAAElFTkSuQmCC';

/** Complete default theme written by `okcms init` (paths relative to themes/default/). */
export const DEFAULT_THEME_FILES: Record<string, string> = {
  'theme.json': DEFAULT_THEME_MANIFEST,
  ...THEME_TEMPLATE_FILES,
  'dist/theme.css': DEFAULT_THEME_CSS,
};

/**
 * BINARY files of the default theme: written with a Buffer decoded from
 * base64 (writing a string would corrupt the PNG). Same re-init rule —
 * never overwrites a file that is already present.
 */
export const DEFAULT_THEME_BINARY_FILES: Record<string, string> = {
  'screenshot.png': DEFAULT_THEME_SCREENSHOT_BASE64,
};
