> 📄 **English** · [Português](./operator-guide.pt-BR.md)

# Operator guide

Guide for someone **hosting an instance** of OkCMS. No need to read code: it is the
operation reference — install, configure, start, migrate, install
extensions, update, back up and diagnose.

- Docker deploy (production): [docker-deploy.md](./docker-deploy.md)
- Writing plugin/theme: [plugin-development.md](./plugin-development.md) ·
  [theme-development.md](./theme-development.md)

## Prerequisites

| Needed for | Requirement |
|---|---|
| always | **Node 20+** or **Bun 1.3+** |
| always | **PostgreSQL 16+** |
| worker queues | **Redis** (without it: `REDIS_HOST=disabled` — in-memory cache, queues don't work) |
| Docker deploy | **Docker** + **Docker Compose v2** (`docker compose version`) |

## Installing the CLI

```bash
# global — allows `okcms ...` without a prefix in any folder
npm install -g @oktis-works/cms      # or: bun add -g @oktis-works/cms

# without installing — always works
npx okcms --help                     # bunx okcms --help with Bun
```

In a project created with `okcms init` the CLI is already in `devDependencies`, so
`npx okcms ...` is enough. The `package.json` shortcuts also already exist:
`bun run start` · `bun run migrate` · `bun run doctor` · `bun run backup`.

> The CLI **never runs inside a container**: `update`, `redeploy` and
> `config` refuse (it is the host that has the `.env` and the Docker). `--force` is the
> deliberate escape hatch.

## Creating the project

```bash
npx okcms init meu-site
cd meu-site
$EDITOR .env            # DB_PASSWORD and JWT_SECRET, at minimum
npx okcms db:migrate    # schema + idempotent seed
npx okcms start         # api + admin + web + worker
npx okcms doctor        # if anything fails
```

The `init` creates the whole structure — including the Docker deploy files — and
runs `bun install` (falls back to `npm install` if there is no Bun).

It also asks which language to write the project docs in (`README.md`,
`PLUGIN.md`, `THEME.md`): English or Portuguese. In a script/CI (no TTY) the
question does not appear and **English** is the default — force it with
`--lang en` or `--lang pt`. Only the Markdown files change language; commands,
flags and log messages stay as they are.

```
meu-site/
├── okcms.config.json     # name, ports, storage, dirs, active theme (no credentials)
├── .env                  # ONLY source of credentials: database, redis, JWT, ports
├── migrations/           # SQL applied by `okcms db:migrate`
├── plugins/  themes/     # project extensions
├── docker-compose.yml    # dev infra: postgres + redis
└── docker/ deploy/ …     # blue/green deploy files
```

## `.env` configuration

```bash
npx okcms config                          # interactive wizard
npx okcms config --list                   # keys, with secrets masked
npx okcms config --show-secrets           # reveals the values
npx okcms config --set PORT=4000          # programmatic (repeatable)
npx okcms config --section deploy -n      # no TTY: asks no question at all
npx okcms config --set JWT_SECRET=$(openssl rand -hex 32)
```

Wizard rules: **Enter keeps the current value** (no default written by
accident), changes are applied only after **all** of them are validated (the write
is atomic), and **Ctrl+C discards everything** with exit `130`.

`--section` accepts: `app · database · redis · auth · storage · worker · cache ·
ports · theme · deploy`.

Database in two formats, pick one — `DATABASE_URL` has precedence:

```bash
# (a) separate variables (default)
DB_HOST=localhost DB_PORT=5432 DB_NAME=okcms DB_USER=postgres DB_PASSWORD=…
# (b) single URL
DATABASE_URL=postgresql://postgres:senha@localhost:5432/okcms
```

## Running

```bash
npx okcms start              # everything (api + admin + web + worker)
npx okcms start --api        # only one app (-a) · --admin (-m) · --web (-w) · --worker (-W)
npx okcms status             # what is running (pidfiles in .data/)
npx okcms stop               # stops what start brought up
npx okcms doctor             # node, .env, database, config, docker, compose, lane, proxy
```

`okcms start` is **dev convenience**: it does not restart children that die and
mixes the logs. In production use pm2 or the Docker deploy — see
[docker-deploy.md](./docker-deploy.md).

Default ports (adjustable in the `.env`): **API 3000** (`PORT`) · **Web 3001**
(`WEB_PORT`) · **Admin 3011** (`ADMIN_PORT`).

## Database

```bash
npx okcms db:migrate                    # applies pending migrations/
npx okcms db:status                     # what has already been applied
npx okcms db:rollback                   # reverts the last one
npx okcms db:migrate --tenant outro     # selective migration (default: default)
npx okcms db:backup                     # timestamped dump in backups/
npx okcms db:restore -f backups/arquivo.sql
npx okcms db:restore -f dump.sql --clean   # drop before restoring
```

- The database is **multi-tenant via Row-Level Security**; `--tenant` accepts the slug
  (`default`) and resolves it to the UUID.
- **Migrations are immutable** after they are applied: to change something,
  create a new one. Rewriting the file invalidates the recorded checksum.
- Mandatory name: `V<numero>__<owner>__<nome>.sql` — `owner` = `core` for the
  CMS schema, any other name marks the migration as a plugin one.
- Before touching production: `db:backup`. Always.

## Extensions

```bash
# plugins
npx okcms plugin:create -n meu-plugin
npx okcms plugin:install -n ./caminho/para/meu-plugin
npx okcms plugin:list
npx okcms plugin:manage -n meu-plugin --info|--enable|--disable|--uninstall
npx okcms plugin:search -q galeria          # npm, keyword okcms-plugin

# themes
npx okcms theme:create -n meu-tema --style scss
npx okcms theme:install -n ./caminho/para/meu-tema
npx okcms theme:manage -n meu-tema --set-active
npx okcms theme:build -n meu-tema           # scss/tailwind → dist/theme.css
npx okcms theme:list
```

Installing copies the files into `plugins/` / `themes/` and validates
`compatibility.okcms` against the CMS version — an incompatible manifest is
refused.

### After installing: `okcms redeploy`

**Installing does not change what is live.** `plugins/` and `themes/` go into the
image at build, and `themes/<n>/dist/theme.css` is compiled on the host (the
container does not compile SCSS/Tailwind). A plugin that touches the database must
additionally apply its own SQL.

```bash
npx okcms redeploy --dry-run   # only shows the plan
npx okcms redeploy             # stage + build + deploy blue/green
```

1. copies `plugins/<n>/migrations/*.sql` into `migrations/` — idempotent;
   a name outside `V###__owner__nome.sql` is never copied, and an existing
   file outside the pattern **stops the command before Docker**;
2. compiles each theme's style entry, writing `dist/theme.css`;
3. runs the blue/green deploy **without `bun add`** (what changed is an extension,
   not a package version).

| Flag | Effect |
|---|---|
| `-n, --dry-run` | Only the plan, nothing executed |
| `-p, --plugin <n>` / `-t, --theme <n>` | Restricts the **prep** to one extension (the rebuild is always global) |
| `-M, --skip-migrations` | Does not copy plugin SQL |
| `-B, --skip-theme-build` | Does not compile styles |
| `-y, --yes` | No prompts (CI) |
| deploy flags | `-c/--no-cache` · `-r/--remove-orphans` · `-k/--keep-orphans` · `-F/--force` |

If the project does not run in Docker (dev on the host), the cycle is just:

```bash
npx okcms theme:build -n meu-tema
npx okcms db:migrate
npx okcms stop && npx okcms start
```

## Updating

```bash
npx okcms update                     # with TTY: menu
npx okcms update -i                  # only downloads/applies the packages (classic behavior)
npx okcms update --mode deploy       # full blue/green Docker deploy
npx okcms update --mode deploy --yes # CI: no prompts
```

> **Non-TTY never deploys by accident.** Without `--mode`, the default in a script
> is `download` — an `-i` in cron keeps doing exactly what it always did.

## Backup and recovery

```bash
npx okcms db:backup                                   # timestamped dump
npx okcms db:restore -f backups/okcms-2026-10-04.sql  # restore
```

Schedule the `db:backup` (systemd cron) **and** copy the media directory
(`STORAGE_LOCAL_PATH`, default `.data/storage`) — the Docker volume
`okcms-storage` is shared across the lanes and is **never** deleted by the
deploy, but an off-server backup is the only one that survives losing the machine.

## Command reference

| Command | What it does |
|---|---|
| `okcms init <dir> [nome]` | Creates the project (configs, `.env`, compose, deploy, docs in English or Portuguese — `--lang en\|pt`) + install |
| `okcms start` / `stop` / `status` | Starts / stops / shows the host processes |
| `okcms doctor` | Full diagnostics (node, `.env`, database, config, docker, compose, lane, proxy) |
| `okcms config` | `.env` wizard (`--list`, `--set`, `--section`, `--show-secrets`) |
| `okcms update` | Packages only **or** blue/green deploy |
| `okcms redeploy` | Applies a new plugin/theme: plugin migrations + theme build + deploy |
| `okcms db:migrate` · `db:rollback` · `db:status` | Migrations from `migrations/` (`--tenant` optional) |
| `okcms db:backup` · `db:restore -f <arquivo>` | Postgres backup/restore |
| `okcms plugin:create` · `plugin:install` · `plugin:list` · `plugin:search` · `plugin:manage` | Plugin lifecycle |
| `okcms theme:create` · `theme:install` · `theme:list` · `theme:search` · `theme:manage` | Theme lifecycle (`--set-active`) |
| `okcms theme:build -n <nome>` | Compiles SCSS/Tailwind → isolated `dist/theme.css` |
| `okcms user:create` | Creates a user and assigns a role in the tenant |
| `okcms seed` | Initial roles + settings (idempotent) |
| `okcms system:status` | Environment status + database health |
| `okcms media:migrate -f <de> -t <para>` | Moves media between drivers (`local`, `s3`, `r2`, `minio`) |
| `okcms prerender` | Static HTML of published pages (best-effort) |
| `okcms build` | Builds the apps (only in monorepo) |

## Exit codes and conventions

| Code | Meaning |
|---|---|
| `0` | success (or an explicit user refusal at a prompt) |
| `1` | error — with the cause printed; no half of an operation is left applied |
| `130` | interrupted (Ctrl+C) — nothing was written |

- Every boolean option accepts `-x` or `--long`; `--set` is repeatable and accumulates.
- Secrets appear masked in `--list` and never come back to the terminal on
  an error: `redact()` covers credential URLs, passwords and tokens.
- Commands that change state outside the process refuse to run **inside** a
  container; `--force` is the escape hatch.

## Troubleshooting

| Symptom | What to do |
|---|---|
| `init` fails on install | Run `bun install` (or `npm install`) by hand and look at the error |
| `start` dies right away | `npx okcms doctor` — almost always an incomplete `.env` or a database that is down |
| `403` right after the first registration | `npx okcms seed` — without the policy roles, every `requirePermission` denies |
| `db:migrate` says `Invalid migration filename` | Something in `migrations/` outside `V###__owner__nome.sql`; rename it |
| `etcd/ERR_CLIENT_RESPONSE_UNAUTHORIZED` in the worker | Redis with a wrong password in the `.env` (`REDIS_PASSWORD`) |
| Deploy stops at the healthcheck | `docker logs okcms-api-<lane>` — nothing was swapped, the current lane stays up |
| 502 after deploy | `cat deploy/nginx/conf.d/00-upstreams.conf` + `docker ps --filter label=okcms.role=edge` |
| Theme with no CSS in production | `npx okcms redeploy` — `dist/theme.css` must be built on the host |
| CLI refuses inside a container | Expected; run on the host or use `--force` |
