# @oktis-works/api-client

## 0.7.4

### Patch Changes

- Updated dependencies
  - @oktis-works/types@0.10.0

## 0.7.3

### Patch Changes

- Complete the provider-aware migration lifecycle, CLI database workflows, generated MySQL and MariaDB assets, audit safeguards, and GPL-2.0-or-later licensing metadata.
- Updated dependencies
  - @oktis-works/types@0.9.4

## 0.7.2

### Patch Changes

- Updated dependencies [12d1963]
  - @oktis-works/types@0.9.0

## 0.7.1

### Patch Changes

- Updated dependencies
  - @oktis-works/types@0.8.0

## 0.7.0

### Minor Changes

- Fix version bump: release 0.15.0 instead of reusing 0.14.0 tag.

### Patch Changes

- Updated dependencies
  - @oktis-works/types@0.7.0

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
