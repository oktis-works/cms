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
npx okcms theme:create --name my-theme --style css   # css | scss | tailwind
```

```
themes/my-theme/
├── theme.json               # manifest (type: theme + compatibility)
├── templates/
│   ├── index.html           # listing (home)
│   └── single.html          # single page (post/content)
├── style.css                # css engine — or styles/main.scss — or src/input.css
└── README.md
```

### theme.json

```json
{
  "name": "my-theme",
  "version": "0.1.0",
  "description": "my-theme theme for OkCMS",
  "type": "theme",
  "compatibility": { "okcms": "^0.2.0" }
}
```

With `--style scss` or `--style tailwind`, the manifest also gets
`stylesConfig` (`engine`, `entry`, `output`, `isolation`) pointing at the
style entry. `compatibility.okcms` is filled in and validated
automatically, just like with plugins.

### Templates

Template syntax with variables and loops:

```html
<main class="site">
  {{#each posts}}
    <article>
      <h2>{{this.title}}</h2>
      <p>{{this.excerpt}}</p>
    </article>
  {{/each}}
</main>
```

- `templates/index.html` — listing (e.g. `{{#each posts}}`)
- `templates/single.html` — single item (e.g. `{{title}}`, `{{content}}`)

## Styles per engine

| `--style` | Generated file | Build |
|---|---|---|
| `css` (default) | `style.css` | none — served as is |
| `scss` | `styles/main.scss` (+ `components.scss`) | `okcms theme:build -n my-theme` |
| `tailwind` | `src/input.css` + `tailwind.config.js` | `okcms theme:build -n my-theme` |

The build compiles into `dist/theme.css` **with `[data-theme="my-theme"]`
isolation** (styles never leak between themes; Tailwind already ships with
`preflight: false`).

> `dist/theme.css` is read **ready-made** by the container — nothing compiles
> SCSS or Tailwind inside the image. The file exists on the host and only
> reaches production when the image is rebuilt: `okcms theme:build` followed by
> `okcms redeploy`.

## Development workflow

```bash
# 1. Create it
npx okcms theme:create --name my-theme --style scss

# 2. Edit templates/ and styles

# 3. Compile the styles (scss/tailwind)
npx okcms theme:build --name my-theme

# 4. Activate it (writes activeTheme into okcms.config.json)
npx okcms theme:manage --name my-theme --set-active
#    (equivalent: ACTIVE_THEME=my-theme in .env)

# 5. Management
npx okcms theme:list                               # installed + status
npx okcms theme:manage -n my-theme --info          # theme.json information
npx okcms theme:manage -n my-theme --disable|enable
npx okcms theme:manage -n my-theme --uninstall
npx okcms theme:search -q blog                     # npm search (keyword okcms-theme)

# If you created it OUTSIDE the project:
npx okcms theme:install --name ../my-theme-source

# 6. After changing templates/styles: recompile and redo the deploy
npx okcms theme:build --name my-theme   # (the redeploy compiles it anyway)
npx okcms redeploy
```

## Publishing

Publish as an npm package with the keyword `okcms-theme` (the target of
`okcms theme:search`) and keep `compatibility.okcms` on the supported CMS
line. Run `theme:build` in your release process so `dist/theme.css` ships
inside the package.
