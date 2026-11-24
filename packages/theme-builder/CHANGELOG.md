# @oktis-works/theme-builder

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
