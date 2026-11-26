# Theme Development

This guide describes the OkCMS v1 theme contract. Themes are independent React
or Solid applications compiled to an SSR artifact.

## Create a theme

```bash
okcms theme:create customer-theme --engine react
okcms theme:build --name customer-theme
```

The generated theme contains:

```
customer-theme/
├── package.json
├── theme.json
├── src/
│   └── entry-server.tsx
├── home.tsx
├── index.tsx
├── single.tsx
├── page.tsx
├── archive.tsx
├── 404.tsx
└── dist/
    └── theme-build.json
```

Declare the framework and the bridge in the theme's own package manifest. Do
not import the CMS database, core, plugin runtime, or web application.

## Entry server

The entry server exports a key list and the render function:

```tsx
import type {
  ThemePageData,
  ThemeRenderContext,
  ThemeRenderOutput,
  ThemeSdkBridge,
} from '@oktis-works/theme-sdk';

export const templateKeys = ['home', 'index', 'single', 'page', 'archive', '404'];

export function render(
  key: string,
  data: ThemePageData,
  context: ThemeRenderContext,
  sdk: ThemeSdkBridge,
): ThemeRenderOutput {
  const Component = components[key] ?? components['404'];
  return { html: renderToStaticMarkup(<Component {...data} sdk={sdk} />) };
}
```

The runtime passes the same data shape to React and Solid. The SDK is explicit
in the function signature so every request uses the correct tenant and plugin
context.

## Data contract

`data` contains:

- `site`: title, description, URL, language, and active theme settings;
- `page`: logical key, type, slug, canonical path, and route flags;
- `content` and `fields`: public normalized fields;
- `items` and `pagination`: collection data;
- `menus`, `contentTypes`, `taxonomies`, and `terms`;
- `settings` and `themeData`: public theme configuration.

Sensitive credentials, tokens, hashes, tenant storage columns, and private
settings are removed before a theme receives data.

## SDK bridge

```tsx
const latest = await sdk.content.query({ type: 'post', limit: 5 });
const mainMenu = await sdk.menus.get('main');
const siteTitle = await sdk.settings.get('siteTitle', 'Site');
const field = sdk.fields.get('hero', data.record);
const filtered = await sdk.hooks.apply({
  name: 'theme:data:posts',
  value: latest.data,
});
```

The bridge is read-only by default. Actions are host-defined and return a
structured result. Never use a global provider or infer a tenant from process
state.

## Manifest

```json
{
  "name": "customer-theme",
  "version": "1.0.0",
  "type": "theme",
  "compatibility": { "okcms": "^1.0.0" },
  "render": {
    "engine": "solid",
    "apiVersion": 2,
    "hydration": "none",
    "entry": "src/entry-server.tsx"
  }
}
```

The runtime rejects missing or invalid compatibility ranges, unsupported
engines, API versions other than 2, missing build artifacts, stale build IDs,
and assets outside the theme directory.

## Inheritance

Set `parent` only when the parent is a same-engine theme with a compatible
bridge. A child overrides logical keys by exporting the same key. It does not
inherit source files or npm dependencies. For a different framework, create a
new standalone theme.

## Styles

Use `stylesConfig` for CSS, SCSS, or Tailwind. The builder scopes styles to
the theme and writes versioned assets. Only assets declared by the build
artifact are served.

## Public metadata

OkCMS does not add generator metadata, product headers, or RSS generator
elements to public output. This keeps the site owner in control of platform
disclosure. Themes should emit only metadata required by the site's content and
SEO configuration.

## Validation

```bash
bun run build
bun run typecheck
bun run test:run
bun run lint
```

Run the complete release validation from [AGENTS.md](../AGENTS.md) before a
major release.
