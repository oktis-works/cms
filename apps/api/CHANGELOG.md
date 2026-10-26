# @oktis-works/api

## 0.16.7

### Patch Changes

- Updated dependencies
  - @oktis-works/database@0.14.6
  - @oktis-works/core@0.15.4

## 0.16.6

### Patch Changes

- Updated dependencies
  - @oktis-works/database@0.14.5
  - @oktis-works/core@0.15.3

## 0.16.5

### Patch Changes

- Updated dependencies
  - @oktis-works/database@0.14.4
  - @oktis-works/core@0.15.2

## 0.16.4

### Patch Changes

- Complete the provider-aware migration lifecycle, CLI database workflows, generated MySQL and MariaDB assets, audit safeguards, and GPL-2.0-or-later licensing metadata.
- Updated dependencies
  - @oktis-works/auth@0.8.3
  - @oktis-works/config@0.6.5
  - @oktis-works/core@0.15.1
  - @oktis-works/database@0.14.3
  - @oktis-works/types@0.9.4
  - @oktis-works/validation@0.8.1

## 0.16.3

### Patch Changes

- Unify standard and custom content fields across definitions, persistence, editing, validation, and theme delivery.
- Updated dependencies
  - @oktis-works/core@0.15.0
  - @oktis-works/database@0.14.2
  - @oktis-works/validation@0.8.0
  - @oktis-works/auth@0.8.2
  - @oktis-works/types@0.9.3

## 0.16.2

### Patch Changes

- Harden plugin registration, permissions, tenancy, lifecycle reconciliation, admin extension loading, and public rendering.
- Updated dependencies
  - @oktis-works/types@0.9.2
  - @oktis-works/core@0.14.2

## 0.16.1

### Patch Changes

- Fix theme lifecycle, preview, rendering, security, tenant scoping, configuration validation, SDK contracts, pagination, and runtime inheritance behavior.
- Updated dependencies
  - @oktis-works/core@0.14.1
  - @oktis-works/database@0.14.1
  - @oktis-works/types@0.9.1

## 0.16.0

### Minor Changes

- ### Features
  
  - **Phase 5 - Polish, Tests & Documentation**
    - **Unit Tests**: ThemeService coverage >90% (validation, inheritance, export/import)
    - **API Integration Tests**: Config validation, export/import, history, restore
    - **E2E Tests**: Playwright tests for full customizer flow (load → edit → preview → save → export → import → history restore)
    - **Visual Regression Tests**: Screenshots for customizer states
    - **Documentation**: Complete `THEME.md` with manifest.settings schema, all 21 field types, inheritance, conditional logic, tabs/groups, API endpoints, CLI
    - **Migration Guide**: `docs/THEME_MIGRATION.md` for legacy theme migration
    - **CHANGELOG**: Updated with all changes
  
  ### Testing
  
  - Unit tests for ThemeService validation, inheritance, export/import
  - API integration tests for config endpoints
  - Playwright E2E tests for full customizer flow
  - Visual regression tests with Chromatic/pixelmatch
  
  ### Documentation
  
  - `THEME.md` - Complete theme development guide
  - `docs/THEME_MIGRATION.md` - Legacy theme migration guide
  - Updated `CHANGELOG.md`

### Patch Changes

- Updated dependencies
  - @oktis-works/core@0.14.0
  - @oktis-works/auth@0.8.1

## 0.15.0

### Minor Changes

- ### Features
  
  - **Theme Config Export/Import**: Export theme config as JSON file, import with validation (merge/replace modes)
  - **Config History/Versioning**: Automatic history tracking via `theme_config_versions` table, with REST API for history and restore
  - **Permission `theme:customize`**: New granular permission for theme config operations (separate from `theme:update`)
  - **Audit Log**: Automatic history entries on config changes with user tracking
  - **Restore Defaults**: One-click reset to manifest defaults
  
  ### Database
  
  - New migration `V022__core__theme_config_history.sql` creates `theme_config_versions` table with RLS
  
  ### API
  
  - `GET /themes/:id/config/export` - Export config as downloadable JSON
  - `POST /themes/:id/config/import` - Import config with merge/replace modes
  - `GET /themes/:id/config/history` - Paginated config history
  - `POST /themes/:id/config/restore` - Restore specific version
  - `POST /themes/:id/config/restore-defaults` - Reset to manifest defaults
  
  ### Permissions
  
  - New `theme:customize` permission added to TENANT_ADMIN role
  - Config routes (`PATCH/GET/POST /themes/:id/config/*`) now require `theme:customize` instead of `theme:update`

### Patch Changes

- Updated dependencies
  - @oktis-works/core@0.13.0
  - @oktis-works/auth@0.8.0

## 0.14.6

### Patch Changes

- Updated dependencies
  - @oktis-works/core@0.12.0
  - @oktis-works/auth@0.7.10

## 0.14.5

### Patch Changes

- Updated dependencies
  - @oktis-works/database@0.14.0
  - @oktis-works/auth@0.7.9
  - @oktis-works/core@0.11.5

## 0.14.4

### Patch Changes

- Updated dependencies
  - @oktis-works/database@0.13.1
  - @oktis-works/core@0.11.4

## 0.14.3

### Patch Changes

- Updated dependencies
  - @oktis-works/database@0.13.0
  - @oktis-works/auth@0.7.8
  - @oktis-works/core@0.11.3

## 0.14.2

### Patch Changes

- Updated dependencies
  - @oktis-works/database@0.12.1
  - @oktis-works/core@0.11.2

## 0.14.1

### Patch Changes

- Updated dependencies
  - @oktis-works/core@0.11.1

## 0.13.7

### Patch Changes

- Updated dependencies
- Updated dependencies
  - @oktis-works/core@0.11.0
  - @oktis-works/database@0.12.0
  - @oktis-works/auth@0.7.7

## 0.13.6

### Patch Changes

- Updated dependencies [641e556]
  - @oktis-works/database@0.11.0
  - @oktis-works/auth@0.7.6
  - @oktis-works/core@0.10.3

## 0.13.5

### Patch Changes

- Updated dependencies [7df7caa]
  - @oktis-works/database@0.10.2
  - @oktis-works/core@0.10.2

## 0.13.4

### Patch Changes

- Updated dependencies
  - @oktis-works/database@0.10.1
  - @oktis-works/core@0.10.1

## 0.13.3

### Patch Changes

- Updated dependencies
  - @oktis-works/core@0.10.0
  - @oktis-works/database@0.10.0
  - @oktis-works/auth@0.7.5

## 0.13.2

### Patch Changes

- Updated dependencies
  - @oktis-works/core@0.9.0
  - @oktis-works/database@0.9.0
  - @oktis-works/auth@0.7.4

## 0.13.1

### Patch Changes

- Updated dependencies
  - @oktis-works/core@0.8.0
  - @oktis-works/auth@0.7.3

## 0.13.0

### Minor Changes

- 12d1963: New editor extension endpoints (parity E1–E8): GET /api/v1/plugins/extensions (merged manifest + runtime admin extension state with plugin namespacing and dedupe), GET /api/v1/blocks and GET /api/v1/patterns (editor-agnostic catalogs merging manifest declarations with runtime registrations — no tables, entries exist while plugins are active).

### Patch Changes

- Updated dependencies [12d1963]
- Updated dependencies [12d1963]
- Updated dependencies [12d1963]
- Updated dependencies
  - @oktis-works/core@0.7.0
  - @oktis-works/types@0.9.0
  - @oktis-works/validation@0.7.0
  - @oktis-works/database@0.8.0
  - @oktis-works/auth@0.7.2
  - @oktis-works/config@0.6.4

## 0.12.1

### Patch Changes

- Updated dependencies [562e5c1]
  - @oktis-works/core@0.6.1

## 0.12.0

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
  - @oktis-works/core@0.6.0
  - @oktis-works/types@0.8.0
  - @oktis-works/auth@0.7.1
  - @oktis-works/config@0.6.3
  - @oktis-works/database@0.7.1

## 0.11.0

### Minor Changes

- Fix version bump: release 0.15.0 instead of reusing 0.14.0 tag.

### Patch Changes

- Updated dependencies
  - @oktis-works/auth@0.7.0
  - @oktis-works/types@0.7.0
  - @oktis-works/database@0.7.0
  - @oktis-works/config@0.6.2
  - @oktis-works/core@0.5.15

## 0.10.0

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
  - @oktis-works/auth@0.6.0
  - @oktis-works/database@0.6.0
  - @oktis-works/config@0.6.1
  - @oktis-works/core@0.5.14

## 0.9.0

### Minor Changes

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

### Patch Changes

- Updated dependencies [3da0733]
  - @oktis-works/config@0.6.0
  - @oktis-works/auth@0.5.6
  - @oktis-works/core@0.5.13
  - @oktis-works/database@0.5.8

## 0.8.2

### Patch Changes

- Updated dependencies
  - @oktis-works/database@0.5.7
  - @oktis-works/core@0.5.12

## 0.8.1

### Patch Changes

- Updated dependencies
  - @oktis-works/validation@0.6.0
  - @oktis-works/core@0.5.11
  - @oktis-works/types@0.5.6

## 0.8.0

### Minor Changes

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
- Updated dependencies
- Updated dependencies
  - @oktis-works/core@0.5.10

## 0.7.3

### Patch Changes

- Updated dependencies [ce6aef8]
  - @oktis-works/core@0.5.9

## 0.7.2

### Patch Changes

- 2f2919f: - **Plugins no boot**: novo `bootstrapPlugins` — lê do banco os plugins habilitados (ACTIVATED/RUNNING), chama `register(registry)`, descarrega os desabilitados e isola falhas (plugin quebrado não derruba o boot nem dos outros nem do processo). `core.bootstrap()` chama `syncEnabledPlugins` e cobre API, web e worker num ponto só; ativar/desativar pela API sincroniza o processo na hora.
  - **Loader**: descobre o `manifest.json` gerado pelo scaffold (fallback atrás de `package.json` de pacotes npm).
  - **CLI**: comando `okcms prerender`/SSG removido por completo (comando, wizard, parser e docs do scaffold).
  - **Admin**: `AtGlanceWidget` sem versão de app — Storage vira stat próprio; removidos `lib/version.ts` e a chave i18n `dashboard.widgets.version`.
  - **Docs**: auditoria de promessas falsas em todos os `.md` do projeto e nos templates gerados — exemplo de plugin com hooks reais (`content:query`, `after_publish_content_post`), `plugin:manage/theme:manage --disable` descrito como estado local, `update/redeploy` sem assumir blue/green, SSR-only e "sandbox" não anunciado como isolamento de execução.
- Updated dependencies [2f2919f]
  - @oktis-works/core@0.5.8

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

## 0.7.0

### Minor Changes

- Bump to 0.8.0 for monorepo sync with CLI 0.8.0 (DB engine selection + container control).

## 0.6.0

### Minor Changes

- Bump to 0.7.0 for monorepo sync with CLI 0.7.0 (interactive wizard release).

## 0.5.6

### Patch Changes

- Updated dependencies []:
  - @oktis-works/core@0.5.6

## 0.5.5

### Patch Changes

- Updated dependencies []:
  - @oktis-works/config@0.5.5
  - @oktis-works/core@0.5.5
  - @oktis-works/auth@0.5.5
  - @oktis-works/database@0.5.5
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

## 0.2.0

### Patch Changes

- Updated dependencies []:
  - @oktis-works/auth@0.2.0
  - @oktis-works/config@0.2.0
  - @oktis-works/core@0.2.0
  - @oktis-works/database@0.2.0
  - @oktis-works/types@0.2.0

## 0.1.7

### Patch Changes

- Fases A–D do TODO: publisher real nas rotas de conteúdo (publish/unpublish com revisions + eventBus + cache), QueueProducer no core com degradação silenciosa (fila opcional), processamento real de mídia com sharp e build Docker real no worker, renderização real do site público (templates do tema + settings), design-system Solid no @oktis-works/ui (Button/Input/Select/Card/Badge/Modal/Toast/Table/Pagination) consumido pelo admin, fluxo de auth híbrido completo (tokens no body + cookies HttpOnly) e limpeza de legado (rota /me duplicada, stub de validação).
- Updated dependencies []:
  - @oktis-works/core@0.1.14
  - @oktis-works/auth@0.1.14
  - @oktis-works/config@0.1.14
  - @oktis-works/database@0.1.14
  - @oktis-works/types@0.1.14

## 0.1.6

### Patch Changes

- Segurança: tokens em cookies HttpOnly (não localStorage) + CSRF double-submit
  
  - Login/register/logout movidos para cookies HttpOnly + Secure + SameSite (configurável via AUTH_COOKIE_SAMESITE: strict|lax|none)
  - Cookie CSRF legível pelo JS (httpOnly: false) — double-submit header X-CSRF-Token === cookie
  - CSRF: clientes Bearer (API-first) isentos; sem Origin/Referer (curl/SDK/CI) isento; cross-port via TRUSTED_ORIGINS
  - Auto-refresh de access token via cookie refresh_token em 401
  - GET /auth/me para verificação de sessão (cookie HttpOnly)
  - Middleware auth aceita Bearer OU cookie access_token
  - Hono 4.0.0 → 4.13.12 (API oficial hono/cookie: setCookie/getCookie/deleteCookie)
  - admin: api-client com credentials: include, session guard via /me, zero localStorage
  - Tests: 486 passando; E2E API 33/33; Admin Playwright 16/16
- Updated dependencies []:
  - @oktis-works/config@0.1.13
  - @oktis-works/auth@0.1.13
  - @oktis-works/core@0.1.13
  - @oktis-works/database@0.1.13
  - @oktis-works/types@0.1.13

## 0.1.5

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
  - @oktis-works/auth@0.1.12
  - @oktis-works/core@0.1.12
  - @oktis-works/types@0.1.12
  - @oktis-works/config@0.1.12

## 0.1.4

### Patch Changes

- Log de start do admin com URL correta: `http://` no lugar de `https://` (o `@astrojs/node` calcula o protocolo com `server instanceof https.Server`, que sob Bun responde `true` até para `http.Server`) e sem a linha `network:` com IP interno de WSL. Deps internas publicadas como range `^X.Y.Z` em vez de pin exato — o consumidor resolve a versão atual via `bun update` sem cópias aninhadas stale (ex.: `api` preso em `database@0.1.3`) e dependentes não precisam ser republicados a cada patch.
- Updated dependencies []:
  - @oktis-works/validation@0.1.11
  - @oktis-works/core@0.1.11
  - @oktis-works/types@0.1.11
  - @oktis-works/auth@0.1.11
  - @oktis-works/config@0.1.11
  - @oktis-works/database@0.1.11

## 0.1.3

### Patch Changes

- Scaffold zero-config: `okcms init` agora gera o `package.json` do projeto com os apps do OkCMS (@oktis-works/api, admin, web) já como dependências na versão do CLI e instala tudo automaticamente (bun, com fallback para npm). `okcms update` passa a funcionar de imediato e o `okcms build` degrada com mensagem clara fora de workspaces (os apps vêm pré-compilados do npm).
- Updated dependencies []:
  - @oktis-works/validation@0.1.3
  - @oktis-works/core@0.1.3
  - @oktis-works/types@0.1.3
  - @oktis-works/auth@0.1.3
  - @oktis-works/config@0.1.3
  - @oktis-works/database@0.1.3
