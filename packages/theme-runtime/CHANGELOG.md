# @oktis-works/theme-runtime

## 0.10.1

### Patch Changes

- Fix theme lifecycle, preview, rendering, security, tenant scoping, configuration validation, SDK contracts, pagination, and runtime inheritance behavior.
- Updated dependencies
  - @oktis-works/theme-sdk@0.6.1
  - @oktis-works/types@0.9.1

## 0.10.0

### Minor Changes

- Posts page resolves as a real blog listing (WP `home.php` semantics)
  
  The configured posts page (canonical `postsPage`, legacy `page_for_posts`)
  was only detected on the `/` fallback — visiting `/blog` directly rendered
  the page as a plain static template with no posts feed.
  
  - The router now detects the posts page by id in every branch (single
    segment `/blog`, nested `/page/blog` and the `/` fallback), setting
    `isPageForPosts` so the web app fetches the published posts feed.
  - The template chain gains `isPostsPage`: `posts.astro` is tried before the
    regular page chain, so themes can ship a dedicated listing template
    (WordPress `home.php` equivalent). Themes without `posts.astro` keep the
    previous page chain — fully backward compatible.

## 0.9.0

### Minor Changes

- front-page template support in the hierarchy
  
  `TemplateContext` gained `isFrontPage` and the chain builder now tries
  `front-page.astro` BEFORE the regular page chain when resolving the static
  front page (WordPress-like `front-page.php` behavior). The `RuntimeRouter`
  flags the static front page resolution with `isFrontPage` and passes the hint
  to the resolver. Themes without a `front-page.astro` fall back to the page
  chain unchanged.

## 0.8.1

### Patch Changes

- Respect the admin Reading Settings on runtime routing
  
  The RuntimeRouter only read the legacy seeded keys (`static_front_page`,
  `page_for_posts`), so changing "Your homepage displays" in the admin had no
  effect on the public site. The router now reads the keys the admin saves —
  `frontPageDisplays`/`frontPage`/`postsPage` — with the legacy keys kept as a
  fallback for projects that never saved the form. `frontPageDisplays: latest`
  explicitly disables the static front page, and empty setting values are
  treated as unset.

## 0.8.0

### Minor Changes

- Fix taxonomy management UI and theme activation
  
  - TaxonomyTermsManager: Redesigned to match PostTypesManager layout (form left, table right)
  - Fixed theme activation in seed: activates default theme if none active
  - Fixed taxonomy management UI to match PostTypesManager layout (form left, table right)

## 0.7.0

### Minor Changes

- Implement Static Front Page (WP-style), demo content seed, and redesigned default theme
  
  - **Theme Runtime (core):** Added Static Front Page logic — `resolve('/')` now checks settings `static_front_page` (UUID of a page) and `page_for_posts` (UUID of a page). Falls back to posts archive if unconfigured. Removed hardcoded `isHome: true` priority.
  - **Database (seed):** New `seedDemoContent()` creates 3 pages (home, sobre, blog), 2 posts (primeiro-post, segundo-post), 2 menus (header, footer), and configures reading settings (`static_front_page` + `page_for_posts`). Idempotent via ON CONFLICT.
  - **CLI:** `prepareDb()` and `seed` command now call `seedDemoContent()` automatically — `okcms init` + `okcms start` yields a working site with Home, About, Blog listing, and 2 demo posts.
  - **Admin:** New Settings → Reading page with selects for "Front page" and "Posts page" (populated from published pages). Saves to `reading` settings group.
  - **Default Theme (redesigned):**
    - Removed `home.astro` (no longer hardcoded priority)
    - New specific templates: `page-home.astro`, `page-sobre.astro`, `page-blog.astro`, `post-primeiro-post.astro`, `post-segundo-post.astro`
    - Updated fallbacks: `page.astro`, `single.astro`, `archive.astro`, `index.astro`, `404.astro`
    - Template naming uses hyphen: `type-slug.astro` (e.g., `page-home.astro`)
    - New CSS design system in `src/theme.css` → `dist/theme.css` (engine: css, isolation: manual)
    - Theme settings: siteTitle, siteDescription, contactText
  - **Compatibility:** Breaking change in home resolution — projects without Static Front Page configured now show posts archive instead of `home.astro`. Fallback chain: static_front_page → page_for_posts → posts archive → home.astro (if exists).

## 0.6.4

### Patch Changes

- Updated dependencies [12d1963]
  - @oktis-works/types@0.9.0

## 0.6.3

### Patch Changes

- Updated dependencies
  - @oktis-works/types@0.8.0

## 0.6.2

### Patch Changes

- Updated dependencies
  - @oktis-works/types@0.7.0

## 0.6.1

### Patch Changes

- Updated dependencies
  - @oktis-works/types@0.6.0

## 0.6.0

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

### Patch Changes

- Updated dependencies
  - @oktis-works/theme-sdk@0.6.0

## 0.5.8

### Patch Changes

- ce6aef8: - **Unificação do manifesto de tema — `theme.json` é o canônico único**: fim da redundância `manifest.json`/`theme.json` (o tema default nascia com o nome legado enquanto `theme:create` já gerava o novo).
    - `okcms init` agora grava `themes/default/theme.json` (antes: `manifest.json`).
    - **Migração automática nos projetos existentes**: os entry points do CLI — `okcms update`, `okcms redeploy` (execução real, nunca `--dry-run`), `okcms dev`, `okcms start`, `okcms theme:build` e `okcms theme:manage` — renomeiam `manifest.json` → `theme.json` onde o legado ainda existe (novo `theme-migrate.ts`: idempotente, nunca sobrescreve um `theme.json` já presente, sem permissão de escrita = tenta na próxima execução).
    - **Fallbacks removidos dos leitores**: `themeManifestPath` (theme-build), `theme:manage --info`, `ThemeLoader` (theme-runtime) e `ThemeService.syncFromDirectory` (core) leem só `theme.json`.
    - `manifest.json` continua canônico apenas para **plugins** (caso legítimo de pacotes npm) — fora deste escopo.

## 0.5.7

### Patch Changes

- 2f2919f: - **Plugins no boot**: novo `bootstrapPlugins` — lê do banco os plugins habilitados (ACTIVATED/RUNNING), chama `register(registry)`, descarrega os desabilitados e isola falhas (plugin quebrado não derruba o boot nem dos outros nem do processo). `core.bootstrap()` chama `syncEnabledPlugins` e cobre API, web e worker num ponto só; ativar/desativar pela API sincroniza o processo na hora.
  - **Loader**: descobre o `manifest.json` gerado pelo scaffold (fallback atrás de `package.json` de pacotes npm).
  - **CLI**: comando `okcms prerender`/SSG removido por completo (comando, wizard, parser e docs do scaffold).
  - **Admin**: `AtGlanceWidget` sem versão de app — Storage vira stat próprio; removidos `lib/version.ts` e a chave i18n `dashboard.widgets.version`.
  - **Docs**: auditoria de promessas falsas em todos os `.md` do projeto e nos templates gerados — exemplo de plugin com hooks reais (`content:query`, `after_publish_content_post`), `plugin:manage/theme:manage --disable` descrito como estado local, `update/redeploy` sem assumir blue/green, SSR-only e "sandbox" não anunciado como isolamento de execução.

## 0.5.6

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

## 0.5.5

### Patch Changes

- Updated dependencies []:
  - @oktis-works/theme-sdk@0.5.5
  - @oktis-works/types@0.5.5

## 0.3.3

### Patch Changes

- Patch alignment 0.3.3 (interactive install prompt + live dependency loader shipped via `@oktis-works/cms`)

## 0.3.2

### Patch Changes

- Patch alignment 0.3.2 (docker build hardening + admin SSR fix shipped via `@oktis-works/cms` and `@oktis-works/ui`)

## 0.3.1

### Patch Changes

- Fix @oktis-works/admin missing bin/admin.js entry point for standalone Astro server

## 0.3.0

### Minor Changes

- Release 0.3.0, aligned with tag v0.3.0: interactive arrow-key menus and English
  output across the `okcms` CLI, plus a third deploy target (simple containers in
  front of the proxy) next to blue/green and PM2.

## 0.2.1

### Minor Changes

- Histórico/rollback unificado, comando deploy (Docker/PM2), docs auto-atualizadas no update/deploy
## 0.2.0

### Patch Changes

- Updated dependencies []:
  - @oktis-works/theme-sdk@0.2.0
  - @oktis-works/types@0.2.0

## 0.1.14

### Patch Changes

- Updated dependencies []:
  - @oktis-works/theme-sdk@0.1.14
  - @oktis-works/types@0.1.14

## 0.1.13

### Patch Changes

- Updated dependencies []:
  - @oktis-works/theme-sdk@0.1.13
  - @oktis-works/types@0.1.13

## 0.1.12

### Patch Changes

- Updated dependencies []:
  - @oktis-works/types@0.1.12
  - @oktis-works/theme-sdk@0.1.12

## 0.1.11

### Patch Changes

- Updated dependencies []:
  - @oktis-works/types@0.1.11
  - @oktis-works/theme-sdk@0.1.11

## 0.1.10

### Patch Changes

- Updated dependencies []:
  - @oktis-works/theme-sdk@0.1.10
  - @oktis-works/types@0.1.10

## 0.1.9

### Patch Changes

- Updated dependencies []:
  - @oktis-works/types@0.1.9
  - @oktis-works/theme-sdk@0.1.9

## 0.1.8

### Patch Changes

- Updated dependencies []:
  - @oktis-works/types@0.1.8
  - @oktis-works/theme-sdk@0.1.8

## 0.1.7

### Patch Changes

- Updated dependencies []:
  - @oktis-works/types@0.1.7
  - @oktis-works/theme-sdk@0.1.7

## 0.1.6

### Patch Changes

- Updated dependencies []:
  - @oktis-works/types@0.1.6
  - @oktis-works/theme-sdk@0.1.6

## 0.1.5

### Patch Changes

- Updated dependencies []:
  - @oktis-works/types@0.1.5
  - @oktis-works/theme-sdk@0.1.5

## 0.1.4

### Patch Changes

- Updated dependencies []:
  - @oktis-works/types@0.1.4
  - @oktis-works/theme-sdk@0.1.4

## 0.1.3

### Patch Changes

- Updated dependencies []:
  - @oktis-works/types@0.1.3
  - @oktis-works/theme-sdk@0.1.3
