# @oktis-works/plugin-sdk

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

## 0.7.3

### Patch Changes

- Complete the provider-aware migration lifecycle, CLI database workflows, generated MySQL and MariaDB assets, audit safeguards, and GPL-2.0-or-later licensing metadata.
- Updated dependencies
  - @oktis-works/types@0.9.4
  - @oktis-works/validation@0.8.1

## 0.7.2

### Patch Changes

- Updated dependencies
  - @oktis-works/validation@0.8.0
  - @oktis-works/types@0.9.3

## 0.7.1

### Patch Changes

- Harden plugin registration, permissions, tenancy, lifecycle reconciliation, admin extension loading, and public rendering.
- Updated dependencies
  - @oktis-works/types@0.9.2

## 0.7.0

### Minor Changes

- 12d1963: Editor extensibility APIs for plugins (parity E1–E8): api.admin.addEditor (editor slot registrations with id/screens/mode validation), api.registerBlock (blocks:register), api.registerPattern (patterns:register), the new patterns:register permission, AdminEditorRegistration re-export and the shared admin extension state factory.

### Patch Changes

- Updated dependencies [12d1963]
- Updated dependencies [12d1963]
  - @oktis-works/types@0.9.0
  - @oktis-works/validation@0.7.0

## 0.6.0

### Minor Changes

- feat: add custom field types via plugins
  
  - Core: field_type_extensions table, dynamic type registry
  - Plugin Runtime: addFieldType API, manifest fieldTypes[]
  - Admin: dynamic component loading for field config/render
  - Docs: plugin-development.md, PLUGIN.md
  - Example plugin: mermaid-field
  
  BREAKING CHANGE: none

### Patch Changes

- Updated dependencies
  - @oktis-works/types@0.8.0

## 0.5.8

### Patch Changes

- Updated dependencies
  - @oktis-works/types@0.7.0

## 0.5.7

### Patch Changes

- Updated dependencies
  - @oktis-works/types@0.6.0

## 0.5.6

### Patch Changes

- 2f2919f: - **Plugins no boot**: novo `bootstrapPlugins` — lê do banco os plugins habilitados (ACTIVATED/RUNNING), chama `register(registry)`, descarrega os desabilitados e isola falhas (plugin quebrado não derruba o boot nem dos outros nem do processo). `core.bootstrap()` chama `syncEnabledPlugins` e cobre API, web e worker num ponto só; ativar/desativar pela API sincroniza o processo na hora.
  - **Loader**: descobre o `manifest.json` gerado pelo scaffold (fallback atrás de `package.json` de pacotes npm).
  - **CLI**: comando `okcms prerender`/SSG removido por completo (comando, wizard, parser e docs do scaffold).
  - **Admin**: `AtGlanceWidget` sem versão de app — Storage vira stat próprio; removidos `lib/version.ts` e a chave i18n `dashboard.widgets.version`.
  - **Docs**: auditoria de promessas falsas em todos os `.md` do projeto e nos templates gerados — exemplo de plugin com hooks reais (`content:query`, `after_publish_content_post`), `plugin:manage/theme:manage --disable` descrito como estado local, `update/redeploy` sem assumir blue/green, SSR-only e "sandbox" não anunciado como isolamento de execução.

## 0.5.5

### Patch Changes

- Updated dependencies []:
  - @oktis-works/types@0.5.5

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

### Patch Changes

- Updated dependencies []:
  - @oktis-works/types@0.2.0

## 0.1.14

### Patch Changes

- Updated dependencies []:
  - @oktis-works/types@0.1.14

## 0.1.13

### Patch Changes

- Updated dependencies []:
  - @oktis-works/types@0.1.13

## 0.1.12

### Patch Changes

- Updated dependencies []:
  - @oktis-works/types@0.1.12

## 0.1.11

### Patch Changes

- Updated dependencies []:
  - @oktis-works/types@0.1.11

## 0.1.10

### Patch Changes

- Updated dependencies []:
  - @oktis-works/types@0.1.10

## 0.1.9

### Patch Changes

- Updated dependencies []:
  - @oktis-works/types@0.1.9

## 0.1.8

### Patch Changes

- Updated dependencies []:
  - @oktis-works/types@0.1.8

## 0.1.7

### Patch Changes

- Updated dependencies []:
  - @oktis-works/types@0.1.7

## 0.1.6

### Patch Changes

- Updated dependencies []:
  - @oktis-works/types@0.1.6

## 0.1.5

### Patch Changes

- Updated dependencies []:
  - @oktis-works/types@0.1.5

## 0.1.4

### Patch Changes

- Updated dependencies []:
  - @oktis-works/types@0.1.4

## 0.1.3

### Patch Changes

- Updated dependencies []:
  - @oktis-works/types@0.1.3
