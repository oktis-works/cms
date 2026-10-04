# @oktis-works/api

## 0.1.7

### Patch Changes

- Fases A–D do TODO: publisher real nas rotas de conteúdo (publish/unpublish com revisions + eventBus + cache), QueueProducer no core com degradação silenciosa (fila opcional), processamento real de mídia com sharp e build Docker real no worker, renderização real do site público (templates do tema + settings), design-system Solid no @oktis-works/ui (Button/Input/Select/Card/Badge/Modal/Toast/Table/Pagination) consumido pelo admin, fluxo de auth híbrido completo (tokens no body + cookies HttpOnly) e limpeza de legado (rota /me duplicada, stub de validação).
- Updated dependencies []:
  - @oktis-works/core@0.1.14
  - @oktis-works/auth@0.1.14
  - @oktis-works/config@0.1.14
  - @oktis-works/database@0.1.14
  - @oktis-works/types@0.1.14

## 0.1.6

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
  - @oktis-works/auth@0.1.13
  - @oktis-works/core@0.1.13
  - @oktis-works/database@0.1.13
  - @oktis-works/types@0.1.13

## 0.1.5

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
  - @oktis-works/auth@0.1.12
  - @oktis-works/core@0.1.12
  - @oktis-works/types@0.1.12
  - @oktis-works/config@0.1.12

## 0.1.4

### Patch Changes

- Log de start do admin com URL correta: `http://` no lugar de `https://` (o `@astrojs/node` calcula o protocolo com `server instanceof https.Server`, que sob Bun responde `true` até para `http.Server`) e sem a linha `network:` com IP interno de WSL. Deps internas publicadas como range `^X.Y.Z` em vez de pin exato — o consumidor resolve a versão atual via `bun update` sem cópias aninhadas stale (ex.: `api` preso em `database@0.1.3`) e dependentes não precisam ser republicados a cada patch.
- Updated dependencies []:
  - @oktis-works/validation@0.1.11
  - @oktis-works/core@0.1.11
  - @oktis-works/types@0.1.11
  - @oktis-works/auth@0.1.11
  - @oktis-works/config@0.1.11
  - @oktis-works/database@0.1.11

## 0.1.3

### Patch Changes

- Scaffold zero-config: `okcms init` agora gera o `package.json` do projeto com os apps do OkCMS (@oktis-works/api, admin, web) já como dependências na versão do CLI e instala tudo automaticamente (bun, com fallback para npm). `okcms update` passa a funcionar de imediato e o `okcms build` degrada com mensagem clara fora de workspaces (os apps vêm pré-compilados do npm).
- Updated dependencies []:
  - @oktis-works/validation@0.1.3
  - @oktis-works/core@0.1.3
  - @oktis-works/types@0.1.3
  - @oktis-works/auth@0.1.3
  - @oktis-works/config@0.1.3
  - @oktis-works/database@0.1.3
