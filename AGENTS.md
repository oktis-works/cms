# Agent Instructions & Project Rules

This document defines strict operational rules and workflows that the AI Agent must execute during development, commit, and deployment phases.

## 1. Commit Message Standard
* **Language:** Every commit message must be written in English.
* **Format:** Use the full Conventional Commits specification. This includes types such as `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`, etc.

## 2. GitHub & CI/CD Pipeline Workflow
Before preparing or recommending a push to GitHub, evaluate if the updates trigger the CI/CD and Publish workflows. If they do, the following actions are mandatory:

### CMS Versioning & Tagging
1. **Locate CMS_VERSION:** Check the current version specified in the `CMS_VERSION` variable or configuration file.
2. **Bump Version:** Determine the next version number based on the nature of the changes (Major, Minor, or Patch).
3. **Update File:** Apply the new version directly to the `CMS_VERSION` variable in the codebase.
4. **Git Tagging:** Create a new Git tag that matches exactly the updated `CMS_VERSION` (e.g., `v1.2.3`). This tag must be pushed to GitHub to trigger the release workflow.

### Individual Package Management via Changeset
* **Verification:** Always check for package updates using `changeset`.
* **Flow:** Ensure changesets are generated for individual packages when changes occur, and that they are consumed (`changeset version`) to bump the package versions independently before the final publish execution.

## 3. Custom Field Types via Plugins
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

### Versioning & Release
1. Bump version in root `package.json` (Minor for new features).
2. Run `bun run sync-version --write` to sync `CMS_VERSION`.
3. Create changeset: `bun run changeset` (select affected packages).
4. Run `bun run version-packages` to consume changesets and bump versions.
5. Commit with conventional commit message.
6. Tag: `git tag vX.Y.Z`.
7. Push: `git push origin main --tags`.

## 4. Build & Lint Rules
* **Build Order:** Always use `bun run build` which builds packages in dependency order.
* **Typecheck:** Run `bun run typecheck` (excludes plugins directory).
* **Lint:** Run `bun run lint` (ignores `packages/cli/src/scaffold.test.js`).
* **Tests:** Run `bun run test:run` before committing.

## 5. Custom Field Types via Plugins
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

### Versioning & Release
1. Bump version in root `package.json` (Minor for new features).
2. Run `bun run sync-version --write` to sync `CMS_VERSION`.
3. Create changeset: `bun run changeset` (select affected packages).
4. Run `bun run version-packages` to consume changesets and bump versions.
5. Commit with conventional commit message.
6. Tag: `git tag vX.Y.Z`.
7. Push: `git push origin main --tags`.

## 6. Build & Lint Rules
* **Build Order:** Always use `bun run build` which builds packages in dependency order.
* **Typecheck:** Run `bun run typecheck` (excludes plugins directory).
* **Lint:** Run `bun run lint` (ignores `packages/cli/src/scaffold.test.js`).
* **Tests:** Run `bun run test:run` before committing.
