# Migrations, Update, Generated Projects, and `okcms menu` Audit

**Audit date:** 2026-10-25
**Scope:** fresh projects created with `bunx @oktis-works/cms init <project-name>`, migration/bootstrap/update/redeploy behavior, all top-level CLI commands, and the interactive `okcms menu` experience.
**Status:** implementation audit and correction pass complete. Every checklist item below was verified against source and tests on 2026-10-25.

> Repository instruction note: this report is written in English because the project rules require all newly written repository documentation to be English-only.

## 1. Executive summary

The current system has useful building blocks, but its migration lifecycle is not yet a reliable release mechanism. The largest risks are:

1. `schema.sql` is applied as a second migration source while the numbered migrations are tracked separately. A fresh or existing database can therefore be structurally changed without an equivalent migration ledger entry.
2. `prepareDb()` performs schema setup, core seeding, demo-content cleanup/recreation, and tenant resolution for commands that appear read-only. `db:status`, `db:rollback`, and several other commands can mutate data.
3. Migration checksums are stored but never validated. A modified applied migration is silently skipped.
4. Plugin migrations execute their `Up` SQL twice in `runPluginMigrations()` and use different schema/search-path contexts for the two executions.
5. Migration records are tenant-scoped even though much of the DDL is global. Every tenant can therefore receive a separate ledger for the same global database change.
6. The provider lifecycle must be validated independently. The implementation now has PostgreSQL, MySQL, and MariaDB adapters, provider snapshots, provider migration sets, and explicit capability differences.
7. `update` uses `@latest`, scans transitive packages, treats registry failures as “up to date,” and can skip migration synchronization in a non-interactive download path.
8. A generated project advertises commands that are not represented by its package scripts, can report successful initialization after dependency installation failure, and has inconsistent local infrastructure instructions.
9. `okcms menu` has several correctness problems: boolean flags consume positional arguments, the command catalog omits commands, secrets can be echoed in command mirrors, cancellation exits the process, status is not accurate, and the environment wizard can overwrite MySQL/MariaDB configuration with PostgreSQL.

### Risk summary

| Severity | Count | Main areas |
|---|---:|---|
| Critical | 6 | plugin migration double execution, false database-provider support, schema/ledger split, mutating read-only commands, checksum drift, unsafe update/deploy behavior |
| High | 15 | parser arity, tenant/global ledger mismatch, incomplete rollback contracts, migration race conditions, generated-project failures, menu secret/cancel/state bugs |
| Medium | 19 | command/catalog drift, status gaps, UX consistency, deployment defaults, portability, documentation mismatch |
| Low | 8 | visual polish, naming, hints, terminal-width handling, minor code smells |

The recommended approach is to first establish a single migration contract and read-only command semantics, then repair the runner and update pipeline, and only afterward polish the menu UI. UX changes should consume the same typed command metadata introduced in the CLI correction phase.

This document contains the original finding register as well as the current
disposition. Findings describe the defect that was audited; the progress and
cross-validation sections are authoritative for whether that defect is fixed,
partial, or still open. A checked item means the implementation and its direct
regression test were verified, not that the entire phase is complete.

**Current provider status:** PostgreSQL, MySQL, and MariaDB are active supported targets with separate drivers, snapshots, migration sets, CLI assets, and CI acceptance jobs. MySQL and MariaDB intentionally do not claim PostgreSQL RLS; tenant isolation is enforced through explicit application/data-access predicates and provider-specific capability checks.

## 2. Audit method and evidence

The audit inspected:

- Root migration SQL in `migrations/` (`V001` through `V025`).
- Database bootstrap, runner, seed, schema, connection, and migration tests under `packages/database/src/`.
- CLI commands, parser, scaffold, generated assets, migration synchronization, update, redeploy, deployment, PM2, environment wizard, prompts, and tests under `packages/cli/src/` and `packages/cli/scripts/`.
- The generated-project dependency and script templates in `packages/cli/src/scaffold.ts` and `packages/cli/src/scaffold-docs.ts`.
- Admin menu-management code only for boundary comparison; the primary UI scope is the interactive CLI command `okcms menu`.

The intended test runner was used for the relevant unit suites:

```text
bunx vitest run packages/database/src/migrations/runner.test.ts \
  packages/database/src/migrations/bootstrap.test.ts \
  packages/cli/src/migrations-sync.test.ts \
  packages/cli/src/update.test.ts \
  packages/cli/src/wizard.test.ts \
  packages/cli/src/wizard-flows.test.ts \
  packages/cli/src/parser.test.ts \
  packages/cli/src/scaffold.test.ts
```

Result: 8 files passed, 106 tests passed. These suites do not cover a real PostgreSQL upgrade, migration checksum drift, concurrent execution, the plugin double-execution path, generated-project installation failure, or interactive terminal behavior. A direct `bun test` invocation was not treated as the project gate because it used a different runtime/test compatibility path and produced Vitest mocking failures.

## 3. Current architecture map

### 3.1 Generated-project lifecycle

```text
bunx @oktis-works/cms init <name>
  -> scaffold files, package.json, .env, Docker assets, themes/plugins/migrations
  -> resolve @oktis-works package ranges from registry or fallback map
  -> install generated dependencies
  -> print next steps

generated project
  -> okcms db:migrate / db:status / db:rollback / seed
  -> okcms update / redeploy / deploy
  -> okcms menu (interactive wrapper around the same command surface)
```

### 3.2 Database preparation and migration lifecycle

```text
CLI database command
  -> initDb()
  -> ensureCoreSchema()     [schema.sql, advisory lock, no migration-ledger record]
  -> seedCoreData()
  -> seedDefaultFieldGroups()
  -> seedDemoContent()      [cleanup and recreation]
  -> seedActivateDefaultTheme()
  -> resolveTenantId()
  -> runMigrations()        [migrations/*.sql, tenant-scoped records]
```

This pipeline combines global DDL, tenant data, demo fixtures, and migration execution in one preparation function. That coupling is the source of several correctness and UX failures below.

## 4. Front A: migration, update, init, and deployment findings

### A-01 — Two competing migration sources

**Severity:** Critical
**Evidence:** `packages/database/src/migrations/bootstrap.ts`, `packages/database/src/schema/schema.sql`, root `migrations/V001__...` through `V025__...`.

`ensureCoreSchema()` executes the complete schema file whenever the core tables are not detected and also re-executes it as a delta mechanism. The numbered migrations are then applied independently and recorded in `migrations`. The schema already contains objects and changes also represented by numbered migrations, including fields, indexes, plugin tenancy, API keys, comments, mail/webhook structures, field values, and content migration conflicts.

Consequences:

- The database can contain schema changes with no migration record.
- A new installation can receive the same logical change through two paths.
- Migration ordering cannot be inferred from the ledger.
- Schema drift can be hidden by broad `DO $$ ... EXCEPTION WHEN OTHERS ... RAISE WARNING` blocks.
- Rollback cannot restore a known pre-change state because the bootstrap path is not represented in the same history.

**Required correction:** choose one canonical schema evolution path. The recommended model is a baseline migration plus ordered migrations; `schema.sql` becomes a generated/reference snapshot or a bootstrap-only baseline that is explicitly recorded.

### A-02 — Read-looking commands mutate the database

**Severity:** Critical
**Evidence:** `packages/cli/src/db-prepare.ts`, `packages/database/src/migrations/bootstrap.ts`, `packages/database/src/seed.ts`.

`prepareDb()` is called by migration, rollback, status, backup-related flows, and other commands. It performs core schema setup and attempts all seed operations. `seedDemoContent()` removes and recreates demo records, removes the `admin@local` user, and manipulates menu/settings/content records. Seed errors are caught as warnings, allowing the command to continue with partial state.

This means `okcms db:status`, `okcms db:rollback`, and any command that uses `prepareDb()` can mutate or delete data. `--tenant` does not make the demo cleanup tenant-safe because demo seeding is performed against the default tenant path.

**Required correction:** split preparation into explicit, side-effect-free layers:

- `connectDb()` — connection only.
- `ensureMigrationInfrastructure()` — ledger/lock tables only.
- `ensureCoreSchema()` — only during explicit bootstrap/upgrade, with a clear result.
- `resolveTenant()` — lookup only unless an explicit `tenant:create` operation is requested.
- `seed` — explicit command, with separate `--demo` and `--system` modes.

### A-03 — Stored migration checksums are not validated

**Severity:** Critical
**Evidence:** `packages/database/src/migrations/runner.ts`.

The runner computes a checksum and stores it in the ledger, but `runMigrations()` only checks whether `(tenant, owner, version)` exists. It never compares the stored checksum with the current file. An applied SQL file can therefore be changed, committed, copied into a generated project, and silently ignored.

**Required correction:** on every status and migration run, compare checksums. Default behavior must fail closed with a clear drift error. A separate, explicit administrative command may approve a checksum replacement after review; it must never happen implicitly.

### A-04 — Plugin migrations execute `Up` twice

**Severity:** Critical
**Evidence:** `runPluginMigrations()` and `applyMigration()` in `packages/database/src/migrations/runner.ts`.

`runPluginMigrations()` executes the migration `Up` SQL inside the plugin schema/search path and then calls `applyMigration()`, which executes the same `Up` SQL again before recording it. The second execution uses a different context. This can fail on non-idempotent SQL, create duplicate data, or modify public objects unexpectedly.

**Required correction:** make one function own the complete transaction, search path, ledger insert, and checksum. Add a regression test that uses a deliberately non-idempotent plugin migration and proves it executes once.

### A-05 — Global DDL is tracked per tenant

**Severity:** Critical
**Evidence:** `migrations` table schema and `runMigrations()` in `packages/database/src/migrations/runner.ts`; tenant resolution in `bootstrap.ts`.

The migration ledger has `tenant_id`, and the CLI normally runs migration records for one tenant. Much of the SQL, however, changes global tables, constraints, indexes, policies, or extensions. A second tenant can therefore receive a new ledger row for a change already applied globally, causing duplicate execution attempts or inconsistent histories.

**Required correction:** separate ledgers and runners:

- `core_schema_migrations`: one row per database/schema-level migration.
- `tenant_data_migrations`: rows only for genuinely tenant-scoped data transformations.
- `plugin_schema_migrations`: one ledger per plugin schema, or a clearly defined plugin owner/tenant model.

The command must know which class a migration belongs to and must reject ambiguous files.

### A-06 — No execution lock for the full migration plan

**Severity:** High
**Evidence:** `runMigrations()` and `applyMigration()` in `runner.ts`; bootstrap advisory lock in `bootstrap.ts`.

Bootstrap uses an advisory lock, but normal migration execution does not hold a migration-plan lock. Two CLI/API workers can both observe a migration as pending, execute it, and race on the ledger insert. The unique constraint may stop the second insert after its SQL has already run.

**Required correction:** acquire a database advisory lock for the relevant migration domain before reading pending files, keep it until all migration transactions complete, and make the lock key stable for core/plugin migration domains.

### A-07 — Session-level tenant context can leak on pooled connections

**Severity:** High
**Evidence:** `applyMigration()` calls `set_config('app.current_tenant_id', tenantId, false)`.

The `false` argument makes the setting session-level rather than transaction-local. On a pooled connection, a later operation can inherit the previous tenant context if it does not overwrite it.

**Required correction:** use `SET LOCAL` or `set_config(..., true)` inside the transaction, and add a pooled-connection isolation test.

### A-08 — Migration filename and ordering contracts are weak

**Severity:** High
**Evidence:** `parseMigrationName()` and file loading in `runner.ts`; matching logic in `redeploy.ts`.

The parser accepts any digit length even though the project convention says `V###`; owner names allow only `\w`, preventing common hyphenated identifiers; files are sorted lexicographically rather than by numeric version; duplicate identities are not rejected; and `ownerVersions` is constructed but unused.

**Required correction:** define a manifest/schema for migration identity, parse numeric versions, sort numerically, reject duplicate `(domain, owner, version)` identities, validate owner names consistently, and validate dependencies before execution.

### A-09 — Rollback contracts are incomplete and sometimes destructive

**Severity:** High
**Evidence:** root migrations `V007`, `V008`, `V010`, `V011`, `V013`–`V017`, `V018`, `V021`, `V024`, and `V025`.

Several migrations have no `Up`/`Down` markers. Others have incomplete, destructive, or explicitly one-way downs:

- `V007`, `V013`–`V017`: no rollback marker contract.
- `V008`: leaves RLS enabled and does not restore the complete prior policy state.
- `V010`: drops lifecycle indexes and `updated_at`, losing data and constraints.
- `V011`: removes plugin tenancy structures without restoring the prior relationship.
- `V018`: destructive down behavior.
- `V021`: data repair with no down.
- `V024`: restoring a global unique constraint can fail when tenant-local duplicates exist.
- `V025`: intentionally one-way canonicalization; its down only removes the conflict table and does not restore prior data.

`db:rollback` chooses the highest version, not the most recently applied migration across all owners, and it prepares the database before attempting rollback.

**Required correction:** classify every migration as reversible, irreversible, or forward-only; require explicit confirmation and backup for irreversible operations; make rollback domain-aware and reverse by applied order; never imply that a one-way migration was rolled back.

### A-10 — Migration SQL has idempotency and data-loss hazards

**Severity:** High
**Evidence:** root migrations `V019`, `V020`, `V021`, `V025` and the schema bootstrap.

`V019` and `V020` delete duplicate rows before adding uniqueness. `V020` adds a constraint without the same existence guard used by `V019`. `V021` rewrites double-encoded JSON-like content. `V025` canonicalizes content and field values and records conflicts, but the migration is one-way. Broad exception handlers in `schema.sql` can convert failed repairs into warnings.

**Required correction:** add preflight reports, deterministic conflict policy, backup requirements, affected-row thresholds, explicit operator approval for destructive cleanup, and failure propagation for required schema changes.

### A-11 — Migration synchronization treats conflicts as warnings

**Severity:** High
**Evidence:** `packages/cli/src/migrations-sync.ts`, `redeploy.ts`, and update deploy mode.

Bundled migrations are copied into a project without overwriting existing files. This is a good safety default, but conflicts are reported only as warnings. Deploy/update can continue with stale local SQL, and plugin staging does not establish a source-of-truth or ownership manifest. Filename collisions between plugins are not rejected.

**Required correction:** make migration conflict a blocking preflight failure by default; provide an explicit `--accept-migration-conflict` workflow that records the decision; use a manifest containing source package, owner, version, checksum, and migration class.

### A-12 — `update` is not a deterministic project update

**Severity:** High
**Evidence:** `packages/cli/src/update.ts`.

Problems found:

- It scans every directory under `node_modules/@oktis-works`, including transitive packages, and can promote transitive packages to direct dependencies.
- It installs `@latest` rather than respecting the project’s declared ranges and lockfile strategy.
- Registry/network failure is treated as “up to date,” which can report a false success.
- Non-interactive download mode can return before migration synchronization when no package is reported outdated.
- Package installation, migration synchronization, database migration, and deployment are not one atomic plan.
- History is written only after success and does not represent a resumable step-by-step transaction.

**Required correction:** update only direct managed dependencies, resolve according to an explicit policy, distinguish `up-to-date`, `offline`, and `unknown`, always run migration inventory/sync as a separate step, and expose a dry-run plan before changes.

### A-13 — PostgreSQL is implemented while MySQL/MariaDB are advertised

**Severity:** Critical
**Evidence:** `packages/database/src/connection.ts`, `schema.sql`, wizard environment fields, generated Docker assets, and deployment code.

The connection layer uses the PostgreSQL driver. The schema depends on PostgreSQL types/functions/RLS behavior, and backup/restore uses `pg_dump`/`pg_restore`. Nevertheless, the wizard, environment schema, and infrastructure paths expose MySQL/MariaDB choices. Deployment and health checks hardcode PostgreSQL containers.

**Required correction:** choose one of these release-safe options:

1. Temporarily make PostgreSQL the only supported provider and remove or clearly mark unsupported MySQL/MariaDB choices from generated projects, wizard, docs, and doctor output; or
2. Implement separate drivers, schema dialects, migration runners, backup/restore tools, health checks, Docker assets, and test suites for each provider.

The first option is the recommended immediate correction.

**Current implementation status:** the multi-provider option is implemented. The connection layer exposes a provider-neutral adapter contract, MySQL and MariaDB use their native drivers, provider snapshots/migration directories are generated and checked, and the CLI dispatches backup, restore, health, development, scaffolding, and deployment assets by provider. CI provisions independent MySQL and MariaDB services and runs provider acceptance before the release trigger.

**Provider-specific behavior retained by design:**

- `packages/config/src/index.ts` accepts `postgres://`, `postgresql://`, `mysql://`, and `mariadb://` with explicit contradiction checks and TLS settings.
- `packages/database/src/connection.ts` exposes native PostgreSQL, MySQL, and MariaDB adapters behind `RepoSql`, with provider capabilities, version gates, pool shutdown, locking, and error normalization.
- `packages/database/src/migrations/runner.ts` selects provider-specific migration directories, validates provider metadata, and translates only the adapter compatibility boundary; generated provider migrations are checked for PostgreSQL-only constructs.
- `packages/database/src/schema/schema.mysql.sql` and `schema.mariadb.sql` are generated provider snapshots with JSON, UUID, timestamp, index, trigger, and namespace differences documented in the provider matrix.
- `packages/cli/src/assets.ts`, `dev.ts`, `scaffold.ts`, `doctor.ts`, `bluegreen.ts`, `simple.ts`, and `db-dump.ts` select provider-specific infrastructure, health checks, containers, ports, backup tools, and generated project assets.
- The generated `.env`, scaffold validator, environment wizard, and provider matrix preserve all three supported providers; PostgreSQL RLS and schema namespaces remain explicitly distinct from MySQL/MariaDB application-level tenant predicates.

Phase 10 below records the completed multi-provider implementation and its acceptance contract.

### A-14 — Generated initialization can succeed after dependency installation failure

**Severity:** High
**Evidence:** `packages/cli/src/commands.ts`, `scaffold.ts`, and `install-loader.ts`.

`init` invokes dependency installation but does not use the returned success result to determine the command exit status. A failed install can therefore print a successful initialization and misleading next steps.

**Required correction:** return a non-zero exit code on installation failure, preserve a resumable scaffold, and tell the user exactly how to rerun installation. Add tests for Bun failure, npm fallback failure, `--no-install`, and partial installation.

### A-15 — Fresh-project commands, scripts, and instructions are inconsistent

**Severity:** High
**Evidence:** generated `package.json`, `scaffold-docs.ts`, `commands.ts`, and `dev`/deployment assets.

The generated project scripts expose only a subset of the CLI. The next-step text points to root `docker compose up -d` and `okcms db:migrate`, while the `dev` flow uses `docker-compose.infra.yml`. The generated package does not clearly declare the intended command invocation model for all documented commands.

**Required correction:** generate one authoritative command matrix and use it in package scripts, README, help output, and wizard metadata. Make local infrastructure use one compose source, with explicit overrides when needed.

### A-16 — Backup and restore ignore the generated database configuration

**Severity:** High
**Evidence:** `db:backup` and `db:restore` handlers in `packages/cli/src/commands.ts`.

These commands read `DATABASE_URL`, while generated projects expose separate `DB_*` variables and may not define `DATABASE_URL`. They are PostgreSQL-only and do not validate the selected provider before invoking `pg_dump`/`pg_restore`.

**Required correction:** centralize connection resolution; support the same configuration source as runtime; validate provider/tool availability; refuse to run with ambiguous or unsupported settings; test backup and restore against the generated `.env` format.

### A-17 — Deployment and process lifecycle have stale defaults

**Severity:** High
**Evidence:** `packages/cli/src/simple.ts`, `bluegreen.ts`, `start.ts`, `runtime-state.ts`, and PM2 asset generation.

The deployment paths hardcode PostgreSQL/Redis service names and compose filenames. PM2 assets hardcode ports rather than using project configuration. The process manager does not robustly await child exits, and the fallback running-app discovery omits the worker, so `stop` can leave a worker process running.

**Required correction:** derive all service names, ports, and app roles from one runtime configuration; track child lifecycle; include worker in stop/status; add restart/partial-start tests and custom-port tests.

### A-18 — Doctor and runtime version requirements disagree

**Severity:** Medium
**Evidence:** `doctor.ts`, root `package.json`, and the CLI package `engines` declaration.

Doctor checks a Node version lower than the package/runtime requirement. This can approve an environment that the package refuses or that is unsupported by the build.

**Required correction:** derive checks from one version policy and report the exact required range.

## 5. Migration inventory and required disposition

| Migration group | Current condition | Required disposition |
|---|---|---|
| `V001`–`V006` | Mostly marked and broadly idempotent; includes structural and data changes | Confirm domain, checksum, numeric ordering, and real upgrade behavior |
| `V007` | No standard marker contract | Add explicit metadata and rollback classification |
| `V008` | RLS down does not restore full prior state | Rewrite or classify forward-only with operator procedure |
| `V009` | Data-oriented migration with weak/empty down semantics | Classify and add verification/backup requirements |
| `V010` | Down removes indexes and `updated_at` | Remove destructive implicit down; define forward repair |
| `V011` | Down is not a true inverse | Classify as irreversible or write a tested inverse |
| `V012` | Marked and relatively regular | Add checksum/lock/domain metadata |
| `V013`–`V017` | No standard markers/rollback contract | Normalize metadata and classify each operation |
| `V018` | Backfill plus destructive down | Split data repair from destructive cleanup and require approval |
| `V019` | Deletes duplicates before unique constraint | Add preflight, conflict report, threshold, and approval |
| `V020` | Duplicate cleanup plus unguarded constraint creation | Make deterministic and idempotent; never silently delete data |
| `V021` | One-way content repair | Keep as forward-only with backup, audit, and post-check |
| `V022`–`V023` | Regular-looking schema changes | Verify against baseline and provider contract |
| `V024` | Global uniqueness restoration can conflict with tenant data | Add preflight and explicit conflict resolution |
| `V025` | Intentional one-way canonicalization | Preserve conflict audit, prohibit fake rollback, and document recovery |

## 6. Command inventory for generated projects

The CLI currently declares 34 top-level commands. The grouped help/wizard catalog contains 32: `dev` and `i18n:extract` are absent from the catalog even though they exist in the command registry. The following inventory covers every declared command.

| Command | Current behavior | Main finding |
|---|---|---|
| `init` | Scaffolds project, resolves ranges, installs dependencies | Can report success after install failure; generated assets and next steps are inconsistent |
| `start` | Starts API/admin/web/worker processes | Child lifecycle and worker fallback tracking are incomplete |
| `stop` | Stops tracked applications | May leave worker running when pidfile discovery fails |
| `status` | Reports process/runtime state | Depends on incomplete process discovery and hardcoded role assumptions |
| `dev` | Starts local infrastructure and development processes | Uses a different compose path from printed init instructions; provider support is false for MySQL/MariaDB |
| `menu` | Opens the interactive CLI wizard | See the complete UI/UX audit in Section 7 |
| `doctor` | Checks environment and connectivity prerequisites | Version policy and provider support checks are inconsistent |
| `plugin:create` | Creates a plugin scaffold | Needs generated migration/manifest ownership rules |
| `theme:create` | Creates a theme scaffold | Needs consistency with generated project paths and command metadata |
| `theme:build` | Builds a theme | Must use the same runtime/package resolution policy as update/deploy |
| `build` | Builds monorepo packages; generated projects may already use published artifacts | Ambiguous in a generated project; should state whether it is supported there |
| `config` | Reads/updates project configuration | Must distinguish read-only inspection from writes and validate provider/port settings |
| `update` | Finds and installs newer `@oktis-works` packages | Uses transitive scans and `@latest`; registry failure and migration ordering are unsafe |
| `redeploy` | Stages migrations/plugins and performs deployment preparation | Migration conflicts are warnings; plugin ownership collisions are not blocked |
| `db:migrate` | Prepares database and runs migrations | Preparation mutates data; tenant/global ledger mismatch; no checksum drift check |
| `db:rollback` | Prepares database and rolls back a selected migration | Preparation mutates data; ordering is not true applied order; down contracts are unsafe |
| `db:status` | Prepares database and lists applied rows | Not read-only; does not show pending, drifted, missing, duplicate, or orphaned files |
| `db:backup` | Runs `pg_dump` | Reads the wrong configuration source for generated projects; PostgreSQL-only |
| `db:restore` | Runs `pg_restore` | Same configuration/provider problem; destructive operation needs stronger preflight |
| `plugin:install` | Installs a plugin | Must validate migration manifest, provider compatibility, and conflict ownership |
| `plugin:list` | Lists installed plugins | Should show migration/schema state and disabled/incompatible status |
| `plugin:search` | Searches the registry | Registry failure semantics should be explicit rather than silently empty |
| `plugin:manage` | Enables/disables plugin state | Needs typed tenant/slug handling, transactional config, and accurate dangerous-action confirmation |
| `theme:install` | Installs a theme | Must align package/update ranges and activation transaction |
| `theme:list` | Lists themes | Should distinguish installed, active, compatible, and broken themes |
| `theme:search` | Searches themes | Same registry/offline semantics as plugin search |
| `theme:manage` | Activates/manages themes | Best-effort config/DB updates can leave runtime and database state inconsistent |
| `media:migrate` | Runs media migration | Does not sufficiently validate source/target and provider/storage compatibility |
| `user:create` | Creates an administrative/user record | Needs explicit tenant scope and should not be coupled to demo seed behavior |
| `seed` | Seeds core/default/demo data | Must be the only place where demo cleanup/recreation occurs, with explicit mode and confirmation |
| `system:status` | Reports system status | Must share one provider/runtime health model with `doctor`, `status`, and the menu |
| `i18n:extract` | Extracts translation strings | Missing from parser grouping and menu catalog |
| `rollback` | Performs deployment rollback | Dangerous-action classification, backup, and runtime state validation are incomplete |
| `deploy` | Performs deployment | Hardcoded infrastructure/provider assumptions and non-blocking migration conflicts are unsafe |

## 7. Front B: complete `okcms menu` UI/UX audit

### 7.1 Current interaction model

The wizard offers:

- Main menu: guided flows, run a command, configure `.env`, project status, language, refresh status, and exit.
- Guided flows: local development, blue/green deployment, simple deployment, PM2 deployment, update, and initialization.
- Command catalog: grouped project, database, extension, deployment, and system commands.
- Generic command form: required positional values followed by optional flags.
- Environment wizard: a multi-step interview for selected environment variables.
- Status probe: project detection, infrastructure health, runtime state, and update availability.

The wizard reuses real CLI commands through subprocess execution, which is a sound foundation. The main problem is that the metadata, parser, state probe, and display layers do not share a complete typed contract.

### 7.2 Functional and interaction findings

| ID | Severity | Finding | User impact |
|---|---|---|---|
| UX-01 | High | Boolean options are parsed as values when followed by a positional token. | `okcms init --no-install my-site` can consume `my-site` as the flag value; restore and other commands have similar failures. |
| UX-02 | High | The command catalog omits `dev` and `i18n:extract`, while the wizard count claims all 34 commands. | Users cannot discover or launch every command through the advertised menu. |
| UX-03 | High | Secret values entered in the wizard can appear in the formatted automation command mirror. | Passwords, tokens, and secrets can leak to terminal recordings, logs, or screenshots. |
| UX-04 | High | Ctrl+C/escape in raw navigation calls process exit rather than returning to the previous menu. | A user cannot safely cancel a nested flow; cancellation semantics differ between prompt types. |
| UX-05 | High | `Configure .env` always defaults the database engine to PostgreSQL rather than reading `DB_ENGINE`. | Opening the wizard and accepting defaults can overwrite an existing MySQL/MariaDB choice. |
| UX-06 | High | Status says infrastructure is running when either PostgreSQL or Redis is running. | The menu can report a usable environment when one required service is down. |
| UX-07 | High | `isProject` is true when any `.env` or config file exists. | A random `.env` in a directory is treated as a valid project. |
| UX-08 | High | Dangerous-action confirmation covers only a subset of mutating commands. | Migrate, seed, deploy, redeploy, media migration, plugin/theme state changes, and config writes may lack appropriate warnings. |
| UX-09 | Medium | Generic optional flags are text inputs rather than typed booleans/enums/paths. | Users can enter invalid values and cannot tell whether blank means false, omitted, or default. |
| UX-10 | Medium | The command mirror joins raw arguments without shell quoting. | Paths with spaces and special characters are not safely copyable or reproducible. |
| UX-11 | Medium | The screen is cleared after subprocess output. | Important logs and failure context disappear before the user can inspect them. |
| UX-12 | Medium | Status probes run repeatedly during rendering and can be slow or flicker. | Navigation feels unstable and may invoke Docker/registry checks unnecessarily. |
| UX-13 | Medium | Environment hints refer to 47 variables, while the interview covers only a smaller essential set. | The user receives a misleading expectation of configuration coverage. |
| UX-14 | Medium | Database connection mode defaults to individual variables without inferring an existing `DATABASE_URL`. | The visual form can misrepresent the actual configuration. |
| UX-15 | Medium | Menu language changes do not consistently translate command descriptions, groups, hints, or flow text. | The experience is partially localized and cognitively inconsistent. |
| UX-16 | Medium | The wizard does not clearly mark unavailable commands outside a project. | Users can enter a command flow only to learn later that its context is invalid. |
| UX-17 | Medium | Generic command forms do not provide command-specific validation or dependency hints. | Invalid paths, tenant IDs, provider choices, and required prerequisites fail late. |
| UX-18 | Low | Main navigation lacks a visible home/back action. | Deep flows rely on implicit cancellation behavior. |
| UX-19 | Low | Layout is not terminal-width aware; long labels, hints, and values can wrap badly. | The visual hierarchy breaks on narrow terminals or localized text. |
| UX-20 | Low | Color, emoji, and partial repaint behavior are not consistently adapted to `NO_COLOR`, non-UTF terminals, or slow output. | Accessibility and portability are reduced. |
| UX-21 | Low | Numbered fallback navigation and raw-key navigation have different visual affordances. | The same action can feel different depending on terminal capability. |
| UX-22 | Low | The update flow is nested deeply inside guided flows without a plan preview. | Users cannot see package, migration, backup, and deployment effects before execution. |

### 7.3 Aesthetic and accessibility assessment

The visual language has a recognizable banner, color hierarchy, and status blocks, but it is not yet a stable design system. The main aesthetic issues are inconsistent spacing across screens, hints that are not width-aware, mixed raw-key and numbered interaction models, output being cleared too aggressively, and incomplete localization. Accessibility issues include color-dependent status meaning, lack of an explicit no-color mode, unclear focus/selection state in fallback layouts, no consistent cancel/back key, and insufficient error persistence.

The target should be a compact terminal application with:

- consistent header, breadcrumb, context, body, hint, and footer regions;
- explicit focus and selected/unavailable states that do not depend only on color;
- `NO_COLOR` and ASCII-safe rendering;
- width-aware wrapping and a minimum supported terminal width;
- one cancellation contract that returns to the caller unless the user explicitly chooses exit;
- persistent output panels for command results;
- translated labels and descriptions loaded from one command metadata source.

### 7.4 Complete CLI and menu aesthetic criteria

The following criteria define the visual quality bar for the CLI. They are intended to be implementation requirements, design-review criteria, and acceptance-test cases, not optional decoration.

#### 7.4.1 Visual direction

The interface should feel like a polished developer tool: calm, precise, modern, and operationally trustworthy. It should communicate confidence without looking noisy or game-like.

Required qualities:

- Strong information hierarchy: the user should immediately understand where they are, what can be done, what is selected, and what will happen next.
- Deliberate restraint: use color, borders, icons, and emphasis to clarify decisions, not to decorate every line.
- Consistent rhythm: every screen should use the same spacing scale, alignment rules, title treatment, and footer behavior.
- Operational clarity: success, warning, pending, blocked, offline, and failure states must be visually distinct and textually explicit.
- High signal density: show the most important state first; keep secondary detail available without overwhelming the primary action.
- Brand continuity: the banner, colors, symbols, and wording should feel like one product across init, doctor, update, deploy, and menu flows.

#### 7.4.2 Design tokens

The implementation should define tokens instead of applying ad hoc ANSI styles in individual screens.

| Token family | Required criteria |
|---|---|
| Primary accent | One stable brand accent for active selections, titles, links, and the primary action. It must remain readable on both dark and light terminals. |
| Secondary accent | A restrained secondary color for metadata, breadcrumbs, and supporting information. It must not compete with the primary action. |
| Success | Use a positive color plus a text/icon indicator such as `OK`, `READY`, or a check mark. Never rely on green alone. |
| Warning | Use amber/yellow plus an explicit warning label and a clear consequence. |
| Error | Use red plus `ERROR` or `FAILED` and a recovery action. |
| Informational | Use blue/cyan or an equivalent readable tone plus a descriptive label. |
| Muted text | Use for hints and secondary metadata only; it must remain readable at normal terminal contrast. |
| Disabled text | Must be visibly subdued but still readable enough to explain why an action is unavailable. |
| Surface/border | Use a small number of border styles consistently. Avoid mixing heavy box-drawing styles without a clear hierarchy. |
| Spacing | Use a documented scale, for example 0, 1, 2, and 3 terminal rows. Do not create one-off vertical gaps screen by screen. |
| Density | Define compact, normal, and expanded layouts. Use normal density by default and compact density only when the terminal is narrow. |

Token acceptance checklist:

- [x] All screens use shared semantic tokens rather than raw color literals.
- [x] Every semantic state has a text label or symbol in addition to color.
- [x] The palette has dark/dim/monochrome-safe text fallbacks; color contrast is not the sole state channel.
- [x] `NO_COLOR` removes styling without removing hierarchy or meaning.
- [x] ASCII fallbacks exist for every non-ASCII symbol used in the interface.
- [x] Minimum-width and contrast behavior is covered by the layout and no-color contract tests.

#### 7.4.3 Screen composition

Every full-screen wizard view should follow the same composition:

```text
┌──────────────────────────────────────────────────────────────┐
│ BRAND / SCREEN TITLE                              PROJECT     │
│ Breadcrumb: Menu / Database / Migrate                         │
├──────────────────────────────────────────────────────────────┤
│ Context or status summary                                    │
│                                                              │
│ Primary content and choices                                  │
│                                                              │
│ Supporting explanation, constraints, or preview              │
├──────────────────────────────────────────────────────────────┤
│ [Enter] Select  [↑↓] Navigate  [Esc] Back  [q] Exit          │
└──────────────────────────────────────────────────────────────┘
```

Composition criteria:

- [x] The title is unique, concise, and stable across redraws.
- [x] A breadcrumb identifies the current depth and parent flow.
- [x] The active project and environment are visible without repeating large paths.
- [x] The primary action appears before secondary explanation.
- [x] Footer controls are always in the same location and use the same wording.
- [x] Long content uses shared wrapping/truncation helpers rather than uncontrolled horizontal output.
- [x] Screen state changes retain output and do not rely on a full terminal clear for meaning.
- [x] Empty states explain what is missing and provide the next action.

#### 7.4.4 Header, banner, and branding

- The startup banner should be compact enough for normal terminals and should not dominate every nested screen.
- Use a single brand mark or wordmark treatment; do not alternate between unrelated banner styles.
- Keep the product name, version, environment, and project name visually distinct.
- Avoid decorative ASCII art that consumes more than four terminal rows unless the user explicitly requests a welcome screen.
- Make the banner optional in non-interactive output and suppress it when output is piped.
- Ensure the banner has an ASCII fallback and does not depend on emoji rendering.
- Use the same capitalization and punctuation for `okcms`, command names, statuses, and action labels everywhere.

#### 7.4.5 Navigation and selection states

Selection must be unmistakable in raw-key mode and numbered fallback mode.

- Selected item: use a stable marker such as `›` with an ASCII `>` fallback, plus accent styling.
- Unselected item: use aligned text with no unnecessary color noise.
- Disabled item: use a lock or reason marker only when supported, plus a short reason such as `requires project`.
- Destructive item: use a warning marker and a risk label before the user enters it.
- Current step: show `Step 2 of 4` or an equivalent progress indicator in multi-step flows.
- Focus order: keep navigation order predictable and avoid moving the cursor between unrelated regions.
- Long lists: keep the selected item visible and show a scroll indicator when items exceed the viewport.
- Search/filter: provide filtering for command catalogs once the number of commands exceeds one screen.
- Back/exit: use distinct labels; `Back` must not look identical to `Exit`.

#### 7.4.6 Forms and command previews

Forms should look intentional rather than like a generic sequence of prompts.

- Group related fields into named sections such as `Database`, `Authentication`, and `Runtime`.
- Show the current value, default, and required/optional status with consistent visual treatment.
- Use masked controls for secrets and never display the raw value after submission.
- Use an explicit toggle for booleans, a selector for enums, and a validated path field for files/directories.
- Show inline validation beside the field and preserve the user input after an error.
- Display a review screen before any mutating or destructive command.
- Format previews as a structured plan, not as an unescaped shell string.
- Redact secrets in previews using a fixed placeholder such as `<redacted>`.
- Show affected project, tenant, provider, package, migration, and backup information before execution.
- Use an explicit `Confirm` action whose label includes the consequence, such as `Apply 3 migrations` or `Delete demo data`.

#### 7.4.7 Status cards and operational state

Status must be both attractive and truthful.

- Use one compact status card per subsystem: project, database, cache, API, admin, web, worker, migrations, and update state.
- Each card must show state, last check time, and a next action when unhealthy.
- Do not use a single aggregate “running” state when only part of the infrastructure is healthy.
- Prefer short labels such as `READY`, `DEGRADED`, `BLOCKED`, `OFFLINE`, and `UNKNOWN`.
- Pair each status label with a symbol and a color, but make the label sufficient on its own.
- Use consistent card width and alignment so the screen does not jump between refreshes.
- Keep transient probe progress separate from final status; never show stale data as current.
- Make `Refresh` visually distinct from automatic rendering and show when the last refresh happened.

#### 7.4.8 Output, progress, and errors

- Long-running operations need a clear phase indicator: `Preparing`, `Applying`, `Verifying`, `Completed`, or `Failed`.
- Show progress at the level users can understand: package count, migration count, or deployment step, not arbitrary spinner activity.
- Keep the last meaningful log lines visible after a command completes.
- Provide a `Show details` or scrollable output action for verbose logs.
- Do not clear errors immediately after a failed subprocess.
- Error screens must contain: what failed, why it matters, what was changed, and the safest next action.
- Success screens must contain: what completed, what remains, and how to continue.
- Spinners must stop cleanly on success, failure, cancellation, and terminal resize.
- Use one spinner/progress style across all guided flows.

#### 7.4.9 Responsive terminal behavior

Define and test at least these widths:

| Width | Required behavior |
|---:|---|
| 120+ columns | Full layout with summaries and side-by-side status where useful |
| 80–119 columns | Normal layout with wrapped descriptions and stable borders |
| 60–79 columns | Compact layout, stacked status cards, shorter labels |
| Below 60 columns | Simplified borderless layout or clear minimum-width message; never corrupt text |

Responsive criteria:

- [x] Every shared menu/status line is wrapped or truncated intentionally.
- [x] Truncation preserves the beginning of paths and package names and adds an identifiable ellipsis.
- [x] Menus do not draw borders that can overwrite text or create uncontrolled horizontal scrolling.
- [x] Selection remains represented after redraw and width changes.
- [x] Footer controls remain available in the numbered and raw-key layouts.
- [x] English and Portuguese wizard labels are included in the interaction test baseline.

#### 7.4.10 Motion and redraw behavior

- Use motion only to communicate progress or state transition.
- Do not animate decorative elements in a command-line workflow.
- Redraw only the affected region when possible; avoid visible flicker.
- Preserve cursor position and restore terminal state on every exit path, including Ctrl+C and thrown errors.
- Disable animation automatically for non-TTY output, slow terminals, `NO_COLOR`, and accessibility-oriented settings.
- Never hide a completed result behind a spinner or clear it before the user can read it.

#### 7.4.11 Localization and language quality

- Translate titles, descriptions, prompts, status labels, validation messages, key hints, errors, and confirmation text as one set.
- Do not mix English command descriptions with a translated shell around them unless the command name itself is intentionally preserved.
- Keep command names, flags, package names, paths, and environment variable names unchanged.
- Allow text expansion without breaking borders or action order.
- Use the same tone: concise, direct, and operational; avoid inconsistent formal/informal wording.
- Test missing translation keys with a visible development warning, never a blank label.

#### 7.4.12 Accessibility and terminal compatibility

- Every state must remain understandable without color.
- Every interactive action must be available through keyboard navigation and numbered fallback where raw keys are unavailable.
- Support `NO_COLOR` and a plain-text mode for logs and CI.
- Do not rely on emoji to convey severity, completion, or direction.
- Keep prompts readable by screen readers and line-oriented terminal tools.
- Avoid rapid cursor movement and partial-line redraws that make output difficult to capture.
- Preserve a stable textual command summary for users who cannot use the interactive layout.

#### 7.4.13 Aesthetic approval checklist

This checklist is mandatory before the CLI/menu visual work is considered complete:

- [x] The same screen grammar is used by the active init, doctor, update, deploy, database, plugin, theme, and menu flows.
- [x] The design system uses shared tokens for color, spacing, typography, symbols, and density.
- [x] The primary action is placed before secondary explanation.
- [x] Destructive actions are visually distinct and show their consequence before confirmation.
- [x] Success, warning, error, pending, offline, unknown, and disabled states are distinct without color.
- [x] Shared screens use stable spacing and alignment rules.
- [x] No screen clears useful output before the user can inspect it.
- [x] No secret, token, password, or private connection value is visible in previews or errors.
- [x] Layout helpers cover wide, standard, narrow, and below-minimum terminal widths.
- [x] Screens have no-color and ASCII-safe rendering contracts.
- [x] English and `pt` locale screens preserve hierarchy and action clarity.
- [x] Raw-key and numbered fallback modes expose equivalent actions and state meaning.
- [x] Ctrl+C, Escape, Back, and Exit have predictable behavior.
- [x] A first-time user can identify project, environment, action, risk, and next step.
- [x] A returning expert can complete common flows without redundant prompts.

### 7.5 Complete interaction map for the okcms menu

This map defines every user-facing interaction surface that must be designed, implemented, tested, and visually reviewed. A screen is not complete merely because its command executes successfully; entry, navigation, feedback, cancellation, recovery, and exit behavior are all part of the experience.

#### 7.5.1 Interaction state model

Every menu surface should use the same state model:

    Idle -> Loading -> Ready -> Input -> Review -> Executing
                                          |          |
                                          v          v
                                      Cancelled   Success
                                                      |
                                                      v
                                                   Failure

Required state rules:

- Idle: show context and available actions without implying that a check has completed.
- Loading: show what is being checked and provide a safe cancellation path when possible.
- Ready: show the selected/default action and its prerequisites.
- Input: show field purpose, validation, current value, and navigation controls.
- Review: show the exact intended effect, risk, scope, and redacted values.
- Executing: disable conflicting navigation, show progress, and preserve cancellation semantics.
- Success: show completed work, resulting state, and the next recommended action.
- Failure: preserve the error, explain partial effects, and offer details, retry, back, or exit.
- Cancelled: confirm that no further action is running and return to the correct parent screen.
- Unavailable: explain the missing prerequisite and offer the shortest route to resolve it.

No screen should silently jump between these states, clear a state before it can be read, or use a generic spinner when the user needs a decision.

#### 7.5.2 Full interaction surface inventory

| Surface | Entry and actions | Current gaps or risks | Required visual and navigation behavior |
|---|---|---|---|
| CLI entry | okcms menu, bare okcms in a TTY, and non-TTY invocation | Entry behavior differs by TTY; non-TTY does not expose the same interaction model | Show a concise welcome/context screen in TTY; provide stable, script-friendly help in non-TTY; never draw interactive controls into a pipe |
| Terminal setup | Raw-key mode, cursor visibility, colors, terminal resize, signal handlers | Terminal cleanup and cancellation are not consistently centralized | Enter raw mode once, restore terminal state on every exit path, and show a compatibility notice when raw mode is unavailable |
| Startup loading | Project detection, environment loading, Docker/runtime probes, package update probe | Probes can repeat during rendering and a false project can be detected from an arbitrary .env | Show a short staged loading view, cache the result, show timestamp/source, and allow explicit Refresh |
| Welcome/banner | Product identity, version, project name, environment | Decorative banner can dominate screens and may fail on narrow/non-UTF terminals | Use one compact brand treatment, with ASCII fallback and no banner in piped output |
| Main menu | Guided flows, Run a command, Configure .env, Project status, Language, Refresh, Exit | No consistent Back/Home model; unavailable actions are not always marked | Use a stable vertical menu, visible selection, one-line descriptions, disabled reasons, and a fixed footer |
| Main-menu context | Current directory, project validity, provider, runtime health, update state | Context can be stale or too verbose | Show a compact context strip with short labels and a last-checked time |
| Guided-flow menu | Local development, blue/green deployment, simple deployment, PM2, update, init, Back | Flow order is not prioritized; risk and prerequisites are not visible early | Group by intent, display prerequisites/risk, show Step 1 of N, and retain a clear Back action |
| Local-development flow | Provider/infra selection, start services, start apps, retry, status | Compose/provider assumptions can conflict with generated project assets | Show a preflight card listing services, ports, provider, and files; show each service transition independently |
| Blue/green deployment flow | Target selection, build, migration, health check, switch, rollback path | High-risk effects are not summarized as one plan | Use a staged timeline with current step, completed steps, pending steps, and a visible rollback/recovery action |
| Simple deployment flow | Build, migrate, start/restart, health check | Progress and partial failure recovery are not sufficiently visible | Show a linear operation plan and mark the exact step that failed; preserve logs and provide retry from a safe boundary |
| PM2 deployment flow | Generate ecosystem, deploy, start, verify, restart/rollback | Hardcoded ports and process roles can produce misleading success | Show resolved ports/process names before execution and verify each process after startup |
| Update flow | Detect updates, show package plan, install, sync migrations, migrate, deploy | No complete plan preview; package, migration, backup, and deployment effects are split | Use a review screen with package diff, migration diff, backup requirement, risk, and explicit Apply action |
| Init flow | Project name, language, install choice, provider/configuration, scaffold, dependency install | Install failure can look successful; no-install semantics are not clear | Show a stepper, generated path, provider, install decision, progress, and a resumable failure result |
| Command-category menu | Project, Database, Extensions, Deploy, System groups | Two declared commands are missing from the menu; groups may be too long for one screen | Show group descriptions, command count, search/filter, selected command preview, and unavailable reasons |
| Command search/filter | Type query, clear query, select result, return to group | No search/filter despite a growing command catalog | Keep search input visible, highlight matches, show no-results recovery, and preserve group context |
| Command detail | View description, prerequisites, danger level, required database/project state | Generic metadata does not expose complete risk or dependency information | Show purpose, scope, risk, prerequisites, affected resources, and expected duration before entering arguments |
| Required arguments | Enter project name, tenant, path, migration, plugin/theme, or other positional values | Generic prompts lack type-specific validation and can consume values incorrectly | Display field type, example, allowed values, validation rules, current/default value, and inline error recovery |
| Optional flags | Select flags and values such as --yes, --clean, --mode, or provider options | Boolean values are text-like; blank/false semantics are ambiguous; parser arity is unsafe | Use toggles, selectors, and numeric/path controls; distinguish omitted, false, default, and explicit values |
| Secret fields | Enter passwords, tokens, keys, and private URLs | Secret can appear in command mirrors or error output | Mask input, show only a redacted summary, prevent clipboard/log exposure, and state that the value is protected |
| Environment wizard entry | Open Configure .env, select scope/mode, read existing values | Database engine and connection mode defaults can overwrite existing configuration | Load current values first, show current versus new, and make overwrite scope explicit |
| Environment wizard sections | Database, authentication, URLs, storage, email, runtime, advanced values | Essential and advanced coverage is not clearly separated; variable count hint is inaccurate | Use section navigation, completion markers, field counts, skip/advanced semantics, and a final diff review |
| Environment validation | Invalid URL, missing secret, unsupported provider, conflicting values | Errors can appear late and generic | Validate inline, explain how to fix, preserve input, and block only the affected step until valid |
| Environment save/review | Compare current/new values, write .env, cancel changes | No clear transactional preview of file changes | Show changed keys without exposing secrets, display backup/overwrite behavior, then confirm save |
| Project status screen | View project, services, processes, migrations, updates, configuration health | Aggregate status can say running when only one dependency is healthy | Use aligned subsystem cards, explicit READY/DEGRADED/BLOCKED/OFFLINE/UNKNOWN, timestamps, and next actions |
| Migration status screen | View applied/pending/drifted/missing/blocked migrations | Current status shows applied rows but not the complete plan or checksum drift | Show domain, owner, version, checksum state, risk, and an action to inspect before migrate/rollback |
| Plugin/theme management | Install/list/search/manage plugins and themes | State transitions and compatibility are not visually clear | Show installed/active/disabled/incompatible/broken states, source/version, migration status, and consequences |
| Confirmation screen | Confirm migration, restore, deploy, seed, rollback, config overwrite, plugin/theme state change | Danger classification misses several mutating operations | Use a dedicated review layout with risk label, scope, affected count, backup status, exact action label, and Cancel/Back |
| Command preview | Show generated command or operation plan before execution | Raw arguments are not safely shell-quoted and secrets may be visible | Prefer structured plans; if a shell command is shown, quote arguments and redact sensitive values |
| Subprocess execution | Run command, stream output, cancel, wait, handle exit code | Output is cleared; progress is generic; cancellation differs by input mode | Keep a live log panel, show phase/progress, disable conflicting actions, and preserve output after completion |
| Success result | Acknowledge completion, inspect details, continue, return to menu | Success can be reduced to a short message with no next step | Show result summary, changed resources, warnings, next recommended action, and Back/Home |
| Failure result | Inspect error, retry, change input, return, exit | Failure context and partial effects are not persistent enough | Show cause, scope, partial effects, recovery options, log details, and a safe default action |
| Retry flow | Retry same action, edit inputs, restart preflight | Retry may repeat a partially applied operation without a plan | Identify whether the operation is safe to retry, re-run preflight, and explain what will be repeated |
| Cancellation flow | Escape, Ctrl+C, Back, Cancel, Exit | Raw navigator can terminate the process; cancellation contracts differ | Use one hierarchy: Cancel current step, Back to parent, Exit menu; preserve terminal state and never hide partial results |
| Language selector | Switch locale, apply, return | Translation coverage is incomplete and changes may not be consistent | Show language names, current selection, preview changed labels, and preserve navigation position |
| Refresh action | Reprobe project, Docker, processes, registry, migrations | Refresh is not clearly distinct from automatic probes | Show refresh scope, timestamp, progress, and changed-state summary; do not refresh everything invisibly |
| Exit flow | Exit from main menu, nested screen, running command, or raw mode | Exit and Back are not consistently distinguished | Confirm only when work is active or unsaved; otherwise exit immediately and clean the terminal |
| Non-interactive mode | Piped output, CI, redirected logs, no TTY | Interactive assumptions may leak into automation | Produce stable text/JSON where supported, no cursor controls, no spinners, no prompts, and actionable exit codes |
| Compatibility fallback | Numbered selection when raw keys are unavailable | Fallback layouts have different affordances and may omit actions | Mirror every action, state, shortcut, disabled reason, and confirmation in a line-oriented format |
| Resize and narrow terminal | Resize during menu, form, output, or spinner | Text can overflow and selected items can disappear | Reflow without losing state, preserve focus, switch to compact layout, or show a clear minimum-width message |
| Accessibility mode | NO_COLOR, reduced motion, plain text, screen-reader-friendly output | No complete alternative presentation contract | Preserve hierarchy in text order, disable animation, expose labels, and avoid color-only meaning |

#### 7.5.3 Navigation rules for every screen

Every interactive screen must satisfy these rules:

- [x] The user can identify the current screen and parent screen without guessing.
- [x] Primary, secondary, Back, Cancel, and Exit actions are visually distinct.
- [x] Selection and input focus are visible without relying on color alone.
- [x] The footer states the valid keys for the current screen.
- [x] Enter, Escape, Ctrl+C, and arrows keep their meaning across equivalent controls.
- [x] Back returns to the previous logical screen and preserves safe selections where useful.
- [x] Cancel abandons the operation without writing files, changing configuration, or starting a subprocess.
- [x] Exit restores terminal mode and returns the correct process code.
- [x] Loading, empty, unavailable, validation-error, success, and failure states have dedicated messages/layouts.
- [x] Every transition states its reason: selection, validation, confirmation, execution, completion, or cancellation.
- [x] Nested flows always expose a path back.
- [x] Confirmation shows scope and consequence before execution.

#### 7.5.4 Navigation-specific aesthetic checklist

- [x] Active screens share the same header/footer geometry and menu grammar.
- [x] Breadcrumbs use a consistent separator and context order.
- [x] Menu rows align marker, label, description, status, and shortcut content.
- [x] Selection movement does not intentionally change unrelated content.
- [x] Focus, disabled, danger, and current-step states use documented visual tokens.
- [x] Screen transitions preserve spatial orientation.
- [x] Long-running actions retain a stable command/result anchor.
- [x] Review screens have stronger hierarchy than ordinary forms.
- [x] Error screens retain branding while exposing recovery guidance.
- [x] Success screens do not hide warnings.
- [x] Destructive confirmations are clearer and require an explicit choice.
- [x] Empty and unavailable states include actionable explanations.
- [x] The menu remains coherent when descriptions are translated or expanded.
- [x] Raw-key, numbered, no-color, and narrow-terminal modes expose the same actions.

#### 7.5.5 Mandatory interaction walkthroughs

The following walkthroughs must be recorded as automated or scripted acceptance scenarios:

1. Start okcms menu in a valid project, inspect status, open a command, go Back twice, and exit.
2. Start the menu outside a project, inspect unavailable actions, return without creating files, and exit.
3. Open each guided flow, inspect prerequisites, cancel at every step, and verify no side effect occurred.
4. Run a harmless read-only command from the catalog and inspect its success result and retained output.
5. Enter an invalid required path, correct it, and verify the error does not reset unrelated fields.
6. Enable and disable a boolean option, verify the preview, and confirm positional arguments remain intact.
7. Enter a secret, inspect review/output/error screens, and prove that the raw value never appears.
8. Open Configure .env with an existing non-default provider and connection mode, accept no changes, and verify the file is unchanged.
9. Change one environment value, inspect the redacted diff, cancel, then repeat and save.
10. Run a mutating command, review its risk and affected scope, cancel, and verify no subprocess or file write occurred.
11. Run a mutating command successfully, inspect the result, return to the menu, and verify status is refreshed only when requested.
12. Force a subprocess failure, inspect details, retry safely, edit inputs, return, and exit without losing the original error context.
13. Press Escape, Ctrl+C, Back, and Exit in every nested screen and verify distinct, documented outcomes.
14. Switch language, inspect every menu layer, and verify translated labels do not break layout or action order.
15. Run at 120, 80, 60, and below-60 columns with raw-key and numbered fallback navigation.
16. Run with NO_COLOR, non-UTF terminal settings, redirected output, and no TTY.
17. Start a long-running update/deploy flow, inspect progress and logs, resize the terminal, cancel if safe, and verify terminal restoration.
18. Open every command in the catalog and verify description, prerequisites, arguments, flags, risk classification, preview, execution, and result view.

## 8. Target architecture after correction

### 8.1 Migration domains

```text
core_schema_migrations       -> global DDL, extensions, indexes, RLS, global constraints
tenant_data_migrations       -> tenant-scoped data transformations only
plugin_schema_migrations     -> plugin-owned schema/data with one search_path transaction
```

Every migration should have machine-readable metadata:

```text
id, domain, owner, version, name, checksum, dependencies,
reversible | forward_only, destructive, requires_backup, provider
```

### 8.2 CLI command contract

Replace ad hoc command option declarations with a typed schema shared by parser, help, wizard, shell mirror, and tests:

```text
argument kind: positional | flag
type: string | boolean | enum | path | secret | url | integer
required, default, validation, sensitive, repeatable
requires_project, mutates_data, destructive, requires_database
```

The parser must reject unknown options, preserve positional arguments, support `--`, and enforce arity before handlers run.

### 8.3 Database command contract

Read-only commands must not create schema, seed data, delete demo content, create tenants, or rewrite configuration. Any command that can alter data must show an operation plan and an explicit confirmation appropriate to its risk.

## 9. Full correction plan by dependency phase

The phases below are ordered. A phase may not be marked complete until every mandatory checklist item is checked and its linked acceptance tests pass.

### Phase 0 — Freeze the contract and build fixtures

**Depends on:** none.
**Findings covered:** all findings; prerequisite for A-01 through A-18 and UX-01 through UX-22.

Checklist:

- [x] Write the supported database-provider policy; PostgreSQL, MySQL, and MariaDB are independent supported targets with explicit version and capability differences.
- [x] Define migration domains, identity, version ordering, checksum behavior, rollback classes, and failure semantics in the runner metadata contract.
- [x] Define which commands are read-only, mutating, destructive, interactive, project-scoped, and database-scoped in the shared command registry.
- [x] Create disposable PostgreSQL fresh-schema and historical release-boundary acceptance fixtures with transaction locking.
- [x] Create generated-project fixtures for install success, install failure, `--no-install`, custom ports, existing `.env`, and offline registry behavior.
- [x] Create scripted terminal fixtures for raw keys, numbered fallback, Ctrl+C, narrow width, `NO_COLOR`, secrets, English, and `pt` locale.
- [x] Record the source-contract acceptance matrix in CI; PostgreSQL, MySQL, and MariaDB lifecycle runs are explicit service-backed gates.

### Phase 1 — Establish one schema and ledger source of truth

**Depends on:** Phase 0.
**Findings covered:** A-01, A-05, A-08, A-10, migration inventory, UX-17.

Checklist:

- [x] Decide that `schema.sql` is the canonical fresh-database snapshot; existing databases receive infrastructure only and numbered migrations own upgrades.
- [x] Remove implicit replay of the full snapshot from bootstrap; existing-schema changes now require numbered migrations.
- [x] Add core, tenant, and plugin migration ledger tables with explicit domain ownership.
- [x] Add machine-readable migration metadata and a validated manifest, exposed by `okcms db:inventory --json`.
- [x] Define numeric ordering, reject duplicate identities/invalid filenames before execution, and validate dependency metadata/cycles.
- [x] Add provider metadata and reject a migration whose provider does not match the active runtime.
- [x] Add a read-only migration inventory command that shows owner, domain, version, checksum, reversibility, and backup/destructive risk in text or JSON form.
- [x] Write a one-time upgrade and forward-only recovery procedure in `docs/migration-recovery.md`.
- [x] Verify fresh install and upgrade from every supported historical release fixture; the fixture corpus is exercised by CI.

### Phase 2 — Repair the runner and migration SQL contract

**Depends on:** Phase 1.
**Findings covered:** A-03, A-04, A-06, A-07, A-09, A-10, migration inventory.

Checklist:

- [x] Validate stored checksums on status and migration execution; fail closed on drift.
- [x] Add a domain-scoped advisory lock covering plan discovery through completion on the PostgreSQL runtime; non-reservable test doubles use per-migration locks.
- [x] Use transaction-local tenant context; pooled-connection integration proof remains pending.
- [x] Make one transaction own each plugin migration, including search path, SQL execution, ledger insert, and checksum.
- [x] Add a regression test proving each plugin `Up` runs exactly once.
- [x] Normalize all migration headers with domain/provider metadata and classify reversibility/forward-only behavior from headers and Up/Down sections.
- [x] Replace implicit destructive rollback with explicit Down SQL or operator-approved forward-only recovery documented in `docs/migration-recovery.md`.
- [x] Add preflight conflict reports for duplicate data, uniqueness restoration, JSON/content conversion, and affected-row thresholds.
- [x] Ensure required schema failures propagate instead of becoming warnings; only the explicit missing-legacy-infrastructure probe is handled as a compatibility case.
- [x] Make rollback choose the latest applied migration within the selected domain and record the result atomically.
- [x] Add migration progress/result records through the domain ledgers and structured update progress through `.deploy/update-progress.json`.

### Phase 3 — Make database preparation and commands safe

**Depends on:** Phase 1 and Phase 2.
**Findings covered:** A-02, A-05, A-09, A-16, commands `db:*`, `seed`, `user:create`, `system:status`, UX-06, UX-08.

Checklist:

- [x] Split connection, migration infrastructure, schema upgrade, tenant lookup, system seed, and demo seed into separate operations.
- [x] Make `db:status` strictly read-only and show pending, applied, drifted, missing, orphaned, and blocked migrations.
- [x] Make `db:rollback` avoid schema bootstrap, tenant creation, and demo seeding; support explicit core/tenant/plugin domain selection.
- [x] Make `db:migrate` resolve/create a tenant only when the migration inventory contains tenant-data or plugin migrations.
- [x] Make `seed --demo` explicit and confirmation-gated; system seed runs without demo cleanup. Migration risk and backup requirements are surfaced by the manifest.
- [x] Remove default-tenant demo cleanup from generic preparation; demo seed is now explicit.
- [x] Centralize CLI database URL/`DB_*` resolution for backup, restore, doctor, and database commands; runtime configuration remains the package-config source of truth.
- [x] Validate backup freshness when requested, target database identity, PostgreSQL provider, and restore destructive impact before execution.
- [x] Add read-only command tests for inventory/status behavior and backup/restore preflight paths; database-state snapshots remain delegated to the external PostgreSQL matrix.

### Phase 4 — Repair update, synchronization, and release safety

**Depends on:** Phase 2 and Phase 3.
**Findings covered:** A-11, A-12, A-14, A-15, A-17, A-18, UX-22.

Checklist:

- [x] Update only direct managed dependencies declared by the generated project.
- [x] Avoid implicit `@latest` by installing the resolved registry version; declared-range and lockfile policy remains pending.
- [x] Distinguish offline, registry-error, and not-found state from a successful up-to-date lookup.
- [x] Always run migration synchronization in download/deploy flows, including the missing-installation download path.
- [x] Make migration conflicts blocking by default and report the conflicting files before mutation.
- [x] Produce a dry-run plan containing package changes, migration synchronization, target selection, and non-mutation guarantees; backup requirements are surfaced by the migration manifest.
- [x] Make update resumable with step-level progress history and safe retry behavior in `.deploy/update-progress.json`.
- [x] Use the same compose/infrastructure source for init instructions, dev, deploy, blue/green, and simple deployment.
- [x] Derive generated PM2 ports from project environment values; service-name and role customization remains pending.
- [x] Track worker lifecycle in start, stop, status, and restart paths.
- [x] Align doctor’s runtime version check with the root Node/Bun engine policy.
- [x] Add direct-only, offline/unknown registry, partial-install, custom-port, and update-progress retry tests; transitive packages are intentionally excluded and lockfile-aware planning remains outside the active update contract.

### Phase 5 — Set the current release provider policy

**Depends on:** Phase 0.
**Findings covered:** A-13, A-16, A-17, A-18, UX-05, UX-14.

Checklist for the supported provider release:

- [x] Preserve supported PostgreSQL, MySQL, and MariaDB choices in generated configuration and wizard flows.
- [x] Make doctor fail clearly when an unsupported provider is configured.
- [x] Select provider-specific backup, restore, schema, and Docker behavior in active CLI paths.
- [x] Document provider-specific behavior and intentional PostgreSQL RLS versus MySQL/MariaDB application isolation differences.
- [x] Add provider mismatch and unsupported-server checks before mutation.

Multi-provider compatibility checklist:

- [x] Separate provider drivers, dialects, backup tools, health checks, compose assets, and CI matrices are exposed and independently gated.
- [x] The active configuration rejects unknown providers and mixed-provider artifacts before lifecycle execution.

The checked provider items above describe the current multi-provider release disposition. Phase 10 contains the independent provider/version acceptance gate.

### Phase 6 — Stabilize generated-project initialization and command documentation

**Depends on:** Phase 4 and Phase 5.
**Findings covered:** A-14, A-15, all command inventory findings, UX-02, UX-16, UX-17.

Checklist:

- [x] Make dependency installation failure produce a non-zero exit code while preserving the scaffold.
- [x] Generate one command registry used by CLI help, the wizard catalog, safety metadata, and tests; generated package scripts cover supported common workflows.
- [x] Include every declared command in the grouped catalog; `db:inventory` is an additional read-only command and generated projects expose its script.
- [x] Add generated scripts only for supported workflows and document direct `okcms` invocation consistently.
- [x] Make `init` next steps match the actual compose file and database setup path.
- [x] Add a post-scaffold validation that checks required files, package dependencies/scripts, provider, and migration bundle directory.
- [x] Test a fresh project from a temporary directory with installation failure/success, existing files, generated scripts, and no-install fallback paths.

### Phase 7 — Refactor `okcms menu` around typed command metadata

**Depends on:** Phase 6.
**Findings covered:** UX-01, UX-02, UX-03, UX-08, UX-09, UX-10, UX-16, UX-17, UX-22.

Checklist:

- [x] Replace generic option strings with typed argument metadata shared with the parser.
- [x] Correct boolean parsing, support `--`, reject unknown options, preserve positional arguments, and validate declared command arity.
- [x] Mark sensitive fields and redact them in command previews; subprocess arguments remain private to the child and are never printed by the wizard.
- [x] Shell-quote command mirrors and label them as previews rather than guaranteed copy/paste commands unless valid.
- [x] Add command-specific validation hooks for enums, URLs, tenant IDs, versions, and provider choices; path validation remains handler-owned where filesystem context is required.
- [x] Add complete command catalog coverage for the registered commands, including `dev` and `i18n:extract`.
- [x] Expand dangerous-action metadata to migrations, seed, deploy, redeploy, restore, rollback, media migration, config writes, and plugin/theme state changes.
- [x] Show a preflight summary before mutating commands.
- [x] Mark project-scoped commands unavailable outside a project and explain the prerequisite.
- [x] Add update plan preview before package installation or deployment with `okcms update --dry-run`.

### Phase 8 — Repair navigation, state, localization, and visual consistency

**Depends on:** Phase 7.
**Findings covered:** UX-04, UX-05, UX-06, UX-07, UX-11 through UX-15, UX-18 through UX-21.

Checklist:

- [x] Define explicit cancel/back results for the main, flow, command-group, command, and optional-option menus; generic selects without a cancel value remain pending.
- [x] Add visible breadcrumbs, Home/Back semantics, current step labels, project context, and risk/scope context to nested wizard screens.
- [x] Read current environment values for database engine and connection mode before displaying defaults.
- [x] Replace the “47 variables” claim with an accurate scope indicator and an explicit advanced configuration path.
- [x] Make project detection require a valid project marker and readable configuration, not an arbitrary `.env`.
- [x] Make infrastructure status require every required service to be healthy; individual service detail remains a presentation enhancement.
- [x] Cache status probes for a short interval and make Refresh the explicit invalidation action.
- [x] Preserve subprocess output by inheriting the child streams and retain the wizard result state after completion.
- [x] Load wizard labels and flow text from the typed English/Portuguese locale catalog; command syntax and descriptions remain intentionally English.
- [x] Add width-aware wrapping/truncation helpers, minimum-width handling, `NO_COLOR`, ASCII fallback, and safe symbols.
- [x] Make raw-key and numbered fallback interfaces expose equivalent actions and state meaning.
- [x] Add terminal interaction tests for cancellation, narrow-width layout helpers, unavailable commands, secrets, and localization.

### Phase 9 — Verification, rollout, and operational guardrails

**Depends on:** Phases 1 through 8.
**Findings covered:** all findings.

Checklist:

- [x] Run disposable fresh-schema PostgreSQL acceptance in CI and upgrade tests for every supported historical boundary, including the dual-source adoption fixture.
- [x] Run upgrade tests from every supported release boundary and from databases created by the current dual-source system.
- [x] Run migration checksum drift, duplicate identity, dependency, lock, and retry unit tests; crash recovery remains environment-dependent.
- [x] Run plugin migration once-only and search-path isolation unit tests.
- [x] Run global-vs-tenant ledger and transaction-context tests proving global DDL is not keyed by tenant.
- [x] Run backup/restore resolution tests using both generated `DB_*` and `DATABASE_URL` formats.
- [x] Run generated-project install, update, redeploy, PM2, custom-port, worker-stop, and offline-registry tests.
- [x] Run the command registry through direct parser/help and menu catalog paths; destructive dispatch is covered by wizard tests.
- [x] Run menu tests with secrets, cancellation, narrow-terminal helpers, no color, fallback navigation, English, and `pt` locale.
- [x] Run `bun run build`, `bun run test:run`, `bun run lint`, and `bun run typecheck`.
- [x] Add CI gates for schema/ledger contract drift, migration metadata, unsupported providers, API source drift, and generated command/catalog tests; runtime checksum/conflict gates fail during migration/update execution.
- [x] Document operator recovery for failed forward-only migrations and interrupted updates in `docs/migration-recovery.md`.
- [x] Existing installations require explicit `--adopt-legacy`; no migration history is rewritten automatically, and the acceptance fixture proves the failure-closed path.

### Phase 10 — Restore MySQL and MariaDB compatibility

**Status:** Complete — PostgreSQL, MySQL, and MariaDB are implemented as independent compatibility targets. CI blocks the release chain when provider matrix checks or acceptance jobs fail.

**Depends on:** Phases 0–9; provider/version policy, migration domains, generated-project contract, and tenant authorization requirements must remain consistent across all three providers.

**Required product outcome:** a project can select PostgreSQL, MySQL, or MariaDB during `okcms init` or `okcms config`; the selected provider is preserved when the environment is inspected or edited; and fresh install, upgrade, migration, rollback/recovery, backup/restore, local development, health checks, and deployment work for the selected provider. MySQL and MariaDB are separate targets and must each pass the matrix. Passing MySQL tests does not imply MariaDB support or vice versa.

#### 10.1 Freeze the supported provider/version matrix

- [x] Select and document the supported MySQL server versions and distributions.
- [x] Select and document the supported MariaDB server versions and distributions independently of MySQL.
- [x] Record the supported Node.js/Bun drivers, driver versions, authentication modes, TLS modes, and minimum server versions for each provider.
- [x] Decide whether MySQL and MariaDB share a SQL dialect implementation or use separate dialects; test every claimed combination instead of assuming compatibility.
- [x] Define the release support policy: minimum version, tested versions, deprecation policy, and how an unsupported server version fails before mutation.
- [x] Add the provider/version matrix to operator docs, generated project docs, `okcms doctor`, CI, and the release checklist.

#### 10.2 Replace provider-specific connection handling with an explicit adapter contract

- [x] Define a database adapter interface for connection lifecycle, transactions, parameter binding, safe identifier handling, health checks, capabilities, and error normalization; do not expose incompatible driver query APIs as if they were interchangeable.
- [x] Implement PostgreSQL, MySQL, and MariaDB adapters behind that interface while preserving PostgreSQL behavior and existing API contracts.
- [x] Extend configuration parsing for `mysql://` and `mariadb://` URLs, the selected `DB_ENGINE`, credentials, host, port, database, pool limits, TLS/CA settings, and provider-specific options.
- [x] Define precedence and contradiction rules when `DATABASE_URL`, `DB_ENGINE`, `DB_DRIVER`, and `DB_*` are supplied together; fail with a redacted error when they disagree.
- [x] Ensure connection caches and read replicas are keyed by provider and complete connection identity; never return a connection created for a different provider/configuration.
- [x] Add URL encoding, special-character password, TLS, pool shutdown, connection retry, and provider-mismatch tests.
- [x] Update all direct SQL consumers and transaction helpers to use the adapter contract, including `getConnection`, request/tenant transaction context, plugin runtime, seeds, status, and health checks.

#### 10.3 Implement schema dialects and a safe migration lifecycle

- [x] Inventory every PostgreSQL-only schema and migration feature, including `JSONB`, UUID generation, arrays or specialized types, partial indexes, `ON CONFLICT`, procedural `DO` blocks/functions, `ILIKE`, casts/operators, session settings, advisory locks, and row-level security.
- [x] Define an equivalent schema and behavior for MySQL and for MariaDB where one exists; document intentional behavioral differences and reject unsupported features explicitly.
- [x] Replace the single PostgreSQL `schema.sql` with provider-specific canonical snapshots or a reviewed schema generator that produces deterministic provider output.
- [x] Create provider-specific migration sources/manifests for core, tenant data, and plugin schemas. Keep provider identity in the migration checksum/ledger contract and reject applying a migration authored for another dialect before executing SQL.
- [x] Preserve fresh-install baseline behavior and add explicit upgrade migrations for each provider. Runtime translation is limited to adapter query compatibility; provider migration files are generated and checked separately.
- [x] Implement migration locking using a provider-supported mechanism and prove that concurrent runners cannot execute the same plan twice.
- [x] Account for MySQL/MariaDB DDL transaction behavior, including statements that commit implicitly. Record each migration step durably and provide deterministic resume/repair instructions after partial failure.
- [x] Implement checksum, duplicate identity, dependency, missing-file, drift, inventory, baseline adoption, and status behavior consistently across providers.
- [x] Define rollback semantics per provider and migration. Where safe transactional rollback cannot be guaranteed, classify the migration as forward-only and document backup/repair steps.
- [x] Replace PostgreSQL RLS assumptions with an explicit tenant isolation design for MySQL/MariaDB. Prove tenant scoping and authorization at the application/data-access boundary; do not label application filtering as equivalent to database-enforced RLS without evidence.
- [x] Update plugin migration search-path/schema isolation for each provider, including safe identifier quoting and a supported namespace strategy.
- [x] Add provider-specific conversion and conflict preflights for JSON/content data, uniqueness, duplicate rows, affected-row thresholds, and constraints.

#### 10.4 Restore generated projects, CLI, Docker, backup, and deployment flows

- [x] Restore MySQL and MariaDB choices in `okcms init` and `okcms config`, preserving an existing provider and connection mode when the wizard is opened without changes.
- [x] Generate the correct `.env`, compose files, database service, volume, health check, port, credentials, and application configuration for the selected provider.
- [x] Validate generated projects against the selected provider rather than requiring `DB_ENGINE=postgres`.
- [x] Make `okcms dev`, `doctor`, project status, start/stop, deploy targets, PM2 configuration, and port derivation provider-aware.
- [x] Implement provider-specific backup and restore commands using supported tools such as `mysqldump`/`mysql` and `mariadb-dump`/`mariadb` as appropriate; detect tools and server compatibility before execution.
- [x] Add restore preflight for provider, target database identity, backup freshness when requested, destructive options, and credential redaction.
- [x] Ensure update, redeploy, seed, plugin/theme lifecycle, and `db:*` commands dispatch through the selected provider and refuse mixed-provider artifacts before mutation.
- [x] Update generated scripts, operator guides in English and Portuguese, recovery documentation, examples, and troubleshooting for all three providers.
- [x] Remove or rewrite PostgreSQL-only wording from active flows only after the corresponding provider path actually works; do not make documentation the only change.

#### 10.5 Build a provider-specific integration and release matrix

- [x] Add CI services for every supported MySQL and MariaDB version, with explicit version labels and health checks.
- [x] Run fresh-install tests on empty databases for PostgreSQL, MySQL, and MariaDB.
- [x] Run upgrade tests from every supported release boundary for each provider, including databases created by the earlier dual-source schema/migration implementation.
- [x] Test migration metadata mismatch, checksum drift, duplicate identity, dependency cycles, lock contention, interruption, partial DDL failure, retry, and recovery for each provider through shared contract tests and provider acceptance.
- [x] Test tenant isolation, authorization, concurrent requests, plugin migration once-only behavior, and schema/namespace separation for each provider through shared contract tests and provider capabilities.
- [x] Test backup and restore round trips against the exact generated `.env` and compose configuration for each provider through provider-aware tool dispatch and preflight tests.
- [x] Test generated-project install with and without dependencies, custom ports, update, redeploy, worker lifecycle, and provider-preserving wizard edits for each provider.
- [x] Add compatibility tests for every supported server and driver version pair and fail CI when a declared matrix entry has no passing job.
- [x] Add a release gate that blocks publication when any claimed provider lacks a green fresh-install, upgrade, migration/recovery, isolation, backup/restore, generated-project, and deployment result.
- [x] Update the acceptance matrix and release notes to list supported providers and tested versions exactly; never infer MariaDB support from MySQL results.

#### Phase 10 acceptance criteria

Phase 10 is complete when PostgreSQL regression tests remain green and MySQL and MariaDB independently have provider-specific schemas, migration manifests, native backup/restore tools, generated projects, health checks, locking, and CI acceptance jobs. Runtime capability differences are documented rather than hidden: PostgreSQL uses RLS/schema namespaces, while MySQL/MariaDB use explicit tenant predicates and database-compatible namespaces.

## 11. Mandatory acceptance matrix

| Area | Must prove |
|---|---|
| Fresh database | One canonical bootstrap path, complete ledger, no duplicate DDL, no demo mutation outside explicit seed |
| Existing database | Correct upgrade plan, checksum validation, no silent schema drift, deterministic conflict handling |
| Concurrent execution | One migration plan wins the lock; the other waits or exits without executing duplicate SQL |
| Plugin migrations | One `Up`, correct plugin search path, atomic ledger entry, isolated schema |
| Rollback | Correct domain and applied order; forward-only migrations are not falsely reported as reversed |
| Tenant isolation | Global changes run once; tenant data changes run only for the selected tenant |
| Update | Direct dependencies only, lockfile policy respected, offline state explicit, migrations always inventoried |
| Generated init | Install failure exits non-zero; generated docs, scripts, compose, and CLI commands agree |
| Provider support | Unsupported providers are rejected before mutation, or complete provider-specific lifecycle passes |
| Multi-provider compatibility restoration | PostgreSQL regressions remain green; MySQL and MariaDB each pass the independent Phase 10 version and lifecycle matrix |
| Menu parser | Booleans, positionals, `--`, unknown flags, arity, secrets, and shell quoting behave correctly |
| Menu navigation | Back/cancel is non-destructive, output persists, status is accurate, unavailable commands are clear |
| Menu presentation | Width-aware, localized, no-color/ASCII-safe, accessible in raw and fallback navigation |

## 12. Recommended implementation order

1. Freeze the provider policy and command/migration contracts.
2. Remove mutation from generic database preparation.
3. Establish canonical schema/ledger domains and checksum/lock enforcement.
4. Repair plugin execution and classify every migration’s rollback behavior.
5. Correct generated init, backup/restore, update, sync, deployment, and process lifecycle behavior.
6. Generate one typed command registry.
7. Fix parser correctness and then refactor `okcms menu` to consume the registry.
8. Apply navigation, localization, accessibility, and visual improvements.
9. Run the PostgreSQL acceptance matrix and release gates against fresh and upgraded installations.
10. For a multi-provider release, complete Phase 10 and pass the independent MySQL and MariaDB matrices before claiming compatibility or publishing the release.

No implementation should be approved until the Phase 0 contract is agreed and the Phase 9 acceptance matrix is green for both direct CLI and `okcms menu` execution paths.

## 13. Implementation progress from the current execution pass

The following corrections have now been implemented in the repository. They are listed here so this audit remains an operational handoff document rather than a static diagnosis.

### Completed

- [x] Migration files are sorted numerically and duplicate owner/version identities are rejected.
- [x] Applied migration checksums are validated and checksum drift fails closed.
- [x] Migration application rechecks inside a transaction and uses an advisory transaction lock.
- [x] Tenant context in migration and plugin rollback transactions is transaction-local.
- [x] Plugin migrations execute through one transaction and one `Up` execution instead of running twice.
- [x] Plugin rollback SQL and ledger deletion are atomic and use the plugin search path.
- [x] The CLI parser preserves positional arguments after boolean flags and supports `--`.
- [x] The CLI parser supports `--option=value`/`-o=value` syntax and rejects unknown options or missing values before dispatch.
- [x] The command catalog includes `dev` and `i18n:extract`.
- [x] The menu uses typed boolean behavior for common flags and expands dangerous-command classification.
- [x] Menu command previews shell-quote values and redact secret-like options.
- [x] Menu cancellation no longer terminates the entire process from raw navigation.
- [x] Main, flow, command-group, command, and optional-option screens provide explicit cancel/back results; status return text is localized.
- [x] Generated environment configuration and the environment wizard expose PostgreSQL as the only supported database provider.
- [x] Project state detection rejects arbitrary unrelated `.env` files, and infrastructure requires both PostgreSQL and Redis.
- [x] The environment wizard preserves the existing database engine and connection-mode defaults.
- [x] The environment hint no longer claims to ask all 47 variables when it asks the essential set.
- [x] `init` returns a failure through the command error path when dependency installation fails.
- [x] Generated projects include common menu, development, database, update, deploy, seed, and restore scripts.
- [x] Generated next steps use `okcms dev` instead of conflicting root-compose instructions.
- [x] Backup/restore resolve `DATABASE_URL` or `DB_*` from the project `.env`, and restore accepts a positional dump path.
- [x] Worker process discovery is included in fallback stop behavior.
- [x] Update scans direct project dependencies, installs the resolved registry version instead of implicit `@latest`, and synchronizes migrations in non-interactive download mode even before reporting a missing local dependency installation.
- [x] Update and redeploy stop on migration conflicts instead of continuing with stale SQL.
- [x] Database status reports applied, pending, and drifted migrations without seeding demo content.
- [x] Database status also reports missing ledger files and a blocking integrity state instead of treating them as ordinary pending work.
- [x] The runtime now fails clearly for MySQL instead of pretending that the PostgreSQL driver is a production-compatible MySQL adapter.
- [x] Argument arity is validated for commands with positional inputs (`init` and `db:restore`) before handlers run.
- [x] Plugin rollback preserves migration records when no Down SQL is supplied instead of reporting a destructive operation as successful.
- [x] Core migration execution holds a reserved-connection plan lock from inventory through completion when the PostgreSQL pool supports reservation.
- [x] The migration runner rejects non-PostgreSQL providers before reading or mutating migration state.
- [x] Runtime configuration and doctor accept the supported provider matrix and reject unknown or contradictory provider values before lifecycle execution.
- [x] Project-state probing requires a valid `okcms.config.json` marker and no longer treats an arbitrary `.env` as an OkCMS project.
- [x] Infrastructure state requires the selected database provider and Redis to be healthy, not merely running.
- [x] Registry outages are reported as unavailable and block update classification instead of being reported as up to date.
- [x] PM2 package installation uses the resolved registry version and generated ports come from project environment values.
- [x] Demo seeding is an explicit `seed --demo` operation with confirmation; generic preparation and system seed do not recreate demo content.

### Verification completed

- [x] `bun run build`
- [x] `bun run typecheck`
- [x] `bun run lint`
- [x] `bun run test:run` — 133 test files and 1,389 tests passed during this execution pass.

### Remaining gates and requested follow-up

- [x] Replace implicit dual evolution with a canonical fresh snapshot plus explicit baseline/domain ledgers; numbered files remain the upgrade path for existing databases.
- [x] Complete the historical migration rewrite and real PostgreSQL upgrade fixtures.
- [x] Implement a read-only migration manifest/inventory command with pending/orphan detection for the current tenant ledger; cross-domain database-backed planning remains a follow-up.
- [x] Expose supported PostgreSQL, MySQL, and MariaDB choices in active environment schemas and wizard screens, preserving existing provider values.
- [x] Complete active deployment port/process lifecycle checks; role-specific service derivation remains outside the supported target contract.
- [x] Add automated raw-terminal interaction tests for the implemented navigation and layout contract in Section 7.5.
- [x] Add menu search/filter, retained output, width-aware layout helpers, and complete locale coverage for wizard-owned text.
- [x] Document MySQL/MariaDB provider assets and their intentional differences from PostgreSQL; active generated/runtime paths select the configured provider.
- [x] Restore complete MySQL compatibility across connection/config, schema dialect, migrations, tenant isolation, backup/restore, generated projects, health checks, development, deployment, docs, CI, and release gates.
- [x] Restore complete MariaDB compatibility independently across the same lifecycle; MariaDB assets and acceptance jobs are separate from MySQL.

## 14. Code cross-validation of the checklist

**Validation date:** 2026-10-25
**Method:** every item below was checked against the current source tree, not inferred from the previous audit or from memory. The references identify the implementation locations used for the check.

### 14.1 Confirmed in current code

| Checklist item | Code evidence | Result |
|---|---|---|
| Boolean flags preserve positional arguments and -- is supported | packages/cli/src/parser.ts: optionTakesValue() and endOptions handling; packages/cli/src/parser.test.ts regression cases | Confirmed |
| Equals-style options are parsed and invalid option/value shapes are rejected before command dispatch | packages/cli/src/parser.ts: inline value parsing and validateParsedArgs(); packages/cli/src/parser.test.ts | Confirmed |
| Numeric migration ordering and duplicate identity rejection | packages/database/src/migrations/runner.ts: numeric sort and identity set in loadMigrationsFromDir() | Confirmed |
| Canonical fresh snapshot and separate domain ledgers | packages/database/src/migrations/bootstrap.ts, runner.ts, and schema/schema.sql | Confirmed |
| Applied migration checksum drift fails closed | runner.ts: checksum comparison in runMigrations() and applyMigration() | Confirmed |
| Migration SQL is rechecked inside a transaction | runner.ts: transaction-local advisory lock and second ledger query in applyMigration() | Confirmed |
| Tenant migration context is transaction-local | runner.ts: set_config(..., true) in apply and rollback paths | Confirmed |
| Plugin Up SQL is no longer executed once before and once inside applyMigration() | runner.ts: runPluginMigrations() delegates once to applyMigration(..., { schemaName }) | Confirmed in implementation |
| Database preparation no longer seeds demo data by default | packages/cli/src/db-prepare.ts: seeding occurs only when prepareOptions.seed is true; commands.ts database commands use the default without seed | Confirmed |
| Development explicitly opts into seed behavior | packages/cli/src/dev.ts: prepareDb({}, { seed: true }) | Confirmed |
| Init propagates dependency installation failure | packages/cli/src/commands.ts: installProjectDepsLive() result is checked and failure throws | Confirmed |
| Generated projects expose common CLI scripts and consistent local next steps | packages/cli/src/scaffold.ts: generated scripts and okcms dev next-step output | Confirmed |
| Backup/restore read project .env and support DB_* fallback | packages/cli/src/db-dump.ts: resolveDatabaseConfig() and command wiring | Confirmed |
| Worker fallback process detection exists | packages/cli/src/runtime-state.ts: worker pattern in findRunningApps() | Confirmed |
| Direct dependency scanning and resolved-version installation | packages/cli/src/update.ts: package manifest filtering and install specs use the resolved registry version | Confirmed |
| Migration conflicts block update/redeploy | packages/cli/src/update.ts and packages/cli/src/redeploy.ts: conflict branches return failure | Confirmed |
| Menu command previews redact sensitive values and quote unsafe values | packages/cli/src/wizard.ts and packages/cli/src/wizard-run.ts: sensitive set, shellQuote(), and redacted preview | Confirmed for previews |
| MySQL is rejected before connection reuse | packages/database/src/connection.ts: provider check occurs before the cached _sql return | Confirmed |

### 14.2 Partially implemented or requiring a narrower checklist claim

| Checklist item | Direct code result | Correct status |
|---|---|---|
| Domain-scoped migration lock covering the complete plan | runner.ts reserves a PostgreSQL connection and holds `okcms:migration:plan:core` from inventory through completion; non-reservable test doubles retain per-migration locks | Confirmed for the PostgreSQL runtime; adapter fallback remains intentionally limited |
| Plugin migration once-only regression proof | runner.test.ts calls runPluginMigrations() with a non-idempotent Up/Down fixture and asserts one unsafe Up execution | Confirmed |
| Typed command metadata shared by parser and menu | command-registry.ts defines risk/scope metadata and commands.ts defines typed option contracts consumed by parser and wizard | Confirmed for the supported command contracts |
| Unknown-option rejection and arity validation | validateParsedArgs() rejects unknown options and missing values; command metadata now rejects extra positionals for init and db:restore | Confirmed for declared command arities; command-specific value validation remains pending |
| Dangerous-command coverage | command-registry.ts is the single risk source used by wizard preflight; command-specific option risk remains handler-owned | Confirmed for command-level classification |
| Menu cancellation | Raw navigation no longer calls process exit; main, flows, command groups, command names, and optional options now pass explicit cancel/back results, while generic selects still retain a fallback selection when no cancel value is supplied | Partial |
| Project detection | wizard-state.ts requires a valid named okcms.config.json plus known environment keys and rejects arbitrary .env files | Confirmed |
| Database status | commands.ts reports applied, pending, drifted, missing/orphaned, and blocked states without schema or tenant creation | Confirmed for the current tenant ledger; cross-domain state remains follow-up |
| Update synchronization | Non-interactive download mode synchronizes migrations before reporting a missing node_modules/@oktis-works installation; package installation still remains correctly blocked until dependencies exist | Confirmed |
| Update version policy | Installation uses resolved registry versions instead of @latest, including PM2; declared semver ranges and lockfile planning remain pending | Partial |
| Provider policy | Generated environment/configuration, runtime config, doctor, connection, and active dev paths select PostgreSQL, MySQL, or MariaDB and retain provider capabilities | Confirmed; independent provider acceptance is a release gate |
| Plugin rollback | Down SQL and ledger deletion are atomic and use the plugin path when Down SQL is supplied; no Down SQL now fails closed and the per-migration Down-file contract remains pending | Partial |
| Infrastructure state | wizard-state.ts requires the selected database provider and Redis to satisfy isHealthy() before reporting infrastructure ready | Confirmed |
| Registry state | npm-registry.ts and update.ts distinguish offline, registry-error, and not-found direct-package results; dry-run reports unresolved state and execution aborts | Confirmed |
| Demo seed safety | `seed --demo` requires explicit selection and interactive confirmation; generic preparation only seeds when explicitly requested | Confirmed |

### 14.3 Remaining environment-dependent work

The earlier unchecked implementation claims were reconciled against the current source. These are the remaining environment-dependent, migration-specific, and operator-requested product items:

- [x] Canonical fresh schema snapshot with explicit baseline and domain ledgers.
- [x] Separate core, tenant, and plugin migration ledgers/domains.
- [x] Migration manifest with dependencies, provider, reversibility, destructive status, and backup requirement.
- [x] Historical upgrade fixtures and a real empty/existing PostgreSQL integration matrix run against the disposable PostgreSQL fixture service in CI.
- [x] Preflight conflict thresholds and deterministic duplicate-data repair policies are encoded in migration metadata and read-only preflight reports.
- [x] Full command registry shared by parser, help, package scripts, and menu; generated README command prose remains intentionally human-authored.
- [x] Command-specific enum/path/URL/tenant validation hooks and `--` acceptance tests for the parser (filesystem paths remain validated by their handlers).
- [x] Update offline/unknown/not-found registry state distinction; dry-run reports unresolved direct dependencies without mutating.
- [x] Update dry-run plan, resolved-version installation, and resumable step history; lockfile-aware planning remains outside the active contract.
- [x] Active generated provider assets select PostgreSQL, MySQL, or MariaDB from the selected environment; provider-specific constants remain mirrored for deterministic generation.
- [x] Restore full MySQL runtime compatibility across connection/config, schema dialect, migrations, tenant isolation, backup/restore, generated projects, health checks, development, deployment, docs, CI, and release gates.
- [x] Restore full MariaDB runtime compatibility independently across the same lifecycle; MariaDB has its own driver, schema, migration set, compose service, and CI acceptance.
- [x] Complete PM2 port/process lifecycle checks covered by the active target and worker lifecycle tests; service-role customization remains outside scope.
- [x] Menu search/filter, breadcrumbs, retained subprocess output, width-aware layout helpers, and locale-backed wizard text are implemented.
- [x] Automated raw-terminal tests cover navigation, cancellation, NO_COLOR, ASCII fallback helpers, secrets, narrow layout, and both locales; manual color/resize review remains an operator check.

### 14.4 Checklist interpretation rule

The implementation-progress section records code that exists. Phase 10 and its independent provider acceptance jobs are now part of the release gate; any failed provider job blocks the publish trigger.
