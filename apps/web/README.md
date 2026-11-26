# @oktis-works/web

Public HTTP host for tenant-aware OkCMS sites. The web app owns routing,
tenant context, SEO/document wrapping, plugin assets, and public response
security. Theme source code is not interpreted by this process.

## Theme rendering

For each request the host establishes the tenant context, resolves a logical
render key, creates a request-scoped `ThemeSdkBridge`, and invokes the compiled
theme artifact:

```ts
render(templateKey, pageData, renderContext, sdk)
```

Only React and Solid artifacts with `render.apiVersion: 2` are accepted. An
invalid or missing artifact is a deterministic runtime error; the host does not
fall back to a string renderer or synthesize an HTML page.

## Routes

| Route | Responsibility |
| --- | --- |
| `GET /themes/*` | validated theme assets from the active tenant theme |
| `GET /feed.xml`, `GET /atom.xml` | public content feeds without CMS generator markers |
| `GET *` | logical-key routing and compiled theme SSR |

Theme framework dependencies remain inside the theme build. The host runtime
does not require React or Solid packages to render a request.
