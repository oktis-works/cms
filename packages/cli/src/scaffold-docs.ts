// @oktis-works/cms - Documentação gerada no scaffold do projeto
// README.md (uso local/Docker + visão do sistema), PLUGIN.md e THEME.md
// (guias de desenvolvimento de extensões). Só escreve se o arquivo não existir.
//
// O exemplo de manifest usa o CMS_VERSION real: é o MESMO valor que o
// `okcms plugin:create`/`theme:create` grava em `compatibility.okcms`, então
// o doc nunca fica desatualizado em relação ao scaffold.
//
// Cada documento existe em duas línguas (en/pt), mas o ARQUIVO gerado tem
// sempre o mesmo nome — a língua é escolhida no `okcms init` (prompt com TTY,
// `--lang en|pt` sem TTY) e não muda o path. No repositório, os guias derivados
// (docs/plugin-development*.md) existem nos dois nomes, com banner de idioma.

import { CMS_VERSION } from '@oktis-works/validation';

/** Língua da documentação gerada no scaffold. */
export type DocsLang = 'en' | 'pt';

/** Línguas suportadas (ordem = ordem do menu do init). */
export const DOCS_LANGS: DocsLang[] = ['en', 'pt'];

/**
 * Default: inglês — é o que o Enter do prompt escolhe e o único valor em
 * modo não-interativo (CI/scripts), onde o prompt nunca aparece.
 */
export const DEFAULT_DOCS_LANG: DocsLang = 'en';

/**
 * Normaliza o valor de `--lang`. Devolve `null` para valor desconhecido (ou
 * vazio): o chamador decide entre erro (flag explícita) e default (flag ausente).
 */
export function parseDocsLang(value: string | undefined | null): DocsLang | null {
  if (value === undefined || value === null) return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === '') return null;
  if (['en', 'en-us', 'en-gb', 'english', 'ingles', 'inglês'].includes(normalized)) {
    return 'en';
  }
  if (['pt', 'pt-br', 'ptb', 'br', 'portuguese', 'portugues', 'português'].includes(normalized)) {
    return 'pt';
  }
  return null;
}

/** Rótulo legível da língua (mensagens da CLI). */
export function docsLangLabel(lang: DocsLang): string {
  return lang === 'pt' ? 'português' : 'inglês';
}

/** README.md do projeto scaffoldado — versão em português. */
function projectReadmePt(projectName: string): string {
  return `# ${projectName}

Projeto OkCMS criado com \`okcms init\`. Este guia explica o sistema e como
rodar em desenvolvimento local e com Docker.

## O que é o OkCMS

CMS API-first, multi-tenant e extensível. Quatro apps + uma CLI:

| App | Pacote | Função |
|---|---|---|
| **API** | \`@oktis-works/api\` | Servidor REST (Hono) em \`/api/v1\`: conteúdo, auth, mídia, plugins |
| **Admin** | \`@oktis-works/admin\` | Painel de administração (Astro + SolidJS) |
| **Web** | \`@oktis-works/web\` | Site público (Astro) |
| **Worker** | \`@oktis-works/worker\` | Filas/jobs em background (bullmq): publicação, mídia, webhooks, cache |
| **CLI** | \`@oktis-works/cms\` | \`okcms\` — init, start, banco, extensões, update |

- **Banco:** PostgreSQL (Row-Level Security, multi-tenant)
- **Cache e filas:** Redis
- **Extensões:** [plugins](./PLUGIN.md) (hooks/filters no runtime) e [temas](./THEME.md) (templates + estilos isolados)

## Estrutura do projeto

| Caminho | O que é |
|---|---|
| \`okcms.config.json\` | Estrutura: nome, ports, storage, dirs, tema ativo. **Sem credenciais de banco.** |
| \`.env\` | **Fonte única de conexão**: banco (\`DB_*\` ou \`DATABASE_URL\`), Redis, JWT, ports |
| \`package.json\` | Apps do CMS (\`api\`, \`admin\`, \`web\`, \`worker\`) + CLI em devDependencies + scripts de atalho (start, migrate, doctor…) |
| \`plugins/\`, \`themes/\` | Extensões do projeto |
| \`migrations/\` | SQL de migrations (\`okcms db:migrate\`) |
| \`docker-compose.yml\` | Infra local: PostgreSQL + Redis (com healthcheck e volume) |
| \`docker/Dockerfile\`, \`.dockerignore\` | Imagem única \`okcms/app\` — 4 entrypoints: api, admin, web, worker |
| \`docker-compose.infra.yml\` | Projeto \`okcms\`: rede, postgres (só 127.0.0.1), redis (só interna) e proxy |
| \`docker-compose.deploy.yml\` | As 8 services blue/green: api, web, admin, worker × blue, green |
| \`deploy/nginx/\` | Template do proxy + \`conf.d/00-upstreams.conf\` (reescrito no swap) |
| \`.deploy/\` | Estado do deploy: lane ativa, lane anterior e histórico (não versionado) |

## Começando (desenvolvimento local)

Pré-requisitos: **Node 20+** ou **Bun 1.3+** · **PostgreSQL 16+** (obrigatório) ·
**Redis** (opcional — só para filas do worker).

> **CLI do projeto:** os comandos abaixo rodam com \`npx okcms\` (com Bun,
> \`bunx okcms\`) — a CLI é instalada em devDependencies, **não** no PATH.
> Atalhos que já vêm no \`package.json\`: \`bun run start\` · \`bun run migrate\`
> · \`bun run doctor\`. Para usar \`okcms\` cru sem prefixo em qualquer pasta,
> instale a CLI globalmente: \`bun add -g @oktis-works/cms\`.

\`\`\`bash
# 1. Banco no .env — escolha UM formato:
#    (a) variáveis separadas (default)
DB_HOST=localhost
DB_PORT=5432
DB_NAME=okcms
DB_USER=postgres
#    (b) URL única — tem precedência sobre as DB_* acima
# DATABASE_URL=postgresql://postgres:senha@localhost:5432/okcms

# 2. Suba a infra (Postgres + Redis) — com Docker:
docker compose up -d
# Sem Docker: aponte DB_* para um Postgres seu. Sem Redis, use:
#   REDIS_HOST=disabled   (cache em memória; filas do worker exigem Redis)

# 3. Migrações
npx okcms db:migrate

# 4. Sobe tudo: api + admin + web + worker
npx okcms start

# 5. Se algo falhar
npx okcms doctor
\`\`\`

Ports padrão (ajustáveis no \`.env\`): **API 3000** (\`PORT\`) · **Web 3001**
(\`WEB_PORT\`) · **Admin 3011** (\`ADMIN_PORT\`).

## Começando (Docker)

\`\`\`bash
docker compose up -d   # só a infra: postgres:16 + redis:7 (healthcheck + volumes)
npx okcms db:migrate
npx okcms start            # apps rodam como processos normais, fora do compose
\`\`\`

O \`.env\` gerado já aponta para \`localhost\`, que é onde o compose expõe as
portas do Postgres (5432) e do Redis (6379). Os apps em si rodam via
\`okcms start\` — o compose é só a infraestrutura.

Para subir a aplicação **inteira em Docker** (api, admin, web e worker em
containers, atrás de um nginx), use o deploy blue/green:

\`\`\`bash
npx okcms update --mode deploy
\`\`\`

Esse é o caminho de produção — ver o guia completo em
[docs/docker-deploy.md](https://github.com/oktis-works/cms/blob/main/docs/docker-deploy.md).

## Produção

Em produção **não use \`okcms start\` como supervisor** — ele é conveniência
de dev: não reinicia filhos que morrem e mistura os logs de todos os apps num
único fluxo. Escolha um dos caminhos abaixo.

### Caminho 1: pm2 (processos no host)

Um processo pm2 **por app** — restart em crash, log por processo, \`pm2
startup\` na inicialização do servidor e \`pm2 reload\` individual
(zero-downtime). Requer **Bun instalado no servidor** (os apps sobem via
\`bunx\`).

\`\`\`js
// ecosystem.config.js
module.exports = {
  apps: [
    { name: 'okcms-api',    script: 'bunx', args: '@oktis-works/api',    env: { NODE_ENV: 'production', PORT: 3000 } },
    { name: 'okcms-admin',  script: 'bunx', args: '@oktis-works/admin',  env: { NODE_ENV: 'production', PORT: 3011 } },
    { name: 'okcms-web',    script: 'bunx', args: '@oktis-works/web',    env: { NODE_ENV: 'production', WEB_PORT: 3001 } },
    { name: 'okcms-worker', script: 'bunx', args: '@oktis-works/worker', env: { NODE_ENV: 'production', WORKER_MODE: 'pm2' } },
  ],
};
\`\`\`

\`\`\`bash
pm2 start ecosystem.config.js
pm2 save && pm2 startup              # sobe com o servidor
pm2 reload okcms-api                 # atualiza sem downtime (por app)
pm2 logs okcms-api                   # log por processo
pm2 unmonitor okcms-api && pm2 delete okcms-api   # remover
\`\`\`

- O worker tem **modo pm2 nativo**: \`WORKER_MODE=pm2\` (cluster) combinado com
  \`WORKER_COUNT\` e \`WORKER_CONCURRENCY\`.
- Como cada app é um executável independente, o \`okcms start\` não é
  necessário em produção — o pm2 supervisoria cada um diretamente.

### Caminho 2: Docker blue/green (recomendado)

O projeto já nasce com tudo que o deploy precisa (o \`okcms init\` escreve
\`docker/\`, os dois composes e o \`deploy/\` do proxy). Um deploy é um único
comando a partir do host:

\`\`\`bash
npx okcms update --mode deploy     # sem TTY; com TTY abre o wizard
\`\`\`

A aplicação roda em **duas lanes** (\`okcms-blue\` e \`okcms-green\`) atrás de
um nginx público. Cada deploy:

1. builda a imagem nova numa lane que **não recebe tráfego**;
2. roda \`okcms db:migrate\` **no host** (falhou = nada mudou);
3. sobe o edge da lane nova e espera o healthcheck de cada contêiner;
4. troca o proxy reescrevendo \`00-upstreams.conf\` + \`nginx -s reload\`
   (conexões existentes vivas);
5. **drena** o worker antigo (SIGTERM + \`stop_grace_period\`), sobe o novo;
6. derruba a lane antiga — **sem \`-v\`**: o volume de mídia é compartilhado.

**Rollback** = rodar o mesmo comando de novo, ou apontar o upstream de volta
para a outra lane. Detalhes, portas e segurança em
[docs/docker-deploy.md](https://github.com/oktis-works/cms/blob/main/docs/docker-deploy.md).

Alternativa manual (sem a CLI): \`docker build -f docker/Dockerfile\` com o
contexto do monorepo e \`docker run --env-file .env\` — funcional, mas entrega
os 6 passos acima na mão. Prefira o comando da CLI.

- Postgres/Redis de produção: serviços gerenciados ou containers próprios com
  volume e backup — não use o \`docker-compose.yml\` de dev. O
  \`docker-compose.infra.yml\` do projeto é o mínimo aceitável (postgres só
  em \`127.0.0.1\`, redis sem porta nenhuma).
- **Migração como passo de deploy**: já é feito pelo \`--mode deploy\`, entre
  o build e o primeiro tráfego.

### Checklist (ambos os caminhos)

- [ ] \`NODE_ENV=production\` e \`JWT_SECRET\` forte e único
- [ ] \`.env\` fora do versionamento; credenciais nunca em \`okcms.config.json\`
- [ ] Proxy reverso com TLS (nginx/caddy) na frente de api/admin/web
- [ ] Versões fixas no \`package.json\` do projeto (nada de \`@latest\` em deploy)
- [ ] \`okcms db:migrate\` no pipeline de deploy e \`okcms db:backup\` agendado
- [ ] Redis real em produção (as filas do worker não funcionam sem Redis)
- [ ] \`okcms doctor\` verde no ambiente de destino
- [ ] Logs com destino (pm2 logrotate, ou stdout do container coletado)

## Comandos da CLI

> Os nomes abaixo são o comando em si: no projeto, prefixe com \`npx\`
> (ex.: \`npx okcms doctor\`) ou use um script do \`package.json\` (\`bun run
> doctor\`); sem prefixo, \`okcms\` só funciona com a CLI instalada
> globalmente (\`bun add -g @oktis-works/cms\`).

| Comando | O que faz |
|---|---|
| \`okcms init <dir>\` | Cria o projeto (arquivos + docs em \`--lang en\\|pt\`) e instala as dependências |
| \`okcms start [--api\\|--admin\\|--web\\|--worker\\|--all]\` | Sobe os apps (default: todos) |
| \`okcms stop\` / \`okcms status\` | Para / mostra os processos (pidfiles) |
| \`okcms doctor\` | Diagnóstico: node, \`.env\`, database (\`DB_*\` ou \`DATABASE_URL\`), config, docker, compose, lane e proxy |
| \`okcms config\` | Wizard de configuração do \`.env\` (Enter mantém, Ctrl+C descarta) · \`--list\` · \`--set K=V\` · \`--section <s>\` |
| \`okcms db:migrate\` · \`db:rollback\` · \`db:status\` | Migrations da pasta \`migrations/\` (\`--tenant\` opcional) |
| \`okcms db:backup\` · \`db:restore -f <arquivo>\` | Backup/restore do Postgres |
| \`okcms plugin:create -n <nome>\` | Scaffold de plugin — guia em [PLUGIN.md](./PLUGIN.md) |
| \`okcms plugin:install -n <caminho>\` | Instala plugin de um caminho local + registra |
| \`okcms plugin:list\` · \`plugin:search\` · \`plugin:manage\` | Lista, busca (npm) e habilita/desabilita plugins |
| \`okcms theme:create -n <nome> --style css\\|scss\\|tailwind\` | Scaffold de tema — guia em [THEME.md](./THEME.md) |
| \`okcms theme:install\` · \`theme:list\` · \`theme:search\` · \`theme:manage\` | Gestão de temas (\`--set-active\` define o ativo) |
| \`okcms theme:build -n <nome>\` | Compila SCSS/Tailwind → \`dist/theme.css\` isolado |
| \`okcms update\` | Wizard: **só baixar pacotes** ou **deploy Docker blue/green** (\`--mode download\\|deploy\`) |
| \`okcms update -i\` | Só baixa/aplica os pacotes \`@oktis-works/*\` (comportamento clássico, não-TTY) |
| \`okcms update --mode deploy\` | Deploy blue/green completo: build → migrations → healthcheck → swap → worker |
| \`okcms redeploy\` | Depois de instalar plugin/tema: SQL do plugin → \`migrations/\`, \`dist/theme.css\` do tema e deploy blue/green (\`--dry-run\` só mostra o plano) |
| \`okcms seed\` | Semeia dados iniciais (roles + settings) — idempotente |
| \`okcms user:create\` | Cria usuário e atribui um papel dentro do tenant |
| \`okcms system:status\` | Status do sistema (ambiente + saúde do banco) |
| \`okcms media:migrate\` | Migra arquivos de mídia entre drivers (\`local\` ↔ \`s3\`/\`r2\`/\`minio\`) |
| \`okcms prerender\` | Gera HTML estático das páginas publicadas (best-effort) |
| \`okcms build\` | Build dos apps em monorepo (\`--apps api,admin,web\`) |

## Banco de dados

- **Conexão** (no \`.env\`, escolha um formato): \`DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD\`
  **ou** \`DATABASE_URL\` (tem precedência). O \`okcms doctor\` valida os dois.
- **Migrations**: arquivos SQL em \`migrations/\`; \`okcms db:migrate\` aplica,
  \`db:rollback\` reverte, \`db:status\` mostra o estado. \`--tenant\` selectiva
  (default \`default\`) — o banco é multi-tenant via Row-Level Security.
- **Backup**: \`okcms db:backup\` gera dump com timestamp; \`db:restore -f <arquivo>\` restaura.

## Atualizando

\`\`\`bash
npx okcms update        # com TTY: escolhe entre baixar pacotes ou deploy
npx okcms update -i     # só baixa/aplica os pacotes (igual sempre foi)
npx okcms update --mode deploy          # deploy blue/green completo
npx okcms update --mode deploy --yes    # sem prompts (CI/CD)
\`\`\`

Em **não-TTY** (script/CI) o default continua sendo \`download\` — um \`-i\`
em cron nunca passa a fazer deploy por acidente. Só \`--mode deploy\` aciona
o Docker.

Flags de deploy: \`--no-cache\` (rebuild limpo) · \`--remove-orphans\`
(default) · \`--keep-orphans\` · \`--yes\` (sem prompts).

### Aplicando um plugin ou tema novo

Instalar extensão não muda o que está no ar: \`plugins/\` e \`themes/\` entram
na imagem no build, e \`themes/<n>/dist/theme.css\` é compilado **no host**.
Depois de \`plugin:install\` / \`theme:install\`, rode:

\`\`\`bash
npx okcms redeploy
\`\`\`

Ele copia \`plugins/<n>/migrations/*.sql\` para \`migrations/\` (idempotente),
compila o estilo de cada tema com entrada e refaz o deploy blue/green — sem
\`bun add\`. Use \`--dry-run\` para ver o plano, \`--plugin <nome>\` /
\`--theme <nome>\` para restringir o preparo, \`--skip-migrations\` e
\`--skip-theme-build\` para pular etapas.

\`\`\`bash
npx okcms doctor        # confere docker, compose v2, lane e proxy antes/depois
\`\`\`

## Próximos passos

- Extender o CMS com plugins → [PLUGIN.md](./PLUGIN.md)
- Criar/ativar um tema → [THEME.md](./THEME.md)
`;
}

/** README.md do projeto scaffoldado — versão em inglês. */
function projectReadmeEn(projectName: string): string {
  return `# ${projectName}

OkCMS project created with \`okcms init\`. This guide explains the system and
how to run it in local development and with Docker.

## What is OkCMS

An API-first, multi-tenant, extensible CMS. Four apps + one CLI:

| App | Package | Role |
|---|---|---|
| **API** | \`@oktis-works/api\` | REST server (Hono) at \`/api/v1\`: content, auth, media, plugins |
| **Admin** | \`@oktis-works/admin\` | Admin panel (Astro + SolidJS) |
| **Web** | \`@oktis-works/web\` | Public site (Astro) |
| **Worker** | \`@oktis-works/worker\` | Background queues/jobs (bullmq): publishing, media, webhooks, cache |
| **CLI** | \`@oktis-works/cms\` | \`okcms\` — init, start, database, extensions, update |

- **Database:** PostgreSQL (Row-Level Security, multi-tenant)
- **Cache and queues:** Redis
- **Extensions:** [plugins](./PLUGIN.md) (hooks/filters at runtime) and [themes](./THEME.md) (templates + isolated styles)

## Project structure

| Path | What it is |
|---|---|
| \`okcms.config.json\` | Structure: name, ports, storage, dirs, active theme. **No database credentials.** |
| \`.env\` | **Single source of connection**: database (\`DB_*\` or \`DATABASE_URL\`), Redis, JWT, ports |
| \`package.json\` | CMS apps (\`api\`, \`admin\`, \`web\`, \`worker\`) + CLI in devDependencies + shortcut scripts (start, migrate, doctor…) |
| \`plugins/\`, \`themes/\` | Project extensions |
| \`migrations/\` | SQL migrations (\`okcms db:migrate\`) |
| \`docker-compose.yml\` | Local infrastructure: PostgreSQL + Redis (healthcheck + volume) |
| \`docker/Dockerfile\`, \`.dockerignore\` | Single \`okcms/app\` image — 4 entrypoints: api, admin, web, worker |
| \`docker-compose.infra.yml\` | \`okcms\` project: network, postgres (127.0.0.1 only), redis (internal only) and proxy |
| \`docker-compose.deploy.yml\` | The 8 blue/green services: api, web, admin, worker × blue, green |
| \`deploy/nginx/\` | Proxy template + \`conf.d/00-upstreams.conf\` (rewritten on swap) |
| \`.deploy/\` | Deploy state: active lane, previous lane and history (not versioned) |

## Getting started (local development)

Prerequisites: **Node 20+** or **Bun 1.3+** · **PostgreSQL 16+** (required) ·
**Redis** (optional — only for the worker queues).

> **Project CLI:** the commands below run with \`npx okcms\` (with Bun,
> \`bunx okcms\`) — the CLI is installed in devDependencies, **not** on PATH.
> Shortcuts already in \`package.json\`: \`bun run start\` · \`bun run migrate\`
> · \`bun run doctor\`. To use bare \`okcms\` without a prefix anywhere,
> install the CLI globally: \`bun add -g @oktis-works/cms\`.

\`\`\`bash
# 1. Database in .env — pick ONE format:
#    (a) separate variables (default)
DB_HOST=localhost
DB_PORT=5432
DB_NAME=okcms
DB_USER=postgres
#    (b) single URL — takes precedence over the DB_* above
# DATABASE_URL=postgresql://postgres:password@localhost:5432/okcms

# 2. Start the infrastructure (Postgres + Redis) — with Docker:
docker compose up -d
# Without Docker: point DB_* to your own Postgres. Without Redis, use:
#   REDIS_HOST=disabled   (in-memory cache; the worker queues require Redis)

# 3. Migrations
npx okcms db:migrate

# 4. Start everything: api + admin + web + worker
npx okcms start

# 5. If something fails
npx okcms doctor
\`\`\`

Default ports (adjustable in \`.env\`): **API 3000** (\`PORT\`) · **Web 3001**
(\`WEB_PORT\`) · **Admin 3011** (\`ADMIN_PORT\`).

## Getting started (Docker)

\`\`\`bash
docker compose up -d   # infrastructure only: postgres:16 + redis:7 (healthcheck + volumes)
npx okcms db:migrate
npx okcms start            # apps run as normal processes, outside the compose
\`\`\`

The generated \`.env\` already points to \`localhost\`, where the compose publishes
the Postgres (5432) and Redis (6379) ports. The apps themselves run via
\`okcms start\` — the compose is only the infrastructure.

To run the **whole application in Docker** (api, admin, web and worker in
containers behind an nginx), use the blue/green deploy:

\`\`\`bash
npx okcms update --mode deploy
\`\`\`

That is the production path — see the complete guide at
[docs/docker-deploy.md](https://github.com/oktis-works/cms/blob/main/docs/docker-deploy.md).

## Production

In production **do not use \`okcms start\` as a supervisor** — it is a dev
convenience: it does not restart children that die and mixes every app's logs
into a single stream. Pick one of the paths below.

### Path 1: pm2 (host processes)

One pm2 **process per app** — restart on crash, log per process, \`pm2
startup\` on server boot and individual \`pm2 reload\`
(zero-downtime). Requires **Bun installed on the server** (apps start via
\`bunx\`).

\`\`\`js
// ecosystem.config.js
module.exports = {
  apps: [
    { name: 'okcms-api',    script: 'bunx', args: '@oktis-works/api',    env: { NODE_ENV: 'production', PORT: 3000 } },
    { name: 'okcms-admin',  script: 'bunx', args: '@oktis-works/admin',  env: { NODE_ENV: 'production', PORT: 3011 } },
    { name: 'okcms-web',    script: 'bunx', args: '@oktis-works/web',    env: { NODE_ENV: 'production', WEB_PORT: 3001 } },
    { name: 'okcms-worker', script: 'bunx', args: '@oktis-works/worker', env: { NODE_ENV: 'production', WORKER_MODE: 'pm2' } },
  ],
};
\`\`\`

\`\`\`bash
pm2 start ecosystem.config.js
pm2 save && pm2 startup              # start on boot
pm2 reload okcms-api                 # update with no downtime (per app)
pm2 logs okcms-api                   # log per process
pm2 unmonitor okcms-api && pm2 delete okcms-api   # remove
\`\`\`

- The worker has a **native pm2 mode**: \`WORKER_MODE=pm2\` (cluster) combined with
  \`WORKER_COUNT\` and \`WORKER_CONCURRENCY\`.
- Since each app is an independent executable, \`okcms start\` is not
  needed in production — pm2 supervises each one directly.

### Path 2: Docker blue/green (recommended)

The project ships with everything a deploy needs ( \`okcms init\` writes
\`docker/\`, both compose files and the proxy's \`deploy/\`). A deploy is a single
command from the host:

\`\`\`bash
npx okcms update --mode deploy     # no TTY; with a TTY it opens the wizard
\`\`\`

The application runs in **two lanes** (\`okcms-blue\` and \`okcms-green\`) behind a
public nginx. Each deploy:

1. builds the new image in a lane that **receives no traffic**;
2. runs \`okcms db:migrate\` **on the host** (if it fails, nothing changed);
3. starts the new lane's edge and waits for every container's healthcheck;
4. swaps the proxy by rewriting \`00-upstreams.conf\` + \`nginx -s reload\`
   (existing connections stay alive);
5. **drains** the old worker (SIGTERM + \`stop_grace_period\`) and starts the new one;
6. tears down the old lane — **without \`-v\`**: the media volume is shared.

**Rollback** = run the same command again, or point the upstream back to the
other lane. Details, ports and security in
[docs/docker-deploy.md](https://github.com/oktis-works/cms/blob/main/docs/docker-deploy.md).

Manual alternative (without the CLI): \`docker build -f docker/Dockerfile\` with the
monorepo context and \`docker run --env-file .env\` — functional, but it hands you
the 6 steps above to do by hand. Prefer the CLI command.

- Production Postgres/Redis: managed services or your own containers with a
  volume and backups — do not use the dev \`docker-compose.yml\`. The project's
  \`docker-compose.infra.yml\` is the acceptable minimum (postgres only on
  \`127.0.0.1\`, redis with no published port).
- **Migration as a deploy step**: already handled by \`--mode deploy\`, between
  the build and the first traffic.

### Checklist (both paths)

- [ ] \`NODE_ENV=production\` and a strong, unique \`JWT_SECRET\`
- [ ] \`.env\` out of version control; credentials never in \`okcms.config.json\`
- [ ] TLS reverse proxy (nginx/caddy) in front of api/admin/web
- [ ] Pinned versions in the project \`package.json\` (no \`@latest\` in a deploy)
- [ ] \`okcms db:migrate\` in the deploy pipeline and scheduled \`okcms db:backup\`
- [ ] Real Redis in production (the worker queues do not work without Redis)
- [ ] \`okcms doctor\` green on the target environment
- [ ] Logs with a destination (pm2 logrotate, or container stdout collected)

## CLI commands

> The names below are the command itself: in the project, prefix them with
> \`npx\` (e.g. \`npx okcms doctor\`) or use a \`package.json\` script (\`bun run
> doctor\`); without a prefix, \`okcms\` only works with the CLI installed
> globally (\`bun add -g @oktis-works/cms\`).

| Command | What it does |
|---|---|
| \`okcms init <dir>\` | Creates the project (files + docs in \`--lang en\\|pt\`) and installs dependencies |
| \`okcms start [--api\\|--admin\\|--web\\|--worker\\|--all]\` | Starts the apps (default: all) |
| \`okcms stop\` / \`okcms status\` | Stops / shows the processes (pidfiles) |
| \`okcms doctor\` | Diagnostics: node, \`.env\`, database (\`DB_*\` or \`DATABASE_URL\`), config, docker, compose, lane and proxy |
| \`okcms config\` | \`.env\` configuration wizard (Enter keeps, Ctrl+C discards) · \`--list\` · \`--set K=V\` · \`--section <s>\` |
| \`okcms db:migrate\` · \`db:rollback\` · \`db:status\` | Migrations from the \`migrations/\` folder (\`--tenant\` optional) |
| \`okcms db:backup\` · \`db:restore -f <file>\` | Postgres backup/restore |
| \`okcms plugin:create -n <name>\` | Plugin scaffold — guide in [PLUGIN.md](./PLUGIN.md) |
| \`okcms plugin:install -n <path>\` | Installs a plugin from a local path + registers it |
| \`okcms plugin:list\` · \`plugin:search\` · \`plugin:manage\` | Lists, searches (npm) and enables/disables plugins |
| \`okcms theme:create -n <name> --style css\\|scss\\|tailwind\` | Theme scaffold — guide in [THEME.md](./THEME.md) |
| \`okcms theme:install\` · \`theme:list\` · \`theme:search\` · \`theme:manage\` | Theme management (\`--set-active\` sets the active one) |
| \`okcms theme:build -n <name>\` | Compiles SCSS/Tailwind → isolated \`dist/theme.css\` |
| \`okcms update\` | Wizard: **download packages only** or **Docker blue/green deploy** (\`--mode download\\|deploy\`) |
| \`okcms update -i\` | Only downloads/applies the \`@oktis-works/*\` packages (classic non-TTY behaviour) |
| \`okcms update --mode deploy\` | Full blue/green deploy: build → migrations → healthcheck → swap → worker |
| \`okcms redeploy\` | After installing a plugin/theme: plugin SQL → \`migrations/\`, theme \`dist/theme.css\` and blue/green deploy (\`--dry-run\` only shows the plan) |
| \`okcms seed\` | Seeds initial data (roles + settings) — idempotent |
| \`okcms user:create\` | Creates a user and assigns a role inside the tenant |
| \`okcms system:status\` | System status (environment + database health) |
| \`okcms media:migrate\` | Migrates media files between drivers (\`local\` ↔ \`s3\`/\`r2\`/\`minio\`) |
| \`okcms prerender\` | Generates static HTML for published pages (best-effort) |
| \`okcms build\` | Builds the monorepo apps (\`--apps api,admin,web\`) |

## Database

- **Connection** (in \`.env\`, pick one format): \`DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD\`
  **or** \`DATABASE_URL\` (takes precedence). \`okcms doctor\` validates both.
- **Migrations**: SQL files in \`migrations/\`; \`okcms db:migrate\` applies,
  \`db:rollback\` reverts, \`db:status\` shows the state. \`--tenant\` is selective
  (default \`default\`) — the database is multi-tenant via Row-Level Security.
- **Backup**: \`okcms db:backup\` writes a timestamped dump; \`db:restore -f <file>\` restores it.

## Updating

\`\`\`bash
npx okcms update        # with TTY: choose between downloading packages or deploying
npx okcms update -i     # only downloads/applies the packages (as always)
npx okcms update --mode deploy          # full blue/green deploy
npx okcms update --mode deploy --yes    # no prompts (CI/CD)
\`\`\`

In **non-TTY** (script/CI) the default is still \`download\` — an \`-i\` in a
cron job never starts deploying by accident. Only \`--mode deploy\` engages
the Docker.

Deploy flags: \`--no-cache\` (clean rebuild) · \`--remove-orphans\`
(default) · \`--keep-orphans\` · \`--yes\` (no prompts).

### Applying a new plugin or theme

Installing an extension does not change what is running: \`plugins/\` and \`themes/\`
go into the image at build time, and \`themes/<n>/dist/theme.css\` is compiled
**on the host**. After \`plugin:install\` / \`theme:install\`, run:

\`\`\`bash
npx okcms redeploy
\`\`\`

It copies \`plugins/<n>/migrations/*.sql\` into \`migrations/\` (idempotent),
compiles the style of every theme with an entry and redoes the blue/green
deploy — without \`bun add\`. Use \`--dry-run\` to see the plan,
\`--plugin <name>\` / \`--theme <name>\` to narrow the preparation, and
\`--skip-migrations\` / \`--skip-theme-build\` to skip steps.

\`\`\`bash
npx okcms doctor        # checks docker, compose v2, lane and proxy before/after
\`\`\`

## Next steps

- Extend the CMS with plugins → [PLUGIN.md](./PLUGIN.md)
- Create/activate a theme → [THEME.md](./THEME.md)
`;
}

/** PLUGIN.md — guia de desenvolvimento de plugins (português). */
const PLUGIN_DOC_PT = `# Desenvolvendo um Plugin

Plugin é a extensão que se registra no runtime do CMS e participa do sistema
de **hooks e filters** (transformar dados, reagir a eventos de conteúdo etc.).
O catálogo de hooks disponíveis é servido pela API em
\`GET /api/v1/hooks/catalog\`.

> Os comandos usam \`npx\` com a CLI local do projeto (sem instalação
> global). Com a CLI global (\`bun add -g @oktis-works/cms\`), rode
> \`okcms ...\` direto.

## Estrutura gerada

\`\`\`bash
npx okcms plugin:create --name meu-plugin
\`\`\`

\`\`\`
plugins/meu-plugin/
├── manifest.json   # identidade + permissões + compatibilidade
├── index.js        # entrypoint: module.exports.register(registry)
└── README.md
\`\`\`

### manifest.json

\`\`\`json
{
  "name": "meu-plugin",
  "version": "0.1.0",
  "description": "Plugin meu-plugin para OkCMS",
  "type": "plugin",
  "main": "index.js",
  "scope": "tenant",
  "permissions": [],
  "compatibility": { "okcms": "^${CMS_VERSION}" }
}
\`\`\`

| Campo | Significado |
|---|---|
| \`type\` | \`"plugin"\` (fixo — temas usam \`"theme"\`) |
| \`main\` | Arquivo de entrada com o registro |
| \`scope\` | Escopo de atuação no multi-tenant (ex.: \`tenant\`) |
| \`permissions\` | Permissões que o plugin pede (vazio = nenhuma) |
| \`compatibility.okcms\` | Range semver exigido do CMS. **O scaffold preenche com a versão atual automaticamente** e o valor é validado no scaffold e em cada instalação — manifesto incompatível é rejeitado. |

### index.js

\`\`\`js
'use strict';

module.exports.register = function register(registry) {
  registry.addFilter('theme:data:posts', (value) => value);
};
\`\`\`

O \`register(registry)\` é chamado quando o plugin é carregado. Use o registro
para expor filters (transformações) — veja o que existe em
\`GET /api/v1/hooks/catalog\` para os nomes e contratos disponíveis.

## Migrations do banco

Se o plugin cria ou altera tabelas, o SQL mora **dentro do plugin**:

\`\`\`bash
plugins/meu-plugin/
└── migrations/
    ├── V001__meu_plugin__tabelas.sql
    └── V002__meu_plugin__colunas.sql
\`\`\`

O nome segue o padrão do runner — \`V<numero>__<owner>__<nome>.sql\` — e o
\`owner\` (aqui \`meu_plugin\`) é o que marca a migration como do plugin: o
rastreamento é por \`owner:version\`, então cada plugin tem a sua própria
linha de versão.

O SQL **não** é aplicado direto do diretório do plugin. O \`okcms redeploy\`
copia \`plugins/<n>/migrations/*.sql\` para \`migrations/\` (o único diretório
que o runner lê) e o \`db:migrate\` do deploy aplica — assim o schema do plugin
fica versionado e revisável no repositório do projeto.

Duas regras que o redeploy impõe:

- arquivo fora do padrão \`V###__owner__nome.sql\` **nunca** é copiado (e um
  já existente em \`migrations/\` quebraria todo \`db:migrate\` — o comando
  falha antes de tocar no Docker e diz qual arquivo renomear);
- uma migration já aplicada é imutável: se o plugin novo trouxer outro
  conteúdo com o mesmo nome, o redeploy **não** sobrescreve o arquivo que já
  está em \`migrations/\`, só avisa. Publique uma \`V00n+1\`.

## Fluxo de desenvolvimento

\`\`\`bash
# 1. Crie (em ./plugins do projeto, ou num workspace externo com --dir)
npx okcms plugin:create --name meu-plugin

# 2. Implemente plugins/meu-plugin/index.js

# 3. Se criou FORA do projeto, instale (valida compatibilidade e copia para plugins/)
npx okcms plugin:install --name ../meu-plugin-fonte

# 4. Gestão
npx okcms plugin:list                                # instalados + status
npx okcms plugin:manage -n meu-plugin --info         # informações do manifesto
npx okcms plugin:manage -n meu-plugin --disable      # desabilita (mantém os arquivos)
npx okcms plugin:manage -n meu-plugin --enable       # habilita de novo
npx okcms plugin:manage -n meu-plugin --uninstall    # remove arquivos + registro

# 5. Busca no npm (pacotes com a keyword okcms-plugin)
npx okcms plugin:search -q galeria

# 6. Publicou/atualizou? Stage do SQL + build dos temas + deploy blue/green
npx okcms redeploy --dry-run   # só mostra o plano
npx okcms redeploy
\`\`\`

## Publicando

Empacote o diretório do plugin como pacote npm com a keyword
\`okcms-plugin\` (é o que o \`okcms plugin:search\` consulta) e mantenha
\`compatibility.okcms\` atualizado para a linha do CMS que você suporta.
`;

/** THEME.md — guia de desenvolvimento de temas (português). */
const THEME_DOC_PT = `# Desenvolvendo um Tema

Tema é o visual do site público: **templates** (hierarquia de páginas) +
**estilos**, com isolamento por \`[data-theme]\` para que um tema nunca vaze
CSS para outro.

> Os comandos usam \`npx\` com a CLI local do projeto (sem instalação
> global). Com a CLI global (\`bun add -g @oktis-works/cms\`), rode
> \`okcms ...\` direto.

## Estrutura gerada

\`\`\`bash
npx okcms theme:create --name meu-tema --style css   # css | scss | tailwind
\`\`\`

\`\`\`
themes/meu-tema/
├── theme.json               # manifest (type: theme + compatibilidade)
├── templates/
│   ├── index.html           # listagem (home)
│   └── single.html          # página única (post/conteúdo)
├── style.css                # engine css — ou styles/main.scss — ou src/input.css
└── README.md
\`\`\`

### theme.json

\`\`\`json
{
  "name": "meu-tema",
  "version": "0.1.0",
  "description": "Tema meu-tema para OkCMS",
  "type": "theme",
  "compatibility": { "okcms": "^${CMS_VERSION}" }
}
\`\`\`

Com \`--style scss\` ou \`--style tailwind\`, o manifesto ganha também
\`stylesConfig\` (\`engine\`, \`entry\`, \`output\`, \`isolation\`) apontando para a
entrada de estilos. \`compatibility.okcms\` é preenchido e validado
automaticamente, como nos plugins.

### Templates

Sintaxe de template com variáveis e laços:

\`\`\`html
<main class="site">
  {{#each posts}}
    <article>
      <h2>{{this.title}}</h2>
      <p>{{this.excerpt}}</p>
    </article>
  {{/each}}
</main>
\`\`\`

- \`templates/index.html\` — listagem (ex.: \`{{#each posts}}\`)
- \`templates/single.html\` — item individual (ex.: \`{{title}}\`, \`{{content}}\`)

## Estilos por engine

| \`--style\` | Arquivo gerado | Build |
|---|---|---|
| \`css\` (default) | \`style.css\` | nenhum — servido direto |
| \`scss\` | \`styles/main.scss\` (+ \`components.scss\`) | \`okcms theme:build -n meu-tema\` |
| \`tailwind\` | \`src/input.css\` + \`tailwind.config.js\` | \`okcms theme:build -n meu-tema\` |

O build compila para \`dist/theme.css\` **com isolamento
\`[data-theme="meu-tema"]\`** (sem vazar estilos entre temas; o Tailwind já
sai com \`preflight: false\`).

> \`dist/theme.css\` é lido **pronto** pelo container — nada compila SCSS ou
> Tailwind dentro da imagem. O arquivo existe no host e só chega em
> produção quando a imagem é reconstruída: \`okcms theme:build\` seguido de
> \`okcms redeploy\`.

## Fluxo de desenvolvimento

\`\`\`bash
# 1. Crie
npx okcms theme:create --name meu-tema --style scss

# 2. Edite templates/ e estilos

# 3. Compile os estilos (scss/tailwind)
npx okcms theme:build --name meu-tema

# 4. Ative (grava activeTheme no okcms.config.json)
npx okcms theme:manage --name meu-tema --set-active
#    (equivalente: ACTIVE_THEME=meu-tema no .env)

# 5. Gestão
npx okcms theme:list                               # instalados + status
npx okcms theme:manage -n meu-tema --info          # informações do theme.json
npx okcms theme:manage -n meu-tema --disable|enable
npx okcms theme:manage -n meu-tema --uninstall
npx okcms theme:search -q blog                     # busca no npm (keyword okcms-theme)

# Se criou FORA do projeto:
npx okcms theme:install --name ../meu-tema-fonte

# 6. Depois de mudar templates/estilos: recompila e refaz o deploy
npx okcms theme:build --name meu-tema   # (o redeploy já compila sozinho)
npx okcms redeploy
\`\`\`

## Publicando

Publique como pacote npm com a keyword \`okcms-theme\` (alvo do
\`okcms theme:search\`) e mantenha \`compatibility.okcms\` na linha suportada
do CMS. O \`theme:build\` deve ser executado no seu processo de release para
que \`dist/theme.css\` vá junto no pacote.
`;

/** PLUGIN.md — plugin development guide (English). */
const PLUGIN_DOC_EN = `# Developing a Plugin

A plugin is the extension that registers with the CMS runtime and takes part
in the **hooks and filters** system (transform data, react to content events,
etc.). The catalogue of available hooks is served by the API at
\`GET /api/v1/hooks/catalog\`.

> The commands use \`npx\` with the project's local CLI (no global
> install). With the global CLI (\`bun add -g @oktis-works/cms\`), run
> \`okcms ...\` directly.

## Generated structure

\`\`\`bash
npx okcms plugin:create --name my-plugin
\`\`\`

\`\`\`
plugins/my-plugin/
├── manifest.json   # identity + permissions + compatibility
├── index.js        # entrypoint: module.exports.register(registry)
└── README.md
\`\`\`

### manifest.json

\`\`\`json
{
  "name": "my-plugin",
  "version": "0.1.0",
  "description": "my-plugin plugin for OkCMS",
  "type": "plugin",
  "main": "index.js",
  "scope": "tenant",
  "permissions": [],
  "compatibility": { "okcms": "^${CMS_VERSION}" }
}
\`\`\`

| Field | Meaning |
|---|---|
| \`type\` | \`"plugin"\` (fixed — themes use \`"theme"\`) |
| \`main\` | Entry file with the registration |
| \`scope\` | Scope of action in the multi-tenant setup (e.g. \`tenant\`) |
| \`permissions\` | Permissions the plugin requests (empty = none) |
| \`compatibility.okcms\` | Required semver range of the CMS. **The scaffold fills it in with the current version automatically** and the value is validated at scaffold time and on every install — an incompatible manifest is rejected. |

### index.js

\`\`\`js
'use strict';

module.exports.register = function register(registry) {
  registry.addFilter('theme:data:posts', (value) => value);
};
\`\`\`

\`register(registry)\` is called when the plugin is loaded. Use the registry
to expose filters (transformations) — see what exists at
\`GET /api/v1/hooks/catalog\` for the available names and contracts.

## Database migrations

If the plugin creates or changes tables, the SQL lives **inside the plugin**:

\`\`\`bash
plugins/my-plugin/
└── migrations/
    ├── V001__my_plugin__tables.sql
    └── V002__my_plugin__columns.sql
\`\`\`

The name follows the runner's pattern — \`V<number>__<owner>__<name>.sql\` — and
the \`owner\` (here \`my_plugin\`) is what marks the migration as the plugin's:
tracking is per \`owner:version\`, so each plugin has its own
version row.

The SQL is **not** applied straight from the plugin directory. \`okcms redeploy\`
copies \`plugins/<n>/migrations/*.sql\` into \`migrations/\` (the only directory
the runner reads) and the deploy's \`db:migrate\` applies it — so the plugin's
schema stays versioned and reviewable in the project repository.

Two rules the redeploy enforces:

- a file outside the \`V###__owner__name.sql\` pattern is **never** copied (and one
  already in \`migrations/\` would break every \`db:migrate\` — the command
  fails before touching Docker and tells you which file to rename);
- an applied migration is immutable: if a new plugin ships different content
  under the same name, the redeploy does **not** overwrite the file already
  in \`migrations/\`, it only warns. Ship a \`V00n+1\`.

## Development workflow

\`\`\`bash
# 1. Create it (in the project's ./plugins, or an external workspace with --dir)
npx okcms plugin:create --name my-plugin

# 2. Implement plugins/my-plugin/index.js

# 3. If you created it OUTSIDE the project, install it (validates compatibility and copies into plugins/)
npx okcms plugin:install --name ../my-plugin-source

# 4. Management
npx okcms plugin:list                                # installed + status
npx okcms plugin:manage -n my-plugin --info          # manifest information
npx okcms plugin:manage -n my-plugin --disable       # disables (keeps the files)
npx okcms plugin:manage -n my-plugin --enable        # enables it again
npx okcms plugin:manage -n my-plugin --uninstall     # removes files + registration

# 5. Search npm (packages with the okcms-plugin keyword)
npx okcms plugin:search -q gallery

# 6. Published/updated? Stage the SQL + build the themes + blue/green deploy
npx okcms redeploy --dry-run   # only shows the plan
npx okcms redeploy
\`\`\`

## Publishing

Package the plugin directory as an npm package with the keyword
\`okcms-plugin\` (that is what \`okcms plugin:search\` queries) and keep
\`compatibility.okcms\` up to date for the CMS line you support.
`;

/** THEME.md — theme development guide (English). */
const THEME_DOC_EN = `# Developing a Theme

A theme is the look of the public site: **templates** (a page hierarchy) +
**styles**, isolated by \`[data-theme]\` so a theme never leaks CSS into
another one.

> The commands use \`npx\` with the project's local CLI (no global
> install). With the global CLI (\`bun add -g @oktis-works/cms\`), run
> \`okcms ...\` directly.

## Generated structure

\`\`\`bash
npx okcms theme:create --name my-theme --style css   # css | scss | tailwind
\`\`\`

\`\`\`
themes/my-theme/
├── theme.json               # manifest (type: theme + compatibility)
├── templates/
│   ├── index.html           # listing (home)
│   └── single.html          # single page (post/content)
├── style.css                # css engine — or styles/main.scss — or src/input.css
└── README.md
\`\`\`

### theme.json

\`\`\`json
{
  "name": "my-theme",
  "version": "0.1.0",
  "description": "my-theme theme for OkCMS",
  "type": "theme",
  "compatibility": { "okcms": "^${CMS_VERSION}" }
}
\`\`\`

With \`--style scss\` or \`--style tailwind\`, the manifest also gets
\`stylesConfig\` (\`engine\`, \`entry\`, \`output\`, \`isolation\`) pointing at the
style entry. \`compatibility.okcms\` is filled in and validated
automatically, just like with plugins.

### Templates

Template syntax with variables and loops:

\`\`\`html
<main class="site">
  {{#each posts}}
    <article>
      <h2>{{this.title}}</h2>
      <p>{{this.excerpt}}</p>
    </article>
  {{/each}}
</main>
\`\`\`

- \`templates/index.html\` — listing (e.g. \`{{#each posts}}\`)
- \`templates/single.html\` — single item (e.g. \`{{title}}\`, \`{{content}}\`)

## Styles per engine

| \`--style\` | Generated file | Build |
|---|---|---|
| \`css\` (default) | \`style.css\` | none — served as is |
| \`scss\` | \`styles/main.scss\` (+ \`components.scss\`) | \`okcms theme:build -n my-theme\` |
| \`tailwind\` | \`src/input.css\` + \`tailwind.config.js\` | \`okcms theme:build -n my-theme\` |

The build compiles into \`dist/theme.css\` **with \`[data-theme="my-theme"]\`
isolation** (styles never leak between themes; Tailwind already ships with
\`preflight: false\`).

> \`dist/theme.css\` is read **ready-made** by the container — nothing compiles
> SCSS or Tailwind inside the image. The file exists on the host and only
> reaches production when the image is rebuilt: \`okcms theme:build\` followed by
> \`okcms redeploy\`.

## Development workflow

\`\`\`bash
# 1. Create it
npx okcms theme:create --name my-theme --style scss

# 2. Edit templates/ and styles

# 3. Compile the styles (scss/tailwind)
npx okcms theme:build --name my-theme

# 4. Activate it (writes activeTheme into okcms.config.json)
npx okcms theme:manage --name my-theme --set-active
#    (equivalent: ACTIVE_THEME=my-theme in .env)

# 5. Management
npx okcms theme:list                               # installed + status
npx okcms theme:manage -n my-theme --info          # theme.json information
npx okcms theme:manage -n my-theme --disable|enable
npx okcms theme:manage -n my-theme --uninstall
npx okcms theme:search -q blog                     # npm search (keyword okcms-theme)

# If you created it OUTSIDE the project:
npx okcms theme:install --name ../my-theme-source

# 6. After changing templates/styles: recompile and redo the deploy
npx okcms theme:build --name my-theme   # (the redeploy compiles it anyway)
npx okcms redeploy
\`\`\`

## Publishing

Publish as an npm package with the keyword \`okcms-theme\` (the target of
\`okcms theme:search\`) and keep \`compatibility.okcms\` on the supported CMS
line. Run \`theme:build\` in your release process so \`dist/theme.css\` ships
inside the package.
`;

// ---------------------------------------------------------------------------
// Superfície pública — uma entrada por documento, com a língua pedida
// ---------------------------------------------------------------------------

/**
 * README.md do projeto scaffoldado, na língua escolhida no \`okcms init\`.
 * Default \`en\` (Enter do prompt e único valor em modo não-interativo).
 */
export function projectReadme(
  projectName: string,
  lang: DocsLang = DEFAULT_DOCS_LANG
): string {
  return lang === 'pt' ? projectReadmePt(projectName) : projectReadmeEn(projectName);
}

/** PLUGIN.md na língua pedida. */
export function pluginDoc(lang: DocsLang = DEFAULT_DOCS_LANG): string {
  return lang === 'pt' ? PLUGIN_DOC_PT : PLUGIN_DOC_EN;
}

/** THEME.md na língua pedida. */
export function themeDoc(lang: DocsLang = DEFAULT_DOCS_LANG): string {
  return lang === 'pt' ? THEME_DOC_PT : THEME_DOC_EN;
}
