# @oktis-works/theme-sdk

## 0.8.0

### Minor Changes

- # Dynamic URL Hierarchy (v0.37.0)
  
  ## Features
  
  ### Phase 1: Dynamic URL Hierarchy
  - **Hub pages per content type**: Any published page can be designated as a listing hub for any content type with `hasArchive` (via `metadata.hub_type`). The page's slug becomes the URL base (e.g., `/blog/`, `/projects/`).
  - **Hierarchical URLs**: Content items support `parent_id` for nested URLs (e.g., `/projects/cliente-a/projeto-1`). Walk-up validation ensures parent chain matches URL segments.
  - **Persistent redirects**: `url_redirects` table stores exact and prefix redirects for slug changes, parent changes, and hub page renames (prefix: `/old-base/*` → `/new-base/*`).
  - **Legacy compatibility**: `postsPage`/`page_for_posts` still work for type `post`; dynamic hubs take precedence.
  
  ### Phase 2: Head SEO
  - `<link rel="canonical">` and `<meta property="og:url">` emitted from `resolution.canonicalPath`.
  - Meta description fix: now uses `page.seo_description` → `page.excerpt` → `siteDescription` (was global only).
  
  ### Phase 3: Sitemap
  - `GET /sitemap.xml` lists hub pages + published items with canonical URLs.
  - Excludes redirect sources; pagination (`?page=N`) uses canonical self.
  
  ### Phase 4: JSON-LD + Breadcrumbs
  - Schema.org entities: `BlogPosting` (post), `WebPage` (page), `CreativeWork` (custom).
  - `BreadcrumbList` from hub base + parent chain: `Home → Hub → Parent1 → Item`.
  - Injected via `<script type="application/ld+json">` in `single.astro` and `page.astro`.
  
  ### Phase 5: RSS/Atom Feeds
  - `GET /{hubBase}/feed` (RSS 2.0 default, `?format=atom` for Atom 1.0).
  - Auto-discovers hub type via `metadata.hub_type`, lists published items ordered by `published_at DESC`.
  
  ## Admin UI
  - **Reading Settings**: Hub pages table (add/remove type + page) with prefix redirect on page rename.
  - **Content Editor**: Parent select dropdown (same type, published, excludes self/descendants, max depth 5).
  - i18n keys for hub pages and parent select.
  
  ## Templates
  - All default templates use `{{url}}` for canonical links (no hardcoded `/blog/`).
  - `single.astro` and `page.astro` inject JSON-LD.
  - CLI `okcms init` produces byte-identical theme.
  
  ## Migrations
  - `V027__core__content_parent_and_hub.sql` (Postgres/MySQL/MariaDB): `parent_id` + `url_redirects` table.
  
  ## Documentation
  All packages updated with READMEs covering Phase 1-5 integration.

### Patch Changes

- Updated dependencies
  - @oktis-works/types@0.10.0
  - @oktis-works/validation@0.8.2

## 0.7.1

### Patch Changes

- Complete the provider-aware migration lifecycle, CLI database workflows, generated MySQL and MariaDB assets, audit safeguards, and GPL-2.0-or-later licensing metadata.
- Updated dependencies
  - @oktis-works/types@0.9.4
  - @oktis-works/validation@0.8.1

## 0.7.0

### Minor Changes

- Unify standard and custom content fields across definitions, persistence, editing, validation, and theme delivery.

### Patch Changes

- Updated dependencies
  - @oktis-works/validation@0.8.0
  - @oktis-works/types@0.9.3

## 0.6.2

### Patch Changes

- Harden plugin registration, permissions, tenancy, lifecycle reconciliation, admin extension loading, and public rendering.
- Updated dependencies
  - @oktis-works/types@0.9.2

## 0.6.1

### Patch Changes

- Fix theme lifecycle, preview, rendering, security, tenant scoping, configuration validation, SDK contracts, pagination, and runtime inheritance behavior.
- Updated dependencies
  - @oktis-works/types@0.9.1

## 0.6.0

### Minor Changes

- feat(themes): isolamento CSS `isolation: "manual"` + tema default já escopado (BUSI-040)
  
  Formaliza a exceção de isolamento para temas `engine: css`: o manifest pode
  declarar `stylesConfig.isolation: "manual"`, significando que o AUTOR entrega o
  CSS já isolado (o pipeline de build não escopa de novo). `'manual'` é válido
  apenas com `engine: css` — em engines com build (scss/tailwind) é rejeitado na
  validação, pois o build sempre escopa.
  
  - `theme-sdk`: `ThemeStyleConfig.isolation` aceita `true | 'manual'`.
  - `theme-runtime`: `validateStyleManifest`/`resolveStyleEngine`/`buildThemeStyles`
    entendem `'manual'` (não escopa; `false` continua proibido).
  - tema default: `dist/theme.css` versionado **já escopado** (`[data-theme="default"]`)
    e `theme.json` com `isolation: "manual"` — o site fica isolado sem build.
  - docs EN/pt-BR, THEMES.md e scaffold-docs atualizados.

## 0.5.5

No changes in this release.

## 0.3.3

### Patch Changes

- Patch alignment 0.3.3 (interactive install prompt + live dependency loader shipped via `@oktis-works/cms`)

## 0.3.2

### Patch Changes

- Patch alignment 0.3.2 (docker build hardening + admin SSR fix shipped via `@oktis-works/cms` and `@oktis-works/ui`)

## 0.3.1

### Patch Changes

- Fix @oktis-works/admin missing bin/admin.js entry point for standalone Astro server

## 0.3.0

### Minor Changes

- Release 0.3.0, aligned with tag v0.3.0: interactive arrow-key menus and English
  output across the `okcms` CLI, plus a third deploy target (simple containers in
  front of the proxy) next to blue/green and PM2.

## 0.2.1

### Minor Changes

- Histórico/rollback unificado, comando deploy (Docker/PM2), docs auto-atualizadas no update/deploy
## 0.2.0

No changes in this release.

## 0.1.14

No changes in this release.

## 0.1.13

No changes in this release.

## 0.1.12

No changes in this release.

## 0.1.11

No changes in this release.

## 0.1.10

No changes in this release.

## 0.1.9

No changes in this release.

## 0.1.8

No changes in this release.

## 0.1.7

No changes in this release.

## 0.1.6

No changes in this release.

## 0.1.5

No changes in this release.

## 0.1.4

No changes in this release.

## 0.1.3

No changes in this release.
