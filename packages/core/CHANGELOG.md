# @oktis-works/core

## 0.1.13

### Patch Changes

- Updated dependencies []:
  - @oktis-works/config@0.1.13
  - @oktis-works/database@0.1.13
  - @oktis-works/plugin-runtime@0.1.13
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
  - @oktis-works/types@0.1.12
  - @oktis-works/config@0.1.12
  - @oktis-works/plugin-runtime@0.1.12

## 0.1.11

### Patch Changes

- Updated dependencies []:
  - @oktis-works/validation@0.1.11
  - @oktis-works/plugin-runtime@0.1.11
  - @oktis-works/types@0.1.11
  - @oktis-works/config@0.1.11
  - @oktis-works/database@0.1.11

## 0.1.10

### Patch Changes

- Updated dependencies []:
  - @oktis-works/database@0.1.10
  - @oktis-works/config@0.1.10
  - @oktis-works/plugin-runtime@0.1.10
  - @oktis-works/types@0.1.10

## 0.1.9

### Patch Changes

- Updated dependencies []:
  - @oktis-works/database@0.1.9
  - @oktis-works/validation@0.1.9
  - @oktis-works/plugin-runtime@0.1.9
  - @oktis-works/types@0.1.9
  - @oktis-works/config@0.1.9

## 0.1.8

### Patch Changes

- Updated dependencies []:
  - @oktis-works/validation@0.1.8
  - @oktis-works/plugin-runtime@0.1.8
  - @oktis-works/types@0.1.8
  - @oktis-works/config@0.1.8
  - @oktis-works/database@0.1.8

## 0.1.7

### Patch Changes

- Updated dependencies []:
  - @oktis-works/validation@0.1.7
  - @oktis-works/plugin-runtime@0.1.7
  - @oktis-works/types@0.1.7
  - @oktis-works/config@0.1.7
  - @oktis-works/database@0.1.7

## 0.1.6

### Patch Changes

- Updated dependencies []:
  - @oktis-works/validation@0.1.6
  - @oktis-works/plugin-runtime@0.1.6
  - @oktis-works/types@0.1.6
  - @oktis-works/config@0.1.6
  - @oktis-works/database@0.1.6

## 0.1.5

### Patch Changes

- Updated dependencies []:
  - @oktis-works/validation@0.1.5
  - @oktis-works/plugin-runtime@0.1.5
  - @oktis-works/types@0.1.5
  - @oktis-works/config@0.1.5
  - @oktis-works/database@0.1.5

## 0.1.4

### Patch Changes

- Updated dependencies []:
  - @oktis-works/config@0.1.4
  - @oktis-works/validation@0.1.4
  - @oktis-works/database@0.1.4
  - @oktis-works/plugin-runtime@0.1.4
  - @oktis-works/types@0.1.4

## 0.1.3

### Patch Changes

- Updated dependencies []:
  - @oktis-works/validation@0.1.3
  - @oktis-works/plugin-runtime@0.1.3
  - @oktis-works/types@0.1.3
  - @oktis-works/config@0.1.3
  - @oktis-works/database@0.1.3
