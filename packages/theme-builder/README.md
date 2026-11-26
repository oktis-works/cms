# @oktis-works/theme-builder

Builds isolated React or Solid themes into the v1 artifact consumed by
`@oktis-works/theme-runtime`.

The builder reads `theme.json`, validates `render.apiVersion: 2`, bundles the
theme's server entry with its framework dependencies, discovers logical
`templateKeys`, builds scoped styles, and writes `dist/theme-build.json`.

The host runtime does not use this package at request time. A theme must be
built before activation and must own its React/Solid, Vite, TypeScript, and SDK
dependencies.

```bash
okcms theme:build --name my-theme
```
