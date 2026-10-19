---
'@oktis-works/core': patch
'@oktis-works/plugin-runtime': patch
'@oktis-works/admin': patch
---

Fix fresh-checkout build and admin plugin field rendering

- plugin-runtime: resolve `@oktis-works/core` at runtime via a non-literal dynamic import in `bootstrapPlugins`, removing the static module reference that broke `tsc` on fresh checkouts (core builds after plugin-runtime and its `dist/` does not exist yet; `require()` is also unavailable in Node ESM).
- core: replace the self-import `await import('@oktis-works/core')` in `plugin/load.ts` with a relative import of the field type extension service.
- admin: fix plugin field type loaders (`PluginFieldRenderer`, `PluginFieldConfig`) — signals were read without calling them inside non-reactive `if` branches, so the components never left the loading state; now uses `Switch`/`Match` with `Dynamic`. Also fixes typecheck errors (index signature access, missing `t` prop propagation, `_t` prop name) across `FieldRenderer`.
