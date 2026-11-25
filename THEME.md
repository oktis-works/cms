# Developing a Theme

A theme is the look of the public site: **templates** (a page hierarchy) +
**styles**, isolated by `[data-theme]` so a theme never leaks CSS into
another one.

> The commands use `npx` with the project's local CLI (no global
> install). With the global CLI (`bun add -g @oktis-works/cms`), run
> `okcms ...` directly.

## Render engines: template, React or Solid

A theme declares **exactly one** render engine in `theme.json`:

```json
"render": { "engine": "react", "apiVersion": 1, "hydration": "none" }
```

| `render.engine` | Source | Build | Runtime |
|---|---|---|---|
| `template` (default) | root `*.astro` string templates | CSS only | `ThemeRenderer` (current engine) |
| `react` | root `*.tsx` + `src/entry-server.tsx` | Vite SSR + `dist/theme-build.json` | imports the server bundle |
| `solid` | root `*.tsx` + `src/entry-server.tsx` | Vite SSR + `dist/theme-build.json` | imports the server bundle |

- **Never mix engines in one theme.** React and Solid are alternatives.
- All engines share the same hierarchy (`home`, `index`, `single`, `page`,
  `archive`, `404`, `{type}-{slug}`), the same `ThemePageData` contract and
  the same `[data-theme]` CSS isolation.
- React/Solid themes are built on the host: `okcms theme:build --name my-theme`
  publishes a validated generation under `dist/.versions/<buildId>/` and
  atomically updates `dist/theme-build.json`. The container never compiles
  theme code.
- **Development:** `okcms dev` starts a watcher for every React/Solid theme and
  rebuilds its artifact on each save (the web runtime picks up the new
  `buildId` on the next request, no restart). Run a single theme with
  `okcms theme:dev --name my-react-theme`. `okcms theme:build` remains the
  one-shot production/pre-deploy command.
- A compiled theme needs its artifact before activation; `okcms theme:manage
  --set-active` and the web runtime fail with an actionable error when it is
  missing or stale.
- Template inheritance works only between themes with the same engine. A
  parent with another engine contributes settings, styles and assets, never
  templates.
- Hydration (`render.hydration: "islands"`) is opt-in and requires
  `src/entry-client.tsx`; the default is server-only (`"none"`).
- **Islands contract:** the web emits a non-executable
  `<script type="application/json" id="okcms-theme-hydration">` with
  `{ buildId, templateKey, data }`, followed by the theme's external module
  script. The client entry reads it with `readThemeHydrationPayload()` from
  `@oktis-works/theme-sdk` and hydrates the matching root. CSP stays
  `script-src 'self'` — no inline executable script is generated.

```bash
okcms theme:create --name my-react-theme --engine react --style tailwind
okcms theme:build --name my-react-theme   # production / pre-deploy
okcms theme:dev   --name my-react-theme   # watch + rebuild (dev)
```

> The legacy examples below describe the `template` engine. They are **not**
> JSX/Astro component execution: `*.astro` files are string templates parsed
> by the OkCMS renderer.

## Generated structure

```bash
okcms theme:create --name my-theme --style css   # css | scss | tailwind
```

```
themes/my-theme/
├── theme.json               # manifest (type: theme + compatibility)
├── home.astro               # hierarchy templates AT THE ROOT
├── index.astro
├── single.astro
├── page.astro
├── archive.astro
├── 404.astro
├── dist/theme.css           # css engine — ready to serve
│                            # (or styles/main.scss — or src/input.css)
└── README.md
```

### theme.json

```json
{
  "name": "my-theme",
  "version": "0.1.0",
  "description": "my-theme theme for OkCMS",
  "type": "theme",
  "compatibility": { "okcms": "^0.40.4" }
}
```

With `--style scss` or `--style tailwind`, the manifest also gets
`stylesConfig` (`engine`, `entry`, `output`, `isolation`) pointing at the
style entry. `compatibility.okcms` is filled in and validated
automatically, just like with plugins.

Isolation (`stylesConfig.isolation`): `scss`/`tailwind` always get scoped
on build (`isolation: true`); on the `css` engine the theme can take
responsibility with `isolation: "manual"` — the shipped `dist/theme.css`
must already be scoped (the bundled default theme is). `isolation: false` is
rejected.

### Templates

Templates are `*.astro` files **at the theme root** — that's what the site
runtime looks up (hierarchy `home` → `index` → `404`, with declared parents,
`_shared`, and the built-in `default` floor for missing legacy templates).
This filesystem resolution happens only after the active tenant-owned database
row has been resolved; it never selects an active theme by fallback. Syntax
with variables, raw HTML, and nested
loops/conditionals:

```html
<main class="site">
  {{#each items}}
    <article>
      <h2>{{title}}</h2>
      <p>{{excerpt}}</p>
    </article>
  {{/each}}
</main>
```

- `{{variable}}` — HTML-escaped value; `{{{html}}}` — raw (content HTML)
- `{{#each}}` / `{{#if}}` nest, dotted paths (`content.author.name`)
- `home.astro` — home (`{{site.title}}`, `{{#each items}}`)
- `index.astro`, `single.astro`, `page.astro` — content (`{{content.*}}`, `{{page.title}}`)
- `archive.astro` — type/taxonomy listing (`{{#each items}}`)
- `404.astro` — last in the chain
- Context available: `site.*`, `page.*`, `content.*` (columns + fields), `items`,
  `menus`, `contentTypes`, `taxonomies`, `terms`, `settings`

> **Note — product signature:** the runtime wraps your templates with
> `<meta name="generator" content="OkCMS <version>">` and sends
> `X-Powered-By: OkCMS/<version>` on every public response. If the theme
> emits a COMPLETE document (`<html>` in the fragment — full-control), the
> meta is not injected (the theme owns its `<head>`), but the header is
> still there.

## Styles per engine

| `--style` | Generated file | Build |
|---|---|---|
| `css` (default) | `dist/theme.css` | none — served as is |
| `scss` | `styles/main.scss` (+ `components.scss`) | `okcms theme:build -n my-theme` |
| `tailwind` | `src/input.css` + `tailwind.config.js` | `okcms theme:build -n my-theme` |

The public site links `dist/theme.css` directly for the manual `css` engine.
Compiled React/Solid styles are emitted under the validated build generation
and linked with `?v=<buildId>` **with `[data-theme="my-theme"]` isolation**
(styles never leak between themes; Tailwind already ships with `preflight:
false`).

> `dist/theme.css` is read **ready-made** by the container — nothing compiles
> SCSS or Tailwind inside the image. The file exists on the host and only
> reaches production when the image is rebuilt: `okcms theme:build` followed by
> `okcms redeploy`.

### Build diagnostics and caching

Compiled React and Solid themes publish each server, client, and stylesheet
under a content-derived generation and update `dist/theme-build.json` only
after validation succeeds. The previous valid generation remains available if
a rebuild fails. Asset URLs include `?v=<buildId>`; unversioned development
assets are sent with `Cache-Control: no-cache`, while immutable caching is
reserved for validated versioned assets.

The Admin Themes screen shows the current artifact ID, expected source ID,
build timestamp, engine, and the exact missing, stale, or invalid-artifact
reason. `okcms dev` fails on an initial compiled-theme build error unless
`OKCMS_THEME_DIAGNOSTIC_MODE=1` is explicitly set. A runtime request with an
invalid artifact returns `THEME_RUNTIME_INVALID` and does not execute the
invalid server bundle.

Common recovery commands:

```bash
okcms theme:build --name my-theme
okcms theme:manage --name my-theme --tenant <tenant-id> --set-active
```

If a theme is missing from Admin, copy its complete directory into the
project's `themes/` directory and run the synchronization flow before
activation. Theme files are project-managed; unregistering a tenant row does
not delete those files.

## data-theme on HTML (automatic isolation)

The site runtime wraps every public page with `<html data-theme="<theme-name>">`.
You **do not need** to add this attribute in your Astro templates — it is injected
automatically by the web server on every public response.

What this means for your CSS:

- **Engine `css` (isolation: `manual`)**: write all CSS scoped inside
  `[data-theme="your-theme"]`. Example:

  ```css
  [data-theme="my-theme"] .hero {
    padding: 4rem 0;
    text-align: center;
  }
  ```

- **Engine `scss`/`tailwind` (isolation: `true`)**: the build already scopes all
  CSS automatically with `[data-theme="your-theme"]`. You write plain CSS without
  thinking about the prefix.

If you omit `[data-theme="..."]` in your CSS, rules will have global scope and
may leak into other themes installed on the same site — isolation is the
protection against this.

## Development workflow

```bash
# 1. Create it
okcms theme:create --name my-theme --style scss

# 2. Edit the root *.astro templates and styles

# 3. Compile the styles (scss/tailwind)
okcms theme:build --name my-theme

# 4. Activate it for an explicit tenant (database is the runtime source of truth)
okcms theme:manage --name my-theme --set-active --tenant <tenant-id>
#    The admin Themes screen activates too — the active theme is read from
#    the database on every request, no site restart needed.

# 5. Management
okcms theme:list                               # installed + status
okcms theme:manage -n my-theme --info          # theme.json information
There is no local enable/disable state for themes.
okcms theme:manage -n my-theme --uninstall --tenant <tenant-id>
okcms theme:search -q blog                     # npm search (keyword okcms-theme)

# If you created it outside the project:
Copy the complete theme directory into `themes/my-theme/`, run `okcms theme:build --name my-theme` for React/Solid themes, and then synchronize it from the Admin or deployment workflow.

# 6. After changing templates/styles: recompile and redo the deploy
okcms theme:build --name my-theme   # (the redeploy compiles it anyway)
okcms redeploy
```

## Publishing

Publish as an npm package with the keyword `okcms-theme` (the target of
`okcms theme:search`) and keep `compatibility.okcms` on the supported CMS
line. Run `theme:build` in your release process so `dist/theme.css` ships
inside the package.
