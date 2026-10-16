// @oktis-works/cms - Templates do tema default embutidos no CLI
//
// O `okcms init` copia estes arquivos para `themes/default/` do projeto novo:
// o site já renderiza de cara (templates .astro na raiz + dist/theme.css
// servido direto). Mantidos em string porque o package publica só `dist/`.

import { CMS_VERSION } from '@oktis-works/validation';

/** Manifesto do tema default (`theme.json` = nome canônico lido por runtime, service e CLI). */
export const DEFAULT_THEME_MANIFEST = `${JSON.stringify(
  {
    name: 'default',
    version: '0.1.0',
    description: 'Tema padrão do OkCMS — templates hierárquicos com interpolação real de conteúdo',
    type: 'theme',
    author: 'Oktis Works',
    // Contrato BUSI-022: exigido pelo theme:install via API. Sem o range,
    // o tema default seria rejeitado na instalação explícita. Derivado do
    // CMS_VERSION (fonte única) — nunca literal, senão dessincroniza.
    compatibility: { okcms: `^${CMS_VERSION}` },
    // Preview do card na tela Temas do admin (servido por /themes/default/).
    screenshots: ['screenshot.png'],
    provides: {
      layouts: ['home', 'index', 'single', 'page', 'archive', '404'],
      assets: ['dist/theme.css'],
    },
    stylesConfig: {
      engine: 'css',
      // CSS commitado já escopado — o tema assume o isolamento (BUSI-040)
      isolation: 'manual',
    },
    settings: [
      { name: 'siteTitle', type: 'text', label: 'Título do site', default: 'OkCMS' },
      { name: 'siteDescription', type: 'text', label: 'Descrição do site', default: '' },
    ],
  },
  null,
  2
)}
`;

/** Estilos básicos do tema default — servido direto de dist/theme.css (sem build). */
export const DEFAULT_THEME_CSS = `/* Tema default do OkCMS — estilos básicos (servido direto de dist/theme.css) */
[data-theme="default"]{
  --brand: #4f46e5;
  --text: #1f2937;
  --muted: #6b7280;
  --surface: #ffffff;
  --border: #e5e7eb;
}

[data-theme="default"] *{ box-sizing: border-box; }

[data-theme="default"]{
  margin: 0;
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  color: var(--text);
  background: var(--surface);
  line-height: 1.6;
}

[data-theme="default"] main{
  max-width: 46rem;
  margin: 0 auto;
  padding: 2.5rem 1.5rem;
}

[data-theme="default"] .hero__title{ margin: 0 0 0.5rem; font-size: 2rem; }
[data-theme="default"] .hero__description{ margin: 0 0 2rem; color: var(--muted); }

[data-theme="default"] .listing{ display: grid; gap: 1rem; }
[data-theme="default"] .card{ border: 1px solid var(--border); border-radius: 8px; padding: 1rem 1.25rem; }
[data-theme="default"] .entry__title{ margin: 0 0 0.25rem; font-size: 1.15rem; }
[data-theme="default"] .entry__title a{ color: var(--brand); text-decoration: none; }
[data-theme="default"] .entry__title a:hover{ text-decoration: underline; }
[data-theme="default"] .entry__excerpt{ margin: 0; color: var(--muted); }

[data-theme="default"] .entry__header{ margin-bottom: 1.5rem; }
[data-theme="default"] .entry__cover{ max-width: 100%; border-radius: 8px; margin: 1rem 0; }
[data-theme="default"] .entry__body{ font-size: 1.05rem; }
[data-theme="default"] .entry__date{ color: var(--muted); font-size: 0.85rem; }

[data-theme="default"] .not-found__code{ margin: 0; font-size: 4rem; color: var(--brand); }
[data-theme="default"] .not-found__message{ color: var(--muted); }
`;

/**
 * Templates da hierarquia (formato do runtime: `*.astro` NA RAIZ do tema,
 * sintaxe `{{var}}` / `{{{raw}}}` / `{{#each}}` / `{{#if}}`).
 */
export const THEME_TEMPLATE_FILES: Record<string, string> = {
  'home.astro': `<main data-theme="{{site.theme}}" data-template="home">
  <section class="hero">
    <h1 class="hero__title">{{site.title}}</h1>
    {{#if site.description}}
    <p class="hero__description">{{site.description}}</p>
    {{/if}}
  </section>

  {{#if items}}
  <section class="listing">
    {{#each items}}
    <article class="card entry entry--item">
      <h2 class="entry__title"><a href="/{{slug}}">{{title}}</a></h2>
      {{#if excerpt}}<p class="entry__excerpt">{{excerpt}}</p>{{/if}}
    </article>
    {{/each}}
  </section>
  {{/if}}
</main>
`,
  'index.astro': `<main data-theme="{{site.theme}}" data-template="index" data-type="{{page.type}}">
  <article class="entry">
    <header class="entry__header">
      <h1 class="entry__title">{{page.title}}</h1>
      {{#if site.description}}
      <p class="entry__excerpt">{{site.description}}</p>
      {{/if}}
    </header>

    <div class="entry__body">
      {{#if content.html}}{{{content.html}}}{{/if}}
      {{#if content.content}}{{{content.content}}}{{/if}}
      {{#if content.text}}<p>{{content.text}}</p>{{/if}}
    </div>

    {{#if items}}
    <section class="listing">
      {{#each items}}
      <article class="card entry entry--item">
        <h2 class="entry__title"><a href="/{{slug}}">{{title}}</a></h2>
        {{#if excerpt}}<p class="entry__excerpt">{{excerpt}}</p>{{/if}}
      </article>
      {{/each}}
    </section>
    {{/if}}
  </article>
</main>
`,
  'single.astro': `<main data-theme="{{site.theme}}" data-template="single" data-type="{{page.type}}">
  <article class="entry">
    <header class="entry__header">
      <h1 class="entry__title">{{content.title}}</h1>
      {{#if content.excerpt}}
      <p class="entry__excerpt">{{content.excerpt}}</p>
      {{/if}}
      {{#if content.thumbnail.url}}
      <img class="entry__cover" src="{{content.thumbnail.url}}" alt="{{content.thumbnail.alt}}" loading="lazy" />
      {{/if}}
      {{#if content.cover.url}}
      <img class="entry__cover" src="{{content.cover.url}}" alt="{{content.cover.alt}}" loading="lazy" />
      {{/if}}
    </header>

    <div class="entry__body">
      {{#if content.html}}{{{content.html}}}{{/if}}
      {{#if content.content}}{{{content.content}}}{{/if}}
      {{#if content.text}}<p>{{content.text}}</p>{{/if}}
    </div>

    <footer class="entry__footer">
      <time class="entry__date" datetime="{{content.published_at}}">{{content.published_at}}</time>
    </footer>
  </article>
</main>
`,
  'page.astro': `<main data-theme="{{site.theme}}" data-template="page" data-type="{{page.type}}">
  <article class="entry entry--page">
    <header class="entry__header">
      <h1 class="entry__title">{{content.title}}</h1>
    </header>

    <div class="entry__body">
      {{#if content.html}}{{{content.html}}}{{/if}}
      {{#if content.content}}{{{content.content}}}{{/if}}
      {{#if content.text}}<p>{{content.text}}</p>{{/if}}
    </div>
  </article>
</main>
`,
  'archive.astro': `<main data-theme="{{site.theme}}" data-template="archive" data-type="{{page.type}}">
  <header class="archive-header">
    <h1 class="archive-header__title">{{page.title}}</h1>
    {{#if site.description}}
    <p class="archive-header__description">{{site.description}}</p>
    {{/if}}
  </header>

  <section class="listing">
    {{#each items}}
    <article class="card entry entry--item">
      <h2 class="entry__title"><a href="/{{slug}}">{{title}}</a></h2>
      {{#if excerpt}}<p class="entry__excerpt">{{excerpt}}</p>{{/if}}
      {{#if published_at}}<time class="entry__date" datetime="{{published_at}}">{{published_at}}</time>{{/if}}
    </article>
    {{/each}}
  </section>
</main>
`,
  '404.astro': `<main data-theme="{{site.theme}}" data-template="404">
  <section class="not-found">
    <h1 class="not-found__code">404</h1>
    <p class="not-found__message">Página não encontrada.</p>
    <p class="not-found__back"><a href="/">{{site.title}}</a></p>
  </section>
</main>
`,
};

/** Screenshot real do tema default (PNG 600×400 — preview no card do admin). */
const DEFAULT_THEME_SCREENSHOT_BASE64 =
  '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' +
  'AACxXxc1EEhePb4DAAAAAElFTkSuQmCC';

/** Tema default completo gravado pelo `okcms init` (caminhos relativos a themes/default/). */
export const DEFAULT_THEME_FILES: Record<string, string> = {
  'theme.json': DEFAULT_THEME_MANIFEST,
  ...THEME_TEMPLATE_FILES,
  'dist/theme.css': DEFAULT_THEME_CSS,
};

/**
 * Arquivos BINÁRIOS do tema default: gravados com Buffer decodificado do
 * base64 (writeFile de string corromperia o PNG). Mesma regra de re-init —
 * nunca sobrescreve um arquivo já presente.
 */
export const DEFAULT_THEME_BINARY_FILES: Record<string, string> = {
  'screenshot.png': DEFAULT_THEME_SCREENSHOT_BASE64,
};
