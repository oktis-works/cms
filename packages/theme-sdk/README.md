# @oktis-works/theme-sdk

The theme SDK is the stable bridge contract between the CMS host, plugins, and
isolated React/Solid themes.

## Public contract

Import the types and bridge API from the package:

```ts
import type {
  ThemePageData,
  ThemeRenderContext,
  ThemeRenderOutput,
  ThemeSdkBridge,
} from '@oktis-works/theme-sdk';
```

The server entry receives `ThemeSdkBridge` explicitly:

```ts
render(templateKey, data, context, sdk): ThemeRenderOutput
```

The bridge exposes tenant-scoped content, menus, taxonomies, public settings,
fields, plugin hooks, host actions, and plugin catalogs. It is JSON-safe and
does not expose database connections or host service instances.

## Versioning

`THEME_SDK_API_VERSION` is `2`. A theme must declare
`theme.json.render.apiVersion: 2`. The host rejects unsupported versions
before importing the theme bundle.

## Frameworks

The SDK has no framework runtime dependency. A theme chooses React or Solid in
its own `package.json`, while the SDK remains the framework-neutral contract.

## Security boundary

A bridge is created per request and bound to the resolved tenant. Public
settings and records are filtered by the host. Themes must not import internal
CMS packages or use process-global providers.
