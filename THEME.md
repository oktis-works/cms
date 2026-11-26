# Theme Platform v1

OkCMS themes are isolated React or Solid projects. A theme owns its framework
dependencies and is compiled before the web runtime loads it. The host does not
interpret source templates and does not import React, Solid, or theme-local
modules into the CMS process.

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

## Theme SDK bridge

`ThemeSdkBridge` is the only runtime communication boundary between a theme,
the host, and plugins. It is request-scoped and tenant-scoped.

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

## Dependency isolation

A theme should have its own `package.json` and declare:

- `react` and `react-dom`, or `solid-js`;
- `@oktis-works/theme-sdk`;
- its own TypeScript, Vite, and framework tooling.

The CMS runtime only consumes the validated build artifact. Theme dependencies are
not added to the CMS root workspace unless the theme is part of this repository.

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
files, providers, or dependencies across engines. Prefer a standalone theme when
the child needs a different framework or a different data contract.

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
okcms theme:build --name customer-theme
okcms theme:dev --name customer-theme
```

A build is valid only when `dist/theme-build.json` reports schema version 2,
the selected engine, API version 2, a non-empty logical key list, and assets
inside the theme directory.
