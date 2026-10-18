> 📄 **Português (Brasil)** · [English](./theme-development.md)

# Desenvolvendo um Tema

Tema é o visual do site público: **templates** (hierarquia de páginas) +
**estilos**, com isolamento por `[data-theme]` para que um tema nunca vaze
CSS para outro.

> Os comandos usam `npx` com a CLI local do projeto (sem instalação
> global). Com a CLI global (`bun add -g @oktis-works/cms`), rode
> `okcms ...` direto.

## Estrutura gerada

```bash
okcms theme:create --name meu-tema --style css   # css | scss | tailwind
```

```
themes/meu-tema/
├── theme.json               # manifest (type: theme + compatibilidade)
├── home.astro               # templates da hierarquia NA RAIZ
├── index.astro
├── single.astro
├── page.astro
├── archive.astro
├── 404.astro
├── dist/theme.css           # engine css — já servível
│                            # (ou styles/main.scss — ou src/input.css)
└── README.md
```

### theme.json

```json
{
  "name": "meu-tema",
  "version": "0.1.0",
  "description": "Tema meu-tema para OkCMS",
  "type": "theme",
  "compatibility": { "okcms": "^0.5.5" }
}
```

Com `--style scss` ou `--style tailwind`, o manifesto ganha também
`stylesConfig` (`engine`, `entry`, `output`, `isolation`) apontando para a
entrada de estilos. `compatibility.okcms` é preenchido e validado
automaticamente, como nos plugins.

Isolamento (`stylesConfig.isolation`): `scss`/`tailwind` sempre escopam no
build (`isolation: true`); no engine `css` o tema pode assumir o isolamento
com `isolation: "manual"` — o `dist/theme.css` entregue já precisa estar
escopado (é o caso do tema default). `isolation: false` é rejeitado.

### Templates

Templates são arquivos `*.astro` **na raiz do tema** — é o formato que o
runtime do site busca (hierarquia `home` → `index` → `404`, com fallback
`_shared` → `default`). Sintaxe com variáveis, HTML cru e laços/condições:

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

- `{{variável}}` — valor com escape HTML; `{{{html}}}` — sem escape (HTML do conteúdo)
- `{{#each}}` / `{{#if}}` aninhados, caminhos pontuados (`content.author.name`)
- `home.astro` — home (`{{site.title}}`, `{{#each items}}`)
- `index.astro`, `single.astro`, `page.astro` — conteúdo (`{{content.*}}`, `{{page.title}}`)
- `archive.astro` — listagem por tipo/taxonomia (`{{#each items}}`)
- `404.astro` — última da cadeia
- Contexto disponível: `site.*`, `page.*`, `content.*` (colunas + campos), `items`,
  `menus`, `contentTypes`, `taxonomies`, `terms`, `settings`

> **Nota — assinatura do produto:** o runtime envolve seus templates com
> `<meta name="generator" content="OkCMS <versão>">` e envia `X-Powered-By:
> OkCMS/<versão>` em toda resposta pública. Se o tema emite o documento
> COMPLETO (`<html>` no fragmento — full-control), o meta não é injetado (o
> tema é dono do próprio `<head>`), mas o header continua presente.

## Estilos por engine

| `--style` | Arquivo gerado | Build |
|---|---|---|
| `css` (default) | `dist/theme.css` | nenhum — servido direto |
| `scss` | `styles/main.scss` (+ `components.scss`) | `okcms theme:build -n meu-tema` |
| `tailwind` | `src/input.css` + `tailwind.config.js` | `okcms theme:build -n meu-tema` |

O site público só linka `/themes/<tema>/dist/theme.css` — no engine `css` o
arquivo já nasce em `dist/` (servível sem build). Nos demais, o build compila
para `dist/theme.css` **com isolamento `[data-theme="meu-tema"]`** (sem vazar
estilos entre temas; o Tailwind já sai com `preflight: false`).

> `dist/theme.css` é lido **pronto** pelo container — nada compila SCSS ou
> Tailwind dentro da imagem. O arquivo existe no host e só chega em
> produção quando a imagem é reconstruída: `okcms theme:build` seguido de
> `okcms redeploy`.

## Fluxo de desenvolvimento

```bash
# 1. Crie
okcms theme:create --name meu-tema --style scss

# 2. Edite os templates *.astro na raiz e os estilos

# 3. Compile os estilos (scss/tailwind)
okcms theme:build --name meu-tema

# 4. Ative (grava activeTheme no okcms.config.json)
okcms theme:manage --name meu-tema --set-active
#    (equivalente: ACTIVE_THEME=meu-tema no .env)
#    A tela Temas do admin também ativa — o tema ativo é lido do banco a
#    cada request, sem restart do site.

# 5. Gestão
okcms theme:list                               # instalados + status
okcms theme:manage -n meu-tema --info          # informações do theme.json
okcms theme:manage -n meu-tema --disable|enable
#    (estado local .okcms/extensions.json; o tema ativo é o --set-active)
okcms theme:manage -n meu-tema --uninstall
okcms theme:search -q blog                     # busca no npm (keyword okcms-theme)

# Se criou FORA do projeto:
okcms theme:install --name ../meu-tema-fonte

# 6. Depois de mudar templates/estilos: recompila e refaz o deploy
okcms theme:build --name meu-tema   # (o redeploy já compila sozinho)
okcms redeploy
```

## Publicando

Publique como pacote npm com a keyword `okcms-theme` (alvo do
`okcms theme:search`) e mantenha `compatibility.okcms` na linha suportada
do CMS. O `theme:build` deve ser executado no seu processo de release para
que `dist/theme.css` vá junto no pacote.

---

## Manifesto do Tema — Referência Completa

O `theme.json` suporta muitos mais campos que o exemplo mínimo:

```json
{
  "name": "meu-tema",
  "version": "1.0.0",
  "description": "Um tema bonito para blog",
  "author": "Seu Nome <voce@exemplo.com>",
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
    { "name": "primaryColor", "type": "color", "label": "Cor Primária", "default": "#2563eb" },
    { "name": "fontFamily", "type": "select", "label": "Família de Fonte", "default": "inter", "options": ["inter", "roboto", "system-ui"] },
    { "name": "enableDarkMode", "type": "toggle", "label": "Habilitar Modo Escuro", "default": true },
    { "name": "logoImage", "type": "image", "label": "Logo", "default": "" },
    { "name": "postsPerPage", "type": "text", "label": "Posts por Página", "default": "10" }
  ],
  "components": [
    { "name": "Hero", "type": "component", "file": "components/Hero.astro" },
    { "name": "PostCard", "type": "component", "file": "components/PostCard.astro" },
    { "name": "DefaultLayout", "type": "layout", "file": "layouts/DefaultLayout.astro" },
    { "name": "PostPartial", "type": "partial", "file": "partials/PostMeta.astro" }
  ]
}
```

### Referência dos Campos do Manifesto

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

## Herança de Temas (`parent`)

Temas podem herdar de outro tema via `parent`. A cadeia de herança é resolvida **pais antes dos filhos**:

```json
{
  "name": "meu-tema-filho",
  "version": "1.0.0",
  "parent": "default",
  "compatibility": { "okcms": "^0.15.0" }
}
```

**Como funciona:**
1. Templates do filho sobrescrevem os do pai (mesmo nome = filho vence)
2. Settings do filho mesclam com os do pai (filho sobrescreve)
4. Components do filho adicionam/substituem os do pai
4. Styles do filho são compilados **após** os do pai (CSS cascade)
4. Assets são unidos (filho adiciona)

O loader resolve a cadeia topologicamente (pais antes dos filhos) — igual ao sistema de plugins.

---

## Theme Settings — UI no Admin

O array `settings` no manifesto gera **controles automáticos no admin** (Temas → Gerenciar → Configurações):

```json
"settings": [
  { "name": "primaryColor", "type": "color", "label": "Cor Primária", "default": "#2563eb" },
  { "name": "fontFamily", "type": "select", "label": "Família de Fonte", "default": "inter", "options": ["inter", "roboto", "system-ui"] },
  { "name": "enableDarkMode", "type": "toggle", "label": "Habilitar Modo Escuro", "default": true },
  { "name": "logoImage", "type": "image", "label": "Logo", "default": "" },
  { "name": "postsPerPage", "type": "text", "label": "Posts por Página", "default": "10" },
  { "name": "customCSS", "type": "text", "label": "CSS Personalizado", "default": "" }
]
```

### Tipos de Setting

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

### Tipos de Component

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

## Herança de Tema — Como estender um tema pai

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
// No bootstrap do tema (se tiver runtime customizado)
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
