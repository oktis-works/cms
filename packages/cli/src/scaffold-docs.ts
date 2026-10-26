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
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

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
  return lang === 'pt' ? 'Portuguese' : 'English';
}

/**
 * Detecta a língua do projeto lendo o README.md existente.
 * Usado pelo `okcms update`/`deploy` para atualizar docs na língua certa.
 */
export function detectProjectDocsLang(cwd: string): 'en' | 'pt' {
  const readmePath = join(cwd, 'README.md');
  if (!existsSync(readmePath)) return DEFAULT_DOCS_LANG;

  const content = readFileSync(readmePath, 'utf-8');
  if (content.includes('O que é o OkCMS') || content.includes('## Produção')) return 'pt';
  if (content.includes('What is OkCMS') || content.includes('## Production')) return 'en';
  return DEFAULT_DOCS_LANG;
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

- **Banco:** PostgreSQL, MySQL, or MariaDB (provider-specific schema and tenant isolation). See \`docs/provider-matrix.md\` for supported versions.
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
| \`docker-compose.yml\` | Infra local: selected database provider + Redis (with healthcheck and volume) |
| \`docker/Dockerfile\`, \`.dockerignore\` | Imagem única \`okcms/app\` — 4 entrypoints: api, admin, web, worker |
| \`docker-compose.infra.yml\` | Projeto \`okcms\`: rede, postgres (só 127.0.0.1), redis (só interna) e proxy |
| \`docker-compose.deploy.yml\` | As 8 services blue/green: api, web, admin, worker × blue, green |
| \`deploy/nginx/\` | Template do proxy + \`conf.d/00-upstreams.conf\` (reescrito no swap) |
| \`.deploy/\` | Estado do deploy: lane ativa, lane anterior e histórico (não versionado) |

## Começando (desenvolvimento local)

Pré-requisitos: **Node 22.17+** ou **Bun 1.4.4+** · **PostgreSQL 16+, MySQL 8.0.36+/8.4 LTS ou MariaDB 11.4+** ·
**Redis** (opcional — só para filas do worker).

> **CLI do projeto:** depois do install, os comandos rodam diretamente com
> \`okcms\`. Para o bootstrap sem instalação global, use
> \`npx @oktis-works/cms@latest init\` ou \`bunx @oktis-works/cms@latest init\`.

Atalho — \`okcms dev\` faz tudo em um comando: completa o \`.env\` (gera os
segredos que faltam, mantém os existentes), sobe a infra (o MESMO compose
que o \`okcms deploy\` reutiliza) e espera o Postgres aceitar conexões antes
das migrations, torna o Redis alcançável do host (via override só-de-dev
em \`.data/dev-infra.override.yml\`, que o deploy não lê), aplica schema +
seed + migrations, cria o primeiro admin (\`SUPER_ADMIN\`) se o banco estiver
vazio, sobe os apps e imprime os endereços finais (API · Admin · Web no
localhost). É reexecutável; sem TTY exige \`--yes\` (com
\`--email/--name/--password\`).
Indo para produção: \`okcms stop\` antes de \`okcms deploy\` — os processos
do dev ocupam as mesmas portas que os containers.

O passo a passo manual:

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
okcms dev
# Sem Docker: aponte DB_* para um Postgres seu. Sem Redis, use:
#   REDIS_HOST=disabled   (cache em memória; filas do worker exigem Redis)

# 3. Migrações (aplica schema + seed de roles/settings)
okcms db:migrate

# 4. **Crie seu primeiro usuário (OBRIGATÓRIO — sem isso não há login)**
okcms user:create \
  --email seu@email.com \
  --name "Admin" \
  --password "SenhaForte123" \
  --role SUPER_ADMIN \
  --tenant default

# 5. Sobe tudo: api + admin + web + worker
okcms start

# 6. Se algo falhar
okcms doctor
\`\`\`

Ports padrão (ajustáveis no \`.env\`): **API 3000** (\`PORT\`) · **Web 3001**
(\`WEB_PORT\`) · **Admin 3011** (\`ADMIN_PORT\`).

## Começando (Docker)

\`\`\`bash
okcms dev              # completes .env, infrastructure, migrations and apps
okcms db:migrate
okcms start            # apps rodam como processos normais, fora do compose
\`\`\`

O \`.env\` gerado já aponta para \`localhost\`, que é onde o compose expõe as
portas do Postgres (5432) e do Redis (6379). Os apps em si rodam via
\`okcms start\` — o compose é só a infraestrutura.

Para subir a aplicação **inteira em Docker** (api, admin, web e worker em
containers, atrás de um nginx), use o \`okcms deploy\`:

\`\`\`bash
okcms deploy                       # abre o menu do destino (setas ↑/↓ + Enter)
okcms deploy --target simple      # ou fixa o destino sem menu
\`\`\`

São três destinos: **blue/green** (duas lanes, sem downtime), **simple** (um
stack só em \`docker-compose.app.yml\`, reinício rápido) e **pm2** (processos no
host, sem Docker). A escolha fica guardada em \`.deploy/state.json\` e vale para
\`deploy\`, \`update\` e \`redeploy\`.

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

- O worker lê \`WORKER_MODE\` (docker · pm2 · k8s, default \`docker\`), loga
  \`WORKER_COUNT\` e usa \`WORKER_CONCURRENCY\` (default 5) na concorrência das filas.
- Como cada app é um executável independente, o \`okcms start\` não é
  necessário em produção — o pm2 supervisoria cada um diretamente.

### Caminho 2: Docker — blue/green ou simple (recomendado)

O projeto já nasce com tudo que o deploy precisa (o \`okcms init\` escreve
\`docker/\`, os três composes e o \`deploy/\` do proxy). Um deploy é um único
comando a partir do host:

\`\`\`bash
okcms deploy                   # primeiro deploy (menu do destino)
okcms update --mode deploy     # depois disso: wizard com o destino salvo
okcms deploy --target simple   # stack único, sem lanes
\`\`\`

No destino **blue/green** a aplicação roda em **duas lanes** (\`okcms-blue\` e
\`okcms-green\`) atrás de um nginx público. Cada deploy:

1. builda a imagem nova numa lane que **não recebe tráfego**;
2. roda \`okcms db:migrate\` **no host** (falhou = nada mudou);
3. sobe o edge da lane nova e espera o healthcheck de cada contêiner;
4. troca o proxy reescrevendo \`00-upstreams.conf\` + \`nginx -s reload\`
   (conexões existentes vivas);
5. **drena** o worker antigo (SIGTERM + \`stop_grace_period\`), sobe o novo;
6. derruba a lane antiga — **sem \`-v\`**: o volume de mídia é compartilhado.

No destino **simple** o caminho é mais curto: build → migrations → \`up -d\` →
healthcheck → \`nginx -s reload\` — sem segunda lane e com reinício rápido; o
zero downtime fica por conta do blue/green.

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

> Os nomes abaixo são o comando em si: depois do install, use \`okcms\`
> diretamente. Para usar fora de um projeto, instale globalmente com
> \`bun add -g @oktis-works/cms\`.

| Comando | O que faz |
|---|---|
| \`okcms init <dir>\` | Cria o projeto (arquivos + docs em \`--lang en\\|pt\`) e instala as dependências |
| \`okcms menu\` | Abre o assistente interativo (igual a rodar \`okcms\` puro num terminal) |
| \`okcms start [--api\\|--admin\\|--web\\|--worker\\|--all]\` | Sobe os apps (default: todos) |
| \`okcms stop\` / \`okcms status\` | Para / mostra os processos (pidfiles) |
| \`okcms doctor\` | Diagnóstico: node, \`.env\`, database (\`DB_*\` ou \`DATABASE_URL\`), config, docker, compose, lane e proxy |
| \`okcms config\` | Wizard de configuração do \`.env\` (Enter mantém, Ctrl+C descarta) · \`--list\` · \`--set K=V\` · \`--section <s>\` |
| \`okcms db:migrate\` · \`db:rollback\` · \`db:status\` | Migrations da pasta \`migrations/\` (\`--tenant\` opcional) |
| \`okcms db:backup\` · \`db:restore -f <arquivo>\` | Backup/restore do Postgres |
| \`okcms plugin:create -n <nome>\` | Scaffold de plugin — guia em [PLUGIN.md](./PLUGIN.md) |
| \`okcms plugin:install -n <caminho>\` | Instala plugin de um caminho local + registra |
| \`okcms plugin:list\` · \`plugin:search\` · \`plugin:manage\` | Lista, busca (npm) e gerencia plugins (info · habilitar/desabilitar no estado local) |
| \`okcms theme:create -n <nome> --style css\\|scss\\|tailwind\` | Scaffold de tema — guia em [THEME.md](./THEME.md) |
| \`okcms theme:install\` · \`theme:list\` · \`theme:search\` · \`theme:manage\` | Gestão de temas (\`--set-active\` define o ativo) |
| \`okcms theme:build -n <nome>\` | Compila SCSS/Tailwind → \`dist/theme.css\` isolado |
| \`okcms update\` | Assistente de atualização: y/n por etapa — pacotes → migrations (sincroniza \`./migrations\`) → healthcheck → deploy |
| \`okcms update -i\` | Alias legado; a atualização completa já instala os pacotes |
| \`okcms update --mode download\` | Baixa/aplica os pacotes \`@oktis-works/*\` + sincroniza \`./migrations\`, sem iniciar Docker |
| \`okcms update --mode deploy\` | Deploy do destino salvo: build → migrations → healthcheck → swap → worker (\`--target\` escolhe blue-green, simple ou pm2) |
| \`okcms redeploy\` | Depois de instalar plugin/tema: SQL do plugin → \`migrations/\`, \`dist/theme.css\` do tema e refaz o deploy (\`--dry-run\` só mostra o plano, \`--target\` escolhe o destino) |
| \`okcms seed\` | Semeia dados iniciais (roles + settings) — idempotente |
| \`okcms user:create\` | Cria usuário e atribui um papel dentro do tenant |
| \`okcms system:status\` | Status do sistema (ambiente + saúde do banco) |
| \`okcms media:migrate\` | Migra arquivos de mídia entre drivers (\`local\` ↔ \`s3\`/\`r2\`/\`minio\`) |
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
okcms update        # assistente: y/n em pacotes → migrations → deploy
okcms update --mode download  # só baixa/aplica os pacotes
okcms update --mode deploy          # deploy completo do destino salvo
okcms update --mode deploy --yes    # sem prompts (CI/CD)
\`\`\`

O \`okcms update\` pergunta etapa por etapa: instalar os pacotes
\`@oktis-works/*\` no host? baixar as migrations pendentes para
\`./migrations\`? fazer o deploy agora? Cada \`n\` pula a etapa. As migrations
vêm embutidas no CLI e são copiadas sem destruir: só entra o que falta e
arquivo local diferente é mantido (o conflito é reportado). Em **não-TTY**
(script/CI), o update completo exige \`--yes\`; \`--mode deploy\` sincroniza as
migrations em silêncio antes do pipeline. Use \`--mode download\` para
atualizar só pacotes + migrations.

Flags de deploy: \`--no-cache\` (rebuild limpo) · \`--remove-orphans\`
(default) · \`--keep-orphans\` · \`--yes\` (sem prompts).

### Aplicando um plugin ou tema novo

Instalar extensão não muda o que está no ar: \`plugins/\` e \`themes/\` entram
na imagem no build, e \`themes/<n>/dist/theme.css\` é compilado **no host**.
Depois de \`plugin:install\` / \`theme:install\`, rode:

\`\`\`bash
okcms redeploy
\`\`\`

Ele copia \`plugins/<n>/migrations/*.sql\` para \`migrations/\` (idempotente),
compila o estilo de cada tema com entrada e refaz o deploy — sem
\`bun add\`. Use \`--dry-run\` para ver o plano, \`--plugin <nome>\` /
\`--theme <nome>\` para restringir o preparo, \`--skip-migrations\` e
\`--skip-theme-build\` para pular etapas.

\`\`\`bash
okcms doctor        # confere docker, compose v2, lane e proxy antes/depois
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

- **Database:** PostgreSQL, MySQL, or MariaDB (provider-specific schema and tenant isolation). See \`docs/provider-matrix.md\` for supported versions.
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
| \`docker-compose.yml\` | Local infrastructure: selected database provider + Redis (healthcheck + volume) |
| \`docker/Dockerfile\`, \`.dockerignore\` | Single \`okcms/app\` image — 4 entrypoints: api, admin, web, worker |
| \`docker-compose.infra.yml\` | \`okcms\` project: network, postgres (127.0.0.1 only), redis (internal only) and proxy |
| \`docker-compose.deploy.yml\` | The 8 blue/green services: api, web, admin, worker × blue, green |
| \`deploy/nginx/\` | Proxy template + \`conf.d/00-upstreams.conf\` (rewritten on swap) |
| \`.deploy/\` | Deploy state: active lane, previous lane and history (not versioned) |

## Getting started (local development)

Prerequisites: **Node 22.17+** or **Bun 1.4.4+** · **PostgreSQL 16+, MySQL 8.0.36+/8.4 LTS, or MariaDB 11.4+** ·
**Redis** (optional — only for the worker queues).

> **Project CLI:** after installation, commands run directly with \`okcms\`.
> For bootstrap without a global install, use
> \`npx @oktis-works/cms@latest init\` or \`bunx @oktis-works/cms@latest init\`.

Shortcut — \`okcms dev\` does everything in one command: completes \`.env\`
(generating missing secrets, keeping existing values), starts the infra
(the SAME compose \`okcms deploy\` reuses) and waits for Postgres to accept
connections before migrating, makes Redis reachable from the host (via a
dev-only override in \`.data/dev-infra.override.yml\` that the deploy never
reads), applies schema + seed + migrations, creates the first admin
(\`SUPER_ADMIN\`) when the database is empty, starts the apps and prints the
final URLs (API · Admin · Web on localhost). Re-runnable; non-TTY requires
\`--yes\` (with \`--email/--name/--password\`). Going to production: \`okcms stop\` before
\`okcms deploy\` — the dev processes hold the same ports the containers
need.

The manual step by step:

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
okcms dev
# Without Docker: point DB_* to your own Postgres. Without Redis, use:
#   REDIS_HOST=disabled   (in-memory cache; the worker queues require Redis)

# 3. Migrations (applies schema + seeds roles/settings)
okcms db:migrate

# 4. **Create your first user (REQUIRED — no login exists without it)**
okcms user:create \
  --email your@email.com \
  --name "Admin" \
  --password "StrongPass123" \
  --role SUPER_ADMIN \
  --tenant default

# 5. Start everything: api + admin + web + worker
okcms start

# 6. If something fails
okcms doctor
\`\`\`

Default ports (adjustable in \`.env\`): **API 3000** (\`PORT\`) · **Web 3001**
(\`WEB_PORT\`) · **Admin 3011** (\`ADMIN_PORT\`).

## Getting started (Docker)

\`\`\`bash
okcms dev              # completes .env, infrastructure, migrations and apps
okcms db:migrate
okcms start            # apps run as normal processes, outside the compose
\`\`\`

The generated \`.env\` already points to \`localhost\`, where the compose publishes
the Postgres (5432) and Redis (6379) ports. The apps themselves run via
\`okcms start\` — the compose is only the infrastructure.

To run the **whole application in Docker** (api, admin, web and worker in
containers behind an nginx), use \`okcms deploy\`:

\`\`\`bash
okcms deploy                       # opens the target menu (↑/↓ + Enter)
okcms deploy --target simple      # or fixes the target without the menu
\`\`\`

There are three targets: **blue/green** (two lanes, no downtime), **simple**
(one stack in \`docker-compose.app.yml\`, fast restart) and **pm2** (host
processes, no Docker). The choice is stored in \`.deploy/state.json\` and shared
by \`deploy\`, \`update\` and \`redeploy\`.

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

- The worker reads \`WORKER_MODE\` (docker · pm2 · k8s, default \`docker\`), logs
  \`WORKER_COUNT\` and uses \`WORKER_CONCURRENCY\` (default 5) for queue concurrency.
- Since each app is an independent executable, \`okcms start\` is not
  needed in production — pm2 supervises each one directly.

### Path 2: Docker — blue/green or simple (recommended)

The project ships with everything a deploy needs ( \`okcms init\` writes
\`docker/\`, all three compose files and the proxy's \`deploy/\`). A deploy is a
single command from the host:

\`\`\`bash
okcms deploy                   # first deploy (target menu)
okcms update --mode deploy     # after that: wizard with the saved target
okcms deploy --target simple   # single stack, no lanes
\`\`\`

With the **blue/green** target the application runs in **two lanes**
(\`okcms-blue\` and \`okcms-green\`) behind a public nginx. Each deploy:

1. builds the new image in a lane that **receives no traffic**;
2. runs \`okcms db:migrate\` **on the host** (if it fails, nothing changed);
3. starts the new lane's edge and waits for every container's healthcheck;
4. swaps the proxy by rewriting \`00-upstreams.conf\` + \`nginx -s reload\`
   (existing connections stay alive);
5. **drains** the old worker (SIGTERM + \`stop_grace_period\`) and starts the new one;
6. tears down the old lane — **without \`-v\`**: the media volume is shared.

With the **simple** target the path is shorter: build → migrations → \`up -d\` →
healthcheck → \`nginx -s reload\` — no second lane and a fast restart; zero
downtime is what blue/green is for.

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

> The names below are the command itself: after install, use \`okcms\`
> directly. Outside a project, install it globally with
> \`bun add -g @oktis-works/cms\`.

| Command | What it does |
|---|---|
| \`okcms init <dir>\` | Creates the project (files + docs in \`--lang en\\|pt\`) and installs dependencies |
| \`okcms menu\` | Opens the interactive wizard (same as running bare \`okcms\` in a terminal) |
| \`okcms start [--api\\|--admin\\|--web\\|--worker\\|--all]\` | Starts the apps (default: all) |
| \`okcms stop\` / \`okcms status\` | Stops / shows the processes (pidfiles) |
| \`okcms doctor\` | Diagnostics: node, \`.env\`, database (\`DB_*\` or \`DATABASE_URL\`), config, docker, compose, lane and proxy |
| \`okcms config\` | \`.env\` configuration wizard (Enter keeps, Ctrl+C discards) · \`--list\` · \`--set K=V\` · \`--section <s>\` |
| \`okcms db:migrate\` · \`db:rollback\` · \`db:status\` | Migrations from the \`migrations/\` folder (\`--tenant\` optional) |
| \`okcms db:backup\` · \`db:restore -f <file>\` | Postgres backup/restore |
| \`okcms plugin:create -n <name>\` | Plugin scaffold — guide in [PLUGIN.md](./PLUGIN.md) |
| \`okcms plugin:install -n <path>\` | Installs a plugin from a local path + registers it |
| \`okcms plugin:list\` · \`plugin:search\` · \`plugin:manage\` | Lists, searches (npm) and manages plugins (info · enable/disable in local state) |
| \`okcms theme:create -n <name> --style css\\|scss\\|tailwind\` | Theme scaffold — guide in [THEME.md](./THEME.md) |
| \`okcms theme:install\` · \`theme:list\` · \`theme:search\` · \`theme:manage\` | Theme management (\`--set-active\` sets the active one) |
| \`okcms theme:build -n <name>\` | Compiles SCSS/Tailwind → isolated \`dist/theme.css\` |
| \`okcms deploy\` | First deploy — target menu: blue/green, simple or pm2 (\`--target\`, \`--yes\`) |
| \`okcms update\` | Update wizard: y/n per step — packages → migrations (syncs \`./migrations\`) → healthcheck → deploy |
| \`okcms update -i\` | Legacy alias; the full update already installs packages |
| \`okcms update --mode download\` | Applies the \`@oktis-works/*\` packages + syncs \`./migrations\`; it never starts Docker |
| \`okcms update --mode deploy\` | Full deploy: build → migrations → healthcheck → swap (target: \`--target blue-green\\|simple\\|pm2\`) |
| \`okcms redeploy\` | After installing a plugin/theme: plugin SQL → \`migrations/\`, theme \`dist/theme.css\` and deploy (\`--dry-run\` only shows the plan, \`--target\` picks the target) |
| \`okcms seed\` | Seeds initial data (roles + settings) — idempotent |
| \`okcms user:create\` | Creates a user and assigns a role inside the tenant |
| \`okcms system:status\` | System status (environment + database health) |
| \`okcms media:migrate\` | Migrates media files between drivers (\`local\` ↔ \`s3\`/\`r2\`/\`minio\`) |
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
okcms update        # wizard: y/n on packages → migrations → deploy
okcms update --mode download  # only downloads/applies the packages
okcms update --mode deploy          # full deploy of the saved target
okcms update --mode deploy --yes    # no prompts (CI/CD)
\`\`\`

\`okcms update\` asks step by step: install the \`@oktis-works/*\` packages on
the host? download the pending migrations into \`./migrations\`? deploy now?
Each \`n\` skips that step. The migrations ship inside the CLI and are copied
without destroying anything: only missing files are added; a locally edited
file is kept (the conflict is reported). In **non-TTY** (script/CI) the full
update requires \`--yes\`; \`--mode deploy\` syncs the migrations silently before
the pipeline. Use \`--mode download\` for packages + migrations only.

Deploy flags: \`--no-cache\` (clean rebuild) · \`--remove-orphans\`
(default) · \`--keep-orphans\` · \`--yes\` (no prompts).

### Applying a new plugin or theme

Installing an extension does not change what is running: \`plugins/\` and \`themes/\`
go into the image at build time, and \`themes/<n>/dist/theme.css\` is compiled
**on the host**. After \`plugin:install\` / \`theme:install\`, run:

\`\`\`bash
okcms redeploy
\`\`\`

It copies \`plugins/<n>/migrations/*.sql\` into \`migrations/\` (idempotent),
compiles the style of every theme with an entry and redoes the deploy of
the chosen target — without \`bun add\`. Use \`--dry-run\` to see the plan,
\`--plugin <name>\` / \`--theme <name>\` to narrow the preparation, and
\`--skip-migrations\` / \`--skip-theme-build\` to skip steps.

\`\`\`bash
okcms doctor        # checks docker, compose v2, lane and proxy before/after
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
okcms plugin:create --name meu-plugin
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
  // Filtro real: roda em toda listagem de conteúdo (ex.: GET /api/v1/content)
  registry.addFilter('content:query', (items) => items);

  // Action real: disparada após publicar um conteúdo do tipo "post"
  registry.addAction('after_publish_content_post', (content) => {
    console.log('[meu-plugin] publicado:', content.slug);
  });
};
\`\`\`

O \`register(registry)\` é chamado quando o plugin é carregado. Use o registro
para expor filters (transformações) — veja o que existe em
\`GET /api/v1/hooks/catalog\` para os nomes e contratos disponíveis.

O carregamento acontece no boot de todos os processos (API, web e worker):
plugins com status \`ACTIVATED\` no banco têm o \`register\` chamado e os hooks
entram no registry compartilhado. Ativar/desativar pela API recarrega no
próprio processo da API na hora; web/worker pegam a mudança no próximo
restart. Um plugin que falha ao carregar é isolado: a falha é reportada no
log e nunca derruba o boot dos outros plugins nem do processo.

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
okcms plugin:create --name meu-plugin

# 2. Implemente plugins/meu-plugin/index.js

# 3. Se criou FORA do projeto, instale (valida compatibilidade e copia para plugins/)
okcms plugin:install --name ../meu-plugin-fonte

# 4. Gestão
okcms plugin:list                                # instalados + estado local
okcms plugin:manage -n meu-plugin --info         # informações do manifesto
okcms plugin:manage -n meu-plugin --disable      # marca como desabilitado no estado local (.okcms/extensions.json)
okcms plugin:manage -n meu-plugin --enable       # marca como habilitado de novo (mesmo estado local)
okcms plugin:manage -n meu-plugin --uninstall    # remove os arquivos do projeto
# O runtime lê o status no banco: ative/desative pelo admin (carregado no boot).

# 5. Busca no npm (pacotes com a keyword okcms-plugin)
okcms plugin:search -q galeria

# 6. Publicou/atualizou? Stage do SQL + build dos temas + deploy (destino salvo)
okcms redeploy --dry-run   # só mostra o plano
okcms redeploy
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
okcms theme:create --name meu-tema --style css   # css | scss | tailwind
\`\`\`

\`\`\`
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

Isolamento (\`stylesConfig.isolation\`): \`scss\`/\`tailwind\` sempre escopam no
build (\`isolation: true\`); no engine \`css\` o tema pode assumir o isolamento
com \`isolation: \"manual\"\` — o \`dist/theme.css\` entregue já precisa estar
escopado (é o caso do tema default). \`isolation: false\` é rejeitado.

### Templates

Templates são arquivos \`*.astro\` **na raiz do tema** — é o formato que o
runtime do site busca (hierarquia \`home\` → \`index\` → \`404\`, com fallback
\`_shared\` → \`default\`). Sintaxe com variáveis, HTML cru e laços/condições:

\`\`\`html
<main class="site">
  {{#each items}}
    <article>
      <h2>{{title}}</h2>
      <p>{{excerpt}}</p>
    </article>
  {{/each}}
</main>
\`\`\`

- \`{{variável}}\` — valor com escape HTML; \`{{{html}}}\` — sem escape (HTML do conteúdo)
- \`{{#each}}\` / \`{{#if}}\` aninhados, caminhos pontuados (\`content.author.name\`)
- \`home.astro\` — home (\`{{site.title}}\`, \`{{#each items}}\`)
- \`index.astro\`, \`single.astro\`, \`page.astro\` — conteúdo (\`{{content.*}}\`, \`{{page.title}}\`)
- \`archive.astro\` — listagem por tipo/taxonomia (\`{{#each items}}\`)
- \`404.astro\` — última da cadeia
- Contexto disponível: \`site.*\`, \`page.*\`, \`content.*\` (colunas + campos), \`items\`,
  \`menus\`, \`contentTypes\`, \`taxonomies\`, \`terms\`, \`settings\`

> **Nota — assinatura do produto:** o runtime envolve seus templates com
> \`<meta name="generator" content="OkCMS <versão>">\` e envia \`X-Powered-By:
> OkCMS/<versão>\` em toda resposta pública. Se o tema emite o documento
> COMPLETO (\`<html>\` no fragmento — full-control), o meta não é injetado (o
> tema é dono do próprio \`<head>\`), mas o header continua presente.

## Estilos por engine

| \`--style\` | Arquivo gerado | Build |
|---|---|---|
| \`css\` (default) | \`dist/theme.css\` | nenhum — servido direto |
| \`scss\` | \`styles/main.scss\` (+ \`components.scss\`) | \`okcms theme:build -n meu-tema\` |
| \`tailwind\` | \`src/input.css\` + \`tailwind.config.js\` | \`okcms theme:build -n meu-tema\` |

O site público só linka \`/themes/<tema>/dist/theme.css\` — no engine \`css\` o
arquivo já nasce em \`dist/\` (servível sem build). Nos demais, o build compila
para \`dist/theme.css\` **com isolamento \`[data-theme="meu-tema"]\`** (sem vazar
estilos entre temas; o Tailwind já sai com \`preflight: false\`).

> \`dist/theme.css\` é lido **pronto** pelo container — nada compila SCSS ou
> Tailwind dentro da imagem. O arquivo existe no host e só chega em
> produção quando a imagem é reconstruída: \`okcms theme:build\` seguido de
> \`okcms redeploy\`.

## data-theme no HTML (isolamento automático)

O runtime do site envolve cada página pública com \`<html data-theme="<nome-do-tema>">\`.
Você **não precisa** adicionar esse atributo nos templates Astro — ele é injetado
automaticamente pelo servidor web em toda resposta pública.

O que isso significa para seu CSS:

- **Engine \`css\` (isolation: \`manual\`)**: escreva todo o CSS escopado dentro de
  \`[data-theme="seu-tema"]\`. Exemplo:

  \`\`\`css
  [data-theme="meu-tema"] .hero {
    padding: 4rem 0;
    text-align: center;
  }
  \`\`\`

- **Engine \`scss\`/\`tailwind\` (isolation: \`true\`)**: o build já escapa todo o CSS
  automaticamente com \`[data-theme="seu-tema"]\`. Você escreve CSS puro sem
  pensar no prefixo.

Se você omitir \`[data-theme="..."]\` no CSS, as regras terão alcance global e
poderão vazar para outros temas instalados no mesmo site — o isolamento é a
proteção contra isso.

## Fluxo de desenvolvimento

\`\`\`bash
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
okcms plugin:create --name my-plugin
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
  // Real filter: runs on every content listing (e.g. GET /api/v1/content)
  registry.addFilter('content:query', (items) => items);

  // Real action: fired after publishing a "post" entry
  registry.addAction('after_publish_content_post', (content) => {
    console.log('[my-plugin] published:', content.slug);
  });
};
\`\`\`

\`register(registry)\` is called when the plugin is loaded. Use the registry
to expose filters (transformations) — see what exists at
\`GET /api/v1/hooks/catalog\` for the available names and contracts.

Loading happens at the boot of every process (API, web and worker): plugins
with \`ACTIVATED\` status in the database get \`register\` called and their hooks
enter the shared registry. Activating/deactivating via the API reloads the
API process in place; web/worker pick the change up on the next restart.
A plugin that fails to load is isolated: the failure is logged and never
breaks the boot of the other plugins or of the process.

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
okcms plugin:create --name my-plugin

# 2. Implement plugins/my-plugin/index.js

# 3. If you created it OUTSIDE the project, install it (validates compatibility and copies into plugins/)
okcms plugin:install --name ../my-plugin-source

# 4. Management
okcms plugin:list                                # installed + local state
okcms plugin:manage -n my-plugin --info          # manifest information
okcms plugin:manage -n my-plugin --disable       # marks as disabled in the local state (.okcms/extensions.json)
okcms plugin:manage -n my-plugin --enable        # marks as enabled again (same local state)
okcms plugin:manage -n my-plugin --uninstall     # removes the project files
# Runtime effect comes from the admin: activate/deactivate flips the database
# status loaded at boot (web/worker on the next restart).

# 5. Search npm (packages with the okcms-plugin keyword)
okcms plugin:search -q gallery

# 6. Published/updated? Stage the SQL + build the themes + deploy (saved target)
okcms redeploy --dry-run   # only shows the plan
okcms redeploy
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
okcms theme:create --name my-theme --style css   # css | scss | tailwind
\`\`\`

\`\`\`
themes/my-theme/
├── theme.json               # manifest (type: theme + compatibility)
├── home.astro               # hierarchy templates AT THE ROOT
├── index.astro
├── single.astro
├── page.astro
├── archive.astro
├── 404.astro
├── dist/theme.css           # css engine — ready to serve
│                            # (or styles/main.scss — or src/input.css)
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

Isolation (\`stylesConfig.isolation\`): \`scss\`/\`tailwind\` always get scoped
on build (\`isolation: true\`); on the \`css\` engine the theme can take
responsibility with \`isolation: \"manual\"\` — the shipped \`dist/theme.css\`
must already be scoped (the bundled default theme is). \`isolation: false\` is
rejected.

### Templates

Templates are \`*.astro\` files **at the theme root** — that's what the site
runtime looks up (hierarchy \`home\` → \`index\` → \`404\`, with \`_shared\` →
\`default\` fallback). Syntax with variables, raw HTML, and nested
loops/conditionals:

\`\`\`html
<main class="site">
  {{#each items}}
    <article>
      <h2>{{title}}</h2>
      <p>{{excerpt}}</p>
    </article>
  {{/each}}
</main>
\`\`\`

- \`{{variable}}\` — HTML-escaped value; \`{{{html}}}\` — raw (content HTML)
- \`{{#each}}\` / \`{{#if}}\` nest, dotted paths (\`content.author.name\`)
- \`home.astro\` — home (\`{{site.title}}\`, \`{{#each items}}\`)
- \`index.astro\`, \`single.astro\`, \`page.astro\` — content (\`{{content.*}}\`, \`{{page.title}}\`)
- \`archive.astro\` — type/taxonomy listing (\`{{#each items}}\`)
- \`404.astro\` — last in the chain
- Context available: \`site.*\`, \`page.*\`, \`content.*\` (columns + fields), \`items\`,
  \`menus\`, \`contentTypes\`, \`taxonomies\`, \`terms\`, \`settings\`

> **Note — product signature:** the runtime wraps your templates with
> \`<meta name="generator" content="OkCMS <version>">\` and sends
> \`X-Powered-By: OkCMS/<version>\` on every public response. If the theme
> emits a COMPLETE document (\`<html>\` in the fragment — full-control), the
> meta is not injected (the theme owns its \`<head>\`), but the header is
> still there.

## Styles per engine

| \`--style\` | Generated file | Build |
|---|---|---|
| \`css\` (default) | \`dist/theme.css\` | none — served as is |
| \`scss\` | \`styles/main.scss\` (+ \`components.scss\`) | \`okcms theme:build -n my-theme\` |
| \`tailwind\` | \`src/input.css\` + \`tailwind.config.js\` | \`okcms theme:build -n my-theme\` |

The public site only links \`/themes/<theme>/dist/theme.css\` — on the \`css\`
engine the file is born in \`dist/\` (served with no build). On the others, the
build compiles into \`dist/theme.css\` **with \`[data-theme="my-theme"]\`
isolation** (styles never leak between themes; Tailwind already ships with
\`preflight: false\`).

> \`dist/theme.css\` is read **ready-made** by the container — nothing compiles
> SCSS or Tailwind inside the image. The file exists on the host and only
> reaches production when the image is rebuilt: \`okcms theme:build\` followed by
> \`okcms redeploy\`.

## data-theme on HTML (automatic isolation)

The site runtime wraps every public page with \`<html data-theme="<theme-name>">\`.
You **do not need** to add this attribute in your Astro templates — it is injected
automatically by the web server on every public response.

What this means for your CSS:

- **Engine \`css\` (isolation: \`manual\`)**: write all CSS scoped inside
  \`[data-theme="your-theme"]\`. Example:

  \`\`\`css
  [data-theme="my-theme"] .hero {
    padding: 4rem 0;
    text-align: center;
  }
  \`\`\`

- **Engine \`scss\`/\`tailwind\` (isolation: \`true\`)**: the build already scopes all
  CSS automatically with \`[data-theme="your-theme"]\`. You write plain CSS without
  thinking about the prefix.

If you omit \`[data-theme="..."]\` in your CSS, rules will have global scope and
may leak into other themes installed on the same site — isolation is the
protection against this.

## Development workflow

\`\`\`bash
# 1. Create it
okcms theme:create --name my-theme --style scss

# 2. Edit the root *.astro templates and styles

# 3. Compile the styles (scss/tailwind)
okcms theme:build --name my-theme

# 4. Activate it (writes activeTheme into okcms.config.json)
okcms theme:manage --name my-theme --set-active
#    (equivalent: ACTIVE_THEME=my-theme in .env)
#    The admin Themes screen activates too — the active theme is read from
#    the database on every request, no site restart needed.

# 5. Management
okcms theme:list                               # installed + status
okcms theme:manage -n my-theme --info          # theme.json information
okcms theme:manage -n my-theme --disable|enable
#    (local state .okcms/extensions.json; the active theme is the --set-active)
okcms theme:manage -n my-theme --uninstall
okcms theme:search -q blog                     # npm search (keyword okcms-theme)

# If you created it OUTSIDE the project:
okcms theme:install --name ../my-theme-source

# 6. After changing templates/styles: recompile and redo the deploy
okcms theme:build --name my-theme   # (the redeploy compiles it anyway)
okcms redeploy
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
  const readme = lang === 'pt' ? projectReadmePt(projectName) : projectReadmeEn(projectName);
  return readme.replaceAll('npx okcms', 'okcms');
}

/** PLUGIN.md na língua pedida. */
export function pluginDoc(lang: DocsLang = DEFAULT_DOCS_LANG): string {
  return lang === 'pt' ? PLUGIN_DOC_PT : PLUGIN_DOC_EN;
}

/** THEME.md na língua pedida. */
export function themeDoc(lang: DocsLang = DEFAULT_DOCS_LANG): string {
  return lang === 'pt' ? THEME_DOC_PT : THEME_DOC_EN;
}

export function providerMatrixDoc(lang: DocsLang = DEFAULT_DOCS_LANG): string {
  return lang === 'pt'
    ? `# Matriz de banco\n\n- PostgreSQL 16+ (driver postgres)\n- MySQL 8.0.36+ ou 8.4 LTS (driver mysql2)\n- MariaDB 11.4+ (driver mariadb)\n\nMySQL e MariaDB têm schemas e migrations próprios. Consulte a documentação do operador para a matriz completa e os testes de release.\n`
    : `# Database provider matrix\n\n- PostgreSQL 16+ (postgres driver)\n- MySQL 8.0.36+ or 8.4 LTS (mysql2 driver)\n- MariaDB 11.4+ (mariadb driver)\n\nMySQL and MariaDB have separate schemas and migration sets. See the operator documentation for the complete matrix and release tests.\n`;
}
