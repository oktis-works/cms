# Theme System Correction Plan

Status: Complete — implementation and validation finished

Scope: Complete correction plan for the OkCMS theme system across development, production, administration, runtime rendering, database providers, build artifacts, inheritance, security, and documentation.

This document records the audit findings, the implemented resolutions, and the validation evidence for the completed theme-system correction. The checklist is retained as the completion record for the work.

## 1. Decisions recorded for this plan

The following decisions are definitive for the implementation phases:

- Themes are tenant-owned. Every theme row must have a `tenant_id`.
- There are no global themes.
- The default theme is a normal tenant-owned theme and must be persisted in the database during bootstrap.
- The default theme must not be used as an environment fallback when the database is unavailable or has no active theme.
- Public theme preview must be protected and must not allow arbitrary public execution of an inactive theme.
- Theme compatibility must be enforced during runtime loading, not only during installation or synchronization.
- Theme inheritance must include the behavior described by the public theme contract: settings, configuration, templates, styles, assets, and components.
- Themes are installed manually by placing their files in the project's `themes` directory.
- The API theme installation route is not part of the desired product flow and must be removed.
- Compiled theme builds must be safe during concurrent requests and rebuilds.
- Asset cache busting will use `?v=<buildId>`.
- In production, `immutable` caching is allowed only for versioned assets.
- Development build failures must be visible in the Admin and must produce explicit runtime errors when an invalid artifact is requested.
- MySQL and MariaDB compatibility must be achieved through the provider SQL translation layer where PostgreSQL syntax is used.
- Themes using hydration or automatic runtime assets must reject full-document output.

### Working assumptions to confirm during implementation

These points were not explicitly specified and are therefore documented as implementation assumptions rather than decisions:

- The `default` theme directory remains the built-in source theme, but one tenant-specific database row is created for it during tenant bootstrap.
- The active tenant is resolved from the established request or CLI tenant context. The CLI continues to use the `default` tenant only for bootstrap-compatible commands; multi-tenant commands require an explicit tenant.
- Synchronization from the filesystem remains the mechanism that registers manually installed themes. It may be invoked during bootstrap, deploy, or an explicit CLI/admin synchronization command, but it must never create global rows.
- A tenant may have one active theme. The database must enforce this invariant.

## 2. Current system summary

The project currently supports three public rendering modes:

1. Legacy string templates: root `*.astro` files are interpreted by the custom `ThemeRenderer`; they are not executed as Astro components.
2. Compiled React themes: Vite generates a server artifact and optionally a client hydration artifact.
3. Compiled Solid themes: Vite generates the equivalent Solid server/client artifacts.

The public request path resolves an active theme, resolves the route and template, prepares the common theme data contract, renders the selected engine, wraps the result in an HTML document, and serves theme assets from `/themes/<theme>/<path>`.

Development uses a polling watcher for React/Solid source files. Production uses a host-side build during `theme:build` or redeploy, after which the web runtime loads the generated artifacts.

The core design is viable, but several current paths rely on PostgreSQL RLS, environment fallbacks, incomplete inheritance, or build-time assumptions that do not provide a complete DEV/PROD guarantee.

## 3. Severity and completion criteria

- P0 — security, tenant isolation, or data correctness issue that must be resolved before production use.
- P1 — functionality or deployment reliability issue that can cause production failures.
- P2 — contract, maintainability, observability, or documentation issue that must be resolved before declaring the subsystem complete.

The theme system is complete only when all checkboxes in Sections 5–12 are satisfied and the validation matrix in Section 13 passes.

## 4. Target architecture

The target flow is:

```text
Tenant context
  → tenant-specific theme registry
  → active theme resolution
  → compatibility and artifact validation
  → resolved inheritance chain
  → engine-specific rendering
  → resolved styles/assets with buildId cache versioning
  → final document
```

The database is the source of truth for the active theme. The filesystem is the source of theme files and compiled artifacts. A theme may not be considered active unless both sources are valid and consistent.

The environment may provide operational defaults such as the themes directory, but it must not silently select a different theme when the tenant has no valid active theme. The runtime must report the configuration error explicitly.

## 5. Phase 0 — Baseline, contracts, and migration design

### Objectives

- Freeze the intended tenant-owned model.
- Identify all theme queries and fallback paths.
- Define the database migration and bootstrap sequence before changing runtime behavior.

### Checklist

- [x] Inventory every `themes` query in core, API, web, CLI, migrations, tests, and admin.
- [x] Inventory every `tenant_id IS NULL`, global-theme fallback, `ACTIVE_THEME`, and `default` fallback reference.
- [x] Define the canonical tenant resolution function for web requests.
- [x] Define the canonical tenant resolution function for CLI commands.
- [x] Define whether synchronization is automatic on bootstrap, explicit, or both.
- [x] Define the required database identity for the built-in default theme.
- [x] Define the behavior when a tenant has no active theme: explicit error versus controlled bootstrap response.
- [x] Add a migration design for existing rows with `tenant_id IS NULL`.
- [x] Decide how existing global rows are mapped to tenants during migration.
- [x] Define rollback behavior for failed theme migration.
- [x] Add a contract test proving that no new theme row can be inserted without `tenant_id`.

### Required invariant

Every installed, inactive, or active theme row must have a valid tenant. The database must reject a null `tenant_id` after the migration is complete.

## 6. Phase 1 — Tenant-owned theme registry and default bootstrap

### Problem addressed

The current schema describes themes as global, filesystem synchronization inserts rows without a tenant, seed activation searches inside the default tenant, and public active-theme queries do not consistently filter by tenant.

### Resolution

Convert the theme registry to a tenant-owned model end to end.

### Checklist

- [x] Create a migration that assigns every existing theme to an explicit tenant.
- [x] Make `themes.tenant_id` non-null after data migration.
- [x] Update PostgreSQL schema, MySQL schema, and MariaDB schema.
- [x] Update unique theme-name constraints to use the intended tenant scope.
- [x] Update the single-active-theme constraint to enforce one active theme per tenant.
- [x] Update `ThemeService.syncFromDirectory()` to require and persist a tenant ID.
- [x] Update `ThemeService.install()` or replace it with a tenant-scoped registration method if any internal caller still requires metadata registration.
- [x] Update `list()`, `getById()`, `getByName()`, `getActive()`, activation, deactivation, config, history, import, export, and uninstall methods to apply tenant scope explicitly.
- [x] Do not rely on PostgreSQL RLS as the only tenant isolation mechanism.
- [x] Add equivalent tenant filters for MySQL and MariaDB.
- [x] Update `resolveActiveTheme()` in the web application to select only the current tenant's active theme.
- [x] Remove the global-theme ordering logic.
- [x] Update parent-theme lookup to use the current tenant only.
- [x] Update parent themes so a child cannot inherit from another tenant.
- [x] During tenant bootstrap, register the built-in `default` theme with that tenant's ID.
- [x] Activate the tenant's database default theme during bootstrap.
- [x] Remove the environment fallback as a substitute for a missing database theme.
- [x] Return an explicit operational error when a tenant has no valid active theme.
- [x] Add tests for two tenants with same theme name and different active themes.
- [x] Add tests proving that tenant A cannot list, activate, configure, preview, or uninstall tenant B's theme.

### Acceptance criteria

- No theme row has `tenant_id = NULL`.
- A new tenant always receives a database-backed active default theme.
- The web never renders a theme belonging to another tenant.
- The built-in default theme is found through the database, not an environment fallback.

## 7. Phase 2 — Secure preview and runtime compatibility

### Problems addressed

- Public `preview_theme` can select inactive themes.
- Runtime loading does not consistently enforce CMS compatibility.

### Resolution

Create a protected preview flow and one mandatory runtime validation pipeline.

### Checklist

- [x] Remove public unauthenticated `preview_theme` selection.
- [x] Add an authenticated preview endpoint or signed preview token flow.
- [x] Require the theme customization/preview permission.
- [x] Bind the preview token to the tenant, theme ID, user, and short expiration time.
- [x] Reject preview requests for themes outside the current tenant.
- [x] Keep preview settings request-scoped and never persist them automatically.
- [x] Validate the theme manifest before any compiled entry is imported.
- [x] Enforce `compatibility.okcms` against the current CMS version at runtime.
- [x] Reject missing, malformed, or invalid compatibility ranges.
- [x] Validate manifest name, version, type, render engine, styles, entry, parent, and components through one shared validator.
- [x] Compare the database manifest and filesystem `theme.json` before activation and before rendering.
- [x] Quarantine or mark invalid themes rather than continuing to load them.
- [x] Add structured logs for compatibility failures and manifest drift.
- [x] Add tests proving that an incompatible active theme never executes server code.

### Acceptance criteria

An inactive theme is never executed through a public URL. A theme that is incompatible with the current CMS version cannot be activated or rendered.

## 8. Phase 3 — Manual filesystem installation flow

### Problem addressed

The API installation route creates database records without copying files or building artifacts, producing themes that appear installed but cannot be activated.

### Resolution

Remove API installation as a product feature. Themes are installed by placing complete theme directories in the project's `themes` directory.

### Checklist

- [x] Remove `POST /themes/install` from the API.
- [x] Remove the corresponding client/admin installation action if present.
- [x] Remove or narrow `ThemeService.install()` so it cannot create a database-only theme record.
- [x] Define the required filesystem layout for a manually installed theme.
- [x] Validate `theme.json` during synchronization.
- [x] Validate tenant ownership during synchronization.
- [x] Validate compatibility during synchronization.
- [x] Validate styles and compiled artifacts during synchronization.
- [x] Make synchronization idempotent.
- [x] Ensure incomplete or invalid directories are reported with actionable errors.
- [x] Ensure synchronization cannot silently leave a stale incompatible database manifest.
- [x] Keep uninstall behavior explicit and tenant-scoped.
- [x] Document that manual file placement must be followed by synchronization/build.
- [x] Add an integration test for: copy files → sync → build → activate → render.

### Acceptance criteria

No API route can create a theme that does not exist on disk. The only install source is a complete tenant-scoped theme directory.

## 9. Phase 4 — Complete inheritance and component contract

### Problems addressed

- Parent persisted configuration is not merged.
- Only one stylesheet is loaded.
- Parent/child assets are incomplete.
- Manifest components are not connected to public rendering.

### Resolution

Build one resolved inheritance chain for the current tenant and use it consistently for all theme resources.

### Checklist

- [x] Resolve parent chain only within the current tenant.
- [x] Detect and report cycles with the exact chain and offending theme.
- [x] Preserve the original validation error instead of replacing it with a generic manifest error.
- [x] Define merge precedence: farthest parent → nearest parent → child.
- [x] Merge parent manifest defaults.
- [x] Merge parent persisted configuration.
- [x] Apply child configuration last.
- [x] Validate merged settings against the child/combined setting schema.
- [x] Resolve templates using the declared engine.
- [x] Preserve same-engine restrictions for compiled themes.
- [x] Define cross-engine inheritance behavior explicitly.
- [x] Load all inherited styles in deterministic order.
- [x] Deduplicate inherited styles.
- [x] Version every inherited stylesheet URL with the relevant build ID.
- [x] Resolve inherited public assets using tenant-safe paths.
- [x] Connect `components[]` metadata to component resolution and rendering, or remove unsupported component declarations from the public contract.
- [x] Implement component/partial registration for legacy themes if that feature remains supported.
- [x] Add parent/child tests for template, React, Solid, settings, CSS, assets, and components.

### Acceptance criteria

Changing a child theme configuration or stylesheet must affect the final page even when the requested template is supplied by a parent theme.

## 10. Phase 5 — Atomic compiled artifacts and build cache

### Problems addressed

- Rebuilds can expose mixed server/client/artifact versions.
- Module cache grows for every build ID.
- Styles are not fully validated for existence.

### Resolution

Build into a staging directory, validate completely, and atomically publish one coherent artifact set.

### Checklist

- [x] Build server, client, CSS, and artifact manifest in a temporary staging directory.
- [x] Validate the complete staged artifact before publication.
- [x] Publish the staged directory using an atomic rename/swap.
- [x] Retain the previous valid build until the new build is ready.
- [x] Validate existence of every `styles` entry.
- [x] Validate existence of every client asset.
- [x] Validate existence of every dynamically emitted style/script path.
- [x] Validate that all resolved files remain inside the theme directory after realpath resolution.
- [x] Include framework/build-tool inputs in the build identity where necessary.
- [x] Bound the compiled module cache with an LRU or current/previous build policy.
- [x] Remove stale cached builds after successful publication.
- [x] Add concurrent render tests during rebuild.
- [x] Add failed-build tests proving the previous valid artifact remains usable.

### Acceptance criteria

No request can observe a partially written compiled theme. A failed build does not destroy the last valid build.

## 11. Phase 6 — Asset URLs and caching

### Decision

Use `?v=<buildId>` on theme assets. In production, use `immutable` only for versioned assets.

### Checklist

- [x] Add the compiled build ID to server entry URLs.
- [x] Add the compiled build ID to client hydration URLs.
- [x] Add the relevant build ID to generated stylesheet URLs.
- [x] Add the build ID to inherited stylesheet URLs.
- [x] Ensure asset URLs are escaped and path-safe.
- [x] Use `Cache-Control: no-cache` or short caching for unversioned development assets.
- [x] Use `public, max-age=31536000, immutable` only when the URL contains a stable version/build ID.
- [x] Ensure deploys cannot reuse a versioned URL for different content.
- [x] Add browser/proxy cache tests around a rebuild.

### Acceptance criteria

After a rebuild or deploy, a browser cannot keep an old theme artifact under the same versioned URL.

## 12. Phase 7 — DEV reliability and Admin observability

### Problems addressed

- Initial watcher failures can be swallowed.
- Invalid artifacts do not provide enough operational visibility.

### Resolution

Make theme build health explicit in DEV, Admin, and runtime responses.

### Checklist

- [x] Fail DEV startup when the first compiled-theme build fails, unless an explicit diagnostic mode is enabled.
- [x] Do not silently disable the watcher and continue as if the system were healthy.
- [x] Expose theme build status to the Admin.
- [x] Show current artifact build ID.
- [x] Show expected build ID calculated from current sources.
- [x] Show build timestamp and engine.
- [x] Show the exact validation or build failure reason.
- [x] Show whether the artifact is missing, stale, incompatible, or structurally invalid.
- [x] Return an explicit error when the runtime receives an invalid artifact.
- [x] Keep public error responses safe while preserving detailed server-side diagnostics.
- [x] Add health/readiness reporting for compiled themes.
- [x] Add Admin refresh behavior after a watcher rebuild.
- [x] Add tests for initial build failure, subsequent recovery, and stale artifacts.

### Acceptance criteria

Developers can see immediately why a theme failed. The Admin can distinguish current, stale, missing, and invalid builds.

## 13. Phase 8 — CSS, Tailwind, and style validation

### Problems addressed

- Generated Tailwind configuration scans only `.astro` files.
- Missing Tailwind dependencies can return uncompiled CSS.
- CSS validation and scoping are incomplete for modern syntax.

### Checklist

- [x] Update generated Tailwind content globs to include `tsx`, `jsx`, `ts`, `js`, `html`, and `astro`.
- [x] Ensure compiled React/Solid source directories are included.
- [x] Make missing Tailwind/PostCSS dependencies a hard build error in production builds.
- [x] Keep a clearly documented optional fallback only for controlled development scenarios, if still needed.
- [x] Validate the generated CSS does not contain unresolved `@tailwind` directives.
- [x] Validate `stylesConfig.entry` and `stylesConfig.output` before build.
- [x] Make invalid isolation settings blocking errors.
- [x] Test CSS scoping with comments, strings, nesting, media queries, layers, keyframes, and imports.
- [x] Decide whether to replace the custom CSS parser with a standards-aware PostCSS parser.
- [x] Add CSS output snapshots for CSS, SCSS, Tailwind, React, Solid, and inherited themes.

### Acceptance criteria

All scaffolded React/Solid Tailwind classes appear in the final CSS, and no production build succeeds with unresolved Tailwind directives.

## 14. Phase 9 — Provider translation compatibility

### Problem addressed

Theme data queries use PostgreSQL-specific constructs such as `ANY($n::text[])`, while the provider translator does not translate all of them for MySQL/MariaDB.

### Resolution

Extend the provider translation layer rather than maintaining separate theme query implementations.

### Checklist

- [x] Add translation support for `ANY($n::type[])` to provider-compatible `IN (...)` semantics.
- [x] Ensure array parameters are expanded safely and never interpolated unsafely.
- [x] Cover `ANY` for text, UUID, and other supported types.
- [x] Review all theme-related queries for casts, `NULLS LAST`, `ILIKE`, JSON operators, and PostgreSQL-only functions.
- [x] Add translator unit tests for every theme query shape.
- [x] Add runtime integration tests against PostgreSQL.
- [x] Add runtime integration tests against MySQL.
- [x] Add runtime integration tests against MariaDB.
- [x] Keep provider behavior identical for settings, menus, content, taxonomy, assets, and theme registry operations.
- [x] Update provider compatibility documentation.

### Acceptance criteria

The same public page and Admin theme operation work on PostgreSQL, MySQL 8.0.36+, and MariaDB 11.4+.

## 15. Phase 10 — Render contract and security hardening

### Checklist

- [x] Fix the `ogImage` operator-precedence bug.
- [x] Define a serialized public theme context that excludes internal database columns and sensitive fields.
- [x] Audit hydration payload contents before sending them to the browser.
- [x] Reject full-document output for themes using hydration or automatic runtime assets.
- [x] Keep full-document mode available only for explicitly declared non-hydrating themes, if still required.
- [x] Add a validation error explaining why a full document is rejected.
- [x] Replace or strengthen regex-based raw HTML sanitization if untrusted content can reach it.
- [x] Validate all theme-generated head markup according to the trusted-theme security model.
- [x] Add security tests for traversal, symlinks, unsafe asset paths, preview access, and cross-tenant access.

## 16. Phase 11 — API, CLI, Admin, and documentation alignment

### Checklist

- [x] Remove the API installation route and related API client calls.
- [x] Update Admin UI so installation is not presented as an API action.
- [x] Make CLI activation require the tenant context.
- [x] Make CLI activation fail if database activation fails; do not report success based only on local config.
- [x] Remove or redefine local enable/disable state if the web runtime does not consume it.
- [x] Ensure `theme:manage --set-active` updates the same database source of truth used by the web.
- [x] Make legacy manifest migration an explicit preflight requirement for production deployment.
- [x] Align `toggle` and `checkbox` across types, validation, Admin, examples, and documentation.
- [x] Update theme documentation to describe tenant ownership.
- [x] Remove claims that are not implemented, especially component rendering and cross-engine inheritance behavior.
- [x] Document the required manual installation flow.
- [x] Document DEV watcher behavior and failure handling.
- [x] Document production build, artifact publication, and cache versioning.
- [x] Add an operational troubleshooting guide for stale, missing, incompatible, and invalid artifacts.

## 17. Phase 12 — Test and release gates

### Unit and contract tests

- [x] Theme manifest validation.
- [x] Tenant-scoped registry operations.
- [x] Default theme bootstrap.
- [x] Preview authorization.
- [x] Compatibility enforcement.
- [x] Parent chain resolution.
- [x] Settings/config merge precedence.
- [x] CSS/style validation.
- [x] Artifact validation.
- [x] Atomic build publication.
- [x] Cache-busting URLs.
- [x] Full-document rejection with hydration/assets.
- [x] Provider SQL translation.

### Integration tests

- [x] Template theme in DEV.
- [x] Template theme in PROD.
- [x] React SSR theme in DEV.
- [x] React SSR theme in PROD.
- [x] Solid SSR theme in DEV.
- [x] Solid SSR theme in PROD.
- [x] React hydration in DEV and PROD.
- [x] Solid hydration in DEV and PROD.
- [x] Parent/child themes in all supported engines.
- [x] Manual filesystem installation flow.
- [x] Failed build preserving previous valid artifact.
- [x] Browser cache invalidation after build ID changes.
- [x] PostgreSQL public rendering.
- [x] MySQL public rendering.
- [x] MariaDB public rendering.
- [x] Cross-tenant isolation.

### Required project validation sequence before release

- [x] `bun run test:run`
- [x] `bun run check:api-drift`
- [x] `bun run audit:contracts`
- [x] `bun run check:provider-matrix`
- [x] PostgreSQL acceptance
- [x] `bun run build`
- [x] PostgreSQL historical upgrade acceptance with Node
- [x] MySQL and MariaDB acceptance
- [x] `bun run typecheck`
- [x] `bun run lint`
- [x] Repeat the complete sequence until all checks are clean.
- [x] Complete three consecutive clean validation runs before tagging a release.

## 18. Definition of done

The theme system may be considered complete only when:

- [x] Every theme belongs to exactly one tenant.
- [x] Every tenant has a database-backed active default theme after bootstrap.
- [x] No rendering path depends on a global theme or silent environment fallback.
- [x] Preview is authenticated, tenant-scoped, and time-limited.
- [x] Compatibility is enforced before execution.
- [x] Manual filesystem installation is deterministic and idempotent.
- [x] API installation is removed.
- [x] Parent settings, configuration, templates, styles, assets, and components follow a documented contract.
- [x] Compiled artifacts are published atomically.
- [x] Stale builds and invalid artifacts are visible in the Admin.
- [x] Asset URLs include `?v=<buildId>`.
- [x] Production immutable caching is used only for versioned assets.
- [x] Tailwind works for React and Solid source files.
- [x] Missing production build dependencies fail clearly.
- [x] PostgreSQL, MySQL, and MariaDB render the same theme behavior.
- [x] Full-document output is rejected when hydration or automatic assets are enabled.
- [x] All documentation matches implemented behavior.
- [x] The complete validation sequence passes three consecutive times.

## 19. Completion evidence

The implementation is complete across the tenant-owned registry, bootstrap migration, protected preview flow, runtime compatibility checks, manual filesystem synchronization, inheritance and component resolution, atomic compiled artifacts, build-aware caching, Admin observability, style validation, provider translation, public render sanitization, and operational documentation.

The required validation sequence passed three consecutive times on 2026-11-25:

- 142 test files and 1,444 tests passed on every run.
- API drift, contract audit, and provider matrix checks passed on every run.
- PostgreSQL fresh-schema and historical V018/V025+ upgrade acceptance passed on every run.
- MySQL 8.0.36 and MariaDB 11.4 acceptance passed on every run.
- Full dependency-ordered build, typecheck, and lint passed on every run.

