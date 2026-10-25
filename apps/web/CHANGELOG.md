# @oktis-works/web

## 0.12.2

### Patch Changes

- Updated dependencies
  - @oktis-works/core@0.14.0

## 0.12.1

### Patch Changes

- Updated dependencies
  - @oktis-works/core@0.13.0

## 0.12.0

### Minor Changes

- ### Features
  
  - **Theme Customizer Phase 3**: Advanced UI/UX features for theme customization
    - **Conditional Logic**: Fields now show/hide based on `conditionalLogic` in manifest (reuses `isFieldVisible` from FieldRenderer)
    - **Tabs/Accordion Groups**: Fields with `group` property render as tabs (multiple groups) or accordion (single group/ungrouped)
    - **Parent/Child Theme Inheritance**: `buildThemeSettings` now accepts `parentManifest` for deep merge (parent defaults → child defaults → child config)
    - **Group Ordering**: Groups sorted by `groupOrder`, fields by `sort_order`
  
  - **Web Runtime**: Updated `buildThemeSettings` to accept optional `parentManifest` for deep merge inheritance
  - **Web Server**: Fetches parent theme manifest and passes to `buildThemeSettings`
  - **CLI**: `theme:create` generates example settings with `group` and `groupOrder`
  
  ### Related
  
  - Theme Customizer now supports complex field layouts with conditional visibility
  - Parent/child theme inheritance works for settings (child inherits parent defaults, overrides with own)
  - Theme customizer UI adapts to field group structure automatically

### Patch Changes

- Updated dependencies
  - @oktis-works/core@0.12.0

## 0.11.2

### Patch Changes

- Updated dependencies
  - @oktis-works/database@0.14.0
  - @oktis-works/core@0.11.5

## 0.11.1

### Patch Changes

- Updated dependencies
  - @oktis-works/theme-runtime@0.10.0

## 0.11.0

### Minor Changes

- Fetch posts for the static front page and listing pages
  
  The catch-all renderer now fetches recent items for the static front page
  (`isFrontPage`) the same way it already did for `page_for_posts`, so theme
  sections like "Latest posts" render real content on the configured homepage.
  Listing pages (front page and page-for-posts) always list posts; plain
  archives keep listing their own content type and the unconfigured home keeps
  listing everything published.

### Patch Changes

- Updated dependencies
- Updated dependencies
  - @oktis-works/database@0.13.0
  - @oktis-works/theme-runtime@0.9.0
  - @oktis-works/core@0.11.3

## 0.10.6

### Patch Changes

- Normalize content body before theme rendering
  
  `createContentLookup().findByPath/findById` now normalize the `body` column
  through a defensive `normalizeBody` helper: when the column holds the JSON
  text as a string (legacy double-encoded rows), it is parsed into the fields
  object; invalid JSON degrades to an empty body instead of breaking the
  render. Fixes themes receiving `content.html`/`content.content` as undefined
  and rendering pages with an empty `entry__body`.
- Updated dependencies
- Updated dependencies
  - @oktis-works/database@0.12.1
  - @oktis-works/theme-runtime@0.8.1
  - @oktis-works/core@0.11.2

## 0.10.5

### Patch Changes

- Updated dependencies
- Updated dependencies
- Updated dependencies
  - @oktis-works/core@0.11.0
  - @oktis-works/database@0.12.0
  - @oktis-works/theme-runtime@0.8.0

## 0.10.4

### Patch Changes

- Updated dependencies [641e556]
  - @oktis-works/database@0.11.0
  - @oktis-works/core@0.10.3

## 0.10.3

### Patch Changes

- Updated dependencies
  - @oktis-works/core@0.10.0
  - @oktis-works/database@0.10.0

## 0.10.2

### Patch Changes

- Updated dependencies
  - @oktis-works/core@0.9.0
  - @oktis-works/database@0.9.0
  - @oktis-works/theme-runtime@0.7.0

## 0.10.1

### Patch Changes

- Updated dependencies
  - @oktis-works/core@0.8.0

## 0.10.0

### Minor Changes

- 12d1963: Apply theme:before:render and theme:after:render on the public render path (parity E5): plugins can compile editor documents into HTML at render time (context: template, contentType, slug, activeTheme, settings, contentRow) and post-process the final document.

### Patch Changes

- Updated dependencies [12d1963]
- Updated dependencies [12d1963]
- Updated dependencies [12d1963]
- Updated dependencies [12d1963]
- Updated dependencies
  - @oktis-works/core@0.7.0
  - @oktis-works/plugin-runtime@0.7.0
  - @oktis-works/types@0.9.0
  - @oktis-works/validation@0.7.0
  - @oktis-works/database@0.8.0
  - @oktis-works/config@0.6.4
  - @oktis-works/theme-runtime@0.6.4

## 0.9.4

### Patch Changes

- Updated dependencies
  - @oktis-works/core@0.6.0
  - @oktis-works/plugin-runtime@0.6.0
  - @oktis-works/types@0.8.0
  - @oktis-works/config@0.6.3
  - @oktis-works/database@0.7.1
  - @oktis-works/theme-runtime@0.6.3

## 0.9.3

### Patch Changes

- Updated dependencies
  - @oktis-works/types@0.7.0
  - @oktis-works/database@0.7.0
  - @oktis-works/config@0.6.2
  - @oktis-works/core@0.5.15
  - @oktis-works/plugin-runtime@0.5.10
  - @oktis-works/theme-runtime@0.6.2

## 0.9.2

### Patch Changes

- Updated dependencies
  - @oktis-works/types@0.6.0
  - @oktis-works/database@0.6.0
  - @oktis-works/config@0.6.1
  - @oktis-works/core@0.5.14
  - @oktis-works/plugin-runtime@0.5.9
  - @oktis-works/theme-runtime@0.6.1

## 0.9.1

### Patch Changes

- Updated dependencies [3da0733]
  - @oktis-works/config@0.6.0
  - @oktis-works/core@0.5.13
  - @oktis-works/database@0.5.8

## 0.9.0

### Minor Changes

- feat(web): assinatura do produto no site público — `<meta name="generator">` + `X-Powered-By`
  
  O site público agora se identifica explicitamente como OkCMS (padrão de
  mercado: WordPress/Ghost/Hugo emitem o mesmo meta) — é o que permite que
  detectores (Wappalyzer, BuiltWith, Netcraft) reconheçam um site feito com
  OkCMS de forma determinística, em vez de heurística.
  
  - `wrapDocument` injeta `<meta name="generator" content="OkCMS <CMS_VERSION>">`
    em todo documento gerado (fonte única: o símbolo, sem literal).
  - Middleware emite `X-Powered-By: OkCMS/<CMS_VERSION>` em toda resposta —
    cobre até temas full-control, que são donos do próprio `<head>` e não
    recebem o meta (contrato documentado no guia de temas).
  - `apps/web` passa a depender de `@oktis-works/validation` para ler o símbolo.

### Patch Changes

- Updated dependencies
  - @oktis-works/validation@0.6.0
  - @oktis-works/core@0.5.11
  - @oktis-works/plugin-runtime@0.5.8
  - @oktis-works/types@0.5.6

## 0.8.0

### Minor Changes

- refactor(themes): descoberta de templates do projeto unificada no theme-runtime
  
  O `apps/web` reimplementava a cadeia de templates (tema ativo → `_shared` →
  `default`) e a leitura de arquivo em `rendering.ts`, duplicando a lógica já
  testada do pacote — duas fontes de verdade para a mesma regra (risco de drift).
  
  Agora `createProjectTemplateResolver` vive no `@oktis-works/theme-runtime` e é
  a fonte única: saneamento do nome de tema, guard contra `..`/path absoluto e a
  cadeia de fallback. O app web consome via `createTemplateChecker`/
  `loadTemplateSource` (adapters finos, mesma API pública de antes).
  
  Bônus de segurança: templates com nome hostil (`../fora`, `/etc/passwd`) são
  negados pelo guard do pacote em vez de cair em `join()` cru.

### Patch Changes

- feat(themes): isolamento CSS `isolation: "manual"` + tema default já escopado (BUSI-040)
  
  Formaliza a exceção de isolamento para temas `engine: css`: o manifest pode
  declarar `stylesConfig.isolation: "manual"`, significando que o AUTOR entrega o
  CSS já isolado (o pipeline de build não escopa de novo). `'manual'` é válido
  apenas com `engine: css` — em engines com build (scss/tailwind) é rejeitado na
  validação, pois o build sempre escopa.
  
  - `theme-sdk`: `ThemeStyleConfig.isolation` aceita `true | 'manual'`.
  - `theme-runtime`: `validateStyleManifest`/`resolveStyleEngine`/`buildThemeStyles`
    entendem `'manual'` (não escopa; `false` continua proibido).
  - tema default: `dist/theme.css` versionado **já escopado** (`[data-theme="default"]`)
    e `theme.json` com `isolation: "manual"` — o site fica isolado sem build.
  - docs EN/pt-BR, THEMES.md e scaffold-docs atualizados.
- fix(extensions): `THEMES_DIR` e `OKCMS_THEMES_DIR` apontam para o mesmo diretório
  
  O web runtime resolvia o diretório de temas com `THEMES_DIR ?? ./themes` (cwd),
  enquanto o core/API usava `OKCMS_THEMES_DIR ?? okcms.config.json ?? ./themes`.
  Dois nomes de env para a mesma coisa, sem ninguém definir o segundo — em apps
  com cwd diferente (worker/e2e) a API olhava um diretório vazio e o `sync`
  "não descobria" nenhum tema.
  
  Agora o web consome `resolveExtensionDirectory('theme')` do core (fonte única)
  e a função aceita `THEMES_DIR` como alias documentado do canônico
  `OKCMS_THEMES_DIR`. Contrato novo coberto por `project-directories.test.ts`.
- Updated dependencies
- Updated dependencies
- Updated dependencies
- Updated dependencies
  - @oktis-works/core@0.5.10
  - @oktis-works/plugin-runtime@0.5.7
  - @oktis-works/theme-runtime@0.6.0
  - @oktis-works/theme-sdk@0.6.0

## 0.7.1

### Patch Changes

- Correções do sistema de temas (ativação, descoberta, scaffold e customizador):
  
  - **`updated_at` no banco (crítico)**: a tabela `themes` ganhou `updated_at` (schema + migração `V010__core__harden_themes_lifecycle.sql`), índices `UNIQUE(name)` e o índice parcial de **um único tema ativo por tenant** — as rotas de ativar/desativar/instalar sempre falhavam por coluna inexistente, e `deactivate` referenciava também `deactivated_at`, que nunca existiu.
  - **Fonte única de ativação (crítico)**: o app web resolve o tema ativo **por request** lendo `status = 'ACTIVE'` do banco (fallback para `ACTIVE_THEME`), em vez de uma leitura única no boot — ativar pela tela Temas agora reflete no site sem restart. `ThemeService.activate` desativa os demais numa única sequência, `getActive` ordena por `activated_at DESC`, e a CLI `theme:manage --set-active` grava config **e** banco (mesma verdade).
  - **Fallback `manifest.json` (crítico)**: `syncFromDirectory` e o `ThemeLoader` aceitam `theme.json` **ou** `manifest.json` (o formato legado que o tema default distribuído usa); `theme:manage --info` também. O manifesto do tema default agora declara `type: "theme"`.
  - **Tema default no scaffold (crítico)**: `okcms init` copia `themes/default` pronto (manifesto + 6 templates `.astro` + `dist/theme.css` servível) para o projeto novo — nunca mais diretório `themes/` vazio; re-init não sobrescreve tema editado.
  - **Scaffold de tema no formato do runtime**: `theme:create` gera os templates da hierarquia (`home/index/single/page/archive/404.astro`) **na raiz do tema** com o contexto real (`items`, `content`, `site`), `provides.layouts`, e no engine `css` entrega `dist/theme.css` já servível (nada de `templates/*.html` com `{{#each posts}}` que o web ignora). Docs (`THEME.md`, `theme-development.md`) alinhados.
  - **Dados enriquecidos chegam ao render**: a resolução de rota carrega `data`/`record` vindos do `findByPath` (mídia real + `_terms`) — o web parou de re-consultar a row crua; itens de archive/home ganham enriquecimento de mídia em lote (uma query para a lista inteira).
  - **Tela Temas do admin**: badge usa `status === 'ACTIVE'` (não mais `isActive` inexistente), erros são limpos antes de cada operação, botão **Sincronizar**, **Desinstalar com confirmação**, preview do manifesto quando declarado e **painel de configurações do tema** (`manifest.settings` editável → `PATCH /api/v1/themes/:id/config`), com os defaults sobrescritos pelo config salvo expostos aos templates como `settings.theme`.
  - **API de temas honesta**: `activate`/`DELETE` respondem 404 quando o tema não existe; `install` valida o manifesto (BUSI-022: `type` + `compatibility.okcms`, nome seguro e único) e a listagem não esconde mais linhas do banco quando o diretório está vazio.
  - **Runner de migrações**: `applyMigration` executava o arquivo inteiro — inclusive a seção `-- +migrate Down`, desfazendo a própria migration no mesmo commit; agora executa apenas o bloco Up (`extractUpSection`).
  - **Polimentos**: `lang` do documento vem da setting `language` (fallback `pt-BR`), o `<link>` de `dist/theme.css` só sai quando o arquivo existe (cadeia ativo → `_shared` → `default`), `wireThemeHooks` é aguardado no boot (sem janela sem hooks), cache de templates do renderer com teto FIFO (200) e a página de fallback do tema exibe os dados reais num HTML legível em vez de JSON cru.
- Updated dependencies
  - @oktis-works/core@0.5.7
  - @oktis-works/database@0.5.6
  - @oktis-works/theme-runtime@0.5.6

## 0.7.0

### Minor Changes

- Bump to 0.8.0 for monorepo sync with CLI 0.8.0 (DB engine selection + container control).

## 0.6.0

### Minor Changes

- Bump to 0.7.0 for monorepo sync with CLI 0.7.0 (interactive wizard release).

## 0.5.5

### Patch Changes

- Updated dependencies []:
  - @oktis-works/config@0.5.5
  - @oktis-works/core@0.5.5
  - @oktis-works/database@0.5.5
  - @oktis-works/plugin-runtime@0.5.5
  - @oktis-works/theme-runtime@0.5.5
  - @oktis-works/theme-sdk@0.5.5
  - @oktis-works/types@0.5.5
