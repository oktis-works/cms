# @oktis-works/config

## 0.6.6

### Patch Changes

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
- Updated dependencies
  - @oktis-works/types@0.10.0

## 0.6.5

### Patch Changes

- Complete the provider-aware migration lifecycle, CLI database workflows, generated MySQL and MariaDB assets, audit safeguards, and GPL-2.0-or-later licensing metadata.
- Updated dependencies
  - @oktis-works/types@0.9.4

## 0.6.4

### Patch Changes

- Updated dependencies [12d1963]
  - @oktis-works/types@0.9.0

## 0.6.3

### Patch Changes

- Updated dependencies
  - @oktis-works/types@0.8.0

## 0.6.2

### Patch Changes

- Updated dependencies
  - @oktis-works/types@0.7.0

## 0.6.1

### Patch Changes

- Updated dependencies
  - @oktis-works/types@0.6.0

## 0.6.0

### Minor Changes

- 3da0733: fix(rate-limit): 429 em rajada e "logout" falso no admin
  
  O admin estourava o rate limit carregando o dashboard (~21 requisições por
  página, com N+1 e /auth/me triplicado) e todos os clientes dividiam um único
  balde `platform:unknown` — a chave vinha de X-Forwarded-For forjável ou
  retornava literalmente "unknown". O guarda de sessão trataba qualquer erro
  (inclusive 429) como "usuário deslogado" e redirecionava para /login.
  
  API:
  - rate limiting por classe: anônimo por IP real (socket, ou XFF apenas
    quando o par é proxy de confiança; `TRUST_PROXY`/`TRUSTED_PROXIES`),
    autenticado por user id da sessão (JWT verificado, sem banco) e
    credenciais com limiter dedicado por IP + e-mail (10 tentativas / 5min);
  - `X-Tenant-ID` e `X-Forwarded-For` deixam de compor a chave (bypass);
  - escritas custam 5x, mídia estática e bootstrap de CSRF são isentos,
    buckets expirados são varridos e há teto de chaves vivas;
  - `RATE_LIMIT_WINDOW_SECONDS` é o nome canônico (`_MS` vira alias legado);
  - cookie `session_expires_at` (não HttpOnly) emitido em login/refresh e
    `/auth/me` devolve `locale` (sessão + idioma em uma chamada);
  - `GET /content?include=author` expande autores em uma query (anti N+1);
  - nginx: X-Real-IP/X-Forwarded-For também em `/storage/` e `/themes/`.
  
  Admin:
  - `ApiError` tipado e `checkSession()` tri-estado: só um 401 definitivo
    redireciona; 429/5xx/rede viram `unavailable` (sem logout falso);
  - 429 sinalizado na UI com aviso, e leituras repetem uma vez após o
    `Retry-After` curto (nada trava a interface);
  - refresh proativo do access token via cookie `session_expires_at`;
  - lock de refresh entre abas acorda pelo `storage` event (antes: polling
    com TTL de 10s que travava abas órfãs);
  - sessão e idioma resolvidos no SSR (uma chamada server-side; o login
    não gasta nenhuma), CSRF em memória por 60s, proxy injeta o IP real.
  
  Config/CLI:
  - `RATE_LIMIT_DEFAULTS` em `@oktis-works/config` como fonte única; o wizard
    grava os mesmos defaults que a API lê (antes: wizard escrevia 100/60s e o
    código lia 300/60s com outro nome de variável).

## 0.5.5

### Patch Changes

- Fix "Missing refresh token" error on login in local development
  
  ## Problem
  When running OkCMS locally with `okcms start`, the admin (port 3011) and API (port 3000) run on different ports. The auth cookies (including refresh_token) were set with `SameSite=lax`, which blocks cookies on cross-origin fetch requests. This caused the refresh token to not be sent when the admin made API calls, resulting in "Missing refresh token" errors.
  
  ## Solution
  1. **Added Vite proxy to admin** (`apps/admin/astro.config.mjs`): In development, the admin now proxies `/api/*` requests to the API server. This makes admin and API same-origin (both on port 3011), allowing cookies to work with `SameSite=lax`.
  
  2. **Updated scaffold** (`packages/cli/src/scaffold.ts`): New projects now get a complete `.env` with all auth configuration variables:
     - `AUTH_COOKIE_DOMAIN`, `AUTH_COOKIE_SAMESITE`, `AUTH_COOKIE_SECURE`
     - `AUTH_COOKIE_ACCESS_MAXAGE`, `AUTH_COOKIE_REFRESH_MAXAGE`
     - `JWT_EXPIRES_IN=15m` (access token), `REFRESH_TOKEN_EXPIRES_IN=7d` (refresh token)
     - `BCRYPT_ROUNDS`, `AUTH_CSRF_*` settings
     - `ADMIN_API_PROXY_TARGET` for the Vite proxy
     - `PUBLIC_API_URL=/api` to use relative URLs via proxy
  
  3. **Fixed JWT expiry confusion** in template `env.example`: Was `JWT_EXPIRES_IN=7d` (wrong for access token), now correctly `JWT_EXPIRES_IN=15m` and `REFRESH_TOKEN_EXPIRES_IN=7d`.
  
  4. **Updated admin API client** (`apps/admin/src/lib/api.ts`): Supports relative `PUBLIC_API_URL` (e.g., `/api`) for proxy usage.
  
  ## For existing projects
  Add to `.env`:
  ```bash
  # Enable Vite proxy (simpler than lvh.me)
  PUBLIC_API_URL=/api
  ADMIN_API_PROXY_TARGET=http://localhost:3000
  # Ensure these are set:
  AUTH_COOKIE_SAMESITE=lax
  AUTH_COOKIE_SECURE=false
  JWT_EXPIRES_IN=15m
  REFRESH_TOKEN_EXPIRES_IN=7d
  ```
  Then restart with `okcms start`.
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

- Segurança: tokens em cookies HttpOnly (não localStorage) + CSRF double-submit
  
  - Login/register/logout movidos para cookies HttpOnly + Secure + SameSite (configurável via AUTH_COOKIE_SAMESITE: strict|lax|none)
  - Cookie CSRF legível pelo JS (httpOnly: false) — double-submit header X-CSRF-Token === cookie
  - CSRF: clientes Bearer (API-first) isentos; sem Origin/Referer (curl/SDK/CI) isento; cross-port via TRUSTED_ORIGINS
  - Auto-refresh de access token via cookie refresh_token em 401
  - GET /auth/me para verificação de sessão (cookie HttpOnly)
  - Middleware auth aceita Bearer OU cookie access_token
  - Hono 4.0.0 → 4.13.12 (API oficial hono/cookie: setCookie/getCookie/deleteCookie)
  - admin: api-client com credentials: include, session guard via /me, zero localStorage
  - Tests: 486 passando; E2E API 33/33; Admin Playwright 16/16
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

- Conexão com o banco com dois formatos à escolha do usuário: `DATABASE_URL` (tem precedência) ou variáveis separadas `DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD`. `.env` é a fonte única de conexão — `okcms.config.json` deixou de ter bloco `database` (mantém só estrutura: nome, ports, storage, dirs). `okcms doctor` aceita os dois formatos (check `database` + `db-tcp`, agora também `mysql://`).
- Updated dependencies []:
  - @oktis-works/types@0.1.4

## 0.1.3

### Patch Changes

- Updated dependencies []:
  - @oktis-works/types@0.1.3
