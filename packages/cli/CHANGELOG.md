# @oktis-works/cms

## 0.9.4

### Patch Changes

- Updated dependencies
  - @oktis-works/auth@0.6.0
  - @oktis-works/database@0.6.0
  - @oktis-works/config@0.6.1
  - @oktis-works/core@0.5.14
  - @oktis-works/theme-runtime@0.6.1

## 0.9.3

### Patch Changes

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
- Updated dependencies [3da0733]
  - @oktis-works/config@0.6.0
  - @oktis-works/auth@0.5.6
  - @oktis-works/core@0.5.13
  - @oktis-works/database@0.5.8

## 0.9.2

### Patch Changes

- Updated dependencies
  - @oktis-works/database@0.5.7
  - @oktis-works/core@0.5.12

## 0.9.1

### Patch Changes

- Updated dependencies
  - @oktis-works/validation@0.6.0
  - @oktis-works/core@0.5.11

## 0.9.0

### Minor Changes

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

- fix(theme-build): `theme:build` não apaga mais o `dist/theme.css` de temas sem entry
  
  Para `engine: css` sem entry convencional (ex.: o tema default, que tem o CSS
  direto em `dist/theme.css`), `buildThemeStyles` devolvia `css: ""` e
  `buildThemeStylesOnDisk` gravava por cima — truncando o stylesheet servido em
  0 bytes, silenciosamente. Agora `entry` nulo vira no-op seguro: o artefato é
  preservado e o comando reporta `skipped: true` com warning orientando o autor.
  
  Coberto por `theme-build.test.ts` (caso entry-null + caso scss com entry).
- Updated dependencies
- Updated dependencies
- Updated dependencies
- Updated dependencies
  - @oktis-works/core@0.5.10
  - @oktis-works/theme-runtime@0.6.0

## 0.8.14

### Patch Changes

- ce6aef8: - **Unificação do manifesto de tema — `theme.json` é o canônico único**: fim da redundância `manifest.json`/`theme.json` (o tema default nascia com o nome legado enquanto `theme:create` já gerava o novo).
    - `okcms init` agora grava `themes/default/theme.json` (antes: `manifest.json`).
    - **Migração automática nos projetos existentes**: os entry points do CLI — `okcms update`, `okcms redeploy` (execução real, nunca `--dry-run`), `okcms dev`, `okcms start`, `okcms theme:build` e `okcms theme:manage` — renomeiam `manifest.json` → `theme.json` onde o legado ainda existe (novo `theme-migrate.ts`: idempotente, nunca sobrescreve um `theme.json` já presente, sem permissão de escrita = tenta na próxima execução).
    - **Fallbacks removidos dos leitores**: `themeManifestPath` (theme-build), `theme:manage --info`, `ThemeLoader` (theme-runtime) e `ThemeService.syncFromDirectory` (core) leem só `theme.json`.
    - `manifest.json` continua canônico apenas para **plugins** (caso legítimo de pacotes npm) — fora deste escopo.
- Updated dependencies [ce6aef8]
  - @oktis-works/theme-runtime@0.5.8
  - @oktis-works/core@0.5.9

## 0.8.13

### Patch Changes

- 2f2919f: - **Plugins no boot**: novo `bootstrapPlugins` — lê do banco os plugins habilitados (ACTIVATED/RUNNING), chama `register(registry)`, descarrega os desabilitados e isola falhas (plugin quebrado não derruba o boot nem dos outros nem do processo). `core.bootstrap()` chama `syncEnabledPlugins` e cobre API, web e worker num ponto só; ativar/desativar pela API sincroniza o processo na hora.
  - **Loader**: descobre o `manifest.json` gerado pelo scaffold (fallback atrás de `package.json` de pacotes npm).
  - **CLI**: comando `okcms prerender`/SSG removido por completo (comando, wizard, parser e docs do scaffold).
  - **Admin**: `AtGlanceWidget` sem versão de app — Storage vira stat próprio; removidos `lib/version.ts` e a chave i18n `dashboard.widgets.version`.
  - **Docs**: auditoria de promessas falsas em todos os `.md` do projeto e nos templates gerados — exemplo de plugin com hooks reais (`content:query`, `after_publish_content_post`), `plugin:manage/theme:manage --disable` descrito como estado local, `update/redeploy` sem assumir blue/green, SSR-only e "sandbox" não anunciado como isolamento de execução.
- Updated dependencies [2f2919f]
  - @oktis-works/core@0.5.8
  - @oktis-works/theme-runtime@0.5.7

## 0.8.12

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

## 0.8.11

### Patch Changes

- 1951e81: Fix crítico: `okcms dev` falhava com "required variable DB_PASSWORD is missing a value" mesmo com `DB_PASSWORD` preenchido na `.env` da raiz.
  
  - CAUSA: o bun carrega o `.env` do cwd no START de cada processo e não sobrescreve o que já está definido. O menu `okcms` nasce com o snapshot do template do `okcms init` (`DB_PASSWORD=` vazio); a entrevista grava o valor só no ARQUIVO; o `okcms dev` spawnado herda `DB_PASSWORD=''` — e a env vazia do processo vence o `--env-file` na interpolação do docker compose (`''` conta como ausente no `${DB_PASSWORD:?...}`).
  - FIX (3 camadas):
    - `runCompose` agora spawna o docker com `projectProcessEnv(cwd)`: valores não-vazios da `.env` da raiz sobrescrevem o snapshot do processo (todas as chamadas — infra, lanes, app);
    - `syncProcessEnv`: quem grava o `.env` (entrevista do wizard, `okcms config`) sincroniza `process.env`, e o `okcms dev` cura o processo a partir do arquivo antes de subir infra/migrations (sem isso, as migrations conectariam com o placeholder vazio enquanto o compose criava o banco com o valor do arquivo);
    - valor vazio no arquivo não toca o processo — exportação de shell/CI segue valendo.

## 0.8.10

### Patch Changes

- Fix crítico: docker compose não encontra DB_PASSWORD no .env.
  
  - CAUSA: docker compose lê .env do DIRETÓRIO DO COMPOSE FILE (ex:
    infrastructure/compose/), não do cwd (raiz do projeto). Se o .env tem
    DB_PASSWORD preenchido, o compose não o vê e falha na interpolação.
  - FIX: todas as chamadas compose (infraCompose, laneCompose, appCompose)
    agora passam --env-file <cwd>/.env explicitamente.
  - Verificado: sem --env-file → "required variable DB_PASSWORD is missing";
    com --env-file → POSTGRES_PASSWORD corretamente interpolado.

## 0.8.9

### Patch Changes

- Wizard: entrevista .env reduzida aos campos ESSENCIAIS.
  
  - Nova prop `essential` em EnvField — só campos essenciais entram na entrevista
  - Essenciais: DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD, DATABASE_URL, JWT_SECRET, REDIS_HOST
  - Resto (rate limit, cache TTL, storage S3, worker concurrency, deploy, tema): defaults seguros, configurável com `okcms config`
  - Entrevista cai de ~45 prompts para ~9 (engine select + mode select + 5 DB + JWT_SECRET + REDIS_HOST)
  - Dica no resumo: "Configurações avançadas: okcms config"
  - Navegação linear com 'b' em todos os passos (engine ← mode ← campos ← outras seções)
  - Testes atualizados para o novo fluxo (DB_HOST no lugar de PORT)

## 0.8.8

### Patch Changes

- Fix: DB_ENGINE não é mais perguntado duas vezes na entrevista .env.
  
  - O engine select (PostgreSQL/MySQL/MariaDB) já define DB_ENGINE — o campo
    regular DB_ENGINE foi removido da lista de passos (era perguntado como
    [1/8] logo após o select, redundante)
  - Alinhado no helper de teste

## 0.8.7

### Patch Changes

- Fix: conteúdo dos selects não multiplica mais com setas rápidas.
  
  - `SelectOptions.fullClear` — usa ESC[2J+ESC[H (limpa tela inteira) em cada repaint do navigate
  - Aplicado nos selects da entrevista .env (engine, mode, skip) — terminais WSL/Windows que não processam ESC[nA rápido o suficiente agora renderizam limpo
  - Demais selects do CLI (menu, fluxos, catálogo) mantêm o comportamento anterior (ESC[nA+ESC[0J)

## 0.8.6

### Patch Changes

- Wizard: navegação linear real na entrevista .env (b = passo anterior em qualquer ponto).
  
  - Lista plana de passos (engine → mode → campo DB → campos de cada seção na ordem ENV_SECTIONS)
  - 'b' em QUALQUER passo volta ao anterior: campo DB → mode select → engine select → seção anterior
  - Engine e mode selects ganham opção "← Voltar" — selecionar o engine errado não te prende mais
  - __db_mode (marcador interno) removido do .env antes de gravar — não vaza pro docker compose
  - Quando `when` muda (ex: troca de engine), a lista de passos é reconstruída mantendo a posição

## 0.8.5

### Patch Changes

- Wizard: navegação limpa campo a campo (Back/Next) na entrevista .env.
  
  - Cada campo limpa a tela antes de mostrar (ANSI clearScreen) — zero lixo no terminal
  - Tecla 'b' volta ao campo anterior para re-editar (prompt.askWithBack / prompt.secretWithBack)
  - Progress indicator [n/total] + dica "Enter = manter · b = voltar · Ctrl+C = cancelar tudo"
  - Fix crítico: loop infinito no select de modo de conexão (continue dentro do if database re-executava a seção)
  - Fix: helper de teste alinhado à ordem real de ENV_SECTIONS (app → database → ...)

## 0.8.4

### Patch Changes

- Wizard: navegação limpa entre campos (Back/Next) com tela limpa.
  
  - Cada campo da entrevista `.env` agora limpa a tela antes de mostrar (clearScreen)
  - Navegação com tecla 'b' (Back) para voltar ao campo anterior e re-editar
  - Dica visual: "Enter = manter · b = voltar · Ctrl+C = cancelar tudo"
  - Tela limpa entre seções e campos - sem lixo no terminal
  - Funciona em todos os campos da entrevista `.env` (47 campos)
  - Tela limpa também nos fluxos guiados (init, dev, deploy, update)
  - Tela limpa no menu de falha (doctor/retry/menu)

## 0.8.3

### Patch Changes

- Wizard env interview: clean screen between sections.
  
  - `runEnvInterview` clears screen on entry
  - Each section (Application, Database, Redis, Auth, Storage, Worker, Cache, Ports, Theme, Deploy) clears screen before showing fields
  - Clean navigation through all 10 sections of the .env interview

## 0.8.2

### Patch Changes

- Wizard flows: clean screen between all flow steps.
  
  - `flowInit`, `flowDev`, `flowDeploy` (blue-green/simple/pm2), `flowUpdate` now clear screen on entry
  - `flowsMenu` clears screen when opened
  - `envStep`, `precheckDeploy`, `failureMenu` clear screen before prompting
  - Complete clean navigation in guided flows — no terminal pollution between steps

## 0.8.1

### Patch Changes

- Wizard navigation improvements:
  
  - Clear screen between menu transitions (`clearScreen` using ANSI escape codes) — no more terminal pollution when navigating between menus
  - Sub-menus (flows, commands, env, status) now clear screen on entry
  - Status screen (`okcms menu` → status) now waits for Enter before returning to main menu
  - Fixed: `DATABASE_URL` no longer appears in individual DB connection mode (was incorrectly shown even after selecting "Individual values")
  - Added internal `__db_mode` marker to track connection mode and filter fields correctly

## 0.8.0

### Minor Changes

- Wizard: DB engine selection (PostgreSQL/MySQL/MariaDB) and individual container control.
  
  - New `DB_ENGINE` field (postgres/mysql/mariadb) with dynamic defaults for port and compose service
  - Database section now asks engine first, then connection mode (DATABASE_URL vs individual fields)
  - `runDev` and `ensureRedisOnHost` now ask individually for DB container and Redis container
  - Support for MySQL 8 and MariaDB 11 compose services with proper healthchecks
  - `waitForDatabaseReady` replaces `waitForPostgresReady` with engine-aware logic (pg_isready for Postgres, mysqladmin ping for MySQL/MariaDB)
  - Error messages and prompts are engine-agnostic

## 0.7.3

### Patch Changes

- Fix: wizard-i18n Catalog interface missing new DB mode keys (envDbModeChoose, envDbModeConnectionString, etc.) — caused typecheck failure in CI.

## 0.7.2

### Patch Changes

- Wizard: seção de banco agora pergunta o modo de conexão antes dos campos.
  
  - **Connection string (DATABASE_URL)**: usuário informa a URL única; `DB_PASSWORD` é gerado automaticamente para a infra local (o compose precisa dele para `POSTGRES_PASSWORD`).
  - **Valores individuais (DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD)**: fluxo original campo a campo.
  
  Corrige o erro "required variable DB_PASSWORD is missing a value" ao subir a infra quando o usuário escolhia connection string.

## 0.7.1

### Patch Changes

- Fix: validação de `PUBLIC_API_URL` aceita agora caminhos relativos (`/api`, `/api/v1`) além de URLs completas (`https://...`). O default do scaffold `/api` era rejeitado incorretamente.

## 0.7.0

### Minor Changes

- Wizard interativo completo: rodar `okcms` sem argumentos num TTY abre o menu guiado com todos os comandos do CLI (agrupados por área, destrutivos marcados com ⚠ e confirmação extra, cada execução imprimindo primeiro o espelho `$ okcms …`), 5 fluxos guiados (`init`, `dev`, `deploy` blue-green/simple/pm2, `update`) com pré-checagens de projeto/docker/portas e menu de falha (doctor · retry · menu), entrevista dos 47 campos do `.env` (explicação por campo, valor atual com segredos mascarados, Enter mantém, nada gravado até a confirmação única do resumo, Ctrl+C descarta o plano), status adaptativo (docker · infra · apps · `.env`) com sugestão do próximo passo, troca de idioma en/pt em sessão (sintaxe de comandos/flags nunca traduzida) e Ctrl+C durante processos longos retornando ao menu em vez de matar o assistente. Fora de TTY o comando puro continua imprimindo o help estático (automação intacta) e `okcms menu` é o alias explícito. Corrigido loop infinito de `secret`/`ask` do `prompt.ts` em EOF (Ctrl+D ou pipe fechado).

## 0.6.5

### Patch Changes

- `okcms dev` fix round after real-world usage: (1) waits for Postgres to accept connections (`pg_isready`, 60s timeout) before schema/seed/migrations — kills the "the database system is starting up" race on a fresh volume; (2) makes Redis reachable from host processes: the infra compose keeps Redis network-only for production, so the dev writes a loopback-only override in `.data/dev-infra.override.yml` (gitignored, never read by `okcms deploy`; named volume untouched) and recreates just the redis service — kills the `ECONNREFUSED 127.0.0.1:6379` spam from api/worker; (3) prints the final URLs (API · Admin · Web on localhost) like `okcms start`, and surfaces an actionable hint when the database is unreachable instead of a raw stack trace.

## 0.6.4

### Patch Changes

- Novo comando `okcms dev`: setup + run de desenvolvimento num comando só — completa o `.env` (gera segredos que faltam, nunca sobrescreve valores existentes, respeita `DATABASE_URL`), sobe a infra do projeto via compose (a mesma que os alvos de `okcms deploy` reutilizam; sem Docker avisa e segue sem gravar workarounds), aplica schema + seed + migrations, cria o primeiro admin `SUPER_ADMIN` quando o banco está vazio (mesmo caminho do `user:create`) e sobe os apps (`start`). Reexecutável (depois de `docker compose down -v` recria tudo), recusa rodar em container (host-only, `--force` é o escape), exige `--yes` fora de TTY com `--email/--name/--password` para o primeiro usuário, e lembra no fim o ponto de colisão com o deploy: `okcms stop` antes de `okcms deploy` (os processos do dev ocupam as portas dos containers). Flags: `--yes`, `--skip-start`, `--no-infra`, `--email`, `--name`, `--password`, `--force`. README (raiz + gerado, EN/PT) documenta o comando e o caminho dev → deploy.

## 0.6.3

### Patch Changes

- Docs atualizados: o README do projeto (PT/EN) descreve agora o assistente `okcms update` por etapa (y/n em pacotes → migrations → deploy) e as migrations embutidas no pacote sincronizadas em `./migrations` sem destruir; `--mode download` documentado como pacotes + sync de migrations. THEME.md (PT/EN): exemplo de template corrigido — `{{this.title}}`/`{{this.excerpt}}` não existem no engine; a sintaxe real é `{{title}}`/`{{excerpt}}` (o `{{#each}}` espalha o item no contexto).

## 0.6.2

### Patch Changes

- `okcms update` simplificado com assistente sim/não por etapa: atualizar pacotes `@oktis-works/*` no host? baixar migrations pendentes para `./migrations`? fazer o deploy agora? — cada "não" pula a etapa. O pacote agora embute todas as `migrations/*.sql` do repositório (copiadas no build) e as sincroniza com `./migrations` do projeto de forma não destrutiva: só copia o que falta, pula idênticas e mantém o arquivo local diante de conflito (reportando-o). `--mode deploy` (automação) sincroniza as migrations em silêncio antes do pipeline — o `db:migrate` lê exatamente essa pasta.

## 0.6.1

### Patch Changes

- Updated dependencies []:
  - @oktis-works/core@0.5.6

## 0.6.0

### Minor Changes

- Fix scaffold .env template with complete auth configuration
  
  ## Changes
  - Added all missing auth config vars to scaffold `.env`: `AUTH_COOKIE_*`, `JWT_EXPIRES_IN=15m`, `REFRESH_TOKEN_EXPIRES_IN=7d`, `BCRYPT_ROUNDS`, `AUTH_CSRF_*`
  - Added Vite proxy support via `ADMIN_API_PROXY_TARGET` and `PUBLIC_API_URL=/api`
  - Fixed JWT expiry confusion (was 7d for access token, now 15m)
  - Enables cross-port cookie sharing in local dev without lvh.me

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
  - @oktis-works/config@0.5.5
  - @oktis-works/core@0.5.5
  - @oktis-works/auth@0.5.5
  - @oktis-works/database@0.5.5
  - @oktis-works/theme-runtime@0.5.5
  - @oktis-works/validation@0.5.5

## 0.4.22

### Patch Changes

- Updated the Bun workspace lockfile so frozen installs work in the npm publishing workflow.

## 0.4.21

### Minor Changes

- Replaced Operations with audit Logs and configurable log retention.
- Added a dedicated Webhooks manager with multi-event selection and configurable authentication.
- Removed unused Events and Deployments admin API routes from the pre-release surface.

## 0.4.20

### Minor Changes

- Replaced the generic Content page with per-content-type navigation and routes.
- Added singleton content types, editable core types, and Lucide-configurable sidebar icons.

## 0.4.19

### Minor Changes

- Added WordPress-style content navigation with dynamic post type links, taxonomy dropdowns and taxonomy term management.
- Reworked content creation and editing into a classic editor workspace with a rich-text canvas, publish panel and contextual fields.
- Settings navigation is now collapsible, and the admin footer identifies Oktis Works with the CMS repository link.

## 0.4.18

### Minor Changes

- `okcms init` now generates the development CSRF origin and auth-cookie settings, and installs the CLI as a local project binary.
- Redesigned CLI output around the OKCMS identity: grouped command map, command-level help, quick-start guidance, and consistent error messages.
- Admin sidebar and language selector now react immediately to locale changes; dashboard widget spacing and the Settings icon were refined.

## 0.3.3

### Minor Changes

- `okcms init` asks whether to install the project dependencies right after the language prompt (same arrow-key menu; `--no-install` skips for CI/scripts) and installs with a live loader: bun detection with npm fallback, animated spinner and each package's real version as it lands (streamed from bun, reconciled from `node_modules` for npm)
- Redesigned post-init summary: compact English output — numbered quick start (`cd` + `Read README.md to get started`) plus DEV and PROD command sections, never wider than 80 columns

## 0.3.2

### Patch Changes

- Docker build hardening: deterministic production install (single `bun install --production --frozen-lockfile`, no fallbacks) and expanded `.dockerignore` for a leaner, more reproducible image build

## 0.3.1

### Patch Changes

- Fix @oktis-works/admin missing bin/admin.js entry point for standalone Astro server

## 0.3.0

### Minor Changes

- Interactive everywhere: every `okcms` menu is navigated with ↑/↓ and confirmed with
  Enter (native arrow-key prompts, zero dependencies), all terminal output is English
  and the wording is shorter and plainer.
- New deploy target — **simple containers behind the nginx proxy** (`docker-compose.app.yml`,
  project `okcms-app`, no lanes/green/swap) — side by side with blue/green lanes and PM2 in
  `okcms deploy`, `okcms update --mode deploy` and `okcms redeploy`.
- The target is asked on every deploy/update/redeploy and remembered in
  `.deploy/state.json` (plus `--target blue-green|simple|pm2` to skip the menu).
- `okcms deploy` (first deploy) no longer exposes `--no-cache` / `--remove-orphans` —
  those belong to `redeploy` and `update --mode deploy`.
- `okcms init` asks for the project directory when none is given and prints a shorter,
  aligned summary.

## 0.2.1

### Minor Changes

- Histórico/rollback unificado, comando deploy (Docker/PM2), docs auto-atualizadas no update/deploy
## 0.2.0

### Minor Changes

- F0–F4: deploy Docker blue/green, wizards da CLI, redeploy de extensões e documentação bilíngue
  
  - **F0/F1** — CLI de zero dependências com prompt próprio (menu numerado,
    confirmação, input com validação e segredo sem eco) e guardas: a CLI recusa
    rodar dentro de container e nunca monta `docker.sock`.
  - **F1** — `.env` com schema validado (`env-schema`), wizard interativo do
    `okcms config` (seções, `--list`, `--set`, `--section`, `--show-secrets`)
    e editor de `.env` que preserva comentários e ordem das linhas.
  - **F2** — assets de deploy canônicos dentro da CLI (Dockerfile único com os
    4 entrypoints, composes de infra e de lanes, template do nginx) espelhados
    em `infrastructure/**` por `scripts/sync-infrastructure.ts`, com teste de
    sincronia byte a byte.
  - **F3** — `okcms update` com wizard: **baixar pacotes** (default sem TTY, o
    `-i` clássico não muda) ou **deploy blue/green** (`--mode deploy`) — build,
    migrations no host antes do tráfego, healthcheck, swap do proxy via
    `nginx -s reload`, drenagem do worker e rollback.
  - **F4** — `okcms redeploy` para instalar plugin/tema (stage do SQL do plugin
    em `migrations/`, build do `dist/theme.css` de todo tema e novo deploy),
    `okcms doctor` com checagens de docker/compose/lane/proxy e `theme:build`
    passando a usar o mesmo pipeline de build de tema.
  - **Docs** — `README` e todos os guias de `docs/` em inglês e português
    (`*.pt-BR.md`), e `okcms init --lang en|pt` escolhendo a língua das docs
    geradas no projeto (menu com TTY, default inglês e `--lang` em CI).

### Patch Changes

- Updated dependencies []:
  - @oktis-works/auth@0.2.0
  - @oktis-works/config@0.2.0
  - @oktis-works/core@0.2.0
  - @oktis-works/database@0.2.0
  - @oktis-works/theme-runtime@0.2.0

## 0.1.14

### Patch Changes

- Updated dependencies []:
  - @oktis-works/core@0.1.14
  - @oktis-works/auth@0.1.14
  - @oktis-works/config@0.1.14
  - @oktis-works/database@0.1.14
  - @oktis-works/theme-runtime@0.1.14

## 0.1.13

### Patch Changes

- Updated dependencies []:
  - @oktis-works/config@0.1.13
  - @oktis-works/auth@0.1.13
  - @oktis-works/core@0.1.13
  - @oktis-works/database@0.1.13
  - @oktis-works/theme-runtime@0.1.13

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
  - @oktis-works/auth@0.1.12
  - @oktis-works/core@0.1.12
  - @oktis-works/config@0.1.12
  - @oktis-works/theme-runtime@0.1.12

## 0.1.11

### Patch Changes

- Log de start do admin com URL correta: `http://` no lugar de `https://` (o `@astrojs/node` calcula o protocolo com `server instanceof https.Server`, que sob Bun responde `true` até para `http.Server`) e sem a linha `network:` com IP interno de WSL. Deps internas publicadas como range `^X.Y.Z` em vez de pin exato — o consumidor resolve a versão atual via `bun update` sem cópias aninhadas stale (ex.: `api` preso em `database@0.1.3`) e dependentes não precisam ser republicados a cada patch.
- Updated dependencies []:
  - @oktis-works/validation@0.1.11
  - @oktis-works/core@0.1.11
  - @oktis-works/config@0.1.11
  - @oktis-works/database@0.1.11
  - @oktis-works/theme-runtime@0.1.11

## 0.1.10

### Patch Changes

- Updated dependencies []:
  - @oktis-works/database@0.1.10
  - @oktis-works/core@0.1.10
  - @oktis-works/config@0.1.10
  - @oktis-works/theme-runtime@0.1.10

## 0.1.9

### Patch Changes

- Corrige `okcms db:migrate` em banco fresco (erro `relation "migrations" does not exist`):
  
  - `ensureCoreSchema` (novo em `@oktis-works/database`): aplica o schema core **uma única vez**, detectado via `to_regclass` — o schema tem `CREATE POLICY` (não idempotente) e a tabela `migrations` tem FK para `tenants`, ou seja, num banco novo nada existia;
  - `resolveTenantId` (novo): traduz o `--tenant` (slug) para o UUID real de `tenants.slug`, criando o tenant `default` na primeira vez — antes o runner recebia a string `"default"` e quebraria com `invalid input syntax for type uuid`;
  - CLI: novo `prepareDb` (init + schema + tenant) nos comandos `db:migrate`, `db:rollback` e `db:status`;
  - NOTICEs 42701 do Postgres (colunas redundantes do próprio schema) suprimidos no bootstrap via `client_min_messages = warning`;
  - testes: `bootstrap.test.ts` com 7 cenários de banco fresco — 411 no total.
- Updated dependencies []:
  - @oktis-works/database@0.1.9
  - @oktis-works/validation@0.1.9
  - @oktis-works/core@0.1.9
  - @oktis-works/config@0.1.9
  - @oktis-works/theme-runtime@0.1.9

## 0.1.8

### Patch Changes

- Scaffold executável sem CLI global (corrige `okcms: command not found`):
  
  - `package.json` gerado ganha `scripts` (start, stop, status, doctor, migrate, backup) — npm/bun injetam `node_modules/.bin` no PATH, então `bun run migrate` / `npm run start` funcionam logo após o init;
  - next-steps do `init` imprime `npx okcms db:migrate` / `npx okcms start` / `npx okcms --help` (com alternativa `bun run`);
  - README: callout explicando a CLI local (npx/bunx + atalhos + `bun add -g` opcional), quickstart e blocos comandos com prefixo `npx`, aviso na tabela de comandos;
  - PLUGIN.md e THEME.md: blocos com `npx` + nota de CLI global;
  - testes: scripts do manifest, docs com `npx` e output do next-steps (404 no total).
- Updated dependencies []:
  - @oktis-works/validation@0.1.8
  - @oktis-works/core@0.1.8
  - @oktis-works/config@0.1.8
  - @oktis-works/database@0.1.8
  - @oktis-works/theme-runtime@0.1.8

## 0.1.7

### Patch Changes

- README do scaffold ganha seção **Produção** com os dois caminhos: pm2 (ecosystem.config.js com um processo por app, `pm2 startup/save/reload/logs`, worker com `WORKER_MODE=pm2` nativo) e Docker imutável (build do `apps/api/Dockerfile`, atualização/rollback por tag, migrate como passo de deploy), além de checklist de produção (NODE_ENV, JWT_SECRET, TLS, versões fixas, backup, Redis real, doctor).
- Updated dependencies []:
  - @oktis-works/validation@0.1.7
  - @oktis-works/core@0.1.7
  - @oktis-works/config@0.1.7
  - @oktis-works/database@0.1.7
  - @oktis-works/theme-runtime@0.1.7

## 0.1.6

### Patch Changes

- Scaffold gera documentação para o usuário final: `README.md` (visão do sistema, uso local e Docker, tabela de comandos, banco e conexão), `PLUGIN.md` (guia de desenvolvimento de plugins: manifest, hooks, fluxo create/instal/gestão, publicação) e `THEME.md` (temas: templates, engines css/scss/tailwind, build com isolamento, ativação). Arquivos não são sobrescritos em re-init.
- Updated dependencies []:
  - @oktis-works/validation@0.1.6
  - @oktis-works/core@0.1.6
  - @oktis-works/config@0.1.6
  - @oktis-works/database@0.1.6
  - @oktis-works/theme-runtime@0.1.6

## 0.1.5

### Patch Changes

- Scaffold para dev local completo: `@oktis-works/worker` nas dependências (filas/jobs) e `@oktis-works/cms` nas devDependencies (CLI fixada no projeto). `okcms start` agora sobe o worker junto (api + admin + web + worker; flag `--worker`/`-W`). Correção: o range das dependências passa a ser `^MAIOR.MENOR.0` em vez de `^versão-exata-do-CLI` — com apps independentes no changesets, a range exata quebrava o `install` com ETARGET quando CLI e apps não eram publicados juntos (caso do 0.1.4).
- Updated dependencies []:
  - @oktis-works/validation@0.1.5
  - @oktis-works/core@0.1.5
  - @oktis-works/config@0.1.5
  - @oktis-works/database@0.1.5
  - @oktis-works/theme-runtime@0.1.5

## 0.1.4

### Patch Changes

- Conexão com o banco com dois formatos à escolha do usuário: `DATABASE_URL` (tem precedência) ou variáveis separadas `DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD`. `.env` é a fonte única de conexão — `okcms.config.json` deixou de ter bloco `database` (mantém só estrutura: nome, ports, storage, dirs). `okcms doctor` aceita os dois formatos (check `database` + `db-tcp`, agora também `mysql://`).
- Updated dependencies []:
  - @oktis-works/config@0.1.4
  - @oktis-works/validation@0.1.4
  - @oktis-works/core@0.1.4
  - @oktis-works/database@0.1.4
  - @oktis-works/theme-runtime@0.1.4

## 0.1.3

### Patch Changes

- Scaffold zero-config: `okcms init` agora gera o `package.json` do projeto com os apps do OkCMS (@oktis-works/api, admin, web) já como dependências na versão do CLI e instala tudo automaticamente (bun, com fallback para npm). `okcms update` passa a funcionar de imediato e o `okcms build` degrada com mensagem clara fora de workspaces (os apps vêm pré-compilados do npm).
- Updated dependencies []:
  - @oktis-works/validation@0.1.3
  - @oktis-works/core@0.1.3
  - @oktis-works/config@0.1.3
  - @oktis-works/database@0.1.3
  - @oktis-works/theme-runtime@0.1.3
