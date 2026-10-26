# Agent Instructions & Project Rules

This document defines strict operational rules and workflows that the AI Agent must execute during development, commit, and deployment phases.

## 1. Commit Message Standard
* **Language:** Every commit message must be written in English.
* **Format:** Use the full Conventional Commits specification. This includes types such as `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`, etc.

## 2. Versioning Model (memorize this — the release gate validates it)
* **Product version anchor:** the `version` in the ROOT `package.json` (private workspace `okcms`, never published). It carries product semantics and is the ONLY source of truth for releases.
* **`CMS_VERSION` is DERIVED, never edited by hand:** it lives in three places — the root `CMS_VERSION` file, the `CMS_VERSION` constant in `packages/validation/src/compatibility.ts`, and the **README.md title** (`# OkCMS vX.Y.Z`). Sync all three from the anchor with `bun run sync-version --write`.
* **README.md title rule:** The title **MUST** always match the product version in root `package.json`. It is `# OkCMS v{version}` (e.g. `# OkCMS v0.36.9`), never `# OkCMS v2` or any other hardcoded string. If you bump `version` in `package.json`, you **MUST** run `bun run sync-version --write` before committing.
* **No manual README title edits:** Never edit the `# OkCMS v...` line by hand. Always use `bun run sync-version --write` so all three anchors stay identical.
* **Individual package versions are independent:** managed by Changesets (`.changeset/*.md`), consumed with `bun run version-packages` (which also runs `sync-version --write` at the end).
* **Release tag = product version:** the tag `vX.Y.Z` must exactly match the root `package.json` version. This is a BLOCKING check (`scripts/prepare-publish.mjs --check --tag`) — if they differ, `publish.yml` fails before publishing anything.
* **Never reuse a burned tag:** a tag whose CI run failed (e.g. `v0.16.0`, `v0.16.1`) never published anything — skip to the next version instead of re-tagging.

## 3. GitHub & CI/CD Pipeline Workflow
Before preparing or recommending a push to GitHub, evaluate if the updates trigger the CI/CD and Publish workflows.

### CI triggers (`.github/workflows/ci.yml`)
* `push` of tags `v*` and `pull_request` to `main` / `develop`.
* **NO CI on push to `main` / `develop`** — only tags and PRs trigger CI.
* Jobs `test`, `typecheck` (build all packages + `tsc --noEmit`), `lint` run in parallel.
* On a `v*` tag push with all jobs green, the `trigger-publish` job sends a `repository_dispatch` (`publish-release`) that fires `publish.yml`.

### Publish chain (`.github/workflows/publish.yml`)
`tag push → ci.yml (test + typecheck + lint) → trigger-publish → repository_dispatch → publish.yml`:
1. Checkout the exact tag ref.
2. `prepare-publish.mjs --check --tag vX.Y.Z` — blocking validation (semver, tag === product version, CMS_VERSION === product version).
3. `bun install --frozen-lockfile` + `bun run build`.
4. `prepare-publish.mjs --tag` rewrites `workspace:*` → `^version` (npm does not understand the workspace protocol).
5. `npm publish --provenance` (OIDC Trusted Publishing — no NPM token) for every non-private package in `. + packages/* + apps/*`, idempotent (skips versions already in the registry).
6. Final verification: expected version vs `npm view` latest for each package.

Pushes to `main` run CI but NEVER publish — publishing requires a tag.

### Release checklist (execute in this exact order)
1. Ensure a changeset exists for every changed package (`.changeset/*.md`).
2. Consume changesets: `bun run version-packages` (bumps package versions + syncs CMS_VERSION).
3. Bump the product version in root `package.json` (Patch for fixes, Minor for features, Major for breaking).
4. Re-sync anchors: `bun run sync-version --write` (then `bun run sync-version` to validate).
5. Pre-validate the gate locally: `node scripts/prepare-publish.mjs --check --tag vX.Y.Z`.
6. Run `bun run build`, `bun run test:run`, `bun run lint` and `bun run typecheck` (the same CI gates).
7. Commit with a conventional commit message (English), e.g. `chore(release): v0.16.2`.
8. Tag and push: `git tag vX.Y.Z && git push origin main --tags`.
9. Watch the tag CI run; when green, `publish-release` fires and npm publish runs automatically.

## 4. Custom Field Types via Plugins
When implementing custom field types via plugins, follow these rules:

### Backend (Core + API + Plugin Runtime)
- **Field Type Registry:** New field types are registered in `field_type_extensions` table via `FieldTypeExtensionService`.
- **Plugin API:** Plugins register field types via `api.addFieldType(definition)` in their `register()` function.
- **Manifest:** Field types are declared in `manifest.json` under `fieldTypes[]` array.
- **Permissions:** Require `field-types:register` permission in manifest.
- **Build Order:** Packages must be built in dependency order (validation → types → config → database → auth → plugin-sdk → plugin-runtime → core → theme-sdk → theme-runtime → api-client → ui → cli).

### Admin Frontend
- **FieldTypePicker:** Automatically loads plugin field types from `/api/v1/field-types`.
- **FieldSettingsEditor:** Renders plugin config component via dynamic import of `adminComponentPath`.
- **FieldRenderer:** Renders plugin renderer component via dynamic import of `adminRendererPath` (fallback to `adminComponentPath`).
- **Vite Alias:** `@/plugins/*` resolves to `../../../plugins/*/admin` for dynamic imports.
- **Fallbacks:** If plugin component fails to load, show JSON editor (config) or textarea (renderer).

### Plugin Development
- **Manifest:** Declare `fieldTypes[]` with `type`, `label`, `category`, `icon`, `adminComponentPath`, `adminRendererPath`, `configSchema`.
- **Components:** Create `admin/components/FieldName.tsx` (config) and `admin/components/FieldNameRenderer.tsx` (renderer).
- **Permissions:** Declare `field-types:register` in manifest permissions.
- **Example:** See `plugins/mermaid-field/` for complete example.

## 5. Build & Lint Rules
* **Build Order:** Always use `bun run build` which builds packages in dependency order.
* **Typecheck:** Run `bun run typecheck` (excludes plugins directory).
* **Lint:** Run `bun run lint` (ignores `packages/cli/src/scaffold.test.js`).
* **Tests:** Run `bun run test:run` before committing.

## 6. Cross-Package Import Rules (fresh-checkout safety)
A package may only statically import packages that build BEFORE it in the build order. `core` builds AFTER `plugin-runtime`, therefore:
* **plugin-runtime must never statically import `@oktis-works/core`** (no `require()`, no literal `import()`): use a non-literal dynamic import (`const id = '@oktis-works/core'; await import(id)`) so `tsc` cannot resolve it at build time.
* **Never self-import a package by name from inside itself** (e.g. `await import('@oktis-works/core')` inside core): use relative imports (`../fields/service.js`). A self-import does not resolve on a fresh checkout where `dist/` does not exist yet.
* `require()` is unavailable in Node ESM (`"type": "module"`) — prefer `await import()` for runtime-only resolution.

## 7. Language Standard (English everywhere)
Everything the agent writes in this repository is **English-only**:
* **Commit messages:** English, full Conventional Commits (see §1).
* **Code comments:** every comment, JSDoc block, docstring and inline note in source files must be written in English — no Portuguese (or other natural language) comments in code.
* **Identifiers & docs:** variable/function/type names, string literals exposed to users of the API, and developer documentation (PLUGIN.md, README, ADRs, plan/scratch files committed to the repo) are written in English.
* Existing legacy comments in other languages may remain untouched unless the task explicitly includes translating them.

## 8. Migration Safety Rules
To prevent migration-related failures (based on bugs fixed in v0.36.9):

* **Run acceptance test before submitting migrations:** Always execute `packages/database/scripts/postgres-upgrade-acceptance.mjs` (tests upgrade V018 → V025+).
* **Pool max must have a fallback:** Use `max: config.maxConnections ?? 10` in `postgresConnection`. Passing `max: undefined` to postgres.js creates a single-connection pool, causing `reserve()` to deadlock against `assertSupportedServerVersion()`.
* **Reserved connections need `.begin()` shim:** The object returned by `pool.reserve()` lacks `.begin()`. Wrap it with `wrapReservedConnection` to add `BEGIN`/`COMMIT`/`ROLLBACK` on the same session — the migration runner calls `sql.begin()` on all connections.
* **Preflight regex must filter `'set'`:** The regex `/\b(?:UPDATE|DELETE\s+FROM)\s+([a-z_][a-z0-9_]*)/gi` matches `DO UPDATE SET` from `ON CONFLICT` clauses, capturing `'set'` as a table name. Explicitly filter `table === 'set'`.
* **Runner must update `schema_bootstrap.schema_version`:** After applying `core_schema` migrations, set `schema_version` to the highest applied version (not only in `adoptLegacy` path).
* **CI step for acceptance:** Use `timeout-minutes: 5` and run with `node` (not `bun`) — postgres.js pool behavior differs in Bun for small/undefined pools.
* **No references to non-existent columns:** The `schema_bootstrap` table has no `status` column — do not write `SET status = 'ready'` in migrations.

## 9. Tenant Context & RLS Rules
The entire system is multi-tenant with PostgreSQL Row Level Security (RLS). Violations cause cross-tenant data leaks.

* **Always establish tenant context before database operations:** Use `establishTenantContext(tenantId)` or `runWithTenantTransaction(tenantId, fn)`. The context is stored in `AsyncLocalStorage` and mirrors to Postgres via `SET app.current_tenant_id = '...'`.
* **Never bypass RLS with superuser connections in application code:** Admin operations that need cross-tenant access must use explicit `SET LOCAL row_security = off` inside a transaction, never globally.
* **`getCurrentTenantIdSync()` is the only synchronous accessor:** It reads strictly from `AsyncLocalStorage` — the module-level `_fallbackContext` is process-wide and **must not** be used for per-request decisions (it crosses tenants under concurrency).
* **CLI commands default to `default` tenant:** `resolveTenantId()` creates the default tenant on first bootstrap. Explicit `--tenant` required for multi-tenant operations.
* **Tenant isolation in tests:** Each test must call `establishTenantContext()` with a unique tenant ID or use the test utilities that auto-isolate.

## 10. Event Store Idempotency Rules
The event bus uses a persistent `EventStore` with idempotency guarantees.

* **Event IDs must be globally unique (UUID v4):** Duplicate IDs are ignored via `ON CONFLICT (id) DO NOTHING` — handlers never re-execute for the same event.
* **Persistence before processing:** `EventStore.persist(event)` **must** be called before dispatching to handlers. The bus does this automatically; custom emitters must follow the same pattern.
* **Mark processed only after ALL handlers succeed:** `EventStore.markProcessed(eventId)` is called after the full handler chain. If any handler throws, the event stays unprocessed and is retried (up to 2 attempts by default).
* **Dead Letter Queue (DLQ) is durable:** Failed events go to `dead_letter_events` table with error + attempt count. Survives restarts. Monitor and replay manually.
* **Never emit events outside tenant context:** Events carry `tenantId` from the current context. Emitting without context creates orphan events with `tenant_id = NULL`.

## 11. Plugin & Theme Compatibility Rules
Semantic versioning governs extension compatibility. The CMS version is the anchor.

* **Manifest MUST declare `compatibility.okcms`:** A valid semver range (e.g., `^0.36.0`, `>=0.35.0 <0.38.0`). Missing or invalid range blocks install/load.
* **Plugin loader validates at load time:** `PluginLoader.loadPlugin()` throws if `!satisfies(CMS_VERSION, range)`. The check runs **before** dynamic import of the entry point.
* **Theme renderer validates at render time:** Same check in `theme-runtime` before loading theme components.
* **Dependencies between plugins use semver ranges too:** `manifest.dependencies[].versionRange` must be satisfied by the target plugin's version.
* **Never hardcode CMS_VERSION in extensions:** Read it from the host at runtime via `api.cmsVersion` or the `PLUGIN_API_VERSION` env var injected by the loader.

## 12. Database Provider Abstraction Rules
The database layer supports PostgreSQL (primary), MySQL 8.0.36+, and MariaDB 11.4+.

* **All SQL goes through `translateProviderSql()` for non-Postgres:** The function in `connection.ts` strips Postgres-specific syntax (`::cast`, `jsonb`, `ILIKE`, `ON CONFLICT`, advisory locks, etc.). Write migrations in Postgres dialect; the translator handles the rest.
* **Capabilities dictate feature availability:** Check `getDatabaseCapabilities().rowLevelSecurity`, `.advisoryLocks`, `.transactionalDdl` before using provider-specific features. Do not assume Postgres features exist on MySQL/MariaDB.
* **Schema snapshots are provider-specific:** `schema.sql` (Postgres), `schema.mysql.sql`, `schema.mariadb.sql`. Update all three when changing the baseline.
* **Connection pooling defaults differ:** Postgres `max: 10`, MySQL/MariaDB `connectionLimit: 20`. Do not hardcode pool sizes — use `config.maxConnections ?? default`.

## 13. Cache Invalidation Rules
Tag-based invalidation (`TaggedCacheIndex`) is the primary cache strategy.

* **Tag index is eventually consistent:** Concurrent `setWithTags` may lose a key registration (last write wins). Acceptable for cache — worst case is a stale entry until TTL.
* **Tag index TTL extends entry TTL by 30s:** `invalidateTag` can find and delete keys even after the entry expires.
* **Invalidation is fire-and-forget:** `invalidateTag` returns count of deleted keys but does not wait for replicas. Do not rely on immediate cross-instance consistency.
* **Never use raw cache keys for invalidation:** Always tag related entries (`entity:123`, `collection:posts`, `tenant:abc`) and call `invalidateTag('entity:123')`.

## 14. Field Registry & Schema Contracts
The field type system is the contract between core, plugins, and admin UI.

* **Built-in types are registered at startup:** `FieldTypeExtensionService.registerBuiltins()` runs during `core` initialization. Plugin types register via `api.addFieldType()` in their `register()` function.
* **Config schema is JSON Schema (draft-07):** `FieldTypeDefinition.configSchema` validates plugin configuration in the admin. Invalid config blocks field creation.
* **Renderer components must be self-contained:** `adminRendererPath` component receives `{ value, config, field }` and must not depend on external admin state. Fallback is `<textarea>` showing raw JSON.
* **Field values are stored as JSONB in `field_values.value`:** The `config` column stores the field type's configuration. Do not add columns to `field_values` — extend via `config` or custom field types.
* **Field type registry is cached:** `/api/v1/field-types` is cached by the admin. After registering a new type, the admin must refresh (or the server must restart).

## 15. Build & Deployment Invariants
These invariants must hold for every release.

* **`bun run build` must succeed on fresh checkout:** No pre-existing `dist/` or `node_modules/`. The build order (validation → types → config → database → auth → plugin-sdk → plugin-runtime → core → theme-sdk → theme-runtime → api-client → ui → cli) is enforced by the root `build.mjs`.
* **Typecheck runs on all packages EXCEPT plugins:** `tsc --noEmit -p tsconfig.typecheck.json` excludes `plugins/**` (they have their own tsconfig).
* **CLI scaffold test is lint-ignored:** `packages/cli/src/scaffold.test.js` uses dynamic patterns that ESLint cannot parse — it is explicitly ignored in `.eslintrc.json`.
* **Worker process is a separate entry point:** `apps/worker` runs the job queue. It shares the same codebase but has its own `package.json` and build output. Changes to `core` events/queues require worker rebuild.
* **Admin is a Vite + React SPA:** Built to `apps/admin/dist`. Served statically by the API in production. API routes under `/api/v1/**`, admin under `/admin/**`, public under `/`.
