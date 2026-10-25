# @oktis-works/auth

## 0.8.3

### Patch Changes

- Complete the provider-aware migration lifecycle, CLI database workflows, generated MySQL and MariaDB assets, audit safeguards, and GPL-2.0-or-later licensing metadata.
- Updated dependencies
  - @oktis-works/config@0.6.5
  - @oktis-works/core@0.15.1
  - @oktis-works/database@0.14.3
  - @oktis-works/types@0.9.4

## 0.8.2

### Patch Changes

- Updated dependencies
  - @oktis-works/core@0.15.0
  - @oktis-works/database@0.14.2
  - @oktis-works/types@0.9.3

## 0.8.1

### Patch Changes

- Updated dependencies
  - @oktis-works/core@0.14.0

## 0.8.0

### Minor Changes

- ### Features
  
  - **Theme Config Export/Import**: Export theme config as JSON file, import with validation (merge/replace modes)
  - **Config History/Versioning**: Automatic history tracking via `theme_config_versions` table, with REST API for history and restore
  - **Permission `theme:customize`**: New granular permission for theme config operations (separate from `theme:update`)
  - **Audit Log**: Automatic history entries on config changes with user tracking
  - **Restore Defaults**: One-click reset to manifest defaults
  
  ### Database
  
  - New migration `V022__core__theme_config_history.sql` creates `theme_config_versions` table with RLS
  
  ### API
  
  - `GET /themes/:id/config/export` - Export config as downloadable JSON
  - `POST /themes/:id/config/import` - Import config with merge/replace modes
  - `GET /themes/:id/config/history` - Paginated config history
  - `POST /themes/:id/config/restore` - Restore specific version
  - `POST /themes/:id/config/restore-defaults` - Reset to manifest defaults
  
  ### Permissions
  
  - New `theme:customize` permission added to TENANT_ADMIN role
  - Config routes (`PATCH/GET/POST /themes/:id/config/*`) now require `theme:customize` instead of `theme:update`

### Patch Changes

- Updated dependencies
  - @oktis-works/core@0.13.0

## 0.7.10

### Patch Changes

- Updated dependencies
  - @oktis-works/core@0.12.0

## 0.7.9

### Patch Changes

- Updated dependencies
  - @oktis-works/database@0.14.0
  - @oktis-works/core@0.11.5

## 0.7.8

### Patch Changes

- Updated dependencies
  - @oktis-works/database@0.13.0
  - @oktis-works/core@0.11.3

## 0.7.7

### Patch Changes

- Updated dependencies
- Updated dependencies
  - @oktis-works/core@0.11.0
  - @oktis-works/database@0.12.0

## 0.7.6

### Patch Changes

- Updated dependencies [641e556]
  - @oktis-works/database@0.11.0
  - @oktis-works/core@0.10.3

## 0.7.5

### Patch Changes

- Updated dependencies
  - @oktis-works/core@0.10.0
  - @oktis-works/database@0.10.0

## 0.7.4

### Patch Changes

- Updated dependencies
  - @oktis-works/core@0.9.0
  - @oktis-works/database@0.9.0

## 0.7.3

### Patch Changes

- Updated dependencies
  - @oktis-works/core@0.8.0

## 0.7.2

### Patch Changes

- Updated dependencies [12d1963]
- Updated dependencies [12d1963]
- Updated dependencies
  - @oktis-works/core@0.7.0
  - @oktis-works/types@0.9.0
  - @oktis-works/database@0.8.0
  - @oktis-works/config@0.6.4

## 0.7.1

### Patch Changes

- Updated dependencies
  - @oktis-works/core@0.6.0
  - @oktis-works/types@0.8.0
  - @oktis-works/config@0.6.3
  - @oktis-works/database@0.7.1

## 0.7.0

### Minor Changes

- Fix version bump: release 0.15.0 instead of reusing 0.14.0 tag.

### Patch Changes

- Updated dependencies
  - @oktis-works/types@0.7.0
  - @oktis-works/database@0.7.0
  - @oktis-works/config@0.6.2
  - @oktis-works/core@0.5.15

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

### Patch Changes

- Updated dependencies
  - @oktis-works/types@0.6.0
  - @oktis-works/database@0.6.0
  - @oktis-works/config@0.6.1
  - @oktis-works/core@0.5.14

## 0.5.6

### Patch Changes

- Updated dependencies [3da0733]
  - @oktis-works/config@0.6.0
  - @oktis-works/core@0.5.13
  - @oktis-works/database@0.5.8

## 0.5.5

### Patch Changes

- Updated dependencies []:
  - @oktis-works/config@0.5.5
  - @oktis-works/core@0.5.5
  - @oktis-works/database@0.5.5
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
  - @oktis-works/config@0.2.0
  - @oktis-works/core@0.2.0
  - @oktis-works/database@0.2.0
  - @oktis-works/types@0.2.0

## 0.1.14

### Patch Changes

- Updated dependencies []:
  - @oktis-works/core@0.1.14
  - @oktis-works/config@0.1.14
  - @oktis-works/database@0.1.14
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
  - @oktis-works/config@0.1.13
  - @oktis-works/core@0.1.13
  - @oktis-works/database@0.1.13
  - @oktis-works/types@0.1.13

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
- Updated dependencies []:
  - @oktis-works/database@0.1.12
  - @oktis-works/core@0.1.12
  - @oktis-works/types@0.1.12
  - @oktis-works/config@0.1.12

## 0.1.11

### Patch Changes

- Updated dependencies []:
  - @oktis-works/core@0.1.11
  - @oktis-works/types@0.1.11
  - @oktis-works/config@0.1.11
  - @oktis-works/database@0.1.11

## 0.1.10

### Patch Changes

- Updated dependencies []:
  - @oktis-works/database@0.1.10
  - @oktis-works/core@0.1.10
  - @oktis-works/config@0.1.10
  - @oktis-works/types@0.1.10

## 0.1.9

### Patch Changes

- Updated dependencies []:
  - @oktis-works/database@0.1.9
  - @oktis-works/core@0.1.9
  - @oktis-works/types@0.1.9
  - @oktis-works/config@0.1.9

## 0.1.8

### Patch Changes

- Updated dependencies []:
  - @oktis-works/core@0.1.8
  - @oktis-works/types@0.1.8
  - @oktis-works/config@0.1.8
  - @oktis-works/database@0.1.8

## 0.1.7

### Patch Changes

- Updated dependencies []:
  - @oktis-works/core@0.1.7
  - @oktis-works/types@0.1.7
  - @oktis-works/config@0.1.7
  - @oktis-works/database@0.1.7

## 0.1.6

### Patch Changes

- Updated dependencies []:
  - @oktis-works/core@0.1.6
  - @oktis-works/types@0.1.6
  - @oktis-works/config@0.1.6
  - @oktis-works/database@0.1.6

## 0.1.5

### Patch Changes

- Updated dependencies []:
  - @oktis-works/core@0.1.5
  - @oktis-works/types@0.1.5
  - @oktis-works/config@0.1.5
  - @oktis-works/database@0.1.5

## 0.1.4

### Patch Changes

- Updated dependencies []:
  - @oktis-works/config@0.1.4
  - @oktis-works/core@0.1.4
  - @oktis-works/database@0.1.4
  - @oktis-works/types@0.1.4

## 0.1.3

### Patch Changes

- Updated dependencies []:
  - @oktis-works/core@0.1.3
  - @oktis-works/types@0.1.3
  - @oktis-works/config@0.1.3
  - @oktis-works/database@0.1.3
