# cms-teste2

OkCMS project created with `okcms init`. This guide explains the system and
how to run it in local development and with Docker.

## What is OkCMS

An API-first, multi-tenant, extensible CMS. Four apps + one CLI:

| App | Package | Role |
|---|---|---|
| **API** | `@oktis-works/api` | REST server (Hono) at `/api/v1`: content, auth, media, plugins |
| **Admin** | `@oktis-works/admin` | Admin panel (Astro + SolidJS) |
| **Web** | `@oktis-works/web` | Public site (Astro) |
| **Worker** | `@oktis-works/worker` | Background queues/jobs (bullmq): publishing, media, webhooks, cache |
| **CLI** | `@oktis-works/cms` | `okcms` — init, start, database, extensions, update |

- **Database:** PostgreSQL (Row-Level Security, multi-tenant)
- **Cache and queues:** Redis
- **Extensions:** [plugins](./PLUGIN.md) (hooks/filters at runtime) and [themes](./THEME.md) (templates + isolated styles)

## Project structure

| Path | What it is |
|---|---|
| `okcms.config.json` | Structure: name, ports, storage, dirs, active theme. **No database credentials.** |
| `.env` | **Single source of connection**: database (`DB_*` or `DATABASE_URL`), Redis, JWT, ports |
| `package.json` | CMS apps (`api`, `admin`, `web`, `worker`) + CLI in devDependencies + shortcut scripts (start, migrate, doctor…) |
| `plugins/`, `themes/` | Project extensions |
| `migrations/` | SQL migrations (`okcms db:migrate`) |
| `docker-compose.yml` | Local infrastructure: PostgreSQL + Redis (healthcheck + volume) |
| `docker/Dockerfile`, `.dockerignore` | Single `okcms/app` image — 4 entrypoints: api, admin, web, worker |
| `docker-compose.infra.yml` | `okcms` project: network, postgres (127.0.0.1 only), redis (internal only) and proxy |
| `docker-compose.deploy.yml` | The 8 blue/green services: api, web, admin, worker × blue, green |
| `deploy/nginx/` | Proxy template + `conf.d/00-upstreams.conf` (rewritten on swap) |
| `.deploy/` | Deploy state: active lane, previous lane and history (not versioned) |

## Getting started (local development)

Prerequisites: **Node 20+** or **Bun 1.3+** · **PostgreSQL 16+** (required) ·
**Redis** (optional — only for the worker queues).

> **Project CLI:** after installation, commands run directly with `okcms`.
> For bootstrap without a global install, use
> `npx @oktis-works/cms@latest init` or `bunx @oktis-works/cms@latest init`.

```bash
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

# 3. Migrations (applies schema + seeds roles/settings)
okcms db:migrate

# 4. **Create your first user (REQUIRED — no login exists without it)**
okcms user:create   --email your@email.com   --name "Admin"   --password "StrongPass123"   --role SUPER_ADMIN   --tenant default

# 5. Start everything: api + admin + web + worker
okcms start

# 6. If something fails
okcms doctor
```

Default ports (adjustable in `.env`): **API 3000** (`PORT`) · **Web 3001**
(`WEB_PORT`) · **Admin 3011** (`ADMIN_PORT`).

## Getting started (Docker)

```bash
docker compose up -d   # infrastructure only: postgres:16 + redis:7 (healthcheck + volumes)
okcms db:migrate
okcms start            # apps run as normal processes, outside the compose
```

The generated `.env` already points to `localhost`, where the compose publishes
the Postgres (5432) and Redis (6379) ports. The apps themselves run via
`okcms start` — the compose is only the infrastructure.

To run the **whole application in Docker** (api, admin, web and worker in
containers behind an nginx), use `okcms deploy`:

```bash
okcms deploy                       # opens the target menu (↑/↓ + Enter)
okcms deploy --target simple      # or fixes the target without the menu
```

There are three targets: **blue/green** (two lanes, no downtime), **simple**
(one stack in `docker-compose.app.yml`, fast restart) and **pm2** (host
processes, no Docker). The choice is stored in `.deploy/state.json` and shared
by `deploy`, `update` and `redeploy`.

That is the production path — see the complete guide at
[docs/docker-deploy.md](https://github.com/oktis-works/cms/blob/main/docs/docker-deploy.md).

## Production

In production **do not use `okcms start` as a supervisor** — it is a dev
convenience: it does not restart children that die and mixes every app's logs
into a single stream. Pick one of the paths below.

### Path 1: pm2 (host processes)

One pm2 **process per app** — restart on crash, log per process, `pm2
startup` on server boot and individual `pm2 reload`
(zero-downtime). Requires **Bun installed on the server** (apps start via
`bunx`).

```js
// ecosystem.config.js
module.exports = {
  apps: [
    { name: 'okcms-api',    script: 'bunx', args: '@oktis-works/api',    env: { NODE_ENV: 'production', PORT: 3000 } },
    { name: 'okcms-admin',  script: 'bunx', args: '@oktis-works/admin',  env: { NODE_ENV: 'production', PORT: 3011 } },
    { name: 'okcms-web',    script: 'bunx', args: '@oktis-works/web',    env: { NODE_ENV: 'production', WEB_PORT: 3001 } },
    { name: 'okcms-worker', script: 'bunx', args: '@oktis-works/worker', env: { NODE_ENV: 'production', WORKER_MODE: 'pm2' } },
  ],
};
```

```bash
pm2 start ecosystem.config.js
pm2 save && pm2 startup              # start on boot
pm2 reload okcms-api                 # update with no downtime (per app)
pm2 logs okcms-api                   # log per process
pm2 unmonitor okcms-api && pm2 delete okcms-api   # remove
```

- The worker has a **native pm2 mode**: `WORKER_MODE=pm2` (cluster) combined with
  `WORKER_COUNT` and `WORKER_CONCURRENCY`.
- Since each app is an independent executable, `okcms start` is not
  needed in production — pm2 supervises each one directly.

### Path 2: Docker — blue/green or simple (recommended)

The project ships with everything a deploy needs ( `okcms init` writes
`docker/`, all three compose files and the proxy's `deploy/`). A deploy is a
single command from the host:

```bash
okcms deploy                   # first deploy (target menu)
okcms update --mode deploy     # after that: wizard with the saved target
okcms deploy --target simple   # single stack, no lanes
```

With the **blue/green** target the application runs in **two lanes**
(`okcms-blue` and `okcms-green`) behind a public nginx. Each deploy:

1. builds the new image in a lane that **receives no traffic**;
2. runs `okcms db:migrate` **on the host** (if it fails, nothing changed);
3. starts the new lane's edge and waits for every container's healthcheck;
4. swaps the proxy by rewriting `00-upstreams.conf` + `nginx -s reload`
   (existing connections stay alive);
5. **drains** the old worker (SIGTERM + `stop_grace_period`) and starts the new one;
6. tears down the old lane — **without `-v`**: the media volume is shared.

With the **simple** target the path is shorter: build → migrations → `up -d` →
healthcheck → `nginx -s reload` — no second lane and a fast restart; zero
downtime is what blue/green is for.

**Rollback** = run the same command again, or point the upstream back to the
other lane. Details, ports and security in
[docs/docker-deploy.md](https://github.com/oktis-works/cms/blob/main/docs/docker-deploy.md).

Manual alternative (without the CLI): `docker build -f docker/Dockerfile` with the
monorepo context and `docker run --env-file .env` — functional, but it hands you
the 6 steps above to do by hand. Prefer the CLI command.

- Production Postgres/Redis: managed services or your own containers with a
  volume and backups — do not use the dev `docker-compose.yml`. The project's
  `docker-compose.infra.yml` is the acceptable minimum (postgres only on
  `127.0.0.1`, redis with no published port).
- **Migration as a deploy step**: already handled by `--mode deploy`, between
  the build and the first traffic.

### Checklist (both paths)

- [ ] `NODE_ENV=production` and a strong, unique `JWT_SECRET`
- [ ] `.env` out of version control; credentials never in `okcms.config.json`
- [ ] TLS reverse proxy (nginx/caddy) in front of api/admin/web
- [ ] Pinned versions in the project `package.json` (no `@latest` in a deploy)
- [ ] `okcms db:migrate` in the deploy pipeline and scheduled `okcms db:backup`
- [ ] Real Redis in production (the worker queues do not work without Redis)
- [ ] `okcms doctor` green on the target environment
- [ ] Logs with a destination (pm2 logrotate, or container stdout collected)

## CLI commands

> The names below are the command itself: after install, use `okcms`
> directly. Outside a project, install it globally with
> `bun add -g @oktis-works/cms`.

| Command | What it does |
|---|---|
| `okcms init <dir>` | Creates the project (files + docs in `--lang en\|pt`) and installs dependencies |
| `okcms start [--api\|--admin\|--web\|--worker\|--all]` | Starts the apps (default: all) |
| `okcms stop` / `okcms status` | Stops / shows the processes (pidfiles) |
| `okcms doctor` | Diagnostics: node, `.env`, database (`DB_*` or `DATABASE_URL`), config, docker, compose, lane and proxy |
| `okcms config` | `.env` configuration wizard (Enter keeps, Ctrl+C discards) · `--list` · `--set K=V` · `--section <s>` |
| `okcms db:migrate` · `db:rollback` · `db:status` | Migrations from the `migrations/` folder (`--tenant` optional) |
| `okcms db:backup` · `db:restore -f <file>` | Postgres backup/restore |
| `okcms plugin:create -n <name>` | Plugin scaffold — guide in [PLUGIN.md](./PLUGIN.md) |
| `okcms plugin:install -n <path>` | Installs a plugin from a local path + registers it |
| `okcms plugin:list` · `plugin:search` · `plugin:manage` | Lists, searches (npm) and enables/disables plugins |
| `okcms theme:create -n <name> --style css\|scss\|tailwind` | Theme scaffold — guide in [THEME.md](./THEME.md) |
| `okcms theme:install` · `theme:list` · `theme:search` · `theme:manage` | Theme management (`--set-active` sets the active one) |
| `okcms theme:build -n <name>` | Compiles SCSS/Tailwind → isolated `dist/theme.css` |
| `okcms deploy` | First deploy — target menu: blue/green, simple or pm2 (`--target`, `--yes`) |
| `okcms update` | Full update: packages → migrations → healthcheck → deploy, with a `y/n` confirmation |
| `okcms update -i` | Legacy alias; the full update already installs packages |
| `okcms update --mode download` | Packages only; it never starts Docker |
| `okcms update --mode deploy` | Full deploy: build → migrations → healthcheck → swap (target: `--target blue-green\|simple\|pm2`) |
| `okcms redeploy` | After installing a plugin/theme: plugin SQL → `migrations/`, theme `dist/theme.css` and deploy (`--dry-run` only shows the plan, `--target` picks the target) |
| `okcms seed` | Seeds initial data (roles + settings) — idempotent |
| `okcms user:create` | Creates a user and assigns a role inside the tenant |
| `okcms system:status` | System status (environment + database health) |
| `okcms media:migrate` | Migrates media files between drivers (`local` ↔ `s3`/`r2`/`minio`) |
| `okcms prerender` | Generates static HTML for published pages (best-effort) |
| `okcms build` | Builds the monorepo apps (`--apps api,admin,web`) |

## Database

- **Connection** (in `.env`, pick one format): `DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD`
  **or** `DATABASE_URL` (takes precedence). `okcms doctor` validates both.
- **Migrations**: SQL files in `migrations/`; `okcms db:migrate` applies,
  `db:rollback` reverts, `db:status` shows the state. `--tenant` is selective
  (default `default`) — the database is multi-tenant via Row-Level Security.
- **Backup**: `okcms db:backup` writes a timestamped dump; `db:restore -f <file>` restores it.

## Updating

```bash
okcms update        # full update: asks y/n, then packages + migrations + deploy
okcms update --mode download  # only downloads/applies the packages
okcms update --mode deploy          # full blue/green deploy
okcms update --mode deploy --yes    # no prompts (CI/CD)
```

In **non-TTY** (script/CI), the full update requires `--yes` for
confirmation. Use `--mode download` for package-only updates. The full
update runs migrations on the host before deployment.

Deploy flags: `--no-cache` (clean rebuild) · `--remove-orphans`
(default) · `--keep-orphans` · `--yes` (no prompts).

### Applying a new plugin or theme

Installing an extension does not change what is running: `plugins/` and `themes/`
go into the image at build time, and `themes/<n>/dist/theme.css` is compiled
**on the host**. After `plugin:install` / `theme:install`, run:

```bash
okcms redeploy
```

It copies `plugins/<n>/migrations/*.sql` into `migrations/` (idempotent),
compiles the style of every theme with an entry and redoes the blue/green
deploy — without `bun add`. Use `--dry-run` to see the plan,
`--plugin <name>` / `--theme <name>` to narrow the preparation, and
`--skip-migrations` / `--skip-theme-build` to skip steps.

```bash
okcms doctor        # checks docker, compose v2, lane and proxy before/after
```

## Next steps

- Extend the CMS with plugins → [PLUGIN.md](./PLUGIN.md)
- Create/activate a theme → [THEME.md](./THEME.md)
