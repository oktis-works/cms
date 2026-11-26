# Themes

OkCMS v1 supports two theme engines: React SSR and Solid SSR. Both use the same
logical render-key contract and the same request-scoped `ThemeSdkBridge`.

## What changed in v1

The major release removes the string-template engine, source-file template
lookup, custom interpolation, and implicit host providers. Themes are now
independent projects with their own framework dependencies. The host loads only
a validated compiled artifact.

This is intentionally breaking. Existing themes must be rebuilt as React or
Solid themes; there is no legacy adapter or compatibility fallback.

## Theme lifecycle

1. The manifest is parsed and checked for CMS compatibility.
2. The render engine and SDK API version are validated.
3. The theme is built with Vite SSR.
4. The runtime validates `dist/theme-build.json` and its assets.
5. The request resolves a logical key.
6. The host creates a tenant-scoped `ThemeSdkBridge`.
7. The theme renders through `render(key, data, context, sdk)`.
8. The host adds site SEO, plugin assets, and validated theme assets.

An invalid active theme stops rendering with an actionable error. The runtime
does not synthesize a page from raw content.

## Logical key resolution

The standard keys are:

| Key | Use |
| --- | --- |
| `home` | Site home |
| `index` | Generic content fallback |
| `single` | Generic single content |
| `page` | Generic page |
| `archive` | Collection or taxonomy archive |
| `404` | Not-found page |

Specific keys such as `post-project` or `page-about` may be exported by a
theme. Routing chooses the first key available in the active theme's engine
chain.

## The SDK bridge

The theme receives all CMS and plugin communication through `ThemeSdkBridge`.
It is deliberately JSON-safe and request-scoped. A theme can query public
content and settings, resolve fields, apply plugin hooks, execute explicitly
allowed actions, and inspect the plugin catalog.

The bridge is not a replacement for authorization. The host filters public
data,
establishes tenant context before database access, and decides which actions
are callable.

## React and Solid examples

A React theme can keep components in `home.tsx`, `single.tsx`, and related
files. A Solid theme can use the same keys with Solid components. The entry
module is the only framework-specific integration point required by the host.

```tsx
export function render(key, data, context, sdk) {
  const Component = components[key] ?? components['404'];
  return { html: renderToStaticMarkup(<Component {...data} sdk={sdk} />) };
}
```

## Inheritance policy

Inheritance is a controlled override mechanism, not a shared dependency graph.
Only same-engine themes with compatible API versions may contribute logical keys.
A child never imports a parent's source modules at runtime. Cross-engine
inheritance is rejected for rendering and must be replaced with a standalone
theme.

## Migration

Read [THEME.md](./THEME.md) and
[docs/theme-development.md](./docs/theme-development.md). The CLI scaffold now
generates React/Solid source and a private dependency manifest. Remove old
template files, old custom renderers, and direct host imports before rebuilding.
