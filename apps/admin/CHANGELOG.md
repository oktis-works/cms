# @oktis-works/admin

## 0.19.1

### Patch Changes

- Fix /settings/reading stuck in infinite loading
  
  The ReadingSettings component switched its loading state with a top-level
  `if (loading())` early return. Solid component bodies run once, so the
  initial "Loading..." markup was returned permanently: fetches completed
  successfully (no errors anywhere) but the UI never left the loading branch —
  including the safety timeout added earlier, which only mutated signals the
  frozen conditional could not see.
  
  The render now uses the reactive `<Show when={!loading()}>` pattern (the same
  one used by ApiKeysManager, LogsManager and WebhooksManager), and the debug
  console.log calls added while chasing the symptom were removed. The 35s
  safety timeout is kept and now actually surfaces its error in the UI.

## 0.19.0

### Minor Changes

- 372cad9: Fix ReadingSettings: add timezone_string and gmt_offset fields
  
  - Added timezone_string (IANA format) and gmt_offset fields to ReadingSettings
  - Updated submit to save timezone_string and gmt_offset
  - Added missing i18n keys for gmtOffsetDescription (en/pt-BR)
  - Fixed form to save all reading settings including timezone

## 0.17.0

### Minor Changes

- Fix timezone settings, taxonomy management UI, and theme activation
  
  - Settings → Reading: Added timezone_string (IANA) and gmt_offset fields with TimezoneSelect (WP-style)
  - Settings → General: Removed timezone field (moved to Reading)
  - Sidebar: Added Reading to Settings submenu, moved Customize under Themes as sub-item
  - Taxonomy Terms Manager: Redesigned to match PostTypesManager layout (form left, table right)
  - Fixed theme activation in seed: activates default theme if none active
  - Fixed timezone seed: added timezone_string (America/Sao_Paulo) and gmt_offset (-3)
  - Fixed seed: CTE-based upserts for all entities (content, menus, settings)
  - Fixed content seed ON CONFLICT to use CTE-based upserts
  - Fixed tenant_users role lookup to accept global roles (tenant_id IS NULL)
  - Fixed user creation ON CONFLICT to properly handle existing users
  - Fixed menus table unique constraint (V020) for ON CONFLICT (tenant_id, slug)
  - Fixed reading settings ON CONFLICT
  - Fixed TimezoneSelect usage: removed invalid 'name' prop, proper import from local component
  - Fixed bcrypt hash validation regex: proper escaping of $ characters
  - Fixed seed: CTE-based upserts for all entities (content, menus, settings)
  - Fixed tenant_users role lookup to accept global roles (tenant_id IS NULL)
  - Fixed user creation ON CONFLICT to properly handle existing users
  - Fixed ReadingSettings: added timezone_string and gmt_offset fields with TimezoneSelect
  - Fixed GeneralSettings: removed timezone field (moved to Reading)
  - Sidebar: Added Reading to Settings submenu, moved Customize under Themes as sub-item
  - Taxonomy Terms Manager: Redesigned to match PostTypesManager layout (form left, table right)
  - Fixed theme activation in seed: activates default theme if none active
  - Fixed timezone seed: added timezone_string (America/Sao_Paulo) and gmt_offset (-3)
  - Fixed seed: CTE-based upserts for all entities (content, menus, settings)
  - Fixed timezone regex: proper escaping of $ characters
  - Fixed seed: CTE-based upserts for all entities (content, menus, settings)
  - Fixed tenant_users role lookup to accept global roles (tenant_id IS NULL)
  - Fixed user creation ON CONFLICT to properly handle existing users
  - Fixed ReadingSettings: added timezone_string and gmt_offset fields with TimezoneSelect
  - Fixed GeneralSettings: removed timezone field (moved to Reading)
  - Sidebar: Added Reading to Settings submenu, moved Customize under Themes as sub-item
  - Taxonomy Terms Manager: Redesigned to match PostTypesManager layout (form left, table right)
  - Fixed theme activation in seed: activates default theme if none active
  - Fixed timezone seed: added timezone_string (America/Sao_Paulo) and gmt_offset (-3)
  - Fixed seed: CTE-based upserts for all entities (content, menus, settings)
  - Fixed timezone regex: proper escaping of $ characters
  - Fixed seed: CTE-based upserts for all entities (content, menus, settings)
  - Fixed tenant_users role lookup to accept global roles (tenant_id IS NULL)
  - Fixed user creation ON CONFLICT to properly handle existing users

## 0.16.0

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

## 0.15.0

### Minor Changes

- Simplify the Themes and Plugins admin pages and enforce the single-active-theme lifecycle
  
  - Themes page: remove the inline theme settings editor and the uninstall action — each theme card now shows only the Activate/Deactivate toggle.
  - Themes lifecycle: deactivation is refused while only one theme exists (an active theme must always remain). Enforced in the theme service and pre-checked in the admin UI, which shows a warning instead of calling the API.
  - Plugins page: read-only listing — installation, update and activation are manual (place plugin files in the project's plugins/ directory and restart via okcms start, pm2 or docker).
  - Remove stale pre-compiled artifacts that shadowed the ThemeManager/PluginManager sources and the themes API route.

## 0.14.0

### Minor Changes

- 12d1963: Plugin admin UI slots and the editor slot (parity E1–E8): plugin components render via dynamic import (menu/submenu, dashboard widgets, meta boxes, list columns + renderers, action links) fed by GET /api/v1/plugins/extensions; ContentEditor activates plugin editors per screen (replace-body/below modes with the { editorId, contentType, contentId, body, setBody, disabled } contract); field builder supports the block location parameter.

### Patch Changes

- Updated dependencies [12d1963]
- Updated dependencies [12d1963]
- Updated dependencies [12d1963]
  - @oktis-works/plugin-sdk@0.7.0
  - @oktis-works/types@0.9.0
  - @oktis-works/validation@0.7.0
  - @oktis-works/ui@0.5.8

## 0.13.1

### Patch Changes

- 562e5c1: Fix fresh-checkout build and admin plugin field rendering
  
  - plugin-runtime: resolve `@oktis-works/core` at runtime via a non-literal dynamic import in `bootstrapPlugins`, removing the static module reference that broke `tsc` on fresh checkouts (core builds after plugin-runtime and its `dist/` does not exist yet; `require()` is also unavailable in Node ESM).
  - core: replace the self-import `await import('@oktis-works/core')` in `plugin/load.ts` with a relative import of the field type extension service.
  - admin: fix plugin field type loaders (`PluginFieldRenderer`, `PluginFieldConfig`) — signals were read without calling them inside non-reactive `if` branches, so the components never left the loading state; now uses `Switch`/`Match` with `Dynamic`. Also fixes typecheck errors (index signature access, missing `t` prop propagation, `_t` prop name) across `FieldRenderer`.

## 0.13.0

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
  - @oktis-works/plugin-sdk@0.6.0
  - @oktis-works/types@0.8.0

## 0.12.0

### Minor Changes

- Fix version bump: release 0.15.0 instead of reusing 0.14.0 tag.

### Patch Changes

- Updated dependencies
  - @oktis-works/types@0.7.0
  - @oktis-works/plugin-sdk@0.5.8

## 0.11.0

### Minor Changes

- API keys for API-first clients. A key is exchanged once at
  `POST /api/v1/auth/api-key-login` for an access JWT + refresh token (normal
  Bearer + refresh cycle afterwards with reuse detection); it never authorizes
  requests directly. Adds `api_keys` (SHA-256 hash only, RLS per tenant,
  optional single-use/expiry), `GET/POST /api/v1/api-keys`,
  `DELETE /api/v1/api-keys/:id`, `OkCMSClient.loginWithApiKey`, and an admin
  screen at Settings → API keys. Rate limited per key prefix on top of the
  per-IP login bucket.

### Patch Changes

- Updated dependencies
  - @oktis-works/types@0.6.0
  - @oktis-works/plugin-sdk@0.5.7

## 0.10.0

### Minor Changes

- 93b17e3: feat(admin): dropdowns em portal, sidebar sem seta separada e /settings/access com modal + matriz de permissões
  
  Dropdowns imunes a overflow: novo `FloatingPanel` renderiza o painel num
  portal no body com `position: fixed` (mede na abertura, abre para baixo ou
  vira para cima, contido na viewport, reposiciona em scroll/resize, fecha
  por clique fora/Escape). Os três cortes relatados deixam de existir:
  - `IconPicker` em `/settings/post-types` (não estoura mais o form);
  - `FieldTypePicker` em `/settings/custom-fields/[id]` e `/new` (dentro da
    área de drag & drop, que agora não o corta);
  - `TimezoneSelect` em `/settings/general`.
  O `FieldTypePicker` também passa a fechar no clique fora (antes não fechava).
  
  Sidebar: o botão de seta separado para as taxonomias foi removido — a seta
  agora é um caret decorativo DENTRO do link; clicar no link do content type
  navega e abre o dropdown das taxonomias ao mesmo tempo. O link Settings faz
  o mesmo com o submenu de configurações.
  
  /settings/access:
  - permissões do role deixam de ser texto livre e viram `PermissionPicker` —
    matriz de checkboxes recurso × ação (vocabulário real da API), com busca,
    contador e permissões personalizadas preservadas como chips removíveis;
  - "+ Create" de Roles e Tenants sobe para o lado oposto do título
    (`card-header-row`);
  - criar/editar roles e tenants abrem em modal genérico (`ui/Modal`) em vez
    de formulário no topo do card;
  - tabela de Roles ganha coluna de resumo das permissões.
  
  i18n: chaves novas em en/pt-BR (demais idiomas caem no fallback do en).

## 0.9.0

### Minor Changes

- 2b5208c: feat(admin): página 404 com a marca OkCMS e seletor de ícones virtualizado
  
  Página 404 própria (removendo a genérica do Astro) com o logo horizontal,
  caminho solicitado, sugestões sutis de navegação e "Voltar ao início" —
  traduzida nos 14 idiomas, com suporte a RTL (ar/he).
  
  Em `/settings/post-types`, o campo "Ícone do menu lateral" deixa de aceitar
  texto livre e passa a ser um dropdown com preview do ícone Lucide escolhido:
  busca, contagem de resultados e o catálogo completo (~2.100 ícones) renderizado
  com virtualização (54 células no DOM), sem lag de digitação.
- 3da0733: fix(rate-limit): 429 em rajada e "logout" falso no admin
  
  O admin estourava o rate limit carregando o dashboard (~21 requisições por
  página, com N+1 e /auth/me triplicado) e todos os clientes dividiam um único
  balde `platform:unknown` — a chave vinha de X-Forwarded-For forjável ou
  retornava literalmente "unknown". O guarda de sessão trataba qualquer erro
  (inclusive 429) como "usuário deslogado" e redirecionava para /login.
  
  API:
  - rate limiting por classe: anônimo por IP real (socket, ou XFF apenas
    quando o par é proxy de confiança; `TRUST_PROXY`/`TRUSTED_PROXIES`),
    autenticado por user id da sessão (JWT verificado, sem banco) e
    credenciais com limiter dedicado por IP + e-mail (10 tentativas / 5min);
  - `X-Tenant-ID` e `X-Forwarded-For` deixam de compor a chave (bypass);
  - escritas custam 5x, mídia estática e bootstrap de CSRF são isentos,
    buckets expirados são varridos e há teto de chaves vivas;
  - `RATE_LIMIT_WINDOW_SECONDS` é o nome canônico (`_MS` vira alias legado);
  - cookie `session_expires_at` (não HttpOnly) emitido em login/refresh e
    `/auth/me` devolve `locale` (sessão + idioma em uma chamada);
  - `GET /content?include=author` expande autores em uma query (anti N+1);
  - nginx: X-Real-IP/X-Forwarded-For também em `/storage/` e `/themes/`.
  
  Admin:
  - `ApiError` tipado e `checkSession()` tri-estado: só um 401 definitivo
    redireciona; 429/5xx/rede viram `unavailable` (sem logout falso);
  - 429 sinalizado na UI com aviso, e leituras repetem uma vez após o
    `Retry-After` curto (nada trava a interface);
  - refresh proativo do access token via cookie `session_expires_at`;
  - lock de refresh entre abas acorda pelo `storage` event (antes: polling
    com TTL de 10s que travava abas órfãs);
  - sessão e idioma resolvidos no SSR (uma chamada server-side; o login
    não gasta nenhuma), CSRF em memória por 60s, proxy injeta o IP real.
  
  Config/CLI:
  - `RATE_LIMIT_DEFAULTS` em `@oktis-works/config` como fonte única; o wizard
    grava os mesmos defaults que a API lê (antes: wizard escrevia 100/60s e o
    código lia 300/60s com outro nome de variável).

## 0.8.8

### Patch Changes

- Updated dependencies
  - @oktis-works/validation@0.6.0
  - @oktis-works/types@0.5.6
  - @oktis-works/ui@0.5.7

## 0.8.7

### Patch Changes

- feat(themes): `GET /api/v1/themes` vira leitura pura; sincronização explícita em `POST /sync`
  
  `GET /api/v1/themes` disparava `syncFromDirectory()` — uma **escrita** no banco
  a cada listagem (upsert + `updated_at`), colidindo com o contrato de uma
  opação de leitura e fazendo I/O de disco à cada request.
  
  - `GET /api/v1/themes`: só `themeService.list()` (sem side-effect).
  - `POST /api/v1/themes/sync`: novo, com `requirePermission('create', 'theme')`,
    devolve o estado completo após o upsert.
  - Admin (`ThemeManager`): `loadThemes()` chama `syncThemes()` e degrada para a
    listagem pura se o sync falhar (ex.: usuário sem permissão de criação).
  
  Compatível com o fluxo existente do admin (abrir a tela Temas continua
  sincronizando), apenas com o side-effect movido para a operação explícita.

## 0.8.6

### Patch Changes

- 2f2919f: - **Plugins no boot**: novo `bootstrapPlugins` — lê do banco os plugins habilitados (ACTIVATED/RUNNING), chama `register(registry)`, descarrega os desabilitados e isola falhas (plugin quebrado não derruba o boot nem dos outros nem do processo). `core.bootstrap()` chama `syncEnabledPlugins` e cobre API, web e worker num ponto só; ativar/desativar pela API sincroniza o processo na hora.
  - **Loader**: descobre o `manifest.json` gerado pelo scaffold (fallback atrás de `package.json` de pacotes npm).
  - **CLI**: comando `okcms prerender`/SSG removido por completo (comando, wizard, parser e docs do scaffold).
  - **Admin**: `AtGlanceWidget` sem versão de app — Storage vira stat próprio; removidos `lib/version.ts` e a chave i18n `dashboard.widgets.version`.
  - **Docs**: auditoria de promessas falsas em todos os `.md` do projeto e nos templates gerados — exemplo de plugin com hooks reais (`content:query`, `after_publish_content_post`), `plugin:manage/theme:manage --disable` descrito como estado local, `update/redeploy` sem assumir blue/green, SSR-only e "sandbox" não anunciado como isolamento de execução.
- Updated dependencies [2f2919f]
  - @oktis-works/plugin-sdk@0.5.6

## 0.8.5

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

## 0.8.4

### Patch Changes

- c5cb19a: - **Admin bar**: o header nav passa a usar a nova logo horizontal (`/logo-horizontal.svg` — mascote + wordmark OkCMS lado a lado, SVG original do CorelDRAW com viewBox ajustado para a caixa da arte), substituindo a logo vertical 28px e o texto `OkCMS` duplicado ao lado.
  - **Footer**: removido o badge de versão (`v{versão}`) do footer do admin — ficam apenas "OkCMS", os links e o crédito.

## 0.8.3

### Patch Changes

- 02ce591: fix(layout): .layout em 100vh puro com offset da AdminBar aplicado dentro
  
  - `.layout` agora usa `height: 100vh` (antes `calc(100vh - 46px)`) e o
    `padding-top: 46px` no `<html>` foi removido — o documento começa em y=0 e a
    barra fixa sobrepõe o topo.
  - `.content-wrapper` (corpo de cada página): `height: calc(100% - 46px)` +
    `margin-top: 46px` (via `--admin-bar-h`), reservando a faixa da barra em
    todas as páginas do admin com uma regra só.
  - `.sidebar` (e o estado colapsada) ganhou `padding-top` com a mesma
    compensação, para o conteúdo da sidebar não ficar sob a barra.

## 0.8.2

### Patch Changes

- 4b3e5d7: fix(login): proxy /api standalone, join sem prefixo duplicado, logo sem caixa dourado e favicon versionado
  
  - **404 no login (`api/api/v1/auth/csrf`)**: o `okcms dev/start` roda o Admin como
    build pré-compilado, onde o `vite.server.proxy` não existe — o modo
    recomendado do scaffold (`PUBLIC_API_URL=/api`) respondia 404 em todo `/api/*`.
    Novo middleware `proxyApiRequest` encaminha `/api/*` para
    `ADMIN_API_PROXY_TARGET` (mesma variável do modo dev), preservando Set-Cookie,
    streams (uploads) e status; API fora do ar responde 502 JSON.
  - **Join normalizado**: `joinApiUrl` remove a duplicação `/api` + `/api/v1/...`
    no client (`request`, `requestRaw`, csrf e uploads) e no fetch de locale do
    middleware (que também falhava com base relativa).
  - **Login**: removido o caixa dourado ao redor da logo e o texto `OkCMS` (a
    wordmark já está no SVG); logo ampliada para 96px com alt acessível.
  - **Favicon**: `href` com `?v=<versão>` — browsers guardam favicon pela URL;
    a cada release a URL muda e a logo oficial aparece sem limpar cache.

## 0.8.1

### Patch Changes

- 8dbb6f3: Logo oficial em todos os pontos da UI (favicon, admin bar, sidebar e login).
  
  - Novo `public/logo.svg`: SVG original do CorelDRAW com cores e paths
    preservados; apenas o `viewBox` foi ajustado para o caixa real da arte
    (`44817.69 -304.8 30309.6 30309.6`) — o export A4 colocava a arte fora
    do viewBox antigo (`0 0 21000 29700`) e nada aparecia.
  - `favicon.svg` agora é a logo oficial (era um mark placeholder dourado).
  - Admin bar, sidebar colapsada e login passam a usar `<img src="/logo.svg">`
    no lugar dos SVGs inline antigos, com os tamanhos de cada contexto
    (28px na barra/sidebar, 48px no login).

## 0.8.0

### Minor Changes

- Bump to 0.8.0 for monorepo sync with CLI 0.8.0 (DB engine selection + container control).

## 0.7.0

### Minor Changes

- Bump to 0.7.0 for monorepo sync with CLI 0.7.0 (interactive wizard release).

## 0.6.6

### Patch Changes

- Settings → General: idioma agora lista TODOS os locales suportados (18) com bandeiras, e ao salvar aplica de verdade — grava o cookie `admin_locale` e recarrega a página nas traduções novas; timezone virou dropdown buscável estilo WordPress `(UTC-03:00) America/Sao_Paulo` (zonas IANA completas, ordenadas por offset, salva o id IANA, pré-preenche com o fuso do navegador). Field builder: as abas de configuração do campo (General/Validation/Presentation/…) não voltam mais para General a cada interação — memória de aba por field + `patchField` preservando referências (sem remontar linhas irmãs).

## 0.6.5

### Patch Changes

- Sidebar: estilos do DashboardLayout agora são `is:global` — os links dinâmicos de content-types (criados por JS) não recebem data-astro-cid e ficavam sem estilo (link dourado padrão, desalinhado); agora são idênticos aos links normais. Modais do field-builder (fb-modal/fb-browse-modal) enquadrados entre a AdminBar e o rodapé com altura ajustável e corpo com scroll. Core: content type CORE `page` com labels em inglês (Pages/Page) — alinhado ao seed V003 (migration V009 corrige bancos existentes com os labels em português).

## 0.6.4

### Patch Changes

- Fixes de layout/estilização: links de content-types na sidebar iguais aos demais; grid de formulários global (post-types, taxonomies e webhooks agora renderizam corretamente dentro das ilhas Solid); layout formulário-esquerda/tabela-direita em post-types e taxonomies com tabelas em card; checkbox de Active dos webhooks corrigido; seletor de tipo de campo (field-type-picker) estilizado; títulos duplicados removidos em /themes e /plugins; widgets do dashboard alinhados ao container dos cards; h3 duplicado removido em Settings → General.

## 0.6.3

### Patch Changes

- Modal agora se enquadra na viewport menos a barra preta e o rodapé (com folga), em vez de ser cortado por eles; altura máxima ajustável via CSS vars (--admin-bar-h / --admin-footer-h)

## 0.6.2

### Patch Changes

- Fix white bar below the black nav header: body padding-top was stacking on top of the viewport-propagated html padding (double 46px offset)

## 0.6.1

### Patch Changes

- Fix SSR crash "document is not defined" on Modal cleanup during server render
- Updated dependencies []:
  - @oktis-works/ui@0.5.6

## 0.6.0

### Minor Changes

- Unify admin page layouts to match /settings/custom-fields pattern
  
  ## Changes
  - Created shared `PageHeader` component with consistent layout (eyebrow, title, description, actions, toolbar)
  - Applied PageHeader to all settings pages, users, media, content, plugins, themes pages
  - Removed white background bar between header and sidebar by making main-content transparent
  - Moved content padding from .content-wrapper to .content for cleaner layout
  - All pages now follow the same visual pattern as /settings/custom-fields

## 0.5.5

### Patch Changes

- Fix "Missing refresh token" error on login in local development
  
  ## Problem
  When running OkCMS locally with `okcms start`, the admin (port 3011) and API (port 3000) run on different ports. The auth cookies (including refresh_token) were set with `SameSite=lax`, which blocks cookies on cross-origin fetch requests. This caused the refresh token to not be sent when the admin made API calls, resulting in "Missing refresh token" errors.
  
  ## Solution
  1. **Added Vite proxy to admin** (`apps/admin/astro.config.mjs`): In development, the admin now proxies `/api/*` requests to the API server. This makes admin and API same-origin (both on port 3011), allowing cookies to work with `SameSite=lax`.
  
  2. **Updated scaffold** (`packages/cli/src/scaffold.ts`): New projects now get a complete `.env` with all auth configuration variables:
     - `AUTH_COOKIE_DOMAIN`, `AUTH_COOKIE_SAMESITE`, `AUTH_COOKIE_SECURE`
     - `AUTH_COOKIE_ACCESS_MAXAGE`, `AUTH_COOKIE_REFRESH_MAXAGE`
     - `JWT_EXPIRES_IN=15m` (access token), `REFRESH_TOKEN_EXPIRES_IN=7d` (refresh token)
     - `BCRYPT_ROUNDS`, `AUTH_CSRF_*` settings
     - `ADMIN_API_PROXY_TARGET` for the Vite proxy
     - `PUBLIC_API_URL=/api` to use relative URLs via proxy
  
  3. **Fixed JWT expiry confusion** in template `env.example`: Was `JWT_EXPIRES_IN=7d` (wrong for access token), now correctly `JWT_EXPIRES_IN=15m` and `REFRESH_TOKEN_EXPIRES_IN=7d`.
  
  4. **Updated admin API client** (`apps/admin/src/lib/api.ts`): Supports relative `PUBLIC_API_URL` (e.g., `/api`) for proxy usage.
  
  ## For existing projects
  Add to `.env`:
  ```bash
  # Enable Vite proxy (simpler than lvh.me)
  PUBLIC_API_URL=/api
  ADMIN_API_PROXY_TARGET=http://localhost:3000
  # Ensure these are set:
  AUTH_COOKIE_SAMESITE=lax
  AUTH_COOKIE_SECURE=false
  JWT_EXPIRES_IN=15m
  REFRESH_TOKEN_EXPIRES_IN=7d
  ```
  Then restart with `okcms start`.
- Updated dependencies []:
  - @oktis-works/plugin-sdk@0.5.5
  - @oktis-works/types@0.5.5
  - @oktis-works/ui@0.5.5
  - @oktis-works/validation@0.5.5
