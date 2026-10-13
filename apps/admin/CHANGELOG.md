# @oktis-works/admin

## 0.8.0

### Minor Changes

- Bump to 0.8.0 for monorepo sync with CLI 0.8.0 (DB engine selection + container control).

## 0.7.0

### Minor Changes

- Bump to 0.7.0 for monorepo sync with CLI 0.7.0 (interactive wizard release).

## 0.6.6

### Patch Changes

- Settings → General: idioma agora lista TODOS os locales suportados (18) com bandeiras, e ao salvar aplica de verdade — grava o cookie `admin_locale` e recarrega a página nas traduções novas; timezone virou dropdown buscável estilo WordPress `(UTC-03:00) America/Sao_Paulo` (zonas IANA completas, ordenadas por offset, salva o id IANA, pré-preenche com o fuso do navegador). Field builder: as abas de configuração do campo (General/Validation/Presentation/…) não voltam mais para General a cada interação — memória de aba por field + `patchField` preservando referências (sem remontar linhas irmãs).

## 0.6.5

### Patch Changes

- Sidebar: estilos do DashboardLayout agora são `is:global` — os links dinâmicos de content-types (criados por JS) não recebem data-astro-cid e ficavam sem estilo (link dourado padrão, desalinhado); agora são idênticos aos links normais. Modais do field-builder (fb-modal/fb-browse-modal) enquadrados entre a AdminBar e o rodapé com altura ajustável e corpo com scroll. Core: content type CORE `page` com labels em inglês (Pages/Page) — alinhado ao seed V003 (migration V009 corrige bancos existentes com os labels em português).

## 0.6.4

### Patch Changes

- Fixes de layout/estilização: links de content-types na sidebar iguais aos demais; grid de formulários global (post-types, taxonomies e webhooks agora renderizam corretamente dentro das ilhas Solid); layout formulário-esquerda/tabela-direita em post-types e taxonomies com tabelas em card; checkbox de Active dos webhooks corrigido; seletor de tipo de campo (field-type-picker) estilizado; títulos duplicados removidos em /themes e /plugins; widgets do dashboard alinhados ao container dos cards; h3 duplicado removido em Settings → General.

## 0.6.3

### Patch Changes

- Modal agora se enquadra na viewport menos a barra preta e o rodapé (com folga), em vez de ser cortado por eles; altura máxima ajustável via CSS vars (--admin-bar-h / --admin-footer-h)

## 0.6.2

### Patch Changes

- Fix white bar below the black nav header: body padding-top was stacking on top of the viewport-propagated html padding (double 46px offset)

## 0.6.1

### Patch Changes

- Fix SSR crash "document is not defined" on Modal cleanup during server render
- Updated dependencies []:
  - @oktis-works/ui@0.5.6

## 0.6.0

### Minor Changes

- Unify admin page layouts to match /settings/custom-fields pattern
  
  ## Changes
  - Created shared `PageHeader` component with consistent layout (eyebrow, title, description, actions, toolbar)
  - Applied PageHeader to all settings pages, users, media, content, plugins, themes pages
  - Removed white background bar between header and sidebar by making main-content transparent
  - Moved content padding from .content-wrapper to .content for cleaner layout
  - All pages now follow the same visual pattern as /settings/custom-fields

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
  - @oktis-works/plugin-sdk@0.5.5
  - @oktis-works/types@0.5.5
  - @oktis-works/ui@0.5.5
  - @oktis-works/validation@0.5.5
