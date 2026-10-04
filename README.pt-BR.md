> 📄 **Português (Brasil)** · [English](./README.md)

# OkCMS v2

Hybrid, modular, API-first, extensible CMS with Astro+SolidJS frontend, Node.js/TypeScript backend, PostgreSQL, Docker immutable deployments, plugin/theme systems with sandbox, and multi-tenancy.

## Documentation

| Público | Guia |
|---|---|
| **Operador** (hospeda uma instalação) | [Operator Guide](./docs/operator-guide.pt-BR.md) — pré-requisitos, CLI completa, config, update, backup |
| **Operador** (deploy em Docker) | [Docker Deploy](./docs/docker-deploy.pt-BR.md) — imagem única, lanes blue/green, rollback, segurança |
| Mantenedor (contribui com o código) | [Maintainer Guide](./docs/maintainer-guide.pt-BR.md) — dev local, qualidade, publicação npm/Docker |
| Desenvolvedor de extensões | [Plugin Development](./docs/plugin-development.pt-BR.md) · [Theme Development](./docs/theme-development.pt-BR.md) |

---

## CLI `okcms`

A CLI é a **única** superfície de operação do sistema: cria o projeto, sobe os
apps, migra o banco, configura o `.env`, instala extensões e faz deploy. Ela é
zero-dependências (sem lib de prompt), roda em **Node 20+ ou Bun 1.3+** e nunca
executa dentro de um container — deploy e configuração são sempre a partir do
host.

### Instalação

```bash
# global (permite `okcms ...` sem prefixo)
npm install -g @oktis-works/cms      # ou: bun add -g @oktis-works/cms

# sem instalar: sempre funciona com npx (ou bunx com Bun)
npx okcms --help

# num projeto scaffoldado a CLI já está em devDependencies
npx okcms doctor
```

### Primeiros passos

```bash
npx okcms init meu-site      # scaffolding + bun install (ou npm, sem bun)
cd meu-site
$EDITOR .env                 # ajuste DB_PASSWORD e JWT_SECRET
npx okcms db:migrate         # aplica migrations/
npx okcms start              # api + admin + web + worker
npx okcms doctor             # se algo falhar
```

O `init` pergunta em que língua escrever as docs (`README.md`, `PLUGIN.md`,
`THEME.md`): **inglês** ou **português**. Em script/CI (sem TTY) ele não
pergunta e o default é inglês — force com `--lang en` ou `--lang pt`. Só os
arquivos Markdown são traduzidos; comandos, flags e código continuam iguais.

### Referência de comandos

**Projeto e execução**

| Comando | Opções | O que faz |
|---|---|---|
| `okcms init <dir> [nome]` | `-d, --dir` · `-l, --lang en\|pt` | Cria o projeto: configs, `.env`, compose, arquivos de deploy Docker, docs (em inglês ou português) e `bun install` |
| `okcms start` | `-A, --all` (default) · `-a, --api` · `-m, --admin` · `-w, --web` · `-W, --worker` | Sobe os apps como processos do host (pidfiles em `.data/`) |
| `okcms stop` | — | Para o que `start` subiu (pidfile + detecção) |
| `okcms status` | — | Estado dos processos + resumo do projeto |
| `okcms doctor` | — | Diagnóstico: node, `.env`, banco (`DB_*` ou `DATABASE_URL`), config, **docker, compose v2, lane, proxy** |
| `okcms config` | `-s, --set K=V` (repetível) · `-l, --list` · `-S, --show-secrets` · `-n, --non-interactive` · `-x, --section <s>` · `-F, --force` | Wizard de edição do `.env` — Enter mantém, Ctrl+C descarta tudo (exit 130) |

`--section` aceita: `app · database · redis · auth · storage · worker · cache ·
ports · theme · deploy`.

```bash
npx okcms config                          # wizard interativo
npx okcms config --list                   # chaves com segredos mascarados
npx okcms config --set PORT=4000 --set JWT_SECRET=$(openssl rand -hex 32)
npx okcms config --section deploy -n      # programático, sem TTY
```

**Atualização e deploy**

| Comando | Opções | O que faz |
|---|---|---|
| `okcms update` | — | Wizard: escolhe entre **só baixar pacotes** ou **deploy Docker blue/green** |
| `okcms update -i` | `-i, --install` | Modo download clássico: varre `node_modules/@oktis-works/*` e instala o que estiver atrás |
| `okcms update --mode deploy` | `-m, --mode download\|deploy` | Deploy blue/green completo (ver abaixo) |
| `okcms redeploy` | `-p, --plugin <n>` · `-t, --theme <n>` · `-M, --skip-migrations` · `-B, --skip-theme-build` · `-n, --dry-run` | Aplica plugin/tema recém-instalado: SQL do plugin → `migrations/`, `dist/theme.css` do tema e deploy blue/green (ver abaixo) |
| (flags de deploy) | `-c, --no-cache` · `-r, --remove-orphans` · `-k, --keep-orphans` · `-y, --yes` · `-F, --force` | Escolhas do deploy, para uso sem TTY |

```bash
npx okcms update                     # com TTY: menu de duas opções
npx okcms update -i                  # não-TTY: só pacotes (comportamento original)
npx okcms update --mode deploy       # deploy blue/green
npx okcms update --mode deploy --yes # CI: sem prompts, defaults

npx okcms plugin:install -n ./meu-plugin   # ou theme:install
npx okcms redeploy                  # stage + build + deploy (o que fazer depois de instalar)
npx okcms redeploy --dry-run        # só mostra o plano
```

> **Não-TTY nunca faz deploy por acidente.** Sem `--mode`, o default em script
> é `download` — um `-i` em cron continua fazendo exatamente o que sempre fez.

**Banco de dados**

| Comando | Opções | O que faz |
|---|---|---|
| `okcms db:migrate` | `-d, --dir` · `-t, --tenant` | Aplica as migrations pendentes de `migrations/` |
| `okcms db:rollback` | `-d, --dir` · `-t, --tenant` | Reverte a última migration |
| `okcms db:status` | `-t, --tenant` | Mostra o estado das migrations |
| `okcms db:backup` | `-o, --out` | Dump custom do Postgres com timestamp |
| `okcms db:restore` | `-f, --file` (obrigatória) · `-c, --clean` | Restaura um dump, opcionalmente dropando antes |

**Extensões**

| Comando | Opções | O que faz |
|---|---|---|
| `okcms plugin:create` | `-n, --name` (obrigatória) · `-d, --dir` | Scaffold mínimo de plugin |
| `okcms plugin:install` | `-n, --name` (obrigatória) | Instala de um caminho local + registra |
| `okcms plugin:list` · `plugin:search` | `-q, --query` | Lista instalados / busca no npm (`okcms-plugin`) |
| `okcms plugin:manage` | `-n, --name` (obrigatória) · `-i` · `-e` · `-d` · `-u` | Info, enable, disable, uninstall |
| `okcms theme:create` | `-n, --name` (obrigatória) · `-d, --dir` · `-s, --style css\|scss\|tailwind` | Scaffold mínimo de tema |
| `okcms theme:install` · `theme:list` · `theme:search` | `-q, --query` | Instalação/consulta de temas |
| `okcms theme:manage` | `-n, --name` (obrigatória) · `-i` · `-e` · `-d` · `-u` · `-s, --set-active` | Info, enable, disable, uninstall, ativar |
| `okcms theme:build` | `-n, --name` (obrigatória) · `-d, --themes-dir` | Compila SCSS/Tailwind → `dist/theme.css` isolado |

**Conteúdo e sistema**

| Comando | Opções | O que faz |
|---|---|---|
| `okcms user:create` | `-e, --email` · `-n, --name` · `-p, --password` (todos obrigatórios) · `-t, --tenant` | Cria usuário e atribui papel no tenant |
| `okcms seed` | — | Dados iniciais (roles + settings) — idempotente |
| `okcms system:status` | — | Status do ambiente + saúde do banco |
| `okcms media:migrate` | `-f, --from` · `-t, --to` (obrigatórios) | Move mídia entre drivers (`local`, `s3`, `r2`, `minio`) |
| `okcms prerender` | `-o, --out` | HTML estático das páginas publicadas |
| `okcms build` | `-a, --apps api,admin,web` | Build dos apps (só em monorepo) |

**Convenções e exit codes**

- `0` sucesso · `1` erro · `130` interrompido (Ctrl+C) — nenhum artefato gravado.
- Toda opção booleana é `-x` ou `--long`; opções marcadas *repetível* (`--set`)
  acumulam ocorrências em vez de sobrescrever.
- Comandos que alteram estado fora do processo recusam rodar **dentro** de um
  container (`okcms update`, `okcms redeploy`, `okcms config`); `--force` é o
  escape consciente.
- Segredos nunca aparecem em `--list` sem `--show-secrets`, e nunca são
  impressos de volta em erro.

---

## Deploy em Docker (blue/green)

O `okcms init` já escreve tudo que o deploy precisa:

```
meu-site/
├── docker/Dockerfile              # imagem única okcms/app (4 entrypoints)
├── docker/entrypoint.sh           # roteia api | admin | web | worker
├── docker-compose.infra.yml       # projeto `okcms`: rede, postgres, redis, proxy
├── docker-compose.deploy.yml      # projeto das lanes: 8 services blue/green
├── deploy/nginx/templates/…       # template do proxy (envsubst)
├── deploy/nginx/conf.d/00-upstreams.conf   # reescrito pela CLI no swap
└── .deploy/state.json             # lane ativa + histórico (gitignored)
```

```bash
npx okcms update --mode deploy
```

O que acontece, nesta ordem:

1. preflight (docker + compose v2) e rede `okcms-net`;
2. infraestrutura no ar (postgres, redis, proxy) e healthcheck;
3. pacotes `@oktis-works/*` atualizados **no host**;
4. `docker compose build` da lane nova — ainda sem tráfego;
5. `okcms db:migrate` **no host** — falhou aqui e nada mudou;
6. sobe o edge (`api`, `web`, `admin`) da lane nova e espera cada healthcheck;
7. troca o proxy: `00-upstreams.conf` + `nginx -s reload` (conexões vivas);
8. **drena** o worker antigo (SIGTERM + `stop_grace_period`), sobe o novo;
9. derruba a lane antiga com `down` — **sem `-v`**, o volume de mídia é compartilhado;
10. grava `.deploy/state.json` (a lane antiga vira o caminho de rollback).

Qualquer falha nos passos 4–7 desfaz o que já foi feito e deixa a lane atual
servindo. Detalhes completos em **[docs/docker-deploy.md](./docs/docker-deploy.pt-BR.md)**.

### Aplicando um plugin ou tema novo

Instalar extensão **não muda o que está no ar**: `plugins/` e `themes/`
entram na imagem pelo `COPY . .` do build, e `themes/<n>/dist/theme.css` é
compilado **no host** (o container não compila SCSS/Tailwind). Um plugin que
mexe no banco, além disso, precisa aplicar o SQL dele.

```bash
npx okcms plugin:install -n ./meu-plugin   # ou: theme:install
npx okcms redeploy
```

O `okcms redeploy` faz o ciclo completo, nesta ordem:

1. copia `plugins/<n>/migrations/*.sql` para `migrations/` — idempotente, e um
   nome fora de `V###__owner__nome.sql` **nunca** é copiado (quebraria todo
   `db:migrate`);
2. compila o estilo de cada tema que tiver entrada, gravando
   `themes/<n>/dist/theme.css`;
3. roda o mesmo blue/green do `okcms update --mode deploy`, só que **sem**
   `bun add` — o que mudou é conteúdo de extensão, não versão de pacote.

Falha no preparo (1 ou 2) aborta antes de tocar no Docker; falha no deploy
faz rollback, como sempre. Opções úteis:

| Flag | Efeito |
|---|---|
| `-n, --dry-run` | Mostra o plano (o que seria copiado/compilado) e sai |
| `-p, --plugin <n>` / `-t, --theme <n>` | Restringe o **preparo** a uma extensão (o rebuild é sempre global) |
| `-M, --skip-migrations` | Não copia SQL de plugin para `migrations/` |
| `-B, --skip-theme-build` | Não compila estilos (só para rebuild de plugin) |
| `-y, --yes` | Sem prompts (CI) — as flags de deploy valem igual |

---

## Architecture

- **Frontend**: Astro (SSR/SSG) + SolidJS (reactive islands)
- **Backend**: Node.js + TypeScript + Hono
- **Database**: PostgreSQL with Row-Level Security
- **Cache/Queue**: Redis
- **Build**: Docker immutable builds with layer caching
- **Monorepo**: Bun workspaces

## Project Structure

```
okcms-v2/
├── apps/
│   ├── api/           # Hono API server
│   ├── admin/         # Astro + SolidJS admin
│   ├── web/           # Public website
│   └── worker/        # Background job processor
├── packages/
│   ├── types/         # Shared TypeScript types
│   ├── config/        # Configuration management
│   ├── database/      # PostgreSQL connection, migrations, RLS
│   ├── core/          # Bootstrap, lifecycle, events, cache
│   ├── auth/          # JWT, RBAC, sessions
│   ├── api-client/    # HTTP client for API
│   ├── ui/            # Shared UI components
│   ├── plugin-sdk/    # Plugin development SDK
│   ├── theme-sdk/     # Theme development SDK
│   ├── plugin-runtime/# Plugin sandbox and execution
│   ├── theme-runtime/ # Theme rendering engine
│   ├── cli/           # `okcms` CLI (assets canônicos de deploy em src/assets.ts)
│   ├── validation/    # CMS_VERSION / compatibilidade
│   └── utils/         # Shared utilities
├── infrastructure/    # Espelhos gerados da CLI (docker/, compose/, nginx/)
├── plugins/           # Plugin packages
├── themes/            # Theme packages
├── docs/              # Documentation
└── tests/             # Integration tests
```

`infrastructure/**` é **gerado** a partir de `packages/cli/src/assets.ts` —
não edite à mão:

```bash
bun scripts/sync-infrastructure.ts
```

## Getting Started

### Prerequisites

- Node.js 20+
- Bun 1.3+
- Docker & Docker Compose v2 (só para o deploy blue/green)
- PostgreSQL 16+

### Development

1. Clone the repository
2. Install dependencies:
   ```bash
   bun install
   ```

3. Start development environment:
   ```bash
   docker compose up -d
   ```

4. Run API server:
   ```bash
   bun run --filter @oktis-works/api dev
   ```

### Building

```bash
# Build all packages
bun run build

# Build specific package
bun run --filter @oktis-works/api build

# Docker image (equivalente ao que o deploy usa)
docker build -f infrastructure/docker/Dockerfile -t okcms/app .
```

### Testing

```bash
bun run test:run
bun run typecheck
bun run lint
```

## Environment Variables

```bash
# Database (formato (a) variáveis, ou (b) DATABASE_URL com precedência)
DB_HOST=localhost
DB_PORT=5432
DB_NAME=okcms
DB_USER=postgres
DB_PASSWORD=
# DATABASE_URL=postgresql://user:password@localhost:5432/okcms

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Authentication
JWT_SECRET=your-secret-key

# Application
NODE_ENV=development
PORT=3000        # api
WEB_PORT=3001    # site público
ADMIN_PORT=3011  # painel
```

Edite com o wizard: `npx okcms config`.

## API Endpoints

### Health
- `GET /health` - Health check
- `GET /health/ready` - Readiness check
- `GET /health/live` - Liveness check

### Authentication
- `POST /api/v1/auth/register` - Register user
- `POST /api/v1/auth/login` - Login
- `POST /api/v1/auth/refresh` - Refresh token
- `POST /api/v1/auth/logout` - Logout

### Content
- `GET /api/v1/content` - List content
- `GET /api/v1/content/:id` - Get content by ID
- `GET /api/v1/content/slug/:slug` - Get content by slug
- `POST /api/v1/content` - Create content
- `PUT /api/v1/content/:id` - Update content
- `DELETE /api/v1/content/:id` - Delete content
- `GET /api/v1/content/:id/versions` - Get content versions

## License

MIT
