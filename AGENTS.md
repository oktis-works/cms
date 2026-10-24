# Agent Instructions & Project Rules

This document defines strict operational rules and workflows that the AI Agent must execute during development, commit, and deployment phases.

## 1. Commit Message Standard
* **Language:** Every commit message must be written in English.
* **Format:** Use the full Conventional Commits specification. This includes types such as `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`, etc.

## 2. Versioning Model (memorize this — the release gate validates it)
* **Product version anchor:** the `version` in the ROOT `package.json` (private workspace `okcms`, never published). It carries product semantics and is the ONLY source of truth for releases.
* **`CMS_VERSION` is DERIVED, never edited by hand:** it lives in two places — the root `CMS_VERSION` file and the `CMS_VERSION` constant in `packages/validation/src/compatibility.ts`. Sync both from the anchor with `bun run sync-version --write`.
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
