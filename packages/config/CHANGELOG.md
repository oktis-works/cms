# @oktis-works/config

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
