# @oktis-works/types

## 0.10.0

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
  - @oktis-works/validation@0.8.2

## 0.9.4

### Patch Changes

- Complete the provider-aware migration lifecycle, CLI database workflows, generated MySQL and MariaDB assets, audit safeguards, and GPL-2.0-or-later licensing metadata.
- Updated dependencies
  - @oktis-works/validation@0.8.1

## 0.9.3

### Patch Changes

- Updated dependencies
  - @oktis-works/validation@0.8.0

## 0.9.2

### Patch Changes

- Harden plugin registration, permissions, tenancy, lifecycle reconciliation, admin extension loading, and public rendering.

## 0.9.1

### Patch Changes

- Fix theme lifecycle, preview, rendering, security, tenant scoping, configuration validation, SDK contracts, pagination, and runtime inheritance behavior.

## 0.9.0

### Minor Changes

- 12d1963: Editor extensibility for plugin-built block editors (parity E1–E8): new AdminEditorRegistration ({ id, label?, screens, mode: 'replace-body' | 'below', priority?, componentId }), editors on PluginManifestAdmin and AdminExtensionsState, and PluginPatternManifest with manifest v2 patterns[] for the editor-agnostic pattern catalog.

### Patch Changes

- Updated dependencies [12d1963]
  - @oktis-works/validation@0.7.0

## 0.8.0

### Minor Changes

- feat: add custom field types via plugins
  
  - Core: field_type_extensions table, dynamic type registry
  - Plugin Runtime: addFieldType API, manifest fieldTypes[]
  - Admin: dynamic component loading for field config/render
  - Docs: plugin-development.md, PLUGIN.md
  - Example plugin: mermaid-field
  
  BREAKING CHANGE: none

## 0.7.0

### Minor Changes

- Fix version bump: release 0.15.0 instead of reusing 0.14.0 tag.

## 0.6.0

### Minor Changes

- API keys for API-first clients. A key is exchanged once at
  `POST /api/v1/auth/api-key-login` for an access JWT + refresh token (normal
  Bearer + refresh cycle afterwards with reuse detection); it never authorizes
  requests directly. Adds `api_keys` (SHA-256 hash only, RLS per tenant,
  optional single-use/expiry), `GET/POST /api/v1/api-keys`,
  `DELETE /api/v1/api-keys/:id`, `OkCMSClient.loginWithApiKey`, and an admin
  screen at Settings → API keys. Rate limited per key prefix on top of the
  per-IP login bucket.

## 0.5.6

### Patch Changes

- Updated dependencies
  - @oktis-works/validation@0.6.0

## 0.5.5

### Patch Changes

- Updated dependencies []:
  - @oktis-works/validation@0.5.5

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

### Patch Changes

- F1–F10: Admin panel completo
  
  - F1 RBAC: seed 5 roles (SUPER_ADMIN, TENANT_ADMIN, EDITOR, AUTHOR, VIEWER); register atribui TENANT_ADMIN ao 1º usuário; login resolve slug→UUID e devolve tenantId no JWT
  - F2 Media: upload local-disk (UPLOAD_DIR), layout tenant/uuid.ext, GET /file público (cache imutável), 25MB, traversal bloqueado
  - F3 Settings: seed 4 configurações (siteTitle, siteDescription, language, timezone) grupo general
  - F4 Admin api-client tipado (AuthApiClient, MediaApiClient, UsersApiClient, SettingsApiClient, ContentApiClient)
  - F5 MediaLibrary: grid, upload drag-and-drop, preview modal, busca, paginação
  - F6 Users: lista com roles, criação com roleId, troca de senha, papel EDITOR
  - F7 Settings: GeneralSettings (siteTitle, siteDescription, language, timezone) com PUT array
  - F8 Dashboard + ContentList (Solid islands), ContentEditor modo edição (?id=), redirect /dashboard → /
  - F9 DashboardLayout: sidebar ativa por pathname, submenu Settings sempre visível, session guard + logout funcional
  - E2E API 25/25 (register/login/RBAC/upload/settings/traversal/content/users/boundaries/401)
  - E2E Admin 13/13 (login/dashboard/media/users/settings/content/logout/session guard)
  - Fix sistêmico jsonb: params crus (driver serializa 1×), boolean via CASE WHEN, tenant_id em media/content
  - Gates: lint ✅ typecheck 0 ✅ 484 testes ✅ build 17/17 ✅

## 0.1.11

### Patch Changes

- Updated dependencies []:
  - @oktis-works/validation@0.1.11

## 0.1.10

No changes in this release.

## 0.1.9

### Patch Changes

- Updated dependencies []:
  - @oktis-works/validation@0.1.9

## 0.1.8

### Patch Changes

- Updated dependencies []:
  - @oktis-works/validation@0.1.8

## 0.1.7

### Patch Changes

- Updated dependencies []:
  - @oktis-works/validation@0.1.7

## 0.1.6

### Patch Changes

- Updated dependencies []:
  - @oktis-works/validation@0.1.6

## 0.1.5

### Patch Changes

- Updated dependencies []:
  - @oktis-works/validation@0.1.5

## 0.1.4

### Patch Changes

- Updated dependencies []:
  - @oktis-works/validation@0.1.4

## 0.1.3

### Patch Changes

- Updated dependencies []:
  - @oktis-works/validation@0.1.3
