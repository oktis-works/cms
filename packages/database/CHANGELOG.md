# @oktis-works/database

## 0.14.7

### Patch Changes

- Fix migration runner: always sync schema_bootstrap.schema_version against applied ledger
  
  The migration runner only updated `schema_bootstrap.schema_version` when migrations
  were applied in the current run (`result.applied.length > 0`). If a `core_schema`
  migration was applied in a previous run but the baseline bump was missed (e.g. empty
  tenant context), the schema_version stayed behind. On the next run, `baselineVersion`
  was still the old value, so the same migration was applied again.
  
  Now the runner syncs `schema_version` against ALL applied `core_schema` migrations in
  the ledger (not just this run's), so a previously-applied migration correctly advances
  the baseline and prevents re-application. The `content_types_source_admin` migration
  (V026) SQL is idempotent (`DROP CONSTRAINT IF EXISTS` + `ADD CONSTRAINT`), so re-running
  it is harmless, but the baseline sync prevents unnecessary re-execution.

## 0.14.6

### Patch Changes

- Fix postgres upgrade acceptance script version expectation to V026
  
  The `postgres-upgrade-acceptance.mjs` script expected `schema_version = 'V025'` but the new migration `V026__core__content_types_source_admin.sql` advances the schema to V026. Updated the acceptance script to expect V026 so CI passes.

## 0.14.5

### Patch Changes

- Fix content_types source CHECK constraint to accept 'ADMIN'
  
  The `content_types` table CHECK constraint only accepted `'CORE'` and `'PLUGIN'`,
  but the API creates admin-defined content types with `source = 'ADMIN'`, causing
  `new row for relation "content_types" violates check constraint "content_types_source_check"`.
  
  - Updated `schema.sql`, `schema.mysql.sql`, `schema.mariadb.sql` to include `'ADMIN'` in the CHECK constraint
  - Added migration `V026__core__content_types_source_admin.sql` to drop and recreate the constraint on existing databases

## 0.14.4

### Patch Changes

- Fix PostgreSQL upgrade acceptance hang and three related bugs
  
  - **connection.ts**: `postgresConnection` now passes `max: config.maxConnections ?? 10`
    instead of `max: undefined` to postgres.js. When `maxConnections` is not set,
    postgres.js treated `max: undefined` as a single-connection pool, causing
    `reserve()` to deadlock against `assertSupportedServerVersion()` (which uses the
    same pool) — the process would hang indefinitely with no Postgres activity.
  
  - **connection.ts**: `wrapReservedConnection` adds a `.begin()` shim to the object
    returned by `pool.reserve()`. The postgres.js reserved connection does not expose
    `.begin()`, but the migration runner calls `sql.begin()` on the connection it
    receives (including the reserved one used for the session-level advisory lock).
    The shim implements `BEGIN` / `COMMIT` / `ROLLBACK` on the same session.
  
  - **preflight.ts**: The regex that extracts affected table names from migration SQL
    (`/\b(?:UPDATE|DELETE\s+FROM)\s+([a-z_][a-z0-9_]*)/gi`) matched `DO UPDATE SET`
    inside `ON CONFLICT ... DO UPDATE SET`, capturing `set` as a table name. The
    runner then executed `SELECT COUNT(*) FROM set`, which Postgres rejects with
    `relation "set" does not exist`. Fixed by filtering out matches where the
    captured name is `set`.
  
  - **runner.ts**: After applying `core_schema` migrations, `schema_bootstrap.schema_version`
    is now advanced to the highest applied core version. Previously, a database
    starting at V018 would reach V025 via migrations but still report V018 in
    `schema_bootstrap`, causing the acceptance script assertion to fail.
  
  - **postgres-upgrade-acceptance.mjs**: Moved `closeConnection()` into the `finally`
    block so it always runs (including on assertion failure), and removed the
    non-existent `status` column from the `UPDATE schema_bootstrap` statement.

## 0.14.3

### Patch Changes

- Complete the provider-aware migration lifecycle, CLI database workflows, generated MySQL and MariaDB assets, audit safeguards, and GPL-2.0-or-later licensing metadata.
- Updated dependencies
  - @oktis-works/config@0.6.5
  - @oktis-works/types@0.9.4

## 0.14.2

### Patch Changes

- Unify standard and custom content fields across definitions, persistence, editing, validation, and theme delivery.
- @oktis-works/types@0.9.3

## 0.14.1

### Patch Changes

- Fix theme lifecycle, preview, rendering, security, tenant scoping, configuration validation, SDK contracts, pagination, and runtime inheritance behavior.
- Updated dependencies
  - @oktis-works/types@0.9.1

## 0.14.0

### Minor Changes

- ### Fixes
  
  - **seedDemoContent**: Updated `makeBody()` to include `content` key (mirroring `html`) so classic editor reads content back; fixed body insertion to use `JSON.stringify(body)` with `$5::jsonb` cast (correctly parses to jsonb object, avoiding double-encoding)
  - **seedCoreData**: Added `seedDefaultFieldGroups()` call in CLI's `prepareDb` so fresh installs get core-fields-post and core-fields-page groups (title, slug, content, excerpt, featured_image, seo_title, seo_description, status, author) without requiring migrations directory
  - **Exports**: Exported `seedDefaultFieldGroups` from package entry point
  
  ### Related
  
  - Fresh `bunx @oktis-works/cms init` projects now have field groups populated → custom fields section appears in admin
  - Demo content body no longer double-encoded in fresh installs

## 0.13.1

### Patch Changes

- Fix seeded menus landing with swapped name/slug
  
  The demo seed's menu INSERT declared the columns as `(name, slug)` but bound
  the parameters in `(slug, name)` order, so every seeded menu landed with
  `slug='Main Menu'`/`'Footer'` and `name='header'`/`'footer'`. The theme's
  `menus.header` lookup found nothing and the header/footer navigation
  rendered without any links.
  
  - The INSERT now binds `name` → name column and `slug` → slug column.
  - The seed cleanup also deletes the broken legacy rows (swapped slug/name),
    so re-running the seed repairs existing projects.
  
  Regression test asserts the INSERT binding and the extended cleanup.

## 0.13.0

### Minor Changes

- English demo seed aligned with the redesigned default theme
  
  All seeded demo content is now English-only (repo language standard):
  settings (siteTitle "My Site", description, `language: en`, `timezone: UTC`),
  pages (Home, About, Blog), posts (My First Blog Post, Getting Started with
  OkCMS), menus (Main Menu, Footer) and role display names.
  
  - The seeded homepage body now uses the redesigned theme's section classes
    (hero with CTAs, about preview, contact) and no longer includes a static
    "latest posts" placeholder — the front-page template renders real posts.
  - The idempotency cleanup now also deletes the legacy Portuguese slugs
    (`sobre`, `primeiro-post`, `segundo-post`), so re-seeding a pre-i18n
    project leaves no orphaned demo rows.
  - Reading settings seed uses `timezone_string: UTC` / `gmt_offset: 0`.

## 0.12.1

### Patch Changes

- Fix double-encoded demo content bodies and repair existing rows
  
  The demo seed inserted `content.body` with `to_jsonb($5::text)` after
  `JSON.stringify`, which stores the document as a jsonb STRING (the JSON text
  becomes the string value) instead of a jsonb object. The site renderer then
  received the raw JSON text and rendered pages with an empty body.
  
  - Seed upserts (pages and posts) now use the `$5::jsonb` cast, which parses
    the serialized document into a real jsonb object.
  - New migration `V021__core__fix_double_encoded_content_body` converts
    existing double-encoded rows in place. Safe and idempotent: only string
    bodies whose inner text parses as a JSON object/array are converted.

## 0.12.0

### Minor Changes

- Fix demo content seed issues and add theme activation
  
  - Added unique constraint for menus (tenant_id, slug) - V020 migration
  - Fixed demo content seed to use CTE-based upserts instead of ON CONFLICT to avoid constraint caching issues with connection pooling
  - Fixed pages, posts, menus, and settings inserts to use CTE-based upserts (WITH upsert AS UPDATE ... INSERT ... WHERE NOT EXISTS)
  - Fixed tenant_users role lookup to accept global roles (tenant_id IS NULL)
  - Fixed user creation ON CONFLICT to properly handle existing users
  - Added unique constraint for content (tenant_id, type, slug) - V019 migration with safe DO block
  - Fixed seed: CTE-based upserts for all entities (content, menus, settings)
  - Fixed tenant_users role lookup to accept global roles (tenant_id IS NULL)
  - Fixed user creation ON CONFLICT to properly handle existing users

## 0.11.0

### Minor Changes

- 641e556: Fix demo content seed issues
  
  - Add unique constraint for menus (tenant_id, slug) - V020 migration
  - Fix demo content seed to use CTE-based upserts instead of ON CONFLICT to avoid constraint caching issues with connection pooling
  - Fix pages, posts, menus, and settings inserts to use CTE-based upserts (WITH upsert AS UPDATE ... INSERT ... WHERE NOT EXISTS)
  - Fix menus table unique constraint (V020) for ON CONFLICT (tenant_id, slug)
  - Fix content seed to use CTE-based upsert (WITH upsert AS UPDATE ... INSERT ... WHERE NOT EXISTS) to avoid constraint caching issues with connection pooling
  - Fix tenant_users role lookup to accept global roles (tenant_id IS NULL)
  - Fix user creation ON CONFLICT to properly handle existing users

## 0.10.2

### Patch Changes

- 7df7caa: Fix demo content seed issues
  
  - Add unique constraint for content (tenant_id, type, slug) - V019 migration
  - Fix seed demo content ON CONFLICT for users email and tenant_users
  - Fix seed demo content ON CONFLICT for content (tenant_id, type, slug)
  - Fix menus seed ON CONFLICT
  - Fix reading settings ON CONFLICT

## 0.10.1

### Patch Changes

- Fix unique constraint for content slug (tenant_id, type, slug)
  
  Required for demo content seed to work with ON CONFLICT specification.
  The schema now has a unique index on (tenant_id, type, slug) which allows the seed to work properly.

## 0.10.0

### Minor Changes

- Add WordPress-style timezone system (OK CMS nomenclature)
  
  - **Core (timezone service)**: New `okForceUtcRuntime()`, `okDate()`, `okCurrentTime()`, `okGetTimezoneOffset()`, `okConvertToGmt()`, `okConvertFromGmt()`, `okGetTimezoneAbbreviation()`, `okIsDstActive()`, `okGetCommonTimezones()`, `okGetManualOffsets()`
  - **Bootstrap integration**: Forces UTC runtime on startup (equivalent to WP's `date_default_timezone_set('UTC')`)
  - **Database**: Migration V018 adds `published_at_gmt` column to content table for dual date storage (local + GMT)
  - **Dual timezone config**: IANA city identifiers (DST auto) + manual UTC offsets
  - **Settings**: `timezone_string` (IANA) and `gmt_offset` (manual) with priority: timezone_string > gmt_offset
  - **Cache**: Config loaded from settings with in-memory cache
  - **Tests**: 21 new timezone service tests covering DST, offsets, conversions, formatting
  
  Breaking: Requires running migration V018. Default timezone is America/Sao_Paulo.

## 0.9.0

### Minor Changes

- Implement Static Front Page (WP-style), demo content seed, and redesigned default theme
  
  - **Theme Runtime (core):** Added Static Front Page logic — `resolve('/')` now checks settings `static_front_page` (UUID of a page) and `page_for_posts` (UUID of a page). Falls back to posts archive if unconfigured. Removed hardcoded `isHome: true` priority.
  - **Database (seed):** New `seedDemoContent()` creates 3 pages (home, sobre, blog), 2 posts (primeiro-post, segundo-post), 2 menus (header, footer), and configures reading settings (`static_front_page` + `page_for_posts`). Idempotent via ON CONFLICT.
  - **CLI:** `prepareDb()` and `seed` command now call `seedDemoContent()` automatically — `okcms init` + `okcms start` yields a working site with Home, About, Blog listing, and 2 demo posts.
  - **Admin:** New Settings → Reading page with selects for "Front page" and "Posts page" (populated from published pages). Saves to `reading` settings group.
  - **Default Theme (redesigned):**
    - Removed `home.astro` (no longer hardcoded priority)
    - New specific templates: `page-home.astro`, `page-sobre.astro`, `page-blog.astro`, `post-primeiro-post.astro`, `post-segundo-post.astro`
    - Updated fallbacks: `page.astro`, `single.astro`, `archive.astro`, `index.astro`, `404.astro`
    - Template naming uses hyphen: `type-slug.astro` (e.g., `page-home.astro`)
    - New CSS design system in `src/theme.css` → `dist/theme.css` (engine: css, isolation: manual)
    - Theme settings: siteTitle, siteDescription, contactText
  - **Compatibility:** Breaking change in home resolution — projects without Static Front Page configured now show posts archive instead of `home.astro`. Fallback chain: static_front_page → page_for_posts → posts archive → home.astro (if exists).

## 0.8.0

### Minor Changes

- WordPress-parity medium phase (items 6–12): comments system (comments + comment_meta with RLS), mails outbox (mails with RLS), webhook hardening (webhook_secrets + webhook_dead_letters) and lazy field types (field_type_extensions.lazy).

### Patch Changes

- Updated dependencies [12d1963]
  - @oktis-works/types@0.9.0
  - @oktis-works/config@0.6.4

## 0.7.1

### Patch Changes

- Updated dependencies
  - @oktis-works/types@0.8.0
  - @oktis-works/config@0.6.3

## 0.7.0

### Minor Changes

- Fix version bump: release 0.15.0 instead of reusing 0.14.0 tag.

### Patch Changes

- Updated dependencies
  - @oktis-works/types@0.7.0
  - @oktis-works/config@0.6.2

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
  - @oktis-works/config@0.6.1

## 0.5.8

### Patch Changes

- Updated dependencies [3da0733]
  - @oktis-works/config@0.6.0

## 0.5.7

### Patch Changes

- Corrige o schema bootstrap defasado em relação ao sistema de plugins por tenant.
  
  O `schema.sql` e o `rls/index.ts` publicados em `0.5.6` não continham a tabela
  `plugin_tenants` (nem a policy RLS correspondente nem os status `MISSING` /
  `LOAD_FAILED` em `plugins`), enquanto `@oktis-works/core@>=0.5.10` já consultava
  `plugin_tenants` em `plugin/service.ts` e no bootstrap do plugin-runtime — em
  instalações novas isso quebrava o admin com
  `PostgresError: relation "plugin_tenants" does not exist` até que a migration
  `V011__core__plugin_tenants.sql` fosse aplicada.
  
  Com este patch o schema inicial passa a criar `plugin_tenants` (com índices,
  `UNIQUE (plugin_id, tenant_id)`, FKs e RLS `tenant_isolation_plugin_tenants`)
  e a habilitar `FORCE ROW LEVEL SECURITY` em `plugins` e `themes`, alinhando o
  bootstrap ao schema gerido pelas migrations.

## 0.5.6

### Patch Changes

- Correções do sistema de temas (ativação, descoberta, scaffold e customizador):
  
  - **`updated_at` no banco (crítico)**: a tabela `themes` ganhou `updated_at` (schema + migração `V010__core__harden_themes_lifecycle.sql`), índices `UNIQUE(name)` e o índice parcial de **um único tema ativo por tenant** — as rotas de ativar/desativar/instalar sempre falhavam por coluna inexistente, e `deactivate` referenciava também `deactivated_at`, que nunca existiu.
  - **Fonte única de ativação (crítico)**: o app web resolve o tema ativo **por request** lendo `status = 'ACTIVE'` do banco (fallback para `ACTIVE_THEME`), em vez de uma leitura única no boot — ativar pela tela Temas agora reflete no site sem restart. `ThemeService.activate` desativa os demais numa única sequência, `getActive` ordena por `activated_at DESC`, e a CLI `theme:manage --set-active` grava config **e** banco (mesma verdade).
  - **Fallback `manifest.json` (crítico)**: `syncFromDirectory` e o `ThemeLoader` aceitam `theme.json` **ou** `manifest.json` (o formato legado que o tema default distribuído usa); `theme:manage --info` também. O manifesto do tema default agora declara `type: "theme"`.
  - **Tema default no scaffold (crítico)**: `okcms init` copia `themes/default` pronto (manifesto + 6 templates `.astro` + `dist/theme.css` servível) para o projeto novo — nunca mais diretório `themes/` vazio; re-init não sobrescreve tema editado.
  - **Scaffold de tema no formato do runtime**: `theme:create` gera os templates da hierarquia (`home/index/single/page/archive/404.astro`) **na raiz do tema** com o contexto real (`items`, `content`, `site`), `provides.layouts`, e no engine `css` entrega `dist/theme.css` já servível (nada de `templates/*.html` com `{{#each posts}}` que o web ignora). Docs (`THEME.md`, `theme-development.md`) alinhados.
  - **Dados enriquecidos chegam ao render**: a resolução de rota carrega `data`/`record` vindos do `findByPath` (mídia real + `_terms`) — o web parou de re-consultar a row crua; itens de archive/home ganham enriquecimento de mídia em lote (uma query para a lista inteira).
  - **Tela Temas do admin**: badge usa `status === 'ACTIVE'` (não mais `isActive` inexistente), erros são limpos antes de cada operação, botão **Sincronizar**, **Desinstalar com confirmação**, preview do manifesto quando declarado e **painel de configurações do tema** (`manifest.settings` editável → `PATCH /api/v1/themes/:id/config`), com os defaults sobrescritos pelo config salvo expostos aos templates como `settings.theme`.
  - **API de temas honesta**: `activate`/`DELETE` respondem 404 quando o tema não existe; `install` valida o manifesto (BUSI-022: `type` + `compatibility.okcms`, nome seguro e único) e a listagem não esconde mais linhas do banco quando o diretório está vazio.
  - **Runner de migrações**: `applyMigration` executava o arquivo inteiro — inclusive a seção `-- +migrate Down`, desfazendo a própria migration no mesmo commit; agora executa apenas o bloco Up (`extractUpSection`).
  - **Polimentos**: `lang` do documento vem da setting `language` (fallback `pt-BR`), o `<link>` de `dist/theme.css` só sai quando o arquivo existe (cadeia ativo → `_shared` → `default`), `wireThemeHooks` é aguardado no boot (sem janela sem hooks), cache de templates do renderer com teto FIFO (200) e a página de fallback do tema exibe os dados reais num HTML legível em vez de JSON cru.

## 0.5.5

### Patch Changes

- Updated dependencies []:
  - @oktis-works/config@0.5.5
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
  - @oktis-works/types@0.2.0

## 0.1.14

### Patch Changes

- Updated dependencies []:
  - @oktis-works/config@0.1.14
  - @oktis-works/types@0.1.14

## 0.1.13

### Patch Changes

- Updated dependencies []:
  - @oktis-works/config@0.1.13
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
  - @oktis-works/types@0.1.12
  - @oktis-works/config@0.1.12

## 0.1.11

### Patch Changes

- Updated dependencies []:
  - @oktis-works/types@0.1.11
  - @oktis-works/config@0.1.11

## 0.1.10

### Patch Changes

- Tenant context usa set_config parametrizado no setTenantContext e no migration runner (`SET x = $1` não existe no Postgres — syntax error 42601 quebrava login e X-Tenant-ID); ui atualiza solid-js para 1.9.15 (cópia única com o admin em Astro 7).
- Updated dependencies []:
  - @oktis-works/config@0.1.10
  - @oktis-works/types@0.1.10

## 0.1.9

### Patch Changes

- Corrige `okcms db:migrate` em banco fresco (erro `relation "migrations" does not exist`):
  
  - `ensureCoreSchema` (novo em `@oktis-works/database`): aplica o schema core **uma única vez**, detectado via `to_regclass` — o schema tem `CREATE POLICY` (não idempotente) e a tabela `migrations` tem FK para `tenants`, ou seja, num banco novo nada existia;
  - `resolveTenantId` (novo): traduz o `--tenant` (slug) para o UUID real de `tenants.slug`, criando o tenant `default` na primeira vez — antes o runner recebia a string `"default"` e quebraria com `invalid input syntax for type uuid`;
  - CLI: novo `prepareDb` (init + schema + tenant) nos comandos `db:migrate`, `db:rollback` e `db:status`;
  - NOTICEs 42701 do Postgres (colunas redundantes do próprio schema) suprimidos no bootstrap via `client_min_messages = warning`;
  - testes: `bootstrap.test.ts` com 7 cenários de banco fresco — 411 no total.
- Updated dependencies []:
  - @oktis-works/types@0.1.9
  - @oktis-works/config@0.1.9

## 0.1.8

### Patch Changes

- Updated dependencies []:
  - @oktis-works/types@0.1.8
  - @oktis-works/config@0.1.8

## 0.1.7

### Patch Changes

- Updated dependencies []:
  - @oktis-works/types@0.1.7
  - @oktis-works/config@0.1.7

## 0.1.6

### Patch Changes

- Updated dependencies []:
  - @oktis-works/types@0.1.6
  - @oktis-works/config@0.1.6

## 0.1.5

### Patch Changes

- Updated dependencies []:
  - @oktis-works/types@0.1.5
  - @oktis-works/config@0.1.5

## 0.1.4

### Patch Changes

- Updated dependencies []:
  - @oktis-works/config@0.1.4
  - @oktis-works/types@0.1.4

## 0.1.3

### Patch Changes

- Updated dependencies []:
  - @oktis-works/types@0.1.3
  - @oktis-works/config@0.1.3
