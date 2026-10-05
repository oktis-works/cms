# @oktis-works/cms

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
