# Release v1.0.3 Correction Plan

This document is the implementation checklist for the 18 defects and gaps identified in the direct source audit of the v1.0.2 codebase. The release must not be considered complete until every item below has an implementation, regression coverage, documentation, and validation evidence.

## Completion rules

- [x] Every code change preserves tenant isolation and provider compatibility.
- [x] Every changed package has a changeset before release versioning.
- [x] Every completed item has a regression test or an explicit acceptance test.
- [x] Admin behavior, public rendering, API contracts, and developer documentation stay consistent.
- [x] The checklist is updated in the same commit as the corresponding implementation.

## Phase 1 — Request context, tenant isolation, and provisioning

### 1. Establish the Core tenant context in API requests

- [x] Make API authentication establish Core tenant and user context together with the database tenant transaction.
- [x] Keep the signed token tenant as the only tenant authority.
- [x] Verify settings, themes, preview-token, plugin, and audit routes under a real authenticated request.
- [x] Add concurrent tenant isolation coverage.
- [x] Document the canonical request-context contract.

### 2. Make tenant provisioning atomic and complete

- [x] Provision the new tenant inside an explicit tenant-scoped database transaction.
- [x] Seed default settings, themes, and the active default theme for every new tenant.
- [x] Ensure PostgreSQL RLS and non-PostgreSQL providers use the same provisioning contract.
- [x] Roll back the complete provisioning operation on any failure.
- [x] Add integration coverage for a non-default tenant.

### 3. Make settings resolution deterministic

- [x] Return one effective setting per key with tenant-over-global precedence.
- [x] Use the same precedence in API, Admin, web rendering, plugins, and SEO routes.
- [x] Add tests for global-only, tenant-only, and conflicting values.

### 4. Enforce global-setting uniqueness

- [x] Add provider-specific protection for one global row per key.
- [x] Replace check-then-insert global writes with an atomic upsert.
- [x] Add a migration and a race-condition regression test.

## Phase 2 — Typed settings and public configuration safety

### 5. Introduce a typed settings contract

- [x] Define canonical setting schemas, types, defaults, scopes, and validation rules.
- [x] Coerce or reject values in the API instead of trusting Admin payload types.
- [x] Preserve JSON booleans and numbers as native values.
- [x] Return structured validation errors for invalid values.
- [x] Document the settings contract for Admin, plugins, and themes.

### 6. Repair Admin SEO settings behavior

- [x] Use typed form state for toggles and numeric fields.
- [x] Load canonical defaults when a setting is absent.
- [x] Avoid writing empty-string placeholders for unset values.
- [x] Render numeric inputs with numeric browser semantics.
- [x] Add first-save and reload regression coverage.

### 7. Restrict public settings by explicit visibility

- [x] Add explicit public/admin/internal/secret visibility metadata.
- [x] Expose only settings explicitly marked public to themes.
- [x] Recursively sanitize nested objects and arrays.
- [x] Default all new settings to non-public.
- [x] Add a nested-secret leakage regression test.

## Phase 3 — Theme configuration lifecycle

### 8. Reconcile configuration after manifest changes

- [x] Reconcile persisted configuration during theme synchronization.
- [x] Remove or quarantine unknown fields and revalidate changed field types.
- [x] Preserve the old configuration in history before reconciliation.
- [x] Mark themes with invalid required configuration as incompatible.
- [x] Add manifest-drift and upgrade regression tests.

### 9. Validate required theme fields after effective-config merge

- [x] Validate the complete effective configuration, including defaults and persisted values.
- [x] Reject missing required fields in update, import, restore, and activation paths.
- [x] Apply recursive validation to groups, repeaters, and flexible content.
- [x] Add missing-required-field regression coverage.

### 10. Harden theme preview authorization and transport

- [x] Restrict preview URLs to relative paths or configured trusted origins.
- [x] Remove preview secrets and draft configuration from arbitrary external URLs.
- [x] Use an expiring server-side preview session or equivalent opaque exchange.
- [x] Validate tenant, theme, user, origin, expiration, and replay behavior.
- [x] Add cross-origin preview integration coverage.

### 11. Make preview CSP explicit and safe

- [x] Add a dedicated preview CSP policy for the Admin iframe.
- [x] Allow only the configured Admin origin in web `frame-ancestors` for preview responses.
- [x] Allow only the configured web origin in Admin `frame-src`.
- [x] Keep normal public pages non-embeddable.
- [x] Document deployment requirements for preview origins.

### 12. Complete the theme page data contract

- [x] Populate page excerpt, published date, previous, and next values.
- [x] Normalize snake_case database fields to the SDK camelCase contract once.
- [x] Update the default theme to consume the normalized contract.
- [x] Add compiled and server-rendered theme regression tests.

## Phase 4 — Timezone and SEO output correctness

### 13. Make timezone configuration tenant-scoped

- [x] Replace the process-global timezone cache with tenant-keyed or request-scoped state.
- [x] Invalidate only the changed tenant's cache.
- [x] Make database failures observable instead of silently masking them.
- [x] Add concurrent multi-tenant timezone tests.

### 14. Apply configured timezone to theme dates

- [x] Include effective site timezone in theme render data.
- [x] Centralize date formatting with `Intl.DateTimeFormat` and an explicit timezone.
- [x] Apply the formatter to themes, feeds, and SEO metadata where appropriate.
- [x] Cover DST and tenants using different timezones.

### 15. Make sitemap limits and URL generation correct

- [x] Apply the configured limit to the final URL set, including hubs and plugin URLs.
- [x] Replace N+1 hub and parent-chain queries with bounded batch loading.
- [x] Support sitemap partitioning when the configured or protocol limit is exceeded.
- [x] Validate and normalize the site URL before generating links.
- [x] Add sitemap limit and plugin-hook regression tests.

### 16. Make robots and sitemap settings semantically consistent

- [x] Define and document the disabled `robots.txt` response contract.
- [x] Validate robots directives, sitemap change frequency, and priority values.
- [x] Ensure Admin labels and public behavior use the same semantics.
- [x] Add route-level SEO regression tests.

### 17. Escape and validate all feed and SEO XML output

- [x] Escape every XML text node and URL-bearing attribute in RSS and Atom.
- [x] Escape sitemap values and reject malformed URLs.
- [x] Add XML parsing tests for ampersands, quotes, Unicode, and query strings.

## Phase 5 — Admin experience and documentation

### 18. Complete Admin and developer documentation contracts

- [x] Move theme customizer and SEO labels into the Admin i18n catalog.
- [x] Document settings visibility, type coercion, defaults, tenant precedence, and cache invalidation.
- [x] Document theme manifest reconciliation and required-field behavior.
- [x] Document preview CSP, trusted origins, and session requirements.
- [x] Update release notes and operational troubleshooting documentation.
- [x] Verify that all 18 checklist items are marked complete only after tests pass.

## Release validation gate

- [x] `bun run test:run`
- [x] `bun run check:api-drift`
- [x] `bun run audit:contracts`
- [x] `bun run check:provider-matrix`
- [x] PostgreSQL acceptance tests
- [x] `bun run build`
- [x] PostgreSQL historical upgrade acceptance
- [x] MySQL and MariaDB provider acceptance
- [x] `bun run typecheck`
- [x] `bun run lint`
- [x] `bun run sync-version`
- [x] `node scripts/prepare-publish.mjs --check --tag v1.0.3`
- [x] Three consecutive clean validation runs before release push
