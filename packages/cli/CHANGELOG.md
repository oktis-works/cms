# @oktis-works/cms

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
