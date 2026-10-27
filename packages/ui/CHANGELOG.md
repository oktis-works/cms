# @oktis-works/ui

## 0.6.0

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

## 0.5.10

### Patch Changes

- Complete the provider-aware migration lifecycle, CLI database workflows, generated MySQL and MariaDB assets, audit safeguards, and GPL-2.0-or-later licensing metadata.
- Updated dependencies
  - @oktis-works/validation@0.8.1

## 0.5.9

### Patch Changes

- Updated dependencies
  - @oktis-works/validation@0.8.0

## 0.5.8

### Patch Changes

- Updated dependencies [12d1963]
  - @oktis-works/validation@0.7.0

## 0.5.7

### Patch Changes

- Updated dependencies
  - @oktis-works/validation@0.6.0

## 0.5.6

### Patch Changes

- Fix SSR crash "document is not defined" on Modal cleanup during server render

## 0.5.5

### Patch Changes

- Updated dependencies []:
  - @oktis-works/validation@0.5.5

## 0.3.3

### Patch Changes

- Patch alignment 0.3.3 (interactive install prompt + live dependency loader shipped via `@oktis-works/cms`)

## 0.3.2

### Patch Changes

- Fix `exports` condition order so Node/Astro SSR resolves the SSR build (`dist/server.js`) instead of the client build — fixes "Client-only API called on the server side" (admin HTTP 500) during island SSR

## 0.3.1

### Patch Changes

- Fix @oktis-works/admin missing bin/admin.js entry point for standalone Astro server

## 0.3.0

### Minor Changes

- Release 0.3.0, aligned with tag v0.3.0: interactive arrow-key menus and English
  output across the `okcms` CLI, plus a third deploy target (simple containers in
  front of the proxy) next to blue/green and PM2.

## 0.2.0

### Minor Changes

- Alinhamento da release 0.2.0: dependência interna `@oktis-works/validation` republicada como `^0.2.0` (os re-exports de `validation.ts` não mudaram).

## 0.1.6

### Patch Changes

- Fases A–D do TODO: publisher real nas rotas de conteúdo (publish/unpublish com revisions + eventBus + cache), QueueProducer no core com degradação silenciosa (fila opcional), processamento real de mídia com sharp e build Docker real no worker, renderização real do site público (templates do tema + settings), design-system Solid no @oktis-works/ui (Button/Input/Select/Card/Badge/Modal/Toast/Table/Pagination) consumido pelo admin, fluxo de auth híbrido completo (tokens no body + cookies HttpOnly) e limpeza de legado (rota /me duplicada, stub de validação).

## 0.1.5

### Patch Changes

- Log de start do admin com URL correta: `http://` no lugar de `https://` (o `@astrojs/node` calcula o protocolo com `server instanceof https.Server`, que sob Bun responde `true` até para `http.Server`) e sem a linha `network:` com IP interno de WSL. Deps internas publicadas como range `^X.Y.Z` em vez de pin exato — o consumidor resolve a versão atual via `bun update` sem cópias aninhadas stale (ex.: `api` preso em `database@0.1.3`) e dependentes não precisam ser republicados a cada patch.
- Updated dependencies []:
  - @oktis-works/validation@0.1.11

## 0.1.4

### Patch Changes

- Tenant context usa set_config parametrizado no setTenantContext e no migration runner (`SET x = $1` não existe no Postgres — syntax error 42601 quebrava login e X-Tenant-ID); ui atualiza solid-js para 1.9.15 (cópia única com o admin em Astro 7).

## 0.1.3

### Patch Changes

- Scaffold zero-config: `okcms init` agora gera o `package.json` do projeto com os apps do OkCMS (@oktis-works/api, admin, web) já como dependências na versão do CLI e instala tudo automaticamente (bun, com fallback para npm). `okcms update` passa a funcionar de imediato e o `okcms build` degrada com mensagem clara fora de workspaces (os apps vêm pré-compilados do npm).
- Updated dependencies []:
  - @oktis-works/validation@0.1.3
