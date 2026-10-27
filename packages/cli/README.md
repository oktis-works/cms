# @oktis-works/cli

Command-line interface — project scaffolding, theme management, migrations, builds.

## Commands

### Project

```bash
okcms init [dir]                    # Scaffold new project (copies theme/default)
okcms theme:create <name>           # Create new theme from default
okcms theme:build                   # Build active theme (CSS, components)
okcms theme:activate <name>         # Set active theme in DB
```

### Database

```bash
okcms db:migrate                    # Run migrations
okcms db:rollback                   # Rollback last migration
okcms db:seed                       # Run seed data
```

### Build & Deploy

```bash
okcms build                         # Build all packages (bun run build)
okcms build:prod                    # Production build
okcms deploy                        # Deploy to configured target
```

### Development

```bash
okcms dev                           # Start web + admin (concurrent)
okcms web                           # Start web server only
okcms admin                         # Start admin dev server
okcms worker                        # Start job queue worker
```

## Phase 1 Integration

### `okcms init`

Scaffolds `themes/default/` byte-identical to monorepo theme.

**Verifies:**
- Theme assets copied (`dist/`, `templates/`, `assets/`)
- Theme manifest (`theme.json`)
- No hardcoded `/blog/` URLs — uses `{{url}}` template variable

### Theme Assets

Built by `scripts/generate-theme-assets.mjs` → `src/generated/theme-assets.ts`.

```typescript
export const themeAssets = {
  'themes/default/single.astro': '...',
  'themes/default/archive.astro': '...',
  // ...
};
```

Copied to CLI `dist/themes/default/` for `okcms init`.

## Build Pipeline

```bash
bun run build  # Runs scripts/build-order.mjs
```

**Order:** validation → types → config → database → auth → plugin-sdk → plugin-runtime → core → theme-sdk → theme-runtime → api-client → ui → cli

Each package: `tsc` → copy migrations (cli) → copy theme assets (cli).

## Generated Files

| Script | Output |
|--------|--------|
| `generate-versions.mjs` | `src/generated/app-versions.ts` |
| `generate-theme-assets.mjs` | `src/generated/theme-assets.ts` |
| `copy-migrations.mjs` | `dist/migrations/` (79 files) |
| `copy-theme-assets.mjs` | `dist/themes/default/` |

## Version Management

- Root `package.json` `version` = product version (e.g., `0.36.26`)
- `CMS_VERSION` synced to:
  - `CMS_VERSION` file
  - `packages/validation/src/compatibility.ts`
  - `README.md` title (`# OkCMS vX.Y.Z`)
- Sync: `bun run sync-version --write`

## Release Process

1. Changeset: `bunx changeset` (creates `.changeset/*.md`)
2. Version: `bun run version-packages` (bumps packages + syncs CMS_VERSION)
3. Build: `bun run build && bun run test:run && bun run lint && bun run typecheck`
4. Commit: `chore(release): vX.Y.Z`
5. Tag & push: `git tag vX.Y.Z && git push origin main --tags`
6. CI publishes to npm (OIDC, no token)