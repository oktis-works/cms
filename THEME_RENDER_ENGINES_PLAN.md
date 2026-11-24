# Theme Render Engines: React and Solid — Implementation Plan

- **Status:** Implemented in v0.42.0 (compiled React/Solid engines, host build, dev watcher, hydration payload, Admin build status, artifact activation gate).
- **Product target:** OkCMS `0.41.x` (minor release)
- **Scope owner:** Theme platform
- **Last updated:** 2026-11-24
- **Language:** English (repository rule, `AGENTS.md` §7)

---

## 0. Summary

OkCMS currently supports exactly one public-theme model: **string templates** stored in
`*.astro` files and interpreted by `ThemeRenderer` (`packages/theme-runtime/src/renderer.ts`).
Those files are **not** Astro components, and there is no SolidJS theme runtime today.
SolidJS exists only in the admin (`apps/admin`, Astro + `@astrojs/solid-js`) and in plugin
admin components.

This plan adds **compiled component themes** with the same external architecture:

- a theme declares **one** render engine in `theme.json`:
  `"render": { "engine": "react" }` or `"render": { "engine": "solid" }`;
- `"template"` remains the default for existing string-template themes;
- **a theme never mixes engines** — React and Solid are alternatives, not layers;
- the runtime, hierarchy, data contract, CSS isolation, assets, settings, and inheritance
  rules remain the same for both engines;
- framework-specific work lives in the theme's build output, **not** in
  `@oktis-works/theme-runtime`.

The key architectural decision is to treat a compiled theme as a **build artifact** with a
small, versioned server contract. The web runtime imports the artifact and calls `render()`.
It does not import React or Solid.

---

## 1. Current state (verified in the repository)

### 1.1 Public themes are string templates

`packages/theme-runtime/src/renderer.ts` implements a custom parser supporting:

- `{{value}}` (HTML-escaped), `{{{html}}}` (raw with sanitization);
- `{{#each path}}`, `{{#if expression}}`, `{{else if}}`, `{{else}}`;
- allow-listed helpers `field`, `eq`, `formatDate`;
- a narrow `set:html={...}` normalization.

It does **not** execute Astro, SolidJS, React, JSX, component tags, `<slot />`, or `await`.
The `.astro` extension is only a file-naming convention consumed by the runtime.

### 1.2 Render pipeline is synchronous

`apps/web/src/rendering.ts`:

1. `RuntimeRouter` resolves the route/content (`packages/theme-runtime/src/routing.ts`).
2. `TemplateHierarchyResolver` picks a template file.
3. `loadTemplateSource` reads the file from the theme chain
   (`active theme → _shared → default`).
4. `renderContentPage` builds the context (`site`, `page`, `content`, `fields`, `record`,
   `items`, `pagination`, `menus`, `contentTypes`, `taxonomies`, `terms`, `settings`,
   `themeData`) and calls `themeRenderer.renderString(...)` synchronously.
5. `wrapDocument` adds `<head>`, SEO, CSS (`/themes/<theme>/dist/theme.css`), plugin hooks,
   and `data-theme`.

`ThemeRenderer` is a module-level singleton.

### 1.3 Template hierarchy is `.astro`-specific

`packages/theme-runtime/src/template-resolver.ts`:

- `buildTemplateChain` hardcodes `.astro` suffixes;
- `TemplateHierarchyResolver` strips `.astro` for `name` and returns `file`;
- `layoutOverride` appends `.astro` when the value has no suffix;
- the project chain is `[activeTheme, _shared, default]`.

### 1.4 Manifest contract already exists

`packages/types/src/entities/index.ts` defines `ThemeManifest` with:

- `name`, `version`, `type`, `compatibility.okcms`;
- `parent`, `settings[]`, `provides`, `components[]`;
- `stylesConfig` (`css | scss | tailwind`, `entry`, `output`, `isolation`).

`theme.json` is the canonical manifest. `ThemeLoader` discovers themes; `ThemeService`
persists manifests in the `themes` table; the admin manages activation and settings.

### 1.5 Component declarations are not wired into the public render path

`ThemeResolver.resolveComponent` / `listComponents` exist, and `ThemeRenderer` has
`registerComponent` / `renderPartial`, but the public web runtime never populates the
component cache and never calls `renderPartial`. In practice, `manifest.components[]`,
partials, and `<slot />` do not render on the public site. Documentation currently
overpromises these features.

### 1.6 CSS, assets, and deployment

- `buildThemeStyles` (`packages/theme-runtime/src/style-engine.ts`) compiles SCSS/Tailwind
  and scopes CSS with `[data-theme="<name>"]`.
- `okcms theme:build` and `okcms redeploy` build styles **on the host**
  (`packages/cli/src/theme-build.ts`, `packages/cli/src/redeploy.ts`).
- The web serves only `dist/` and `public/` assets (plus `screenshot.png`) through
  `resolveThemeAssetPath`, with traversal and symlink guards.
- Docker is immutable: nothing compiles inside the image; `.dockerignore` keeps `dist/`
  and drops `*.ts`, `*.tsx`, and `*.map`.
- Public responses use CSP `script-src 'self'`; inline scripts are not allowed.

### 1.7 Typecheck and workspace constraints

- Root `tsconfig.json` sets `jsxImportSource: "solid-js"`.
- `tsconfig.typecheck.json` excludes `**/*.astro` and `plugins/**/*` only.
- `themes/*` have no `package.json` today, despite the `themes/*` workspace glob.
- A React `.tsx` file placed under `themes/` would be typechecked with Solid JSX types and
  fail. This must be addressed explicitly.

---

## 2. Goals, non-goals, and success criteria

### 2.1 Goals

1. A developer can choose **React or Solid** for a theme and find the same structure,
   hierarchy, data, CSS isolation, settings, and deployment flow as template themes.
2. Each theme declares exactly one engine: `template`, `react`, or `solid`.
3. Existing template themes keep working with zero changes.
4. `@oktis-works/theme-runtime` remains framework-agnostic (no React/Solid dependency).
5. Compiled themes are reproducible build artifacts, deployable with the current immutable
   Docker flow.
6. CLI support for scaffold, build, list, activate, install, and redeploy.
7. Clear validation and error messages for missing/mismatched/stale artifacts.
8. Documentation, scaffold output, and runtime behavior agree.

### 2.2 Non-goals (initial release)

- Mixing React and Solid in one theme.
- Running JSX/TSX directly at request time.
- Hydration/islands in the first release (design reserved for a later phase).
- A browser-based theme code editor.
- Database schema changes.
- Changing plugin admin components (they remain SolidJS).
- Maintaining an Astro theme engine (`.astro` remains the string-template convention).

### 2.3 Success criteria

- [ ] A React theme and a Solid theme with the same hierarchy render the same routes with
      the same data contract and CSS isolation.
- [ ] `okcms theme:create --engine react` and `--engine solid` produce buildable themes.
- [ ] `okcms theme:build` produces `dist/theme-build.json` + server bundle (+ optional client
      bundle) and the existing `dist/theme.css`.
- [ ] `okcms theme:manage --set-active` refuses a theme whose build artifact is missing or
      mismatched, with an actionable message.
- [ ] `okcms redeploy` builds compiled themes on the host before the image build.
- [ ] Template themes render byte-identical HTML before/after the refactor (golden tests).
- [ ] `@oktis-works/theme-runtime` package dependencies remain React/Solid-free.
- [ ] Full local CI sequence from `AGENTS.md` §16 passes three consecutive times before a
      release tag.

---

## 3. Target architecture

### 3.1 One theme, one engine

```
theme.json
  render.engine = "template" | "react" | "solid"

template  → root *.astro files interpreted by ThemeRenderer (current behavior)
react     → dist/server/entry.js built by Vite, React bundled inside
solid     → dist/server/entry.js built by Vite, Solid bundled inside
```

`render.engine` is **not** the same field as `stylesConfig.engine`. The latter remains the
CSS engine (`css | scss | tailwind`) and is orthogonal.

### 3.2 Runtime composition

```
HTTP request
  → RuntimeRouter (unchanged)
  → template key (home | single | page-about | archive | 404 | ...)
  → ThemeCatalog (active → _shared → default)
       ├─ template theme  → TemplateAdapter  (current ThemeRenderer)
       └─ compiled theme  → CompiledAdapter  (import dist/server/entry.js)
  → ThemeRenderOutput { html, head?, styles?, scripts? }
  → wrapDocument (unchanged ownership of <head>, SEO, plugin hooks)
  → data-theme wrapper + CSS link (unchanged)
```

The runtime selects the adapter from `theme.json` + `dist/theme-build.json`. It never
imports React or Solid.

### 3.3 Build and deploy flow

```
host: okcms theme:build
  ├─ CSS pipeline (existing)        → dist/theme.css
  ├─ Vite SSR build (react|solid)   → dist/server/entry.js
  ├─ optional client build          → dist/client/*
  └─ artifact writer                → dist/theme-build.json

host: okcms redeploy
  ├─ theme:build (all compiled themes)
  ├─ docker image build (COPY . .)
  └─ runtime imports the artifact from /app/themes/<name>/dist/
```

No framework build happens inside the container. No theme `node_modules` are required at
runtime when the framework is bundled into the artifact.

### 3.4 Trust model

Theme server/client code is **trusted code**, equivalent to plugins. Installing or activating
a theme requires the existing admin permissions. The runtime still enforces:

- path containment for manifests, entries, and assets;
- no traversal/absolute paths from the artifact;
- HTML sanitization for raw content;
- CSP restrictions (no inline executable scripts).

---

## 4. Contracts

### 4.1 `theme.json` addition

```json
{
  "name": "my-react-theme",
  "version": "1.0.0",
  "type": "theme",
  "compatibility": { "okcms": "^0.41.0" },
  "render": {
    "engine": "react",
    "apiVersion": 1,
    "hydration": "none",
    "entry": "src/entry-server.tsx"
  },
  "stylesConfig": {
    "engine": "tailwind",
    "entry": "src/input.css",
    "output": "dist/theme.css",
    "isolation": true
  }
}
```

Type:

```ts
export type ThemeRenderEngine = 'template' | 'react' | 'solid';

export interface ThemeRenderConfig {
  engine: ThemeRenderEngine;
  apiVersion?: 1;
  hydration?: 'none' | 'islands';
  /** Source entry used by the builder. Defaults by engine. */
  entry?: string;
}

export interface ThemeManifest {
  // ...existing fields
  render?: ThemeRenderConfig;
}
```

Rules:

- `render` absent ⇒ `engine: "template"` (backward compatible).
- `engine` must be one of the three values; anything else is rejected.
- `apiVersion` currently only `1`.
- `hydration` currently only `"none"`; `"islands"` is reserved and rejected until Phase 7.
- `entry` must stay inside the theme and must not be absolute/`..`.
- `render.engine` must match `dist/theme-build.json.engine` when an artifact exists.

### 4.2 Build artifact: `dist/theme-build.json`

```json
{
  "schemaVersion": 1,
  "engine": "react",
  "apiVersion": 1,
  "buildId": "sha256:8f3a...",
  "entry": "server/entry.js",
  "templates": ["home", "index", "single", "page", "archive", "404"],
  "client": {},
  "styles": ["theme.css"],
  "hydration": "none"
}
```

Rules:

- `entry`, every template, and every client/style path are relative to the theme root and
  must resolve inside it (realpath check).
- `buildId` is a content hash of the source inputs (manifest + source files + build config);
  it is used for cache busting and staleness detection.
- `templates` is the authoritative list for `TemplateHierarchyResolver`.
- `styles` is the ordered list of stylesheets to emit. `theme.css` remains the first one.
- `client` is empty while `hydration: "none"`.

### 4.3 Server entry module contract

```ts
export interface ThemeServerModule {
  render(
    templateKey: string,
    data: ThemePageData,
    ctx: ThemeRenderContext
  ): ThemeRenderOutput | Promise<ThemeRenderOutput>;
  templates?: string[];
}

export interface ThemeRenderOutput {
  html: string;
  /** Optional extra tags for <head>; still subject to sanitization/review. */
  head?: string;
  /** Extra stylesheet URLs relative to the theme root. */
  styles?: string[];
  /** Module scripts relative to the theme root (future hydration). */
  scripts?: string[];
}

export interface ThemeRenderContext {
  url: string;
  params: Record<string, string>;
  tenant: string;
  templateKey: string;
  buildId: string;
}
```

The runtime validates that `render` is a function and that `templates` (when present) matches
the artifact. An invalid module produces a clear 500, never a silent fallback for a compiled
theme.

### 4.4 Data contract: `ThemePageData`

Published from `@oktis-works/theme-sdk` and consumed by both engines:

```ts
export interface ThemePageData {
  site: {
    title: string;
    description: string;
    theme: string;
    url?: string;
    language?: string;
  };
  page: {
    title: string;
    description: string;
    template: string;
    type: string;
    slug: string;
    url: string;
    hubBase: string;
    itemPath: string;
    canonicalPath: string;
    isPageForPosts: boolean;
    isFrontPage: boolean;
  };
  content: Record<string, unknown>;
  fields: Record<string, unknown>;
  record: Record<string, unknown>;
  items: Array<Record<string, unknown>>;
  pagination: {
    page: number;
    perPage: number;
    total: number;
    pages: number;
    previousPage?: number;
    nextPage?: number;
    hasPrevious: boolean;
    hasNext: boolean;
  };
  menus: ThemeRenderData['menus'];
  contentTypes: ThemeRenderData['contentTypes'];
  taxonomies: ThemeRenderData['taxonomies'];
  terms: ThemeRenderData['terms'];
  settings: Record<string, unknown>;
  themeData: ThemeRenderData;
  /** Extension bag for route-provided values (e.g. jsonLd, prevPost/nextPost). */
  [key: string]: unknown;
}
```

Runtime obligations:

- Build this object exactly as `renderContentPage` does today; no data is lost in the
  compiled path.
- Wrap the adapter render in `runWithCurrentContent(record, ...)` so `getField()` works.
- Run `theme:before:render` on the data **before** the adapter and `theme:after:render` on
  the final HTML string **after** `wrapDocument`, preserving current hook semantics.

### 4.5 Template keys

The logical hierarchy becomes engine-agnostic:

| Key | Meaning |
|---|---|
| `home` | Home / latest posts |
| `index` | Generic fallback |
| `single` | Single content fallback |
| `page` | Page fallback |
| `archive` | Archive/listing |
| `404` | Not found |
| `front-page` | Static front page |
| `posts` | Posts page (`home.php` equivalent) |
| `{type}` | Content type fallback |
| `{type}-{slug}` | Specific content template |
| `taxonomy-{slug}` | Taxonomy archive |
| `layoutOverride` value | Manual template override |

The template adapter maps a key to `${key}.astro`; the compiled adapter maps a key to a
component export. The hierarchy algorithm and precedence remain unchanged.

---

## 5. Design decisions

| ID | Decision | Recommendation | Rationale |
|---|---|---|---|
| D1 | Engine field | `render.engine: "template" \| "react" \| "solid"`; absent = `template` | Backward compatible, explicit, one value per theme |
| D2 | Mixed engines | Forbidden in a theme; cross-engine `parent` contributes settings/styles/assets only, never templates | Matches the product rule; avoids an untestable matrix |
| D3 | Framework runtime | Bundle React/Solid into the theme artifact (self-contained) | No framework dependency in core; works with prod-only Docker install; no duplicate-React tree |
| D4 | Server entry | One ESM entry per theme exporting `render(templateKey, data, ctx)` | Small contract; easy to cache; avoids per-template module resolution |
| D5 | Render timing | Pre-resolve all data; compiled SSR is synchronous internally | Matches current data flow and hook semantics; no Suspense/streaming in v1 |
| D6 | Build location | New `@oktis-works/theme-builder` package (Vite + React/Solid plugins), invoked by the CLI | Keeps runtime lean; deterministic host-side build; shared by CLI/redeploy/tests |
| D7 | Hydration | `"none"` in v1; islands reserved | Zero client JS preserves CSP and keeps parity with current themes |
| D8 | CSS | Keep `stylesConfig` as the primary CSS pipeline; CSS emitted by component imports is scoped with `scopeCss` and recorded in the artifact | Preserves `[data-theme]` isolation invariant |
| D9 | Source layout | Root `home.tsx`, `index.tsx`, `single.tsx`, `page.tsx`, `archive.tsx`, `404.tsx` + `src/entry-server.tsx` | Same visible structure as template themes |
| D10 | Typecheck | Exclude `themes/**` from root typecheck; each compiled theme has its own `tsconfig.json` and a `theme:check` command | Avoids Solid JSX global config conflicting with React themes |
| D11 | Inheritance | Same-engine template inheritance; cross-engine parent = settings/styles/assets only, with a warning | Allows React/Solid themes to extend `default` for design tokens without mixing templates |
| D12 | Versioning | `render.apiVersion` + artifact `schemaVersion` + existing `compatibility.okcms` | Explicit surface for future contract changes |

---

## 6. Implementation phases

### Phase 0 — Baseline, guardrails, and documentation truth

**Goal:** freeze current behavior and correct documentation before refactoring.

**Changes**

- `THEME.md`, `docs/theme-development.md`, `README.md`: remove claims that components,
  `<slot />`, `await` in templates, or `.astro` component execution work on the public site.
  Document that `.astro` is a string-template convention.
- Add golden HTML tests for the current default theme and one fixture theme.
- Define fixture themes used by later phases:
  - `packages/theme-runtime/test/fixtures/template-theme/`
  - `packages/theme-builder/test/fixtures/react-theme/`
  - `packages/theme-builder/test/fixtures/solid-theme/`

**Tests**

- [ ] `bun run test:run` green before changes.
- [ ] Golden tests capture `renderContentPage` output for home, single, archive, 404.

**Acceptance**

- [ ] No runtime behavior change.
- [ ] Docs no longer promise features the runtime cannot execute.

**Checklist**

- [ ] Baseline CI green recorded.
- [ ] Fixtures created.
- [ ] Documentation corrections merged.

---

### Phase 1 — Manifest, types, and validation

**Goal:** make `render.engine` a first-class, validated part of `theme.json`.

**Changes**

- `packages/types/src/entities/index.ts`
  - add `ThemeRenderEngine`, `ThemeRenderConfig`;
  - add `render?: ThemeRenderConfig` to `ThemeManifest`.
- `packages/theme-sdk/src/types.ts`
  - re-export the render types.
- `packages/theme-sdk/src/manifest.ts` (new)
  - `validateThemeManifest(manifest)` and `validateThemeRenderConfig(config)`;
  - pure functions, no filesystem access.
- `packages/theme-sdk/src/index.ts`
  - export the validators and types.
- `packages/core/src/theme/service.ts`
  - call the validator in `install()` and `syncFromDirectory()`;
  - reject unknown engines and invalid `entry` paths.
- `packages/theme-runtime/src/loader.ts`
  - validate the render config during discovery (warning today; hard failure at render).
- `apps/web/src/index.ts`
  - use the same validator for parent theme manifests instead of the plugin-oriented
    `validateManifestV2`.

**Tests**

- [ ] Missing `render` ⇒ template.
- [ ] `"react"` and `"solid"` accepted.
- [ ] Unknown engine rejected.
- [ ] `entry` with `..`, absolute path, or backslash rejected.
- [ ] `hydration: "islands"` rejected in v1.
- [ ] Cross-engine `parent` accepted with a warning and no template inheritance.
- [ ] Existing manifests without `render` still install/sync.

**Acceptance**

- [ ] `okcms theme:create` output still valid (template default).
- [ ] Admin sync/install accepts `render.engine`.
- [ ] No database migration required.

**Checklist**

- [ ] Types merged.
- [ ] Validator shared by core, CLI, web, and theme-runtime.
- [ ] Tests added.
- [ ] Changeset for `types`, `theme-sdk`, `core`, `theme-runtime`.

---

### Phase 2 — Engine-agnostic template resolution (parity release)

**Goal:** move from `.astro` filenames to logical template keys without changing output.

**Changes**

- `packages/theme-runtime/src/template-resolver.ts`
  - introduce `TemplateKey`;
  - `buildTemplateChain` returns keys (`home`, `single`, `page-about`, ...);
  - `ResolvedTemplate` gains `key`; keep `file` for the template adapter;
  - `TemplateHierarchyResolver` accepts a `TemplateSource`:
    ```ts
    interface TemplateSource {
      has(key: string): boolean;
      /** Template adapter only; compiled themes return null. */
      read(key: string): string | null;
      engine: ThemeRenderEngine;
    }
    ```
- `packages/theme-runtime/src/adapters.ts` (new)
  - `ThemeRenderAdapter` interface;
  - `themeRenderOutput` helpers.
- `packages/theme-runtime/src/template-adapter.ts` (new)
  - wraps the existing `ThemeRenderer`;
  - maps keys to `${key}.astro`;
  - preserves `layoutOverride` behavior.
- `packages/theme-runtime/src/renderer.ts`
  - keep the parser untouched;
  - optionally expose `renderKey(key, data, record)`.
- `apps/web/src/rendering.ts`
  - make `renderContentPage` async;
  - build `ThemePageData` once;
  - select the adapter from the theme engine;
  - keep `wrapDocument`, hooks, CSS, and `data-theme` behavior.
- `apps/web/src/index.ts`
  - `await renderContentPage(...)`.

**Tests**

- [ ] Golden HTML identical for all template theme routes.
- [ ] Layout override still resolves.
- [ ] `_shared` and `default` fallbacks still resolve.
- [ ] `render-page.test.ts` updated for async.
- [ ] Hook order verified (`before:render` → render → `after:render`).

**Acceptance**

- [ ] Template themes behave exactly as before.
- [ ] No compiled-theme code path is reachable yet.
- [ ] Public API of `theme-runtime` remains backward compatible (deprecated helpers allowed).

**Checklist**

- [ ] Key-based resolver merged.
- [ ] Async pipeline merged.
- [ ] Golden tests green.
- [ ] Changeset for `theme-runtime`, `web`.

---

### Phase 3 — Theme builder and artifact pipeline

**Goal:** build compiled themes on the host and emit a deterministic artifact.

**Changes**

- New package `packages/theme-builder/`
  - `package.json` (public, ESM, `dist/`);
  - dependencies: `vite`, `@vitejs/plugin-react`, `vite-plugin-solid`,
    `babel-preset-solid`, plus existing workspace packages;
  - `src/index.ts` exporting `buildTheme`, `verifyThemeBuild`, `readThemeBuild`;
  - `src/artifact.ts` schema + validation;
  - `src/vite.ts` SSR and client config factories;
  - `src/css.ts` scoping of component CSS via `scopeCss`.
- `scripts/build-order.mjs`
  - add `theme-builder` after `theme-runtime`, before `cli`.
- `packages/cli/src/theme-build.ts`
  - `buildThemeOnDisk()` orchestrates CSS + JS + artifact;
  - keep `buildThemeStylesOnDisk` as a compatibility wrapper for existing tests/commands.
- `packages/cli/src/commands.ts`
  - `theme:build` calls the orchestrator and prints engine, buildId, and outputs.
- `packages/cli/src/redeploy.ts`
  - `ThemeBuildEntry` gains `renderEngine`, `artifactStatus`, `buildId`;
  - build compiled themes before the Docker build;
  - fail before switching if a compiled theme cannot be built.
- `packages/theme-runtime/src/compiled.ts` (new)
  - `loadThemeBuild(themeRoot)`: read + validate `dist/theme-build.json`;
  - `importThemeModule(themeRoot, build)`: validated path, `pathToFileURL`, cache bust by
    `buildId`;
  - module cache keyed by theme + `buildId`.
- `packages/theme-runtime/src/index.ts`
  - export the new loaders/adapters.

**Build details**

- SSR build: `build.ssr = src/entry-server.tsx`, `outDir = dist/server`, `format = "esm"`,
  framework bundled (`ssr.noExternal: true` or explicit list), `target = "node22"`.
- Client build (future hydration): `outDir = dist/client`, `manifest = true`; empty in v1.
- CSS: component-imported CSS is extracted, scoped with
  `[data-theme="<theme>"]`, recorded in `styles[]`.
- `buildId`: SHA-256 over sorted file contents + manifest render config + builder version.
- Artifact paths validated against the real theme root.

**Tests**

- [ ] Artifact schema accepts a valid build, rejects traversal and missing entry.
- [ ] `buildId` is stable for identical inputs and changes when a template changes.
- [ ] `theme:build` on a template theme behaves exactly as before (CSS only).
- [ ] `theme:build` on compiled fixtures emits server bundle + artifact.
- [ ] `redeploy` plan shows compiled builds and aborts on failure.
- [ ] Build order succeeds on a clean `bun run build`.

**Acceptance**

- [ ] `dist/theme-build.json` is the only runtime discovery surface for compiled themes.
- [ ] A built artifact contains no unresolved bare imports.
- [ ] CLI output is actionable: engine, buildId, server entry, styles.

**Checklist**

- [ ] Builder package created and published in the workspace.
- [ ] Build order updated.
- [ ] Artifact contract implemented.
- [ ] CLI/redeploy integration done.
- [ ] Changesets for `theme-builder`, `cli`, `theme-runtime`.

---

### Phase 4 — React SSR-only adapter

**Goal:** end-to-end React theme with no client JavaScript.

**Scaffold (`--engine react`)**

```
themes/my-react-theme/
├── theme.json
├── package.json
├── tsconfig.json
├── vite.config.ts
├── home.tsx
├── index.tsx
├── single.tsx
├── page.tsx
├── archive.tsx
├── 404.tsx
├── src/entry-server.tsx
├── styles/theme.css        # or dist/theme.css with css engine
└── dist/                   # generated by okcms theme:build
    ├── theme.css
    ├── theme-build.json
    └── server/entry.js
```

**Entry contract**

```tsx
// src/entry-server.tsx
import { renderToStaticMarkup } from 'react-dom/server';
import type { ThemePageData, ThemeRenderOutput } from '@oktis-works/theme-sdk';

import Home from '../home';
import Index from '../index';
import Single from '../single';
import Page from '../page';
import Archive from '../archive';
import NotFound from '../404';

const templates: Record<string, (props: ThemePageData) => unknown> = {
  home: Home,
  index: Index,
  single: Single,
  page: Page,
  archive: Archive,
  '404': NotFound,
};

export const templateKeys = Object.keys(templates);

export function render(key: string, data: ThemePageData): ThemeRenderOutput {
  const Component = templates[key] ?? templates['404'];
  return { html: renderToStaticMarkup(<Component {...data} />) };
}
```

**Runtime changes**

- `packages/theme-runtime/src/compiled.ts`
  - resolve `entry` from the artifact;
  - import the module;
  - validate `render` is a function;
  - call `render(key, data, ctx)` inside `runWithCurrentContent`.
- `apps/web/src/rendering.ts`
  - use the compiled adapter when `render.engine === 'react'`;
  - emit `ThemeRenderOutput.styles` after `theme.css`;
  - keep `wrapDocument` and `data-theme`.

**Scaffold generator**

- `packages/cli/src/extension-scaffold.ts`
  - `scaffoldTheme(name, baseDir, style, renderEngine)`;
  - generate `render.engine`, React files, `package.json`, `vite.config.ts`, `tsconfig.json`.
- `packages/cli/scripts/generate-theme-assets.mjs`
  - add generated asset sets for React/Solid scaffolds (source: `templates/theme-react/`,
    `templates/theme-solid/`, or inline constants).
- `packages/cli/src/commands.ts`
  - `--engine template|react|solid` (default `template`).

**Tests**

- [ ] React fixture builds and renders `home`, `single`, `archive`, `404`.
- [ ] Data passed to components matches `ThemePageData` (title, items, menus, settings).
- [ ] `getField()` works inside a React component (ALS context).
- [ ] `theme:before:render` mutates data before React; `theme:after:render` sees final HTML.
- [ ] CSS isolation: React theme rules are prefixed with `[data-theme="..."]`.
- [ ] Missing artifact ⇒ clear 500 with theme name and expected path.
- [ ] Engine mismatch (`theme.json` react vs artifact solid) ⇒ clear 500.
- [ ] Preview settings (`?preview_settings`) work for React themes.
- [ ] No `<script>` tags emitted when `hydration: "none"`.

**Acceptance**

- [ ] `okcms theme:create --engine react`, `theme:build`, `theme:manage --set-active`,
      `okcms redeploy` works end-to-end.
- [ ] No React dependency added to `packages/theme-runtime/package.json`.
- [ ] React theme renders on a fresh checkout after `bun run build`.

**Checklist**

- [ ] React scaffold merged.
- [ ] Compiled adapter merged.
- [ ] Fixture + integration tests merged.
- [ ] Docs: React theme guide.

---

### Phase 5 — Solid SSR-only adapter

**Goal:** same contract, Solid implementation.

**Scaffold (`--engine solid`)**

Same tree as React, with `.tsx` templates and:

```tsx
// src/entry-server.tsx
import { renderToString } from 'solid-js/web';
import type { ThemePageData, ThemeRenderOutput } from '@oktis-works/theme-sdk';

import Home from '../home';
// ...

const templates: Record<string, (props: ThemePageData) => unknown> = {
  home: Home,
  // ...
  '404': NotFound,
};

export const templateKeys = Object.keys(templates);

export function render(key: string, data: ThemePageData): ThemeRenderOutput {
  const Component = templates[key] ?? templates['404'];
  return { html: renderToString(() => <Component {...data} />) };
}
```

**Build**

- `vite-plugin-solid` for both SSR and client configs;
- `solid-js` bundled into the artifact;
- same artifact schema and runtime adapter — no Solid-specific runtime code.

**Tests**

- [ ] Mirror the React matrix (render keys, data, ALS, hooks, CSS, error paths).
- [ ] Solid fixture builds with the same builder version.
- [ ] Switching a site between a React theme and a Solid theme works without runtime changes.

**Acceptance**

- [ ] Solid theme reaches feature parity with React SSR-only.
- [ ] One theme still declares exactly one engine.

**Checklist**

- [ ] Solid scaffold merged.
- [ ] Solid fixture + tests merged.
- [ ] Docs: Solid theme guide.

---

### Phase 6 — Inheritance, `_shared`, and engine rules

**Goal:** make theme composition predictable.

**Rules**

1. A theme declares one engine.
2. Template resolution walks `[active, _shared, default]` and picks the first theme that
   provides the template key **and has the same engine**.
3. A cross-engine `parent` contributes settings, styles, and assets only. It never
   contributes templates. A warning is emitted at build/activation.
4. `_shared` is treated as `template` unless its `theme.json` declares an engine. Compiled
   themes should use an engine-specific shared theme (e.g. `_shared-react`) or duplicate
   small fragments.
5. A compiled theme may omit a template key; the runtime falls back down the chain (same as
   today), ending at `404`.

**Changes**

- `packages/theme-runtime/src/compiled.ts`
  - catalog per theme: `{ engine, build, has(key) }`;
  - chain-level lookup by key.
- `packages/theme-runtime/src/template-resolver.ts`
  - chain aware of engine compatibility.
- `packages/core/src/theme/service.ts`
  - validate parent engine compatibility on install/sync;
  - store nothing new (manifest is already JSONB).
- `packages/cli/src/theme-migrate.ts`
  - leave legacy migration unchanged; add validation for the new field.

**Tests**

- [ ] React child + `default` (template) parent: settings/styles/assets inherit, templates
      do not; warning present.
- [ ] React child + React parent: templates inherit and override by key.
- [ ] Solid child + Solid parent: same.
- [ ] `_shared` template fragment works for template themes and is skipped for compiled
      themes unless engine matches.
- [ ] Missing key falls back to `404` with a diagnostic in `triedChain`.
- [ ] Cycle detection still works.

**Acceptance**

- [ ] No silent cross-engine template rendering.
- [ ] Diagnostics are actionable.

**Checklist**

- [ ] Chain rules implemented.
- [ ] Validation + tests merged.
- [ ] Docs table of inheritance rules updated.

---

### Phase 7 — Hydration / islands (reserved, not part of first release)

**Goal:** optional client interactivity without weakening CSP or the data contract.

**Design gates**

- `render.hydration: "islands"` accepted only after this phase ships.
- Artifact gains `client` entries plus an island map (`templateKey → { entry, islands }`).
- Runtime emits `<script type="module" src="/themes/<theme>/dist/client/...">`.
- Bootstrap data:
  - preferred: same-origin JSON endpoint with per-request payload;
  - alternative: non-executable `<script type="application/json">` block, after a browser
    CSP compatibility check;
  - never inline executable JavaScript under `script-src 'self'`.
- Serialization must escape `</script>` and untrusted strings.
- Hydration must not import `@oktis-works/theme-sdk` in the client bundle
  (`node:async_hooks` is server-only).

**Checklist (future)**

- [ ] Client build pipeline.
- [ ] Island manifest.
- [ ] CSP strategy approved.
- [ ] Hydration mismatch tests.
- [ ] Performance budget.
- [ ] Security review.

---

### Phase 8 — Documentation, release, and migration

**Goal:** ship safely with the repository's release rules.

**Documentation**

- [ ] `THEME.md`: engine matrix, when to choose template/React/Solid, build output.
- [ ] `docs/theme-development.md`: React and Solid guides, data contract, inheritance rules.
- [ ] `README.md`: feature line (compiled themes), no overpromising.
- [ ] CLI help: `theme:create --engine`, `theme:build` output.
- [ ] Admin Themes screen: show engine and build status (read-only; builds stay host-only).
- [ ] Error catalog: missing artifact, engine mismatch, stale build, invalid module.

**Release**

- [ ] Changesets for every changed package (`types`, `theme-sdk`, `theme-runtime`,
      `theme-builder`, `cli`, `web`, `core`, `admin` if UI changes).
- [ ] `bun run version-packages`.
- [ ] Bump root `package.json` minor (new feature).
- [ ] `bun run sync-version --write`, then `bun run sync-version`.
- [ ] `node scripts/prepare-publish.mjs --check --tag vX.Y.Z`.
- [ ] Run the full `AGENTS.md` §16 sequence three consecutive times.
- [ ] Release branch + PR (`release/vX.Y.Z`), merge to `main`.
- [ ] Verify `npm view` versions after publish.
- [ ] Post-release smoke: scaffold React + Solid themes, build, activate, render.

**Migration**

- [ ] Existing themes need no changes.
- [ ] `theme:build` on a template theme is a no-op for JS and keeps current CSS behavior.
- [ ] No database migration.
- [ ] `theme:manage --set-active` refuses a compiled theme without a valid artifact.

---

## 7. File-by-file change map

| File | Change |
|---|---|
| `packages/types/src/entities/index.ts` | `ThemeRenderEngine`, `ThemeRenderConfig`, `ThemeManifest.render` |
| `packages/theme-sdk/src/types.ts` | Re-export render types, `ThemePageData`, `ThemeRenderOutput` |
| `packages/theme-sdk/src/manifest.ts` | New shared validator |
| `packages/theme-sdk/src/index.ts` | Export new types/validator |
| `packages/theme-runtime/src/template-resolver.ts` | Key-based chain, engine-aware catalog |
| `packages/theme-runtime/src/adapters.ts` | New adapter interface |
| `packages/theme-runtime/src/template-adapter.ts` | New wrapper around `ThemeRenderer` |
| `packages/theme-runtime/src/compiled.ts` | New artifact loader, module import cache |
| `packages/theme-runtime/src/renderer.ts` | Keep parser; add key-level render helper |
| `packages/theme-runtime/src/loader.ts` | Validate `render` during discovery |
| `packages/theme-runtime/src/index.ts` | Export new APIs |
| `packages/theme-builder/*` | New package: Vite SSR/client builds, artifact, CSS scoping |
| `scripts/build-order.mjs` | Add `theme-builder` before `cli` |
| `packages/cli/src/theme-build.ts` | Orchestrate CSS + JS + artifact; compatibility wrapper |
| `packages/cli/src/extension-scaffold.ts` | `--engine` scaffold variants |
| `packages/cli/src/commands.ts` | `theme:create --engine`; build output |
| `packages/cli/scripts/generate-theme-assets.mjs` | Generated React/Solid scaffold assets |
| `packages/cli/src/redeploy.ts` | Build compiled themes; fail before switch |
| `packages/core/src/theme/service.ts` | Validate manifest render config on install/sync |
| `apps/web/src/rendering.ts` | Async render, adapter selection, styles/scripts emission |
| `apps/web/src/index.ts` | Await render; asset content types; error mapping |
| `apps/api/src/routes/themes/index.ts` | Surface validation errors (no schema change) |
| `apps/admin/src/components/apps/themes/ThemeManager.tsx` | Show engine/build status (optional) |
| `tsconfig.json` / `tsconfig.typecheck.json` | Exclude `themes/**`; per-theme tsconfig |
| `THEME.md`, `docs/theme-development.md`, `README.md` | Engine docs and corrections |
| `packages/*/CHANGELOG.md` | Via changesets |

---

## 8. Test plan

### 8.1 Unit

| Area | Cases |
|---|---|
| Manifest validation | missing `render`, template/react/solid, unknown engine, invalid `entry`, islands reserved, cross-engine parent |
| Artifact validation | schema version, engine mismatch, traversal, missing entry, missing template |
| Template keys | precedence parity with current chain, `layoutOverride`, `404` fallback |
| Adapter | template adapter parity, compiled adapter export validation, cache bust |
| Builder | deterministic `buildId`, CSS scoping, no bare imports |
| Errors | missing build, stale build, invalid module, missing engine |

### 8.2 Integration

- Render the template fixture with the async pipeline; compare golden HTML.
- Build and render React fixture routes: home, single, archive, 404.
- Build and render Solid fixture routes: same matrix.
- Verify `ThemePageData` fields and `getField()` through ALS.
- Verify hooks: `theme:before:render` data mutation, `theme:after:render` HTML mutation,
  `theme:head` injection.
- Verify preview settings and `preview_theme` for compiled themes.
- Verify CSS isolation: compiled theme selectors are scoped and no global leak.

### 8.3 CLI

- `theme:create --engine template|react|solid` output tree and manifest.
- `theme:build` on each engine; artifact and CSS outputs.
- `theme:manage --set-active` with missing/mismatched artifact refuses.
- `redeploy --dry-run` plan includes compiled builds and correct statuses.
- `theme:install` copies source and artifact; npm package flow.

### 8.4 End-to-end

- Activate a React theme, hit `/`, `/blog`, `/blog/<slug>`, `/missing`; verify content,
  links, CSS, and no client JS.
- Repeat with a Solid theme.
- Switch back to a template theme; verify zero regression.
- Admin customizer iframe preview with a compiled theme.

### 8.5 CI gates

- [ ] `bun run build` (includes `theme-builder`).
- [ ] `bun run test:run`.
- [ ] `bun run check:api-drift`.
- [ ] `bun run audit:contracts`.
- [ ] `bun run check:provider-matrix`.
- [ ] `bun run typecheck` (excluding `themes/**`).
- [ ] `bun run lint`.
- [ ] Theme builder smoke test on fixtures.

---

## 9. Security, multi-tenancy, and performance

### 9.1 Security checklist

- [ ] Artifact paths are relative, lexically contained, and realpath-contained.
- [ ] `entry` and template files cannot escape the theme directory.
- [ ] Compiled theme code is documented as trusted (same as plugins).
- [ ] Raw content continues through the existing sanitizer; React/Solid escaping is used
      for normal values.
- [ ] No inline executable scripts; CSP remains `script-src 'self'`.
- [ ] Hydration payload (future) escapes `</script>` and untrusted data.
- [ ] Build runs on the host, never inside the production container.
- [ ] Artifact is verified before activation to avoid serving arbitrary paths.

### 9.2 Multi-tenancy checklist

- [ ] Theme modules are tenant-agnostic; no module-level tenant caches.
- [ ] `runWithCurrentContent` and `runWithThemeDataProvider` wrap the compiled render.
- [ ] Themes must not call `setThemeDataProvider` globally (document; optional lint rule).
- [ ] Data is resolved per request; no cross-tenant reuse.
- [ ] Preview (`preview_theme`) remains request-scoped.

### 9.3 Performance checklist

- [ ] Compiled module cached per theme + `buildId`.
- [ ] Artifact read cached with mtime/TTL; no re-read per render.
- [ ] SSR build bundles only server dependencies; client is empty in v1.
- [ ] No framework runtime loaded for template themes.
- [ ] Build is deterministic and cached by `buildId`.
- [ ] Measure first render and warm render before/after (report numbers, no claims without
      measurement).

---

## 10. Rollout, compatibility, and rollback

### 10.1 Compatibility

- `render` absent = template; no existing theme changes.
- Existing `components[]`, `provides`, `settings`, `stylesConfig` remain valid.
- `@oktis-works/theme-runtime` public functions remain exported; new async behavior is
  documented as a minor release.
- New `@oktis-works/theme-builder` is additive.

### 10.2 Rollout order

1. Phases 0–3 (contract + builder) with template parity; no compiled theme activated.
2. React SSR-only (Phase 4) documented as preview.
3. Solid SSR-only (Phase 5).
4. Inheritance rules (Phase 6).
5. Stable announcement; hydration only after Phase 7.

### 10.3 Rollback

- Deactivate the compiled theme and activate `default` (template).
- Runtime never silently falls back from a compiled theme to a template; it fails with a
  clear error, so a broken build cannot produce mixed markup.
- Keep the previous artifact on disk until the next successful build (`theme:build` writes
  atomically: temp dir + rename).
- Optional operational kill switch: `OKCMS_THEME_ENGINES=template` refuses compiled engines
  at activation (documented, not a substitute for a correct build).

---

## 11. Release checklist

- [ ] All phase checklists complete for the targeted release.
- [ ] Changesets present for every package.
- [ ] `bun run version-packages`.
- [ ] Root `package.json` version bumped (minor).
- [ ] `bun run sync-version --write` + `bun run sync-version`.
- [ ] `node scripts/prepare-publish.mjs --check --tag vX.Y.Z`.
- [ ] Full `AGENTS.md` §16 sequence three consecutive clean runs.
- [ ] Release branch `release/vX.Y.Z`, PR, merge to `main`.
- [ ] Publish workflow green.
- [ ] `npm view` verification for every published package.
- [ ] Post-release smoke tests for React, Solid, and template themes.

---

## 12. Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Async render refactor touches all web routes | Regressions | Phase 2 golden tests; merge before compiled support |
| Duplicate framework copies | Hook errors, bundle size | Self-contained theme bundles; one framework per theme |
| Stale artifact after edit | Old markup served | `buildId` hash, `theme:verify`, redeploy rebuild |
| Typecheck conflicts with Solid JSX | CI failure | Exclude `themes/**`; per-theme tsconfig |
| CSS from component imports leaks | Cross-theme contamination | Scope all emitted CSS with `[data-theme]` |
| CSP blocks hydration bootstrap | Broken interactivity | Defer hydration; use same-origin JSON/nonce |
| Docs drift | Support burden | Phase 0 corrections; docs in release checklist |
| Build tooling weight in CLI | Install size | Lazy-load builder; optional dependency strategy reviewed in Phase 3 |
| Cross-engine inheritance ambiguity | Surprising output | Explicit rule: settings/styles/assets only; warning + tests |
| Theme code trusted but unvetted | Security | Same trust model as plugins; permissions; no build in container |

---

## 13. Open questions (need approval before Phase 4)

1. **Framework bundling:** confirm self-contained artifacts (recommended) vs host-provided
   React/Solid peer dependencies.
2. **CSS strategy:** confirm `stylesConfig` stays the primary pipeline and component-imported
   CSS is scoped into the artifact (recommended) vs forbidding component CSS imports in v1.
3. **`_shared` semantics:** confirm engine-specific shared themes (`_shared-react`,
   `_shared-solid`) vs a single `_shared` limited to template themes.
4. **Builder packaging:** confirm `@oktis-works/theme-builder` as a hard dependency of the CLI
   vs optional peer dependencies with an install prompt.
5. **Hydration priority:** confirm it is post-first-release and not a launch blocker.
6. **Admin UI:** confirm engine/build status is read-only (builds remain host-only).

---

## Appendix A — React theme example

```
themes/my-react-theme/
├── theme.json
├── package.json
├── tsconfig.json
├── vite.config.ts
├── home.tsx
├── index.tsx
├── single.tsx
├── page.tsx
├── archive.tsx
├── 404.tsx
├── src/entry-server.tsx
├── styles/theme.css
└── dist/                  # generated
    ├── theme.css
    ├── theme-build.json
    └── server/entry.js
```

`theme.json`:

```json
{
  "name": "my-react-theme",
  "version": "1.0.0",
  "description": "React theme for OkCMS",
  "type": "theme",
  "compatibility": { "okcms": "^0.41.0" },
  "render": { "engine": "react", "apiVersion": 1, "hydration": "none" },
  "provides": {
    "layouts": ["home", "index", "single", "page", "archive", "404"],
    "assets": ["dist/theme.css"]
  },
  "stylesConfig": {
    "engine": "css",
    "isolation": "manual",
    "entry": "styles/theme.css",
    "output": "dist/theme.css"
  },
  "settings": [
    { "name": "siteTitle", "type": "text", "label": "Site title", "default": "OkCMS" }
  ]
}
```

`home.tsx`:

```tsx
import type { ThemePageData } from '@oktis-works/theme-sdk';

export default function Home({ site, items, settings }: ThemePageData) {
  return (
    <main className="site">
      <h1>{String(settings.theme?.siteTitle ?? site.title)}</h1>
      <section className="listing">
        {items.map((item) => (
          <article key={String(item.slug)}>
            <h2>
              <a href={`/${String(item.slug)}`}>{String(item.title ?? '')}</a>
            </h2>
            {item.excerpt ? <p>{String(item.excerpt)}</p> : null}
          </article>
        ))}
      </section>
    </main>
  );
}
```

`vite.config.ts`:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  build: {
    ssr: fileURLToPath(new URL('./src/entry-server.tsx', import.meta.url)),
    outDir: 'dist/server',
    emptyOutDir: true,
    target: 'node22',
    rollupOptions: { output: { format: 'esm', entryFileNames: 'entry.js' } },
  },
  ssr: { noExternal: true },
});
```

---

## Appendix B — Solid theme example

Same tree and `theme.json`, with `"engine": "solid"`.

`src/entry-server.tsx`:

```tsx
import { renderToString } from 'solid-js/web';
import type { ThemePageData, ThemeRenderOutput } from '@oktis-works/theme-sdk';

import Home from '../home';
import Index from '../index';
import Single from '../single';
import Page from '../page';
import Archive from '../archive';
import NotFound from '../404';

const templates: Record<string, (props: ThemePageData) => unknown> = {
  home: Home,
  index: Index,
  single: Single,
  page: Page,
  archive: Archive,
  '404': NotFound,
};

export const templateKeys = Object.keys(templates);

export function render(key: string, data: ThemePageData): ThemeRenderOutput {
  const Component = templates[key] ?? templates['404'];
  return { html: renderToString(() => <Component {...data} />) };
}
```

`vite.config.ts` uses `vite-plugin-solid` for both SSR and client builds; Solid is bundled
into the artifact.

---

## Appendix C — CLI experience

```bash
# Template theme (current behavior, default)
okcms theme:create --name my-theme --style scss

# React theme
okcms theme:create --name my-react-theme --engine react --style tailwind

# Solid theme
okcms theme:create --name my-solid-theme --engine solid --style css

# Build (CSS + JS artifact)
okcms theme:build --name my-react-theme

# Activate (validates the artifact)
okcms theme:manage --name my-react-theme --set-active

# Deploy (builds all compiled themes on the host, then rebuilds the image)
okcms redeploy
```

Expected `theme:build` output:

```
[my-react-theme] render=react api=1
[my-react-theme] css -> dist/theme.css (4821 bytes, isolated=true)
[my-react-theme] ssr -> dist/server/entry.js (buildId sha256:8f3a...)
[my-react-theme] artifact -> dist/theme-build.json
```
