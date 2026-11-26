# Theme Platform Major Migration Plan

Status: implementation complete; release validation pending
Target product release: v1.0.0
Release branch: `release/v1.0.0`

## Objective

Replace the current mixed theme platform with a React/Solid-only platform in
which the Theme SDK is the sole public bridge between the CMS host, plugins,
and themes. Themes must own their framework and build dependencies while the
host consumes only a versioned, framework-neutral artifact contract.

This is an intentional breaking major release. The repository is still under
development and has not been publicly released, so all legacy theme behavior
may be removed instead of preserved through compatibility adapters.

## Non-negotiable decisions

- React and Solid are the only supported public theme engines.
- The string-template engine, `.astro` theme templates, custom template parser,
  legacy template hierarchy, and all related scaffolding are removed.
- Themes never import `core`, `database`, `api`, `plugin-runtime`, or private
  CMS modules.
- Themes communicate with the host through the Theme SDK bridge only.
- Theme code receives a request-scoped, tenant-scoped capability object. It
  never receives a database connection or an unrestricted service locator.
- React, Solid, Vite plugins, and theme-only dependencies are not required by
  the host runtime. They are resolved from the theme build environment and are
  bundled into the theme artifact when needed.
- The host runtime remains framework-neutral and loads a stable ESM artifact.
- Plugin functionality remains available, but plugin-to-theme communication
  becomes declarative and capability-based.
- Theme inheritance is declarative and engine-compatible only. Cross-engine
  code inheritance is forbidden.
- Public HTML, response headers, and RSS output must not identify the CMS.
  Remove generator meta tags, `X-Powered-By` signatures, RSS generator
  markers, and related documentation/tests. CMS version remains internal.
- No public output may contain a hidden or visible OkCMS/Wappalyzer marker
  unless a future explicit opt-in feature is introduced.

## Target architecture

```text
HTTP request
  -> tenant context and route resolution in the host
  -> Theme SDK bridge creation
  -> compiled theme artifact
       render(templateKey, pageData, renderContext, sdk)
  -> validated ThemeRenderOutput
  -> host-owned document shell, SEO, assets, CSP, and response
```

The theme artifact contract is the only runtime boundary:

```ts
export interface ThemeServerModule {
  render(
    templateKey: string,
    data: ThemePageData,
    context: ThemeRenderContext,
    sdk: ThemeSdkBridge
  ): ThemeRenderOutput | Promise<ThemeRenderOutput>;

  templateKeys: string[];
}
```

The framework is selected in `theme.json`, but the host does not execute
framework code directly:

```json
{
  "render": {
    "engine": "react",
    "apiVersion": 2,
    "hydration": "none",
    "entry": "src/entry-server.tsx"
  }
}
```

## Theme SDK bridge contract

Create a pure public contract layer and keep Node-specific implementation out
of the universal contract.

### Contract domains

- `context`: CMS version, SDK API version, tenant identity metadata, locale,
  request URL, user capability summary, and current route.
- `content`: scoped queries, single records, slugs, content types, and
  pagination.
- `fields`: logical standard/custom field access, flexible layouts, field type
  metadata, and normalized values.
- `menus`: menu lookup and menu collections.
- `taxonomies`: taxonomy and term lookup.
- `settings`: public settings and validated theme settings.
- `hooks`: explicitly allowed read/transform extension points with typed input
  and output values.
- `actions`: explicitly registered, permission-checked actions. Actions are
  never arbitrary function execution and never expose database access.
- `plugins`: serialized plugin block, pattern, component capability, and asset
  catalogs.
- `media`: safe public media URLs and metadata only.
- `navigation`: tenant-aware URL helpers and canonical paths.

### Bridge rules

- The host creates the bridge per request.
- Every bridge method is already bound to the active tenant.
- A theme cannot provide or override `tenantId` in a query.
- All values crossing the boundary are JSON-safe or explicitly normalized
  strings/numbers/booleans/null/arrays/records.
- Dates are serialized as ISO strings.
- Errors use stable error codes and do not leak SQL, filesystem, or secret
  details.
- Hooks and actions are allow-listed by the host and plugin permissions.
- The bridge must work when the theme bundles its own SDK copy; it cannot rely
  on shared module singletons or duplicated `AsyncLocalStorage` instances.
- Browser hydration receives a serialized, signed or integrity-checked payload;
  it does not receive server-only providers or tenant selectors.

### Package layout

Preferred package boundaries:

- `@oktis-works/theme-contract`: pure types, protocol schemas, output
  validation primitives, and no Node imports.
- `@oktis-works/theme-sdk`: theme-facing bridge factories/types and universal
  helpers.
- `@oktis-works/theme-sdk/react`: optional React helpers.
- `@oktis-works/theme-sdk/solid`: optional Solid helpers.
- `@oktis-works/theme-runtime`: host-side artifact loading, validation,
  routing, style handling, and cache management.
- `@oktis-works/theme-builder`: official React/Solid build tool and artifact
  writer, not a runtime dependency of the theme.

If a new contract package would create unnecessary churn, the first
implementation may place the pure contract in `theme-sdk`, but it must not
retain Node-only data providers in the browser-facing entry point.

## Plugin bridge

Plugins continue to register through the existing plugin SDK/runtime. The
host converts their registrations into a theme-facing catalog.

Supported first-class contributions:

- field values and field metadata;
- block and pattern schemas;
- server-rendered sanitized block output;
- public assets with validation and deduplication;
- typed render transforms;
- public settings and navigation contributions.

Direct theme imports from plugin directories are forbidden. Arbitrary plugin
`rendererPath` loading from the theme is removed from the public contract. A
temporary internal host adapter may render existing server block modules while
the source tree is migrated, but the final public API must expose serialized
capabilities, not plugin filesystem paths.

Framework-specific plugin components are not part of v1.0.0 public theme
rendering. If introduced later, they require separate React and Solid adapter
contracts and explicit version negotiation.

## Theme inheritance

Inheritance is retained only where it does not compromise isolation:

- parent and child must use the same render engine;
- parent and child must support the same artifact API version;
- settings, declared assets, and manifest metadata may be inherited;
- a child may override template keys and styles through its own artifact;
- a child must not import source code or `node_modules` from its parent;
- cycles, missing parents, incompatible parents, and cross-engine parents fail
  during discovery/activation;
- inheritance resolution is tenant-safe and performed by the host.

If implementation complexity becomes disproportionate, code inheritance is
removed entirely and only declarative settings/assets inheritance remains.

## Implementation phases

### Phase 0 — Baseline and release preparation

- [x] Work only on `release/v1.0.0`, created from current `main`.
- [x] Preserve unrelated pre-existing changes.
- [x] Record this plan at the repository root.
- [x] Inventory all legacy template references, theme imports, plugin render
      paths, public signatures, and package dependencies.
- [x] Decide final package names and artifact API version.
- [x] Create and consume changesets for every changed published package, in English.
- [x] Bump the root product version to `1.0.0` only after implementation and
      after consuming package changesets.

### Phase 1 — Contract and bridge

- [x] Define `ThemeSdkBridge`, `ThemeSdkContext`, capability errors, stable
      result types, and JSON-safe value types.
- [x] Define `ThemePageData`, `ThemeRenderContext`, `ThemeRenderOutput`, and
      `ThemeServerModule` at the stable contract boundary.
- [x] Remove Node-only imports from the universal SDK entry point.
- [x] Replace module-global provider/hook assumptions with request-scoped
      bridge injection.
- [x] Keep `AsyncLocalStorage` only inside host implementation adapters where
      needed; never make it a theme ABI requirement.
- [x] Add protocol validation and explicit `apiVersion: 2` handling.
- [x] Add tests for concurrent tenants, concurrent requests, missing
      capabilities, invalid values, and duplicated SDK copies.

### Phase 2 — Host and runtime migration

- [x] Update `apps/web` to create one bridge per request after tenant context is
      established.
- [x] Pass the bridge into the compiled artifact.
- [x] Keep SEO, document wrapping, CSP, asset validation, and security policy
      in the host.
- [x] Make render output validation reject unsafe assets, invalid HTML mode,
      unsupported API versions, and tenant leakage.
- [x] Remove runtime reliance on `ThemeRenderer` and `.astro` file lookup.
- [x] Keep route hierarchy as logical template keys, independent of file
      extension.
- [x] Ensure failed themes return a deterministic runtime error without falling
      through to legacy rendering.
- [x] Preserve tenant RLS and request context on every bridge operation.

### Phase 3 — Isolated theme projects

- [x] Add a real `package.json` to the default theme and generated themes.
- [x] Make each theme declare its own React or Solid dependency, types, build
      plugin, and SDK range.
- [x] Stop resolving framework packages from the root as an implicit fallback.
- [x] Make the builder use the theme's package resolution first and fail with an
      actionable error when dependencies are absent.
- [x] Bundle framework code into the artifact or declare a fully versioned
      external runtime contract; do not rely on host framework versions.
- [x] Ensure the host runtime requires only the artifact and the contract.
- [x] Add isolated dependency-resolution coverage for both engines.
- [x] Make the build ID include the package manifest, parent identity, and contract API.
- [x] Ensure client hydration and SSR use the same contract version.

### Phase 4 — React/Solid-only theme system

- [x] Remove `render.engine = template` and absent-render fallback behavior.
- [x] Require `render.engine` to be `react` or `solid`.
- [x] Remove `.astro` source generation and all legacy template scaffolding.
- [x] Remove the custom string-template parser and legacy renderer tests.
- [x] Remove legacy template resolver branches and `.astro` documentation.
- [x] Convert the default theme completely to the new artifact contract.
- [x] Update CLI commands and help text to require `--engine react|solid`.
- [x] Remove migration code for legacy `manifest.json` and legacy template
      layouts if no longer needed.
- [x] Update all public documentation and generated scaffold docs in English.

### Phase 5 — Plugin integration through the SDK

- [x] Add a host-to-theme plugin catalog adapter.
- [x] Replace filesystem-path renderers in the theme contract with typed,
      sanitized results.
- [x] Preserve plugin field types and admin components unchanged unless they
      are accidentally coupled to public theme rendering.
- [x] Add tenant-scope tests for platform and tenant plugin contributions.
- [x] Add tests for plugin failure isolation, output sanitization, asset
      deduplication, and permission enforcement.
- [x] Document the supported plugin-to-theme capabilities and explicitly reject
      private plugin imports.

### Phase 6 — Inheritance and lifecycle

- [x] Validate parent engine/API compatibility during discovery, sync, and
      activation.
- [x] Remove cross-engine code fallback.
- [x] Ensure inherited settings and assets remain tenant-scoped.
- [x] Include parent manifest/build identity in the child build identity.
- [x] Add cycle, missing-parent, stale-parent, and incompatible-parent tests.
- [x] Update Admin theme health/status to report bridge/API/build failures.

### Phase 7 — Public signature removal

- [x] Remove `<meta name="generator" content="OkCMS ...">` from the public
      document shell.
- [x] Remove `X-Powered-By: OkCMS/...` from public responses, including the
      opt-in configuration path.
- [x] Remove `<generator>OkCMS</generator>` and equivalent RSS markers.
- [x] Remove related comments, tests, snapshots, and scaffold documentation.
      Historical changelog entries remain historical records.
- [x] Search the final source and generated assets for `OkCMS`, `Wappalyzer`,
      `generator`, and `X-Powered-By` in public-output code. Internal CLI,
      package names, logs, and documentation may still mention the product,
      but public site output must not.
- [x] Add negative tests proving the public HTML/head, headers, and RSS do not
      contain CMS identification markers.

### Phase 8 — Package cleanup and versioning

- [x] Remove deprecated legacy exports and package entry points.
- [x] Remove unused root framework dependencies that are not required by the
      admin or official builder.
- [x] Reconcile workspace and lockfile behavior for nested theme dependencies.
- [x] Update package dependency ranges and exports.
- [x] Add major changesets for theme SDK, runtime, builder, CLI, web, types, and
      any other changed published package.
- [x] Run `bun run version-packages`.
- [x] Set the root product version to `1.0.0`.
- [x] Run `bun run sync-version --write` and then `bun run sync-version`.
- [x] Confirm `CMS_VERSION`, `packages/validation/src/compatibility.ts`, and
      the README title all equal `1.0.0`.

### Phase 9 — Documentation and public contract updates

- [x] Rewrite `THEME.md` as the canonical React/Solid-only theme guide.
- [x] Rewrite `THEMES.md` to describe the new package layout, bridge contract,
      artifact format, dependency isolation, inheritance restrictions, and
      activation/build lifecycle.
- [x] Update `docs/theme-development.md` and
      `docs/theme-development.pt-BR.md` with the same supported contract,
      including React and Solid examples that use the Theme SDK bridge.
- [x] Update the root `README.md` and any localized README files with the new
      theme engines, commands, dependency expectations, and breaking-release
      notice.
- [x] Update `apps/web/README.md`, package READMEs, and maintainer guides where
      they describe theme runtime ownership or build order.
- [x] Update CLI-generated documentation in `packages/cli/src/scaffold-docs.ts`
      and all generated theme assets/templates so new projects never mention
      the removed template engine.
- [x] Update `packages/theme-sdk/README.md`, `packages/theme-runtime/README.md`,
      and `packages/theme-builder/README.md` with the stable bridge and artifact
      contracts.
- [x] Update plugin documentation to describe the new plugin-to-theme catalog
      and remove claims about direct public theme renderer paths.
- [x] Update architecture/maintainer documentation and any implementation
      plans that describe legacy templates as supported behavior.
- [x] Add a migration note describing the v1.0.0 breaking changes, including
      the required theme package manifest and React/Solid entry points.
- [x] Audit current Markdown, scaffold strings, examples, and generated
      assets for stale `.astro`, string-template, legacy engine, or CMS public
      signature claims. Historical changelog entries are retained as history.
- [x] Ensure documentation explains that product identifiers remain in package
      and CLI metadata but are intentionally absent from public site HTML,
      headers, and RSS output.

## Required verification

Run in this order after each implementation correction:

1. `bun run test:run`
2. `bun run check:api-drift`
3. `bun run audit:contracts`
4. `bun run check:provider-matrix`
5. `OKCMS_ACCEPTANCE_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres bun run test:postgres`
6. `bun run build`
7. `OKCMS_ACCEPTANCE_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres node packages/database/scripts/postgres-upgrade-acceptance.mjs`
8. `OKCMS_MYSQL_ACCEPTANCE_URL=mysql://root:root@127.0.0.1:3306/mysql OKCMS_MARIADB_ACCEPTANCE_URL=mariadb://root:root@127.0.0.1:3307/mysql bun run test:providers`
9. `bun run typecheck`
10. `bun run lint`

Additional theme-specific gates:

- [ ] React theme clean build and SSR render.
- [ ] Solid theme clean build and SSR render.
- [ ] React and Solid isolated dependency installations.
- [ ] Concurrent tenant bridge isolation.
- [ ] Plugin catalog and action permission tests.
- [ ] Parent/child engine and API compatibility tests.
- [ ] Hydration payload validation tests.
- [ ] Public HTML/header/RSS signature absence tests.
- [ ] Fresh-checkout build with no pre-existing `dist/` or `node_modules/`.

Before release tagging, the full sequence must pass three consecutive times.

## Release procedure

- [ ] Confirm all changes are on `release/v1.0.0` from `main`.
- [ ] Ensure every changed package has an English changeset.
- [ ] Consume changesets with `bun run version-packages`.
- [ ] Bump root `package.json` to `1.0.0`.
- [ ] Synchronize and validate CMS version anchors.
- [ ] Run `node scripts/prepare-publish.mjs --check --tag v1.0.0`.
- [ ] Run all required verification gates three consecutive times.
- [ ] Commit with an English Conventional Commit message.
- [ ] Push `release/v1.0.0` only after local gates pass.
- [ ] Let the release PR workflow create the PR to `main`.
- [ ] Merge only after CI passes; publishing occurs from the configured main
      workflow.
- [ ] Never reuse a failed or burned tag.

## Completion criteria

The migration is complete only when:

- no legacy template engine remains in source, tests, scaffolds, or public
  documentation;
- a theme can be built with only its own framework dependencies;
- the host uses only the stable Theme SDK/artifact bridge;
- plugins communicate with themes through declared capabilities;
- tenant isolation is proven under concurrent requests;
- public output contains no CMS identification signature;
- all release gates pass three consecutive times;
- the release branch is ready for review and merge into `main`.
