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

---

## Theme Manifest — Complete Reference

The `theme.json` manifest supports many more fields than the minimal example:

```json
{
  "name": "my-theme",
  "version": "1.0.0",
  "description": "A beautiful blog theme",
  "author": "Your Name <you@example.com>",
  "screenshot": "screenshot.png",
  "parent": "default",
  "compatibility": { "okcms": "^0.15.0" },
  "provides": {
    "layouts": ["default", "fullwidth", "sidebar-left"],
    "components": ["Hero", "PostCard", "NewsletterForm"],
    "styles": ["typography", "forms", "buttons"],
    "assets": ["fonts", "images"]
  },
  "stylesConfig": {
    "engine": "scss",
    "entry": "styles/main.scss",
    "output": "dist/theme.css",
    "isolation": true
  },
  "settings": [
    { "name": "primaryColor", "type": "color", "label": "Primary Color", "default": "#2563eb" },
    { "name": "fontFamily", "type": "select", "label": "Font Family", "default": "inter", "options": ["inter", "roboto", "system-ui"] },
    { "name": "enableDarkMode", "type": "toggle", "label": "Enable Dark Mode", "default": true },
    { "name": "logoImage", "type": "image", "label": "Logo", "default": "" },
    { "name": "postsPerPage", "type": "text", "label": "Posts per Page", "default": "10" }
  ],
  "components": [
    { "name": "Hero", "type": "component", "file": "components/Hero.astro" },
    { "name": "PostCard", "type": "component", "file": "components/PostCard.astro" },
    { "name": "DefaultLayout", "type": "layout", "file": "layouts/DefaultLayout.astro" },
    { "name": "PostPartial", "type": "partial", "file": "partials/PostMeta.astro" }
  ]
}
```

### Manifest Fields Reference

| Campo | Tipo | Obrigatório? | Descrição |
|-------|------|--------------|-----------|
| `name` | `string` | Sim | Nome único do tema (slug) |
| `version` | `string` | Sim | Versão semver |
| `description` | `string` | Não | Descrição curta |
| `author` | `string` | Não | Autor (nome + email opcional) |
| `screenshot` | `string` | Não | Caminho relativo para screenshot (ex: `screenshot.png`) |
| `parent` | `string` | Não | Nome do tema pai para herança |
| `compatibility.okcms` | `string` | Sim | Range semver do CMS (ex: `^0.15.0`) |
| `provides` | `object` | Não | O que o tema disponibiliza (layouts, components, styles, assets) |
| `stylesConfig` | `object` | Não | Configuração de estilos (engine, entry, output, isolation) |
| `settings` | `array` | Não | Configurações do tema (UI no admin) |
| `components` | `array` | Não | Componentes do tema (layouts, components, partials, pages) |

---

## Theme Inheritance (`parent`)

Temas podem herdar de outro tema via `parent`. A cadeia de herança é resolvida **pais antes dos filhos**:

```json
{
  "name": "my-child-theme",
  "version": "1.0.0",
  "parent": "default",
  "compatibility": { "okcms": "^0.15.0" }
}
```

**Como funciona:**
1. Templates do filho sobrescrevem os do pai (mesmo nome = filho vence)
2. Settings do filho mesclam com os do pai (filho sobrescreve)
3. Components do filho adicionam/substituem os do pai
4. Styles do filho são compilados **após** os do pai (CSS cascade)
4. Assets são unidos (filho adiciona)

O loader resolve a cadeia topologicamente (pais antes dos filhos) — igual ao sistema de plugins.

---

## Theme Settings — UI no Admin

O array `settings` no manifest gera **controles automáticos no admin** (Temas → Gerenciar → Configurações):

```json
"settings": [
  { "name": "primaryColor", "type": "color", "label": "Primary Color", "default": "#2563eb" },
  { "name": "fontFamily", "type": "select", "label": "Font Family", "default": "inter", "options": ["inter", "roboto", "system-ui"] },
  { "name": "enableDarkMode", "type": "toggle", "label": "Enable Dark Mode", "default": true },
  { "name": "logoImage", "type": "image", "label": "Logo", "default": "" },
  { "name": "postsPerPage", "type": "text", "label": "Posts per Page", "default": "10" },
  { "name": "customCSS", "type": "text", "label": "Custom CSS", "default": "" }
]
```

### Setting Types

| Tipo | UI no Admin | Valor Padrão |
|------|-------------|--------------|
| `text` | Input text | `string` |
| `color` | Color picker | `#hex` |
| `image` | Upload de imagem (media library) | `string` (URL) |
| `select` | Dropdown | `string` (um dos `options`) |
| `toggle` | Switch on/off | `boolean` |

### Acessando settings nos templates

```html
<!-- Em qualquer template .astro -->
<style>
  :root {
    --primary-color: {{settings.primaryColor}};
    --font-family: {{settings.fontFamily}};
  }
</style>

{{#if settings.enableDarkMode}}
  <html class="dark">
{{/if}}

<img src="{{settings.logoImage}}" alt="Logo" />
```

---

## Theme Components — Layouts, Components, Partials, Pages

O array `components` registra **arquivos Astro reutilizáveis** que o tema disponibiliza:

```json
"components": [
  { "name": "DefaultLayout", "type": "layout", "file": "layouts/DefaultLayout.astro" },
  { "name": "FullWidthLayout", "type": "layout", "file": "layouts/FullWidthLayout.astro" },
  { "name": "Hero", "type": "component", "file": "components/Hero.astro" },
  { "name": "PostCard", "type": "component", "file": "components/PostCard.astro" },
  { "name": "PostMeta", "type": "partial", "file": "partials/PostMeta.astro" },
  { "name": "CustomPage", "type": "page", "file": "pages/CustomPage.astro" }
]
```

### Component Types

| Type | Uso | Exemplo |
|------|-----|---------|
| `layout` | Wrapper de página inteira (tem `<slot />`) | `DefaultLayout.astro` |
| `component` | Componente reutilizável (pode receber props) | `Hero.astro`, `PostCard.astro` |
| `partial` | Fragmento pequeno (sem props complexas) | `PostMeta.astro`, `Footer.astro` |
| `page` | Página completa (rotas customizadas) | `CustomPage.astro` |

### Usando components nos templates

```html
<!-- Layout -->
<DefaultLayout title="{{page.title}}">
  <main>{{{content}}}</main>
</DefaultLayout>

<!-- Component com props -->
<Hero title="{{content.title}}" image="{{content.featuredImage}}" />

<!-- Partial (include simples) -->
<PostMeta author="{{content.author.name}}" date="{{content.publishedAt}}" />
```

---

## Theme Provides — O que o tema expõe

O objeto `provides` declara o que o tema disponibiliza para outros temas (filhos) ou para o runtime:

```json
"provides": {
  "layouts": ["default", "fullwidth", "sidebar-left"],
  "components": ["Hero", "PostCard", "NewsletterForm"],
  "styles": ["typography", "forms", "buttons", "utilities"],
  "assets": ["fonts", "images"]
}
```

| Chave | Descrição |
|-------|-----------|
| `layouts` | Nomes dos layouts disponíveis para filhos usarem |
| `components` | Nomes dos componentes disponíveis |
| `styles` | Nomes de módulos de estilo (para importação) |
| `assets` | Pastas de assets disponíveis (fonts, images, etc.) |

---

## Theme Inheritance — Como estender um tema pai

### Estrutura recomendada

```
themes/
├── default/                 # Tema pai (base)
│   ├── theme.json
│   ├── home.astro
│   ├── layouts/
│   │   └── DefaultLayout.astro
│   ├── components/
│   │   └── PostCard.astro
│   └── styles/
│       └── main.scss
│
└── meu-tema/                # Tema filho
    ├── theme.json           # "parent": "default"
    ├── home.astro           # sobrescreve home do pai
    ├── layouts/
    │   └── FullWidthLayout.astro  # novo layout
    └── components/
        └── Hero.astro       # novo component
```

### Regras de sobrescrita

| Recurso | Comportamento |
|---------|---------------|
| Templates (`*.astro`) | Filho **substitui** pai (mesmo nome) |
| Layouts/Components | Filho **adiciona**; mesmo nome = filho vence |
| Settings | **Merge profundo** (filho sobrescreve chaves iguais) |
| Components array | Filho **adiciona**; mesmo `name` = filho vence |
| Styles (scss/tailwind) | Filho compila **após** pai (CSS cascade) |
| Assets | União (filho adiciona arquivos) |

---

## Theme Settings no Admin

Quando o tema está ativo, o admin mostra a tela **Configurações do Tema** (Temas → Gerenciar → Configurações):

1. Acessa: **Temas** → clica no tema ativo → **Configurações**
2. Controles gerados automaticamente baseados em `settings[]`
3. Valores salvos no banco (tenant) → disponíveis em `{{settings.*}}` nos templates
3. Imagens usam o media library do admin (upload/seleção)

### Exemplo: Tema com configurações avançadas

```json
{
  "settings": [
    { "name": "brandColor", "type": "color", "label": "Cor da Marca", "default": "#1e40af" },
    { "name": "secondaryColor", "type": "color", "label": "Cor Secundária", "default": "#64748b" },
    { "name": "headingFont", "type": "select", "label": "Fonte dos Títulos", "default": "inter", "options": ["inter", "playfair", "roboto", "system-ui"] },
    { "name": "bodyFont", "type": "select", "label": "Fonte do Corpo", "default": "system-ui", "options": ["inter", "roboto", "system-ui"] },
    { "name": "borderRadius", "type": "select", "label": "Arredondamento", "default": "md", "options": ["none", "sm", "md", "lg", "full"] },
    { "name": "showBreadcrumbs", "type": "toggle", "label": "Mostrar Breadcrumbs", "default": true },
    { "name": "heroImage", "type": "image", "label": "Imagem do Hero", "default": "" },
    { "name": "customCSS", "type": "text", "label": "CSS Personalizado", "default": "" }
  ]
}
```

---

## Theme Styles — Engines e Isolamento

### Engines suportadas

| Engine | Arquivo de entrada | Comando build | Isolamento |
|--------|-------------------|---------------|------------|
| `css` (default) | `dist/theme.css` | nenhum | `manual` (você entrega CSS já isolado) |
| `scss` | `styles/main.scss` | `okcms theme:build` | `true` (auto) |
| `tailwind` | `src/input.css` | `okcms theme:build` | `true` (auto) |

### `stylesConfig` completo

```json
"stylesConfig": {
  "engine": "scss",
  "entry": "styles/main.scss",
  "output": "dist/theme.css",
  "isolation": true
}
```

| Campo | Padrão | Descrição |
|-------|--------|-----------|
| `engine` | `css` | `css` \| `scss` \| `tailwind` |
| `entry` | convencional | Caminho relativo ao tema (ex: `styles/main.scss`) |
| `output` | `dist/theme.css` | Saída relativa ao tema |
| `isolation` | `true` (build) / `manual` (css) | `true` = auto-scope via `[data-theme]`; `manual` = você entrega CSS já scopado |

### Isolamento automático (`true`)

Para `scss` e `tailwind`, o build **escopa automaticamente** todo CSS com `[data-theme="nome-do-tema"]`:

```scss
/* styles/main.scss */
.button { background: var(--primary-color); }

/* Compila para: */
[data-theme="meu-tema"] .button { background: var(--primary-color); }
```

### Isolamento manual (`"manual"`)

Apenas para engine `css`. Você entrega o `dist/theme.css` **já com o seletor**:

```css
/* dist/theme.css — VOCÊ escreve o seletor */
[data-theme="meu-tema"] .button { background: #2563eb; }
```

> `isolation: false` é **rejeitado** na validação.

---

## Theme Data API — Usando dados do CMS nos templates

O runtime expõe helpers via `@oktis-works/theme-sdk` que você pode usar nos templates Astro (via `RenderContext`):

### Dados disponíveis no `RenderContext`

```typescript
interface RenderContext {
  content: string;           // HTML renderizado do conteúdo
  tenant: string;            // Tenant ID
  settings: Record<string, unknown>;  // settings do tema + site
  components: Record<string, ThemeComponent>;  // components do tema
  url: string;               // URL atual
  params: Record<string, string>;   // Parâmetros de rota
  record?: Record<string, unknown>; // Row completa do conteúdo (para getField)
}
```

### Helpers de dados (`@oktis-works/theme-sdk`)

```astro
---
import { getContent, getMenus, getSettings, getContentBySlug } from '@oktis-works/theme-sdk';
---

<!-- Buscar menus -->
{{#each (await getMenus()) as |menu|}}
  <nav>
    {{#each menu.items as |item|}}
      <a href="{{item.url}}">{{item.label}}</a>
    {{/each}}
  </nav>
{{/each}}

<!-- Buscar conteúdo por slug -->
{{#let post = (await getContentBySlug('meu-post', 'post'))}}
  <article>{{{post.content}}}</article>
{{/let}}

<!-- Settings do site -->
{{getSettings 'general'}}
```

### Theme Data Provider (avançado)

Para dados customizados, o tema pode registrar um **provider**:

```js
// No bootstrap do tema (se tiver runtime customizado)
import { setThemeDataProvider } from '@oktis-works/theme-sdk';

setThemeDataProvider({
  async getContent(query) { /* sua lógica */ },
  async getMenus() { /* sua lógica */ },
  async getContentBySlug(slug, type) { /* sua lógica */ },
  // ... demais métodos da interface ThemeDataProvider
});
```

---

## Fields API — Campos Flexíveis no Tema

O tema pode acessar **campos customizados** (Field Groups / Flexible Layouts) definidos no admin:

### `getFields` / `getFieldsAsync`

```astro
---
import { getFields, getFlexibleLayouts } from '@oktis-works/theme-sdk';
---

<!-- Campos do conteúdo atual (usa record do context) -->
{{#let fields = (await getFieldsAsync())}}
  {{#each fields as |field|}}
    <div class="field-{{field.name}}">
      <label>{{field.label}}</label>
      <div>{{{field.value}}}</div>
    </div>
  {{/each}}
{{/let}}

<!-- Flexible Layouts (blocos flexíveis) -->
{{#let layouts = (await getFlexibleLayouts())}}
  {{#each layouts as |layout|}}
    <div class="layout-{{layout.name}}">
      {{#each layout.rows as |row|}}
        <div class="row">{{{row.content}}}</div>
      {{/each}}
    </div>
  {{/each}}
{{/let}}
```

---

## Theme Hooks / Filters

O tema pode registrar **filters** para transformar dados antes de renderizar:

```js
// Em theme bootstrap (se tiver runtime customizado)
import { setThemeHooks } from '@oktis-works/theme-sdk';

setThemeHooks({
  // Filtro: transforma campos antes de entregar ao template
  'theme:data:getFields': (fields, context) => {
    return fields.map(f => ({
      ...f,
      value: typeof f.value === 'string' ? f.value.toUpperCase() : f.value
    }));
  },

  // Filtro: modifica layouts flexíveis
  'theme:data:getFlexibleLayouts': (layouts) => {
    return layouts.filter(l => l.visible !== false);
  },

  // Filtro: catálogo de tipos de campo disponíveis
  'theme:data:getFieldTypes': (types) => {
    return [...types, { name: 'meu-tipo-custom', component: 'MeuCampoCustom' }];
  }
});
```

### Hooks disponíveis

| Hook | Entrada | Saída Esperada |
|------|---------|----------------|
| `theme:data:getFields` | `fields[]` | `fields[]` transformados |
| `theme:data:getFlexibleLayouts` | `layouts[]` | `layouts[]` transformados |
| `theme:data:getFieldTypes` | `types[]` | `types[]` estendidos |

---

## Theme Assets — Fonts, Images, etc.

Assets declarados em `provides.assets` são servidos via `/themes/<tema>/assets/`:

```
themes/meu-tema/
├── assets/
│   ├── fonts/
│   │   └── Inter.woff2
│   └── images/
│       └── pattern.svg
```

No template:

```html
<link rel="preload" href="/themes/meu-tema/assets/fonts/Inter.woff2" as="font" type="font/woff2" crossorigin>

<style>
  @font-face {
    font-family: 'Inter';
    src: url('/themes/meu-tema/assets/fonts/Inter.woff2') format('woff2');
  }
</style>

<img src="/themes/meu-tema/assets/images/pattern.svg" alt="Pattern" />
```

---

## Theme Screenshot

Adicione `screenshot.png` na raiz do tema (recomendado 1200x800px):

```
themes/meu-tema/
├── screenshot.png    # aparece no admin (Temas → Lista)
├── theme.json
└── ...
```

---

## Debug & Logs

```bash
# Temas descobertos no boot
grep 'ThemeLoader' logs/web.log

# Ver tema ativo
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/v1/settings?group=theme

# Testar template (render direto)
curl http://localhost:3000/

# Ver settings do tema ativo
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/v1/themes/active/settings
```

---

## Limitações & Boas Práticas

| Tópico | Detalhe |
|--------|---------|
| **Isolamento CSS** | Sempre use `isolation: true` (scss/tailwind) ou `manual` (css) — nunca `false` |
| **Herança** | Use `parent` para estender temas base; evite copiar arquivos |
| **Settings** | Prefira `toggle`/`select` para opções booleanas/enum; `text` só para livre |
| **Components** | `layout` deve ter `<slot />`; `component` aceita props; `partial` é include simples |
| **Assets** | Coloque em `assets/` — servidos em `/themes/<tema>/assets/` |
| **Migrações** | Temas **não** têm migrações SQL (só plugins); schema changes via content types/fields |
| **Hot reload** | Em dev (`bun run dev`), alterações em `themes/<n>/` recarregam templates/styles |
| **TypeScript** | Templates `.astro` são tipados via `RenderContext`; use `@oktis-works/theme-sdk` types |
| **Performance** | `dist/theme.css` é servido estático (CDN-friendly); não compila no container |
