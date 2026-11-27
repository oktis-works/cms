# Theme Platform v1

OkCMS v1 themes are isolated React or Solid projects. A theme owns its framework
dependencies and communicates with the host only through the request-scoped
`ThemeSdkBridge`. The host does not interpret source templates and does not
import React, Solid, or theme-local modules into the CMS process. There is no
string-template renderer and no HTML fallback.

## What changed in v1

The major release removes the string-template engine, source-file template
lookup, custom interpolation, and implicit host providers. Themes are now
independent projects with their own framework dependencies. The host loads only
a validated compiled artifact.

This is intentionally breaking. Existing themes must be rebuilt as React or
Solid themes; there is no legacy adapter or compatibility fallback.

## Theme lifecycle

1. The manifest is parsed and checked for CMS compatibility.
2. The render engine and SDK API version are validated.
3. The theme is built with Vite SSR.
4. The runtime validates `dist/theme-build.json` and its assets.
5. The request resolves a logical key.
6. The host creates a tenant-scoped `ThemeSdkBridge`.
7. The theme renders through `render(key, data, context, sdk)`.
8. The host adds site SEO, plugin assets, and validated theme assets.

An invalid active theme stops rendering with an actionable error. The runtime
does not synthesize a page from raw content.

## Runtime contract

Every theme must include:

- `theme.json` with `render.engine` set to `react` or `solid`;
- `render.apiVersion: 2`;
- `compatibility.okcms` with a valid semver range;
- `src/entry-server.tsx` exporting `templateKeys` and `render`;
- React or Solid source components for the logical keys declared by
  `templateKeys`;
- a successful `okcms theme:build` artifact at
  `dist/theme-build.json`.

The server entry has this shape:

```ts
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
  // Select a React or Solid component and return its SSR HTML.
  return { html: renderComponent(key, data, context, sdk) };
}
```

The key is logical and framework-independent. The runtime resolves keys such as
`post-project`, `single`, `page`, `archive`, `home`, `index`, and
`404`. Missing keys are resolved through the declared logical chain; a theme
without a valid compiled artifact is an activation/render error, never an HTML
fallback.

## Logical key resolution

The standard keys are:

| Key | Use |
|-----|-----|
| `home` | Site home |
| `index` | Generic content fallback |
| `single` | Generic single content |
| `page` | Generic page |
| `archive` | Collection or taxonomy archive |
| `404` | Not-found page |

Specific keys such as `post-project` or `page-about` may be exported by a
theme. Routing chooses the first key available in the active theme's engine
chain.

## Theme SDK bridge

`ThemeSdkBridge` is the only runtime communication boundary between a theme,
the host, and plugins. It is request-scoped and tenant-scoped. It is
deliberately JSON-safe. A theme can query public content and settings, resolve
fields, apply plugin hooks, execute explicitly allowed actions, and inspect the
plugin catalog. The bridge is not a replacement for authorization: the host
filters public data, establishes tenant context before database access, and
decides which actions are callable.

Available namespaces:

- `sdk.context`: API version, CMS version, tenant, locale, URL, auth state,
  and roles;
- `sdk.content`: published content queries, records, types, and slugs;
- `sdk.menus` and `sdk.taxonomies`: public navigation and taxonomy data;
- `sdk.settings`: public settings only;
- `sdk.fields`: field and flexible-layout access for the current record;
- `sdk.hooks`: asynchronous plugin filter execution through the host;
- `sdk.actions`: explicitly exposed host actions;
- `sdk.plugins`: plugin blocks, patterns, and assets declared for the request.

Themes must not import database packages, core services, plugin runtime modules,
or host internals. Do not use process-global theme providers, mutable current
content, or direct tenant selection. The bridge is the isolation boundary.

## React and Solid examples

A React theme can keep components in `home.tsx`, `single.tsx`, and related
files. A Solid theme can use the same keys with Solid components. The entry
module is the only framework-specific integration point required by the host.

```tsx
export function render(key, data, context, sdk) {
  const Component = components[key] ?? components['404'];
  return { html: renderToStaticMarkup(<Component {...data} sdk={sdk} />) };
}
```

## Dependency isolation

A theme should have its own `package.json` and declare:

- `react` and `react-dom`, or `solid-js`;
- `@oktis-works/theme-sdk`;
- its own TypeScript, Vite, and framework tooling.

The CMS runtime only consumes the validated build artifact. Theme dependencies
are not added to the CMS root workspace unless the theme is part of this
repository.

## Manifest example

```json
{
  "name": "customer-theme",
  "version": "1.0.0",
  "type": "theme",
  "compatibility": { "okcms": "^1.0.0" },
  "render": {
    "engine": "react",
    "apiVersion": 2,
    "hydration": "none",
    "entry": "src/entry-server.tsx"
  },
  "provides": {
    "layouts": ["home", "index", "single", "page", "archive", "404"]
  }
}
```

## Inheritance

Theme inheritance is optional and logical-key based. A child may provide or
replace a key from a parent only when both themes use the same render engine and
the same SDK API contract. The runtime never merges framework modules, source
files, providers, or dependencies across engines. Inheritance is a controlled
override mechanism, not a shared dependency graph: only same-engine themes with
compatible API versions may contribute logical keys. A child never imports a
parent's source modules at runtime. Cross-engine inheritance is rejected for
rendering and must be replaced with a standalone theme. Prefer a standalone
theme when the child needs a different framework or a different data contract.

## Styles and assets

Styles are built by the theme builder and referenced from the versioned build
artifact. CSS must be isolated by the theme scope. Rendered styles, scripts, and
head markup are validated as theme-relative assets before the host emits them.

## Public output and privacy

The public site does not emit CMS product signatures. The host no longer adds
CMS generator metadata, `X-Powered-By` headers, or RSS generator elements.
Themes may emit their own legitimate SEO metadata through the documented render
contract, but must not identify the host platform unless the site owner
explicitly chooses to do so.

## Build and local development

```bash
okcms theme:create --name my-theme --engine react --style scss
okcms theme:build --name my-theme
okcms theme:manage --name my-theme --set-active --tenant <tenant-id>
```

A build is valid only when `dist/theme-build.json` reports schema version 2,
the selected engine, API version 2, a non-empty logical key list, and assets
inside the theme directory.

## Migration

Remove old template files, old custom renderers, and direct host imports before
rebuilding. Read [docs/theme-development.md](./docs/theme-development.md) for
the full development guide.
