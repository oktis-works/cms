# Release v1.0.1 Correction Plan

## Purpose

This document records the complete correction plan resulting from the v1.0.1 release audit. It is an execution plan only. No implementation is included in this document and no source files are changed by registering it.

The release must not be considered ready until all blocking findings are resolved, all required acceptance suites pass, and the release checklist is completed.

## Scope

The plan covers:

- React theme hydration and compiled theme contracts;
- PostgreSQL, MySQL, and MariaDB runtime compatibility;
- tenant isolation and platform-global settings;
- Admin settings contracts and SEO behavior;
- sitemap, RSS, canonical URL, and XML generation;
- theme customizer configuration lifecycle;
- legacy theme upgrade safety;
- generated theme artifacts and release process;
- migration and RLS safety;
- timezone and Admin route consistency.

## Severity and release policy

- **Critical:** blocks release and deployment.
- **High:** blocks release until fixed or explicitly accepted by the release owner with evidence.
- **Medium:** must be fixed before the next release train; may block v1.0.1 if it affects upgrade safety or public behavior.
- **Low:** documentation, cleanup, or non-blocking quality work.

No critical or high item may be closed based only on a unit test. Each must include an integration or end-to-end regression test covering the affected runtime path.

## Finding register

| ID | Severity | Area | Status | Primary evidence |
|---|---|---|---|---|
| BUG-01 | Critical | Default theme hydration | Open | `themes/default/src/entry-client.tsx` expects `#root`, while the host renders the theme directly in `<body>` |
| BUG-02 | Critical | MySQL/MariaDB public runtime | Open | Raw PostgreSQL JSON operators and `current_setting()` remain in web queries |
| BUG-03 | Critical | Settings tenant isolation | Open | `SettingsService` reads and writes by key without `tenant_id` |
| BUG-04 | High | XML safety | Open | Sitemap and RSS `escapeXml` functions are no-ops for most XML characters |
| BUG-05 | High | Sitemap query parameters | Open | Hub exclusion uses `?` placeholders without adding hub slugs to the parameter list |
| BUG-06 | High | SEO/Admin contract | Open | Admin writes `seo.*` site-wide keys while runtime reads unprefixed keys |
| BUG-07 | High | Settings API integrity | Open | Optional database-required fields, sequential writes, races, and unrestricted keys |
| BUG-08 | High | Theme customizer lifecycle | Open | Export/history/restore APIs lack Admin UI; replace import accepts undeclared keys |
| BUG-09 | Medium/High | Default theme URL/data contract | Open | Templates ignore canonical `item.url` and expect camelCase data not always supplied by the host |
| BUG-10 | High | Legacy theme upgrades | Open | v1 removes the legacy adapter without a complete preflight/conversion workflow |
| BUG-11 | High | Release artifacts | Open | `entry-client.tsx` is untracked while the generated embedded asset already contains it |
| BUG-12 | Medium/High | Settings RLS migrations | Open | Historical migration does not fully reconcile the settings policy and `WITH CHECK` behavior |
| BUG-13 | Medium | Timezone/Admin routes | Open | Legacy `general.timezone` remains alongside `reading.timezone_string`; `/settings/general` is not a page |
| BUG-14 | Medium | RSS behavior | Open | RSS language is hardcoded to `pt-BR` and item URLs omit parent hierarchy |

---

## Phase 0 — Baseline, ownership, and freeze

### Objective

Establish a reproducible baseline before implementation begins and prevent accidental release changes while the corrections are being prepared.

### Checklist

- [ ] Confirm the target branch and release version.
- [ ] Confirm the root `package.json` product version.
- [ ] Run `bun run sync-version` and record the result.
- [ ] Record the current commit and working tree state.
- [ ] Preserve unrelated user changes in the working tree.
- [ ] Assign an owner and reviewer for each finding.
- [ ] Mark all release-publishing work as frozen until the blocker list is empty.
- [ ] Create or update changesets for every package changed by the corrections.
- [ ] Define the final release target version; never reuse a burned tag.

### Exit criteria

- The baseline is recorded.
- Every finding has an owner.
- No implementation starts without a corresponding regression test plan.

---

## Phase 1 — Settings security and tenant isolation

### Objective

Make settings provider-neutral, explicitly tenant-scoped, and safe for platform-global configuration.

### Required implementation

- [ ] Introduce explicit tenant-aware settings repository methods.
- [ ] Add `tenant_id` predicates to all settings reads, updates, deletes, and inserts.
- [ ] Separate platform-global settings from tenant settings at the service API boundary.
- [ ] Require `SUPER_ADMIN` for platform-global writes.
- [ ] Prevent ordinary tenant permissions from writing global rows.
- [ ] Pass tenant scope through plugin settings dependencies.
- [ ] Replace read-then-insert/update logic with an atomic provider-neutral upsert.
- [ ] Make `(tenant_id, key)` the effective identity for tenant settings.
- [ ] Define deterministic precedence when a global and tenant setting share a key.
- [ ] Preserve global fallback behavior only where explicitly allowed by the setting definition.
- [ ] Validate setting key, group, type, value shape, and payload size at the API boundary.
- [ ] Reject missing `group` and `type` values instead of sending database `NULL` values.
- [ ] Add transaction support to `setMany`.
- [ ] Return updated setting records from bulk writes.
- [ ] Scope `delete` by tenant or platform scope.
- [ ] Add protection for reserved/system settings.

### Data repair and migration

- [ ] Inventory all existing settings grouped by key and tenant.
- [ ] Detect duplicate global rows.
- [ ] Detect duplicate tenant rows.
- [ ] Classify every `tenant_id IS NULL` row as intentionally global or incorrectly unscoped.
- [ ] Backfill incorrectly global rows to the correct tenant.
- [ ] Create a deterministic conflict resolution policy before deleting duplicates.
- [ ] Add indexes required for tenant-scoped lookups and upserts.
- [ ] Validate the repaired data on PostgreSQL, MySQL, and MariaDB.

### Regression tests

- [ ] Tenant A cannot read tenant B settings.
- [ ] Tenant A cannot update tenant B settings.
- [ ] Tenant A cannot delete tenant B settings.
- [ ] Tenant settings override global settings deterministically.
- [ ] Non-admin users cannot write global settings.
- [ ] Platform admins can write global settings through the explicit global API.
- [ ] Concurrent writes to one tenant/key produce one valid final record.
- [ ] A failed bulk update rolls back all earlier items.
- [ ] Plugin settings use the current tenant scope.
- [ ] All tests pass on PostgreSQL, MySQL, and MariaDB.

### Exit criteria

- No settings query relies on implicit process or PostgreSQL session state for tenant isolation.
- Cross-tenant integration tests pass on all supported providers.
- Existing data has a documented and tested migration path.

---

## Phase 2 — Provider-neutral public runtime

### Objective

Ensure public routing and rendering work identically on PostgreSQL, MySQL, and MariaDB.

### Required implementation

- [ ] Remove raw `metadata ? 'hub_type'` queries from application-level web code.
- [ ] Add provider-aware JSON key existence helpers in the database abstraction.
- [ ] Keep PostgreSQL JSON operators inside the provider translation layer only.
- [ ] Replace `current_setting('app.current_tenant_id', ...)` in web queries with explicit tenant parameters.
- [ ] Ensure all web providers receive the request tenant ID.
- [ ] Define provider-neutral helpers for JSON text extraction and JSON key existence.
- [ ] Review every query in `apps/web` for PostgreSQL-only syntax.
- [ ] Review `NULLS LAST`, `ANY`, casts, JSON operators, and advisory/session functions.
- [ ] Add provider-specific SQL snapshots for every translated public-runtime query.

### Regression tests

- [ ] Resolve the home route on PostgreSQL.
- [ ] Resolve the home route on MySQL.
- [ ] Resolve the home route on MariaDB.
- [ ] Resolve a hub listing on all providers.
- [ ] Resolve a nested content item on all providers.
- [ ] Resolve a legacy URL and verify its canonical redirect on all providers.
- [ ] Verify tenant-specific hubs are not visible across tenants.
- [ ] Verify tenant-specific site settings are loaded on all providers.
- [ ] Verify no public route returns 500 because of provider SQL translation.

### Exit criteria

- Public routing, rendering, settings lookup, and hub discovery pass the provider matrix.
- No application-level web query uses `current_setting()` or unsupported PostgreSQL-only JSON syntax.

---

## Phase 3 — Theme hydration and compiled theme contract

### Objective

Make SSR and browser hydration use the same document structure and payload contract.

### Required implementation

- [ ] Define the official hydration root contract for React and Solid themes.
- [ ] Update the host SSR document to render the expected root when hydration is enabled.
- [ ] Ensure the client entry hydrates the exact server-rendered root.
- [ ] Define behavior for themes with `hydration: "none"`.
- [ ] Define behavior for multiple islands if the platform supports more than one root.
- [ ] Ensure hydration payload and rendered component keys are consistent.
- [ ] Ensure the host does not emit a hydration script for themes without hydration.
- [ ] Make the default theme use canonical URLs from the host contract.
- [ ] Normalize item and page data before passing it to compiled themes.
- [ ] Document the React/Solid entry-point contract for theme authors.

### Regression tests

- [ ] Fresh-build the default React theme.
- [ ] Render home SSR output.
- [ ] Render archive SSR output.
- [ ] Render single SSR output.
- [ ] Render page SSR output.
- [ ] Render 404 SSR output.
- [ ] Load each page in a real browser.
- [ ] Assert no `Root element not found` error.
- [ ] Assert no hydration mismatch error.
- [ ] Assert client event handlers execute.
- [ ] Repeat the browser tests for a Solid fixture theme.
- [ ] Validate hydration payload rejection for malformed payloads.

### Exit criteria

- The default theme hydrates without browser errors.
- React and Solid fixtures pass SSR and browser hydration tests.
- The compiled theme contract is documented and enforced.

---

## Phase 4 — SEO, sitemap, RSS, and XML correctness

### Objective

Make all Admin SEO controls effective and ensure public metadata feeds are valid and canonical.

### Required implementation

- [ ] Define one canonical settings key registry for general and SEO settings.
- [ ] Choose the canonical keys for site title, description, URL, and language.
- [ ] Align `SEOSettings`, `GeneralSettings`, runtime metadata, robots, sitemap, RSS, seed data, and documentation.
- [ ] Add explicit mapping only for backwards compatibility; do not maintain silent duplicate keys indefinitely.
- [ ] Correct XML escaping for sitemap and RSS.
- [ ] Replace sitemap `?` placeholders with properly numbered parameters or a `NOT EXISTS` query.
- [ ] Use one canonical URL builder for HTML, sitemap, RSS, JSON-LD, and theme data.
- [ ] Include parent paths in all item URLs.
- [ ] Pass configured language into RSS and Atom output.
- [ ] Validate sitemap settings such as max items, priority, and change frequency.
- [ ] Validate and sanitize plugin-provided sitemap URLs before insertion.

### Regression tests

- [ ] Save every SEO field through the Admin API.
- [ ] Verify title and description in rendered HTML.
- [ ] Verify canonical URL in rendered HTML.
- [ ] Verify Open Graph values.
- [ ] Verify Twitter card values.
- [ ] Verify robots meta and `/robots.txt`.
- [ ] Verify `/sitemap.xml` with no hubs.
- [ ] Verify `/sitemap.xml` with one hub.
- [ ] Verify `/sitemap.xml` with multiple hubs.
- [ ] Verify sitemap with nested content.
- [ ] Verify RSS and Atom language.
- [ ] Verify RSS and Atom nested URLs.
- [ ] Parse generated XML with a strict XML parser.
- [ ] Include values containing `&`, `<`, `>`, quotes, apostrophes, and Unicode.
- [ ] Run these tests on all supported database providers.

### Exit criteria

- Every Admin SEO field has a verified runtime consumer.
- Sitemap and feeds are valid XML and contain canonical URLs.
- No SEO setting is silently ignored.

---

## Phase 5 — Theme customizer configuration lifecycle

### Objective

Make theme configuration editable, importable, restorable, auditable, and schema-safe.

### Required implementation

- [ ] Add Admin actions for export, import, history, restore, and restore defaults.
- [ ] Add confirmation flows for replace import and restore operations.
- [ ] Show validation errors at field level where possible.
- [ ] Add manifest configuration schema versioning.
- [ ] Define configuration migrations between manifest versions.
- [ ] Validate imported configuration against declared manifest settings.
- [ ] Reject undeclared keys by default.
- [ ] Define an explicit compatibility mode only for controlled migrations.
- [ ] Remove stale settings after a manifest removes or renames a field.
- [ ] Ensure PATCH does not fail because of legacy unknown keys.
- [ ] Record user, timestamp, change type, and summary in configuration history.
- [ ] Ensure restore operations create a new history entry.
- [ ] Add tenant scope to all configuration lifecycle operations.

### Regression tests

- [ ] Save a valid theme configuration.
- [ ] Reject invalid field types.
- [ ] Reject undeclared keys.
- [ ] Export and re-import a configuration.
- [ ] Replace a configuration and verify removed keys are removed.
- [ ] Restore a previous version.
- [ ] Restore manifest defaults.
- [ ] Upgrade a manifest with a renamed setting.
- [ ] Verify stale settings do not prevent future saves.
- [ ] Verify one tenant cannot access another tenant's theme history.

### Exit criteria

- Every lifecycle API is available through an intentional Admin workflow.
- Configuration data is always validated or explicitly migrated.
- Rollback and restore are tested and tenant-scoped.

---

## Phase 6 — Legacy theme upgrade safety

### Objective

Prevent an existing installation from becoming unavailable during the v1 theme platform migration.

### Required implementation

- [ ] Implement a preflight command that inventories active themes by tenant.
- [ ] Detect legacy string-template and source-file themes.
- [ ] Detect missing or stale compiled artifacts.
- [ ] Detect incompatible engine and API version combinations.
- [ ] Produce a tenant-by-tenant migration report.
- [ ] Block deployment when an active theme cannot be rendered by v1.
- [ ] Provide a conversion guide or automated converter for supported legacy themes.
- [ ] Provide an explicit replacement-theme workflow.
- [ ] Validate the replacement theme before activation.
- [ ] Add rollback instructions and rollback verification.
- [ ] Update upgrade documentation with the required preflight command.

### Regression tests

- [ ] Fresh v1 installation with the default theme.
- [ ] Upgrade with a valid v1 theme.
- [ ] Upgrade with a legacy active theme.
- [ ] Upgrade with a missing compiled artifact.
- [ ] Upgrade with an incompatible manifest.
- [ ] Verify deployment is blocked before public downtime.
- [ ] Verify health checks report the exact tenant and theme failure.

### Exit criteria

- No supported upgrade path can activate an invalid theme.
- Operators receive an actionable report before the deployment changes public traffic.

---

## Phase 7 — Migration and RLS hardening

### Objective

Make fresh-schema and historical-upgrade behavior equivalent and safe.

### Required implementation

- [ ] Reconcile the settings RLS policy in an idempotent migration.
- [ ] Include both `USING` and `WITH CHECK` clauses.
- [ ] Verify policies on existing installations, not only fresh schemas.
- [ ] Verify `FORCE ROW LEVEL SECURITY` behavior for all affected tables.
- [ ] Audit global settings and global plugin rows.
- [ ] Verify migration behavior on PostgreSQL V018 through the current version.
- [ ] Verify MySQL and MariaDB migration equivalents.
- [ ] Ensure migration preflight does not match false tables or unsupported SQL fragments.
- [ ] Verify schema bootstrap version updates after all core migrations.
- [ ] Verify default tenant resolution during core-only migration runs.

### Required acceptance commands

```bash
OKCMS_ACCEPTANCE_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres bun run test:postgres
OKCMS_ACCEPTANCE_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres node packages/database/scripts/postgres-upgrade-acceptance.mjs
OKCMS_MYSQL_ACCEPTANCE_URL=mysql://root:root@127.0.0.1:3306/mysql \
OKCMS_MARIADB_ACCEPTANCE_URL=mariadb://root:root@127.0.0.1:3307/mysql \
bun run test:providers
```

### Exit criteria

- Fresh schema and historical upgrades converge to the same effective security policies.
- PostgreSQL historical acceptance passes.
- MySQL and MariaDB provider acceptance passes.

---

## Phase 8 — Admin settings cleanup

### Objective

Remove dead configuration contracts and repair Admin navigation gaps.

### Checklist

- [ ] Choose one canonical timezone model: `timezone_string` plus `gmt_offset`.
- [ ] Migrate or remove legacy `general.timezone`.
- [ ] Verify scheduler, date formatting, publishing, and worker behavior use the canonical timezone service.
- [ ] Add redirect from `/settings/general` to `/settings`, or create the missing page intentionally.
- [ ] Remove stale CSS selectors and route references.
- [ ] Audit all settings cards and sidebar links against actual Astro pages.
- [ ] Audit all translations for fields removed from the UI.
- [ ] Audit seed data against the current Admin settings model.

### Exit criteria

- No seeded setting is orphaned without documented compatibility purpose.
- Every Admin settings link resolves to an intentional page.
- Timezone behavior is covered by an end-to-end Admin test.

---

## Phase 9 — Artifact, build, and release integrity

### Objective

Ensure a fresh checkout produces the same artifacts used in development and release.

### Checklist

- [ ] Add `themes/default/src/entry-client.tsx` to version control.
- [ ] Regenerate `packages/cli/src/generated/theme-assets.ts` from the source theme.
- [ ] Verify generated theme assets have no missing or extra files.
- [ ] Verify generated content is byte-identical to source content.
- [ ] Run the build from a clean checkout with no existing `dist/` or `node_modules/`.
- [ ] Ensure build order remains validation → types → config → database → auth → plugin-sdk → plugin-runtime → theme-sdk → theme-runtime → core → api-client → ui → cli.
- [ ] Ensure worker output is rebuilt when core event or queue contracts change.
- [ ] Add CI failure when generation leaves a dirty working tree.
- [ ] Create changesets for every changed package.
- [ ] Run `bun run version-packages`.
- [ ] Synchronize CMS version anchors.
- [ ] Validate root package version, `CMS_VERSION`, compatibility constants, and README title.
- [ ] Run `node scripts/prepare-publish.mjs --check --tag vX.Y.Z` with the final tag.
- [ ] Confirm the final tag has never been burned.

### Exit criteria

- Fresh checkout build passes.
- Generated assets are synchronized.
- Release metadata and changesets are valid.
- Publish preflight passes.

---

## Phase 10 — Full validation and release gate

### Required sequence

Run the complete sequence in order. Repeat the entire sequence after every correction and require three consecutive clean runs before tagging or merging the release.

```bash
bun run test:run
bun run check:api-drift
bun run audit:contracts
bun run check:provider-matrix
OKCMS_ACCEPTANCE_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres bun run test:postgres
bun run build
OKCMS_ACCEPTANCE_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres node packages/database/scripts/postgres-upgrade-acceptance.mjs
OKCMS_MYSQL_ACCEPTANCE_URL=mysql://root:root@127.0.0.1:3306/mysql \
OKCMS_MARIADB_ACCEPTANCE_URL=mariadb://root:root@127.0.0.1:3307/mysql \
bun run test:providers
bun run typecheck
bun run lint
```

### Additional required gates

- [ ] Browser hydration suite passes for React.
- [ ] Browser hydration suite passes for Solid.
- [ ] Public routing suite passes for all providers.
- [ ] Two-tenant settings isolation suite passes for all providers.
- [ ] SEO contract suite passes.
- [ ] Sitemap XML parser suite passes.
- [ ] RSS/Atom parser suite passes.
- [ ] Theme configuration lifecycle suite passes.
- [ ] Legacy theme upgrade preflight passes.
- [ ] Fresh-checkout build passes.
- [ ] Generated asset parity passes.
- [ ] Three consecutive complete validation runs pass with zero errors.

### Final release checklist

- [ ] All Critical findings are closed.
- [ ] All High findings are closed or formally accepted with evidence.
- [ ] Medium findings affecting upgrade safety are closed.
- [ ] All regression tests are committed.
- [ ] All migrations are provider-specific where required.
- [ ] PostgreSQL acceptance passes.
- [ ] MySQL acceptance passes.
- [ ] MariaDB acceptance passes.
- [ ] Build passes from a clean checkout.
- [ ] Typecheck passes.
- [ ] Lint passes.
- [ ] No generated-file drift remains.
- [ ] Working tree contains only intentional release files.
- [ ] Changesets have been consumed.
- [ ] CMS version anchors are synchronized and validated.
- [ ] Publish preflight passes.
- [ ] Release branch is based on the current `main` branch.
- [ ] Release PR is reviewed and approved.
- [ ] No burned tag is reused.
- [ ] Post-merge CI and publish workflows are monitored.

## Definition of done

The correction plan is complete only when:

1. All Critical and High findings are resolved.
2. Every finding has a regression test or an explicit documented reason why testing is not applicable.
3. PostgreSQL, MySQL, and MariaDB behavior is verified.
4. Fresh-install and upgrade paths are both verified.
5. The Admin exposes all supported configuration lifecycle operations.
6. The public runtime consumes the same settings and URL contracts exposed by the Admin.
7. Three complete validation runs pass consecutively.
8. The release preflight passes for the final product version and tag.
