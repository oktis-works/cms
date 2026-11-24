// @oktis-works/cms - Scaffold sources for compiled themes (React/Solid)
//
// These files are written verbatim by `okcms theme:create --engine react|solid`.
// They are intentionally self-contained and mirror the public template keys.

export type ScaffoldThemeEngine = 'template' | 'react' | 'solid';

const TEMPLATE_KEYS = ['home', 'index', 'single', 'page', 'archive', '404'] as const;

function packageJson(name: string, engine: 'react' | 'solid'): string {
  const framework =
    engine === 'react'
      ? {
          dependencies: {
            react: '^19.0.0',
            'react-dom': '^19.0.0',
            '@oktis-works/theme-sdk': '^0.8.0',
          },
          devDependencies: {
            '@types/react': '^19.0.0',
            '@types/react-dom': '^19.0.0',
            '@vitejs/plugin-react': '^6.0.0',
            vite: '^8.0.0',
            typescript: '5.7.3',
          },
        }
      : {
          dependencies: {
            'solid-js': '^1.9.0',
            '@oktis-works/theme-sdk': '^0.8.0',
          },
          devDependencies: {
            'vite-plugin-solid': '^2.11.0',
            vite: '^8.0.0',
            typescript: '5.7.3',
          },
        };

  return JSON.stringify(
    {
      name: `okcms-theme-${name}`,
      version: '0.1.0',
      private: true,
      type: 'module',
      scripts: {
        build: 'okcms theme:build --name ' + name,
        'build:standalone': 'vite build',
        dev: 'vite build --watch',
      },
      ...framework,
    },
    null,
    2
  );
}

function tsconfig(engine: 'react' | 'solid'): string {
  return JSON.stringify(
    {
      compilerOptions: {
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'Bundler',
        lib: ['ES2022', 'DOM'],
        strict: true,
        skipLibCheck: true,
        esModuleInterop: true,
        resolveJsonModule: true,
        isolatedModules: true,
        noEmit: true,
        ...(engine === 'react'
          ? { jsx: 'react-jsx', jsxImportSource: 'react' }
          : { jsx: 'preserve', jsxImportSource: 'solid-js' }),
      },
      include: ['*.tsx', 'src/**/*.ts', 'src/**/*.tsx'],
    },
    null,
    2
  );
}

function viteConfig(engine: 'react' | 'solid'): string {
  const plugin = engine === 'react' ? 'react' : 'solid';
  return [
    "import { defineConfig } from 'vite';",
    engine === 'react'
      ? "import react from '@vitejs/plugin-react';"
      : "import solid from 'vite-plugin-solid';",
    "import { fileURLToPath } from 'node:url';",
    '',
    'export default defineConfig({',
    `  plugins: [${plugin}()],`,
    '  build: {',
    "    ssr: fileURLToPath(new URL('./src/entry-server.tsx', import.meta.url)),",
    "    outDir: 'dist/server',",
    '    emptyOutDir: true,',
    "    target: 'node22',",
    "    rollupOptions: { output: { format: 'esm', entryFileNames: 'entry.js' } },",
    '  },',
    '  ssr: { noExternal: true },',
    '});',
    '',
  ].join('\n');
}

const REACT_PAGES: Record<string, string> = {
  home: `import type { ThemePageData } from '@oktis-works/theme-sdk';

export default function Home({ site, items, settings }: ThemePageData) {
  const theme = (settings.theme ?? {}) as Record<string, unknown>;
  return (
    <main className="site">
      <header className="site-header">
        <h1>{String(theme.siteTitle ?? site.title)}</h1>
        <p>{site.description}</p>
      </header>
      <section className="listing">
        {items.map((item) => (
          <article className="card" key={String(item.slug)}>
            <h2><a href={\`/\${String(item.slug)}\`}>{String(item.title ?? '')}</a></h2>
            {item.excerpt ? <p>{String(item.excerpt)}</p> : null}
          </article>
        ))}
      </section>
    </main>
  );
}
`,
  index: `import type { ThemePageData } from '@oktis-works/theme-sdk';

export default function Index({ page, content }: ThemePageData) {
  return (
    <main className="site page">
      <h1>{page.title}</h1>
      <div className="entry-content" dangerouslySetInnerHTML={{ __html: String(content.html ?? '') }} />
    </main>
  );
}
`,
  single: `import type { ThemePageData } from '@oktis-works/theme-sdk';

export default function Single({ page, content }: ThemePageData) {
  return (
    <article className="site single">
      <h1>{page.title}</h1>
      <div className="entry-content" dangerouslySetInnerHTML={{ __html: String(content.html ?? '') }} />
    </article>
  );
}
`,
  page: `import type { ThemePageData } from '@oktis-works/theme-sdk';

export default function Page({ page, content }: ThemePageData) {
  return (
    <main className="site page">
      <h1>{page.title}</h1>
      <div className="entry-content" dangerouslySetInnerHTML={{ __html: String(content.html ?? '') }} />
    </main>
  );
}
`,
  archive: `import type { ThemePageData } from '@oktis-works/theme-sdk';

export default function Archive({ page, items }: ThemePageData) {
  return (
    <main className="site archive">
      <h1>{page.title}</h1>
      <section className="listing">
        {items.map((item) => (
          <article className="card" key={String(item.slug)}>
            <h2><a href={\`/\${String(item.slug)}\`}>{String(item.title ?? '')}</a></h2>
            {item.excerpt ? <p>{String(item.excerpt)}</p> : null}
          </article>
        ))}
      </section>
    </main>
  );
}
`,
  '404': `export default function NotFound() {
  return (
    <main className="site not-found">
      <h1>404</h1>
      <p>Page not found.</p>
    </main>
  );
}
`,
};

const SOLID_PAGES: Record<string, string> = {
  home: `import { For } from 'solid-js';
import type { ThemePageData } from '@oktis-works/theme-sdk';

export default function Home(props: ThemePageData) {
  const theme = (props.settings.theme ?? {}) as Record<string, unknown>;
  return (
    <main class="site">
      <header class="site-header">
        <h1>{String(theme.siteTitle ?? props.site.title)}</h1>
        <p>{props.site.description}</p>
      </header>
      <section class="listing">
        <For each={props.items}>
          {(item) => (
            <article class="card">
              <h2><a href={\`/\${String(item.slug)}\`}>{String(item.title ?? '')}</a></h2>
              {item.excerpt ? <p>{String(item.excerpt)}</p> : null}
            </article>
          )}
        </For>
      </section>
    </main>
  );
}
`,
  index: `import type { ThemePageData } from '@oktis-works/theme-sdk';

export default function Index(props: ThemePageData) {
  return (
    <main class="site page">
      <h1>{props.page.title}</h1>
      <div class="entry-content" innerHTML={String(props.content.html ?? '')} />
    </main>
  );
}
`,
  single: `import type { ThemePageData } from '@oktis-works/theme-sdk';

export default function Single(props: ThemePageData) {
  return (
    <article class="site single">
      <h1>{props.page.title}</h1>
      <div class="entry-content" innerHTML={String(props.content.html ?? '')} />
    </article>
  );
}
`,
  page: `import type { ThemePageData } from '@oktis-works/theme-sdk';

export default function Page(props: ThemePageData) {
  return (
    <main class="site page">
      <h1>{props.page.title}</h1>
      <div class="entry-content" innerHTML={String(props.content.html ?? '')} />
    </main>
  );
}
`,
  archive: `import { For } from 'solid-js';
import type { ThemePageData } from '@oktis-works/theme-sdk';

export default function Archive(props: ThemePageData) {
  return (
    <main class="site archive">
      <h1>{props.page.title}</h1>
      <section class="listing">
        <For each={props.items}>
          {(item) => (
            <article class="card">
              <h2><a href={\`/\${String(item.slug)}\`}>{String(item.title ?? '')}</a></h2>
              {item.excerpt ? <p>{String(item.excerpt)}</p> : null}
            </article>
          )}
        </For>
      </section>
    </main>
  );
}
`,
  '404': `export default function NotFound() {
  return (
    <main class="site not-found">
      <h1>404</h1>
      <p>Page not found.</p>
    </main>
  );
}
`,
};

function entryServer(engine: 'react' | 'solid'): string {
  const imports = TEMPLATE_KEYS.map((key) => {
    const symbol = key === '404' ? 'NotFound' : key.charAt(0).toUpperCase() + key.slice(1);
    return `import ${symbol} from '../${key}';`;
  }).join('\n');

  const mapping = TEMPLATE_KEYS.map((key) => {
    const symbol = key === '404' ? 'NotFound' : key.charAt(0).toUpperCase() + key.slice(1);
    return `  '${key}': ${symbol},`;
  }).join('\n');

  if (engine === 'react') {
    return `${imports}
import { renderToStaticMarkup } from 'react-dom/server';
import type { ComponentType } from 'react';
import type { ThemePageData, ThemeRenderContext, ThemeRenderOutput } from '@oktis-works/theme-sdk';

const templates: Record<string, ComponentType<ThemePageData>> = {
${mapping}
};

export const templateKeys = Object.keys(templates);

export function render(
  key: string,
  data: ThemePageData,
  _ctx?: ThemeRenderContext
): ThemeRenderOutput {
  const Component = templates[key] ?? templates['404'];
  return { html: renderToStaticMarkup(<Component {...data} />) };
}
`;
  }

  return `${imports}
import { renderToString } from 'solid-js/web';
import type { Component } from 'solid-js';
import type { ThemePageData, ThemeRenderContext, ThemeRenderOutput } from '@oktis-works/theme-sdk';

const templates: Record<string, Component<ThemePageData>> = {
${mapping}
};

export const templateKeys = Object.keys(templates);

export function render(
  key: string,
  data: ThemePageData,
  _ctx?: ThemeRenderContext
): ThemeRenderOutput {
  const Component = templates[key] ?? templates['404'];
  return { html: renderToString(() => <Component {...data} />) };
}
`;
}

export function compiledThemeFiles(name: string, engine: 'react' | 'solid'): Record<string, string> {
  const pages = engine === 'react' ? REACT_PAGES : SOLID_PAGES;
  const files: Record<string, string> = {
    'package.json': packageJson(name, engine),
    'tsconfig.json': tsconfig(engine),
    'vite.config.ts': viteConfig(engine),
    'src/entry-server.tsx': entryServer(engine),
  };
  for (const key of TEMPLATE_KEYS) {
    files[`${key}.tsx`] = pages[key]!;
  }
  return files;
}

export { TEMPLATE_KEYS };
