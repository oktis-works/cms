> 📄 **English** · [Português](./theme-development.pt-BR.md)

# Developing a Theme

A theme is the look of the public site: **templates** (a page hierarchy) +
**styles**, isolated by `[data-theme]` so a theme never leaks CSS into
another one.

> The commands use `npx` with the project's local CLI (no global
> install). With the global CLI (`bun add -g @oktis-works/cms`), run
> `okcms ...` directly.

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
  "compatibility": { "okcms": "^0.5.5" }
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
runtime looks up (hierarchy `home` → `index` → `404`, with `_shared` →
`default` fallback). Syntax with variables, raw HTML, and nested
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

The public site only links `/themes/<theme>/dist/theme.css` — on the `css`
engine the file is born in `dist/` (served with no build). On the others, the
build compiles into `dist/theme.css` **with `[data-theme="my-theme"]`
isolation** (styles never leak between themes; Tailwind already ships with
`preflight: false`).

> `dist/theme.css` is read **ready-made** by the container — nothing compiles
> SCSS or Tailwind inside the image. The file exists on the host and only
> reaches production when the image is rebuilt: `okcms theme:build` followed by
> `okcms redeploy`.

## Development workflow

```bash
# 1. Create it
okcms theme:create --name my-theme --style scss

# 2. Edit the root *.astro templates and styles

# 3. Compile the styles (scss/tailwind)
okcms theme:build --name my-theme

# 4. Activate it (writes activeTheme into okcms.config.json)
okcms theme:manage --name my-theme --set-active
#    (equivalent: ACTIVE_THEME=my-theme in .env)
#    The admin Themes screen activates too — the active theme is read from
#    the database on every request, no site restart needed.

# 5. Management
okcms theme:list                               # installed + status
okcms theme:manage -n my-theme --info          # theme.json information
okcms theme:manage -n my-theme --disable|enable
#    (local state .okcms/extensions.json; the active theme is the --set-active)
okcms theme:manage -n my-theme --uninstall
okcms theme:search -q blog                     # npm search (keyword okcms-theme)

# If you created it OUTSIDE the project:
okcms theme:install --name ../my-theme-source

# 6. After changing templates/styles: recompile and redo the deploy
okcms theme:build --name my-theme   # (the redeploy compiles it anyway)
okcms redeploy
```

## Publishing

Publish as an npm package with the keyword `okcms-theme` (the target of
`okcms theme:search`) and keep `compatibility.okcms` on the supported CMS
line. Run `theme:build` in your release process so `dist/theme.css` ships
inside the package.
