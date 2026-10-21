# @oktis-works/core

## 0.10.1

### Patch Changes

- Updated dependencies
  - @oktis-works/database@0.10.1

## 0.10.0

### Minor Changes

- Add WordPress-style timezone system (OK CMS nomenclature)
  
  - **Core (timezone service)**: New `okForceUtcRuntime()`, `okDate()`, `okCurrentTime()`, `okGetTimezoneOffset()`, `okConvertToGmt()`, `okConvertFromGmt()`, `okGetTimezoneAbbreviation()`, `okIsDstActive()`, `okGetCommonTimezones()`, `okGetManualOffsets()`
  - **Bootstrap integration**: Forces UTC runtime on startup (equivalent to WP's `date_default_timezone_set('UTC')`)
  - **Database**: Migration V018 adds `published_at_gmt` column to content table for dual date storage (local + GMT)
  - **Dual timezone config**: IANA city identifiers (DST auto) + manual UTC offsets
  - **Settings**: `timezone_string` (IANA) and `gmt_offset` (manual) with priority: timezone_string > gmt_offset
  - **Cache**: Config loaded from settings with in-memory cache
  - **Tests**: 21 new timezone service tests covering DST, offsets, conversions, formatting
  
  Breaking: Requires running migration V018. Default timezone is America/Sao_Paulo.

### Patch Changes

- Updated dependencies
  - @oktis-works/database@0.10.0

## 0.9.0

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

### Patch Changes

- Updated dependencies
  - @oktis-works/database@0.9.0

## 0.8.0

### Minor Changes

- Simplify the Themes and Plugins admin pages and enforce the single-active-theme lifecycle
  
  - Themes page: remove the inline theme settings editor and the uninstall action — each theme card now shows only the Activate/Deactivate toggle.
  - Themes lifecycle: deactivation is refused while only one theme exists (an active theme must always remain). Enforced in the theme service and pre-checked in the admin UI, which shows a warning instead of calling the API.
  - Plugins page: read-only listing — installation, update and activation are manual (place plugin files in the project's plugins/ directory and restart via okcms start, pm2 or docker).
  - Remove stale pre-compiled artifacts that shadowed the ThemeManager/PluginManager sources and the themes API route.

## 0.7.0

### Minor Changes

- 12d1963: Core plumbing for editor extensibility (parity E1–E8): getPluginBlocks/getPluginPatterns accessors (lazy plugin-runtime import, never throw), the 'block' location parameter for field groups (field groups can target editor blocks by namespaced type) and getPluginAdminExtensions for the admin extension state.

### Patch Changes

- Updated dependencies [12d1963]
- Updated dependencies [12d1963]
- Updated dependencies [12d1963]
- Updated dependencies
  - @oktis-works/plugin-runtime@0.7.0
  - @oktis-works/types@0.9.0
  - @oktis-works/validation@0.7.0
  - @oktis-works/database@0.8.0
  - @oktis-works/config@0.6.4

## 0.6.1

### Patch Changes

- 562e5c1: Fix fresh-checkout build and admin plugin field rendering
  
  - plugin-runtime: resolve `@oktis-works/core` at runtime via a non-literal dynamic import in `bootstrapPlugins`, removing the static module reference that broke `tsc` on fresh checkouts (core builds after plugin-runtime and its `dist/` does not exist yet; `require()` is also unavailable in Node ESM).
  - core: replace the self-import `await import('@oktis-works/core')` in `plugin/load.ts` with a relative import of the field type extension service.
  - admin: fix plugin field type loaders (`PluginFieldRenderer`, `PluginFieldConfig`) — signals were read without calling them inside non-reactive `if` branches, so the components never left the loading state; now uses `Switch`/`Match` with `Dynamic`. Also fixes typecheck errors (index signature access, missing `t` prop propagation, `_t` prop name) across `FieldRenderer`.
- Updated dependencies [562e5c1]
  - @oktis-works/plugin-runtime@0.6.1

## 0.6.0

### Minor Changes

- feat: add custom field types via plugins
  
  - Core: field_type_extensions table, dynamic type registry
  - Plugin Runtime: addFieldType API, manifest fieldTypes[]
  - Admin: dynamic component loading for field config/render
  - Docs: plugin-development.md, PLUGIN.md
  - Example plugin: mermaid-field
  
  BREAKING CHANGE: none

### Patch Changes

- Updated dependencies
  - @oktis-works/plugin-runtime@0.6.0
  - @oktis-works/types@0.8.0
  - @oktis-works/config@0.6.3
  - @oktis-works/database@0.7.1

## 0.5.15

### Patch Changes

- Updated dependencies
  - @oktis-works/types@0.7.0
  - @oktis-works/database@0.7.0
  - @oktis-works/config@0.6.2
  - @oktis-works/plugin-runtime@0.5.10

## 0.5.14

### Patch Changes

- Updated dependencies
  - @oktis-works/types@0.6.0
  - @oktis-works/database@0.6.0
  - @oktis-works/config@0.6.1
  - @oktis-works/plugin-runtime@0.5.9

## 0.5.13

### Patch Changes

- Updated dependencies [3da0733]
  - @oktis-works/config@0.6.0
  - @oktis-works/database@0.5.8

## 0.5.12

### Patch Changes

- Updated dependencies
  - @oktis-works/database@0.5.7

## 0.5.11

### Patch Changes

- Updated dependencies
  - @oktis-works/validation@0.6.0
  - @oktis-works/plugin-runtime@0.5.8
  - @oktis-works/types@0.5.6

## 0.5.10

### Patch Changes

- fix(lint): remove imports/vars não usados que quebravam `bun run lint` no CI
  
  `eslint .` falhava com 7 erros de `no-unused-vars` em arquivos committados
  (`apps/api/src/index.ts`, `packages/core/src/plugin/load.ts`,
  `packages/plugin-runtime/src/plugin-api-rls.test.ts`) — o gate de lint do CI
  ficava vermelho em qualquer tag. Removidos os símbolos sem uso, sem mudança
  de comportamento.
  
  Inclui também a limpeza do `apps/web/src/rendering.ts`: `getScopedContainer` e
  `buildTheme` eram helpers exportados porém **nunca consumidos** pelo app
  (duplicavam o style-engine do pacote) — removidos junto com os imports órfãos.
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
  - @oktis-works/plugin-runtime@0.5.7

## 0.5.9

### Patch Changes

- ce6aef8: - **Unificação do manifesto de tema — `theme.json` é o canônico único**: fim da redundância `manifest.json`/`theme.json` (o tema default nascia com o nome legado enquanto `theme:create` já gerava o novo).
    - `okcms init` agora grava `themes/default/theme.json` (antes: `manifest.json`).
    - **Migração automática nos projetos existentes**: os entry points do CLI — `okcms update`, `okcms redeploy` (execução real, nunca `--dry-run`), `okcms dev`, `okcms start`, `okcms theme:build` e `okcms theme:manage` — renomeiam `manifest.json` → `theme.json` onde o legado ainda existe (novo `theme-migrate.ts`: idempotente, nunca sobrescreve um `theme.json` já presente, sem permissão de escrita = tenta na próxima execução).
    - **Fallbacks removidos dos leitores**: `themeManifestPath` (theme-build), `theme:manage --info`, `ThemeLoader` (theme-runtime) e `ThemeService.syncFromDirectory` (core) leem só `theme.json`.
    - `manifest.json` continua canônico apenas para **plugins** (caso legítimo de pacotes npm) — fora deste escopo.

## 0.5.8

### Patch Changes

- 2f2919f: - **Plugins no boot**: novo `bootstrapPlugins` — lê do banco os plugins habilitados (ACTIVATED/RUNNING), chama `register(registry)`, descarrega os desabilitados e isola falhas (plugin quebrado não derruba o boot nem dos outros nem do processo). `core.bootstrap()` chama `syncEnabledPlugins` e cobre API, web e worker num ponto só; ativar/desativar pela API sincroniza o processo na hora.
  - **Loader**: descobre o `manifest.json` gerado pelo scaffold (fallback atrás de `package.json` de pacotes npm).
  - **CLI**: comando `okcms prerender`/SSG removido por completo (comando, wizard, parser e docs do scaffold).
  - **Admin**: `AtGlanceWidget` sem versão de app — Storage vira stat próprio; removidos `lib/version.ts` e a chave i18n `dashboard.widgets.version`.
  - **Docs**: auditoria de promessas falsas em todos os `.md` do projeto e nos templates gerados — exemplo de plugin com hooks reais (`content:query`, `after_publish_content_post`), `plugin:manage/theme:manage --disable` descrito como estado local, `update/redeploy` sem assumir blue/green, SSR-only e "sandbox" não anunciado como isolamento de execução.
- Updated dependencies [2f2919f]
  - @oktis-works/plugin-runtime@0.5.6

## 0.5.7

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
  - @oktis-works/database@0.5.6

## 0.5.6

### Patch Changes

- Sidebar: estilos do DashboardLayout agora são `is:global` — os links dinâmicos de content-types (criados por JS) não recebem data-astro-cid e ficavam sem estilo (link dourado padrão, desalinhado); agora são idênticos aos links normais. Modais do field-builder (fb-modal/fb-browse-modal) enquadrados entre a AdminBar e o rodapé com altura ajustável e corpo com scroll. Core: content type CORE `page` com labels em inglês (Pages/Page) — alinhado ao seed V003 (migration V009 corrige bancos existentes com os labels em português).

## 0.5.5

### Patch Changes

- Updated dependencies []:
  - @oktis-works/config@0.5.5
  - @oktis-works/database@0.5.5
  - @oktis-works/plugin-runtime@0.5.5
  - @oktis-works/types@0.5.5
  - @oktis-works/validation@0.5.5

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
  - @oktis-works/config@0.2.0
  - @oktis-works/database@0.2.0
  - @oktis-works/plugin-runtime@0.2.0
  - @oktis-works/types@0.2.0

## 0.1.14

### Patch Changes

- Fases A–D do TODO: publisher real nas rotas de conteúdo (publish/unpublish com revisions + eventBus + cache), QueueProducer no core com degradação silenciosa (fila opcional), processamento real de mídia com sharp e build Docker real no worker, renderização real do site público (templates do tema + settings), design-system Solid no @oktis-works/ui (Button/Input/Select/Card/Badge/Modal/Toast/Table/Pagination) consumido pelo admin, fluxo de auth híbrido completo (tokens no body + cookies HttpOnly) e limpeza de legado (rota /me duplicada, stub de validação).
- Updated dependencies []:
  - @oktis-works/config@0.1.14
  - @oktis-works/database@0.1.14
  - @oktis-works/plugin-runtime@0.1.14
  - @oktis-works/types@0.1.14

## 0.1.13

### Patch Changes

- Updated dependencies []:
  - @oktis-works/config@0.1.13
  - @oktis-works/database@0.1.13
  - @oktis-works/plugin-runtime@0.1.13
  - @oktis-works/types@0.1.13

## 0.1.12

### Patch Changes

- F1–F10: Admin panel completo
  
  - F1 RBAC: seed 5 roles (SUPER_ADMIN, TENANT_ADMIN, EDITOR, AUTHOR, VIEWER); register atribui TENANT_ADMIN ao 1º usuário; login resolve slug→UUID e devolve tenantId no JWT
  - F2 Media: upload local-disk (UPLOAD_DIR), layout tenant/uuid.ext, GET /file público (cache imutável), 25MB, traversal bloqueado
  - F3 Settings: seed 4 configurações (siteTitle, siteDescription, language, timezone) grupo general
  - F4 Admin api-client tipado (AuthApiClient, MediaApiClient, UsersApiClient, SettingsApiClient, ContentApiClient)
  - F5 MediaLibrary: grid, upload drag-and-drop, preview modal, busca, paginação
  - F6 Users: lista com roles, criação com roleId, troca de senha, papel EDITOR
  - F7 Settings: GeneralSettings (siteTitle, siteDescription, language, timezone) com PUT array
  - F8 Dashboard + ContentList (Solid islands), ContentEditor modo edição (?id=), redirect /dashboard → /
  - F9 DashboardLayout: sidebar ativa por pathname, submenu Settings sempre visível, session guard + logout funcional
  - E2E API 25/25 (register/login/RBAC/upload/settings/traversal/content/users/boundaries/401)
  - E2E Admin 13/13 (login/dashboard/media/users/settings/content/logout/session guard)
  - Fix sistêmico jsonb: params crus (driver serializa 1×), boolean via CASE WHEN, tenant_id em media/content
  - Gates: lint ✅ typecheck 0 ✅ 484 testes ✅ build 17/17 ✅
- Updated dependencies []:
  - @oktis-works/database@0.1.12
  - @oktis-works/types@0.1.12
  - @oktis-works/config@0.1.12
  - @oktis-works/plugin-runtime@0.1.12

## 0.1.11

### Patch Changes

- Updated dependencies []:
  - @oktis-works/validation@0.1.11
  - @oktis-works/plugin-runtime@0.1.11
  - @oktis-works/types@0.1.11
  - @oktis-works/config@0.1.11
  - @oktis-works/database@0.1.11

## 0.1.10

### Patch Changes

- Updated dependencies []:
  - @oktis-works/database@0.1.10
  - @oktis-works/config@0.1.10
  - @oktis-works/plugin-runtime@0.1.10
  - @oktis-works/types@0.1.10

## 0.1.9

### Patch Changes

- Updated dependencies []:
  - @oktis-works/database@0.1.9
  - @oktis-works/validation@0.1.9
  - @oktis-works/plugin-runtime@0.1.9
  - @oktis-works/types@0.1.9
  - @oktis-works/config@0.1.9

## 0.1.8

### Patch Changes

- Updated dependencies []:
  - @oktis-works/validation@0.1.8
  - @oktis-works/plugin-runtime@0.1.8
  - @oktis-works/types@0.1.8
  - @oktis-works/config@0.1.8
  - @oktis-works/database@0.1.8

## 0.1.7

### Patch Changes

- Updated dependencies []:
  - @oktis-works/validation@0.1.7
  - @oktis-works/plugin-runtime@0.1.7
  - @oktis-works/types@0.1.7
  - @oktis-works/config@0.1.7
  - @oktis-works/database@0.1.7

## 0.1.6

### Patch Changes

- Updated dependencies []:
  - @oktis-works/validation@0.1.6
  - @oktis-works/plugin-runtime@0.1.6
  - @oktis-works/types@0.1.6
  - @oktis-works/config@0.1.6
  - @oktis-works/database@0.1.6

## 0.1.5

### Patch Changes

- Updated dependencies []:
  - @oktis-works/validation@0.1.5
  - @oktis-works/plugin-runtime@0.1.5
  - @oktis-works/types@0.1.5
  - @oktis-works/config@0.1.5
  - @oktis-works/database@0.1.5

## 0.1.4

### Patch Changes

- Updated dependencies []:
  - @oktis-works/config@0.1.4
  - @oktis-works/validation@0.1.4
  - @oktis-works/database@0.1.4
  - @oktis-works/plugin-runtime@0.1.4
  - @oktis-works/types@0.1.4

## 0.1.3

### Patch Changes

- Updated dependencies []:
  - @oktis-works/validation@0.1.3
  - @oktis-works/plugin-runtime@0.1.3
  - @oktis-works/types@0.1.3
  - @oktis-works/config@0.1.3
  - @oktis-works/database@0.1.3
