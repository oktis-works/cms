> 📄 **English** · [Português](./README.pt-BR.md)

# OkCMS v0.36.26

Hybrid, modular, API-first, extensible CMS with Astro+SolidJS frontend, Node.js/TypeScript backend, PostgreSQL, Docker immutable deployments, plugin and theme extension systems, and multi-tenancy.

## Documentation

| Audience | Guide |
|---|---|
| **Operator** (hosts an installation) | [Operator Guide](./docs/operator-guide.md) — prerequisites, full CLI, config, update, backup |
| **Operator** (Docker deployment) | [Docker Deploy](./docs/docker-deploy.md) — deploy targets, single image, blue/green lanes, rollback, security |
| Maintainer (contributes code) | [Maintainer Guide](./docs/maintainer-guide.md) — local dev, quality, npm/Docker publishing |
| Extension developer | [Plugin Development](./docs/plugin-development.md) · [Theme Development](./docs/theme-development.md) |

---

## CLI `okcms`

The CLI is the **only** operational surface of the system: it creates the
project, starts the apps, migrates the database, configures `.env`, installs
extensions and deploys. It is zero-dependency (no prompt library), runs on
**Node 22.17+ or Bun 1.4.4+** and never runs inside a container — deployment and
configuration always happen from the host.

### Installation

```bash
# Global install (allows `okcms ...` from anywhere)
npm install -g @oktis-works/cms      # or: bun add -g @oktis-works/cms

# Use without global install (runs latest version)
npx @oktis-works/cms@latest init meu-site
# or: bunx @oktis-works/cms@latest init meu-site

# Inside a scaffolded project, the CLI is available as `okcms`
cd meu-site
okcms doctor
```

**Local project usage (recommended):**

```bash
# 1. Create a new project
npx @oktis-works/cms@latest init meu-site
cd meu-site

# 2. Configure environment (set DB_PASSWORD and JWT_SECRET)
$EDITOR .env

# 3. Apply database migrations
bun run migrate

# 4. Start all apps (API + Admin + Web + Worker)
bun run start

# 5. Run diagnostics if anything fails
bun run doctor
```

**Or do everything in one shot with `bun run dev`:**

```bash
npx @oktis-works/cms@latest init meu-site
cd meu-site
bun run dev
```

`bun run dev` completes `.env` (generating missing secrets), starts the infrastructure (Postgres + Redis via Docker Compose), waits for Postgres, applies schema + seed + migrations, creates the first admin user, starts all apps, and prints the final URLs. It is re-runnable — after `docker compose down -v` everything is recreated on the next run.

### Interactive wizard

Run `okcms` **with no arguments in a terminal** and it opens the guided
wizard — every command, flow and field of the CLI, navigated with arrow keys
(and `1`-`9` shortcuts):

```bash
okcms            # bare command in a TTY → the wizard
okcms menu       # explicit alias for the same wizard
```

- **Guided flows** — `init`, `dev`, `deploy` (blue-green · simple · pm2) and
  `update`, with prechecks (project, docker, ports held by local apps) and a
  doctor / retry / menu choice when a step fails.
- **Every CLI command**, grouped by area. Destructive ones (`db:restore`,
  `db:rollback`, `rollback`, `update`) are marked ⚠ and demand an extra
  confirmation on top of the normal one. Each run first prints the exact
  `$ okcms …` line, so anything done interactively can be scripted later.
- **`.env` interview** — the full schema (47 fields), each with a short
  explanation, the current value (secrets masked) and Enter keeping it.
  Nothing is written until the final summary is confirmed once; Ctrl+C at
  any point discards the whole plan.
- **Adaptive status** — the menu probes docker, the compose services, the
  running apps and `.env`, then suggests the next step
  (init → env → infra → apps → deploy).
- **Language** — the UI starts in English and can be switched to Português
  (or back) from the menu; command names and flags are never translated.
  During a long-running child (`dev`, `start`) Ctrl+C stops the child and
  returns to the menu instead of killing the wizard.

Outside a TTY (pipes, scripts, CI), bare `okcms` prints the static help —
automation behavior never changes.

### First steps

```bash
npx @oktis-works/cms@latest init meu-site  # or: bunx @oktis-works/cms@latest init meu-site
cd meu-site
$EDITOR .env                 # set DB_PASSWORD and JWT_SECRET
bun run migrate              # applies migrations/
bun run start                # api + admin + web + worker
bun run doctor               # if anything fails
```

Or do the whole sequence in one shot with **`bun run dev`**: it completes
`.env` (generating missing secrets, keeping existing values), starts the
project infra (the same compose `okcms deploy` reuses) and **waits for
Postgres to accept connections** before migrating, makes Redis reachable
from the host (the infra compose keeps it network-only for production, so
the dev writes a loopback-only override in `.data/dev-infra.override.yml`
that `okcms deploy` never reads), applies schema + seed + migrations,
creates the first admin (`SUPER_ADMIN`) when the database is empty, starts
the apps and **prints the final URLs** (API · Admin · Web on localhost).
It is re-runnable — after a `docker compose down -v` everything is
recreated on the next run — and outside a TTY it requires `--yes` (with
`--email/--name/--password` for the first user).

> **Dev → deploy.** `okcms dev` prepares the *same* state `okcms deploy`
> consumes (project `.env`, the shared infra compose, versioned migrations,
> idempotent seed, the admin user) — nothing is thrown away. The only
> collision: the host processes from `start` hold the ports the containers
> need, so run `okcms stop` before `okcms deploy`. Without Docker the
> infrastructure step is skipped with a hint (bring your own Postgres);
> `okcms dev` never writes dev workarounds like `REDIS_HOST=disabled` into
> `.env` — existing values are never overwritten. The Redis override lives
> in `.data/` (gitignored); the deploy re-runs compose without it, so Redis
> goes back to network-only and the named volume is untouched.

`init` asks which language to write the docs in (`README.md`, `PLUGIN.md`,
`THEME.md`): **English** or **Português**. In a script/CI (no TTY) it does not
ask and defaults to English — force it with `--lang en` or `--lang pt`. Only
the Markdown files are localized; commands, flags and code stay the same.

Right after, it asks whether to install the project dependencies now (same
arrow-key menu). Answering **No** — or passing `--no-install` — skips the
install. When `bun` is available the install runs behind a live loader that
shows each package's real version as it lands; without bun it falls back to
`npm`.

### Command reference

**Project and execution**

| Command | Options | What it does |
|---|---|---|
| `okcms init <dir> [nome]` | `-d, --dir` · `-l, --lang en\|pt` · `-n, --no-install` | Creates the project: configs, `.env`, compose, Docker deploy files, docs (English or Portuguese) and the dependency install (bun, or npm) |
| `okcms menu` | — | Opens the interactive wizard (same as running bare `okcms` in a terminal) |
| `okcms start` | `-A, --all` (default) · `-a, --api` · `-m, --admin` · `-w, --web` · `-W, --worker` | Starts the apps as host processes (pidfiles in `.data/`) |
| `okcms stop` | — | Stops what `start` started (pidfile + detection) |
| `okcms status` | — | Process state + project summary |
| `okcms dev` | `-y, --yes` · `-s, --skip-start` · `-n, --no-infra` · `-e, --email` · `-N, --name` · `-p, --password` · `-F, --force` | One-shot dev setup + run: complete `.env` → infra (waits for Postgres, publishes Redis on loopback for host apps) → schema/seed/migrations → first admin → `start` + final URLs (re-runnable; non-TTY needs `--yes`) |
| `okcms doctor` | — | Diagnostics: node, `.env`, database (`DB_*` or `DATABASE_URL`), config, **docker, compose v2, lane, proxy** |
| `okcms config` | `-s, --set K=V` (repeatable) · `-l, --list` · `-S, --show-secrets` · `-n, --non-interactive` · `-x, --section <s>` · `-F, --force` | `.env` editing wizard — Enter keeps, Ctrl+C discards everything (exit 130) |

`--section` accepts: `app · database · redis · auth · storage · worker · cache ·
ports · theme · deploy`.

```bash
okcms config                          # interactive wizard
okcms config --list                   # keys with secrets masked
okcms config --set PORT=4000 --set JWT_SECRET=$(openssl rand -hex 32)
okcms config --section deploy -n      # programmatic, no TTY
```

**Update and deployment**

| Command | Options | What it does |
|---|---|---|
| `okcms deploy` | `-t, --target blue-green\|simple\|pm2` | **First deploy**: arrow-key menu (↑/↓ + Enter) picks the target; `--target` skips the menu |
| `okcms update` | — | Update wizard: y/n per step — packages → migrations (syncs `./migrations`) → deployment |
| `okcms update -i` | `-i, --install` | Legacy alias; the full update already installs packages |
| `okcms update --mode download` | `-m, --mode download\|deploy` | Packages + migrations sync; it never starts Docker |
| `okcms update --mode deploy` | `-t, --target blue-green\|simple\|pm2` | Full deployment for the chosen target (see below) |
| `okcms redeploy` | `-p, --plugin <n>` · `-t, --theme <n>` · `-M, --skip-migrations` · `-B, --skip-theme-build` · `-n, --dry-run` · `-T, --target blue-green\|simple\|pm2` | Applies a newly installed plugin/theme: plugin SQL → `migrations/`, theme `dist/theme.css` and deployment (see below) |
| (deploy flags) | `-c, --no-cache` · `-r, --remove-orphans` · `-k, --keep-orphans` · `-y, --yes` · `-F, --force` | `-c`/`-r`/`-k` belong to `redeploy` and `update --mode deploy` only — the first `deploy` does not expose them, and the orphan options only affect blue/green; `-y` and `-F` are for use without TTY |

```bash
okcms deploy --target simple      # first deploy: menu, or --target to skip it
okcms update                     # wizard: y/n on packages → migrations → deploy
okcms update --mode download     # packages only
okcms update --mode deploy       # deployment: target from menu, --target or saved
okcms update --mode deploy --target pm2 --yes # CI: no prompts, defaults

okcms plugin:install -n ./meu-plugin   # or theme:install
okcms redeploy                  # stage + build + deploy (what to do after installing)
okcms redeploy --dry-run        # only shows the plan
```

> **Non-TTY requires explicit confirmation.** Without `--mode`, scripts must
> pass `--yes` to run the full update. Use `--mode download` for package-only
> updates. Without `--target`, a script reuses the target saved in `.deploy/state.json`
> (blue/green on a project that never deployed) instead of prompting.

`okcms update` asks step by step: install the `@oktis-works/*` packages on
the host? download the pending migrations into `./migrations`? deploy now?
Each `n` skips that step — `n` on deploy exits without touching Docker or
PM2. The migrations ship inside the CLI package and are synced without
destroying anything: only missing files are copied; a locally edited file is
kept and the conflict is reported. On `y` to deploy, the update builds the
new version, applies the migrations on the host and deploys the chosen
target.

**Database**

| Command | Options | What it does |
|---|---|---|
| `okcms db:migrate` | `-d, --dir` · `-t, --tenant` | Applies the pending migrations from `migrations/` |
| `okcms db:rollback` | `-d, --dir` · `-t, --tenant` | Reverts the last migration |
| `okcms db:status` | `-t, --tenant` | Shows the migration state |
| `okcms db:backup` | `-o, --out` | Custom Postgres dump with timestamp |
| `okcms db:restore` | `-f, --file` (required) · `-c, --clean` | Restores a dump, optionally dropping first |

**Extensions**

| Command | Options | What it does |
|---|---|---|
| `okcms plugin:create` | `-n, --name` (required) · `-d, --dir` | Minimal plugin scaffold |
| `okcms plugin:install` | `-n, --name` (required) | Installs from a local path + registers |
| `okcms plugin:list` · `plugin:search` | `-q, --query` | Lists installed / searches npm (`okcms-plugin`) |
| `okcms plugin:manage` | `-n, --name` (required) · `-i` · `-e` · `-d` · `-u` | Info; enable/disable (local state); uninstall |
| `okcms theme:create` | `-n, --name` (required) · `-d, --dir` · `-s, --style css\|scss\|tailwind` | Minimal theme scaffold |
| `okcms theme:install` · `theme:list` · `theme:search` | `-q, --query` | Theme install/lookup |
| `okcms theme:manage` | `-n, --name` (required) · `-i` · `-e` · `-d` · `-u` · `-s, --set-active` | Info; enable/disable (local state); uninstall; activate |
| `okcms theme:build` | `-n, --name` (required) · `-d, --themes-dir` | Compiles SCSS/Tailwind → isolated `dist/theme.css` |

**Content and system**

| Command | Options | What it does |
|---|---|---|
| `okcms user:create` | `-e, --email` · `-n, --name` · `-p, --password` (all required) · `-t, --tenant` | Creates a user and assigns a role in the tenant |
| `okcms seed` | — | Initial data (roles + settings) — idempotent |
| `okcms system:status` | — | Environment status + database health |
| `okcms media:migrate` | `-f, --from` · `-t, --to` (required) | Moves media between drivers (`local`, `s3`, `r2`, `minio`) |
| `okcms build` | `-a, --apps api,admin,web` | Builds the apps (monorepo only) |

**Conventions and exit codes**

- `0` success · `1` error · `130` interrupted (Ctrl+C) — no artifact written.
- Every boolean option is `-x` or `--long`; options marked *repeatable* (`--set`)
  accumulate occurrences instead of overwriting.
- Commands that change state outside the process refuse to run **inside** a
  container (`okcms update`, `okcms redeploy`, `okcms config`); `--force` is the
  conscious escape hatch.
- Secrets never show up in `--list` without `--show-secrets`, and are never
  printed back in an error.

---

## Docker deployment

`okcms init` supports **three deploy targets**. Every run of `okcms deploy`,
`okcms update --mode deploy` and `okcms redeploy` asks which one with an
arrow-key menu (navigate with ↑/↓, confirm with Enter, last choice
pre-selected), and `--target blue-green|simple|pm2` skips the menu — the
choice is remembered in `.deploy/state.json`:

- **blue/green** — blue/green lanes behind the nginx proxy, zero-downtime swap;
- **simple** — one lane-less stack in `docker-compose.app.yml` (Docker project
  `okcms-app`, containers `okcms-api`/`okcms-web`/`okcms-admin`/`okcms-worker`)
  with nginx pointing at it, a brief restart instead of zero downtime;
- **pm2** — processes on the host via `pm2 startOrReload ecosystem.config.js --update-env`.

The sequence below is the blue/green target — `okcms init` already writes
everything deployment needs:

```
meu-site/
├── docker/Dockerfile              # single okcms/app image (4 entrypoints)
├── docker/entrypoint.sh           # routes api | admin | web | worker
├── docker-compose.infra.yml       # `okcms` project: network, postgres, redis, proxy
├── docker-compose.deploy.yml      # lanes project: 8 blue/green services
├── docker-compose.app.yml         # simple stack: project `okcms-app` (no lanes)
├── deploy/nginx/templates/…       # proxy template (envsubst)
├── deploy/nginx/conf.d/00-upstreams.conf   # rewritten by the CLI on swap
└── .deploy/state.json             # active lane + target + history (gitignored)
```

```bash
okcms deploy --target blue-green     # first deploy
okcms update --mode deploy           # the same, from every update
```

What happens, in this order (blue/green):

1. preflight (docker + compose v2) and the `okcms-net` network;
2. infrastructure up (postgres, redis, proxy) and healthcheck;
3. `@oktis-works/*` packages updated **on the host**;
4. `docker compose build` of the new lane — still with no traffic;
5. `okcms db:migrate` **on the host** — it fails here and nothing changed;
6. starts the edge (`api`, `web`, `admin`) of the new lane and waits for each healthcheck;
7. proxy swap: `00-upstreams.conf` + `nginx -s reload` (live connections);
8. **drains** the old worker (SIGTERM + `stop_grace_period`), starts the new one;
9. tears down the old lane with `down` — **without `-v`**, the media volume is shared;
10. writes `.deploy/state.json` (the old lane becomes the rollback path).

Any failure in steps 4–7 undoes what was already done and leaves the current
lane serving. Full details in **[docs/docker-deploy.md](./docs/docker-deploy.md)**.

### Applying a new plugin or theme

Installing an extension **doesn't change what's running**: `plugins/` and
`themes/` get into the image through the build's `COPY . .`, and
`themes/<n>/dist/theme.css` is compiled **on the host** (the container does not
compile SCSS/Tailwind). A plugin that touches the database must apply its own SQL.

```bash
okcms plugin:install -n ./meu-plugin   # or: theme:install
okcms redeploy
```

`okcms redeploy` runs the full cycle, in this order:

1. copies `plugins/<n>/migrations/*.sql` to `migrations/` — idempotent, and a
   name outside `V###__owner__nome.sql` is **never** copied (it would break every
   `db:migrate`);
2. compiles the style of each theme that has an entry, writing
   `themes/<n>/dist/theme.css`;
3. runs the deploy of the chosen target — same as `okcms update --mode deploy`,
   except **without**
   `bun add` — what changed is extension content, not a package version.

Failure in preparation (1 or 2) aborts before touching the deploy; a deployment
failure rolls back, as always. Useful options:

| Flag | Effect |
|---|---|
| `-n, --dry-run` | Shows the plan (what would be copied/compiled) and exits |
| `-p, --plugin <n>` / `-t, --theme <n>` | Restricts **preparation** to a single extension (the rebuild is always global) |
| `-M, --skip-migrations` | Doesn't copy plugin SQL to `migrations/` |
| `-B, --skip-theme-build` | Doesn't compile styles (plugin rebuild only) |
| `-y, --yes` | No prompts (CI) — the deployment flags apply the same |

---

## Architecture

- **Frontend**: Astro (SSR) + SolidJS (reactive islands)
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
│   ├── plugin-runtime/# Plugin loader, hooks registry & bootstrap
│   ├── theme-runtime/ # Theme rendering engine
│   ├── cli/           # `okcms` CLI (canonical deploy assets in src/assets.ts)
│   ├── validation/    # CMS_VERSION / compatibility
│   └── utils/         # Shared utilities
├── infrastructure/    # Mirrors generated by the CLI (docker/, compose/, nginx/)
├── plugins/           # Plugin packages
├── themes/            # Theme packages
├── docs/              # Documentation
└── tests/             # Integration tests
```

`infrastructure/**` is **generated** from `packages/cli/src/assets.ts` —
do not edit it by hand:

```bash
bun scripts/sync-infrastructure.ts
```

## Getting Started

### Prerequisites

- Node.js 22.17+
- Bun 1.4.4+
- Docker & Docker Compose v2 (for the `blue-green` and `simple` targets — `pm2` needs none)
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

# Docker image (equivalent to what deployment uses)
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
# Database (format (a) variables, or (b) DATABASE_URL which takes precedence)
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
WEB_PORT=3001    # public site
ADMIN_PORT=3011  # admin panel
```

Edit it with the wizard: `okcms config`.

## API Endpoints

### Health
- `GET /health` - Health check
- `GET /health/ready` - Readiness check
- `GET /health/live` - Liveness check

### Authentication
- `POST /api/v1/auth/register` - Register user
- `POST /api/v1/auth/login` - Login
- `POST /api/v1/auth/api-key-login` - Exchange an API key for access + refresh JWTs (see below)
- `POST /api/v1/auth/refresh` - Refresh token
- `POST /api/v1/auth/logout` - Logout

### API Keys (API-first clients)
- `GET /api/v1/api-keys` - List issued keys (requires `read:apikey`)
- `POST /api/v1/api-keys` - Issue a key (requires `create:apikey`) — the plaintext value is returned **only once**
- `DELETE /api/v1/api-keys/:id` - Revoke a key (requires `delete:apikey`)

The key never authorizes requests directly. Use it once to obtain JWTs:

```bash
curl -X POST http://localhost:3000/api/v1/auth/api-key-login \
  -H 'Content-Type: application/json' \
  -d '{"apiKey":"okcms_<prefix>_<secret>"}'
# → { accessToken, refreshToken, user, tenantId }
# then use Authorization: Bearer <accessToken> and POST /api/v1/auth/refresh
```

Keys can be single-use (`oneTime`) and/or expire at a given date. Only the SHA-256 hash is stored; manage keys in the admin at **Settings → API keys**.

### Content
- `GET /api/v1/content` - List content
- `GET /api/v1/content/:id` - Get content by ID
- `GET /api/v1/content/slug/:slug` - Get content by slug
- `POST /api/v1/content` - Create content
- `PUT /api/v1/content/:id` - Update content
- `DELETE /api/v1/content/:id` - Delete content
- `GET /api/v1/content/:id/versions` - Get content versions

## License

OkCMS is free software licensed under the GNU General Public License, version 2
or any later version (GPL-2.0-or-later), the same license used by WordPress.
See [LICENSE](LICENSE) for the complete license text.
