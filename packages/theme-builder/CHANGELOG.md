# @oktis-works/theme-builder

## 1.0.5

### Patch Changes

- Updated dependencies [6d252fa]
  - @oktis-works/validation@1.0.3
  - @oktis-works/theme-runtime@1.0.4
  - @oktis-works/theme-sdk@1.0.4

## 1.0.4

### Patch Changes

- Preserve the manifest-declared stylesheet at `dist/theme.css` when building compiled themes so fresh development synchronization can validate and serve the default theme.

## 1.0.3

### Patch Changes

- fix(release): apply gap corrections for v1.0.4 — remove duplicate test files (`.js` in favor of `.ts`), remove duplicate API route files (`index.js` in favor of `index.ts`), consolidate Vitest config to `vitest.config.ts`, migrate ESLint to Oxlint, remove tag-based publish trigger (publish only via PR merge to main), and align AGENTS.md with the PR-driven release flow.
- Updated dependencies
  - @oktis-works/validation@1.0.2
  - @oktis-works/types@1.0.3
  - @oktis-works/theme-sdk@1.0.3
  - @oktis-works/theme-runtime@1.0.3

## 1.0.2

### Patch Changes

- Updated dependencies
  - @oktis-works/theme-sdk@1.0.2
  - @oktis-works/types@1.0.2
  - @oktis-works/theme-runtime@1.0.2

## 1.0.1

### Patch Changes

- chore: v1.0.1 patch release

  - Add island hydration support to default theme (entry-client.tsx)
  - Theme default now fully supports hydration: 'islands' with client entry
  - No breaking changes, patch version bump for all packages
- Updated dependencies
  - @oktis-works/theme-runtime@1.0.1
  - @oktis-works/theme-sdk@1.0.1
  - @oktis-works/types@1.0.1
  - @oktis-works/validation@1.0.1

## 1.0.0

### Major Changes

- Replace legacy theme rendering with isolated React/Solid theme artifacts and a request-scoped Theme SDK bridge. Remove string templates, legacy theme migrations, implicit framework resolution, and public CMS signature output.

### Patch Changes

- Updated dependencies
  - @oktis-works/theme-runtime@1.0.0
  - @oktis-works/theme-sdk@1.0.0
  - @oktis-works/types@1.0.0
  - @oktis-works/validation@1.0.0

## 0.2.3

### Patch Changes

- Complete the tenant-scoped theme system correction, including secure preview, validated inheritance, atomic compiled artifacts, provider compatibility, and public rendering hardening.
- Updated dependencies
  - @oktis-works/theme-runtime@0.14.2
  - @oktis-works/theme-sdk@0.10.2
  - @oktis-works/types@0.11.2
  - @oktis-works/validation@0.9.2

## 0.2.2

### Patch Changes

- Release v0.42.2: fix publish workflow tag checkout, add theme-builder README with sourcemap docs, fix CI trigger-publish to use actual tag ref
- Updated dependencies
  - @oktis-works/theme-runtime@0.14.1
  - @oktis-works/theme-sdk@0.10.1
  - @oktis-works/types@0.11.1
  - @oktis-works/validation@0.9.1

## 0.2.1

### Patch Changes

- Updated dependencies
  - @oktis-works/theme-sdk@0.10.0
  - @oktis-works/theme-runtime@0.14.0

## 0.2.0

### Minor Changes

- Add compiled React and Solid theme render engines.

  Themes can now declare `render.engine: "react" | "solid"` and export a
  server bundle that is built on the host by `okcms theme:build` (Vite SSR,
  `dist/theme-build.json` + `dist/server/entry.js`). Template themes keep the
  existing string-template path unchanged. `okcms dev` watches compiled themes
  and rebuilds them on save, while production deploys the host-built artifact.

### Patch Changes

- Updated dependencies
  - @oktis-works/types@0.11.0
  - @oktis-works/validation@0.9.0
  - @oktis-works/theme-sdk@0.9.0
  - @oktis-works/theme-runtime@0.13.0
