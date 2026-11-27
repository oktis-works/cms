# CLI Reference — `okcms`

The CLI is the **only** operational surface of the system: it creates the
project, starts the apps, migrates the database, configures `.env`, installs
extensions and deploys. It is zero-dependency (no prompt library), runs on
**Node 22.23+ or Bun 1.4.4+** and never runs inside a container — deployment and
configuration always happen from the host.

## Installation

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

`bun run dev` completes `.env` (generating missing secrets), starts the
infrastructure (Postgres + Redis via Docker Compose), waits for Postgres,
applies schema + seed + migrations, creates the first admin user, starts all
apps, and prints the final URLs. It is re-runnable — after
`docker compose down -v` everything is recreated on the next run.

## Interactive wizard

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

## First steps

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

## Command reference

### Project and execution

| Command | Options | What it does |
|---|---|---|
| `okcms init <dir> [nome]` | `-d, --dir` · `-l, --lang en\|pt` · `-n, --no-install` | Creates the project: configs, `.env`, compose, Docker deploy files, docs (English or Portuguese) and the dependency install (bun, or npm) |
| `okcms menu` | — | Opens the interactive wizard (same as running bare `okcms` in a terminal) |
| `okcms start` | `-A, --all` (default) · `-a, --api` · `-m, --admin` · `-w, --web` · `-W, --worker` | Starts the apps as host processes (pidfiles in `.data/`) |
| `okcms stop` | — | Stops what `start` started (pidfile + detection) |
| `okcms status` | — | Process state + project summary |
| `okcms dev` | `-y, --yes` · `-s, --skip-start` · `-n, --no-infra` · `-e, --email` · `-N, --name` · `-p, --password` · `-F, --force` | One-shot dev setup + run: complete `.env` → infra (waits for Postgres, publishes Redis on loopback for host apps) → schema/seed/migrations → first admin → `start` + final URLs (re-runnable; non-TTY needs `--yes`) |
| `okcms doctor` | — | Diagnostics: node, `.env`, database (`DB_*` or `DATABASE_URL`), config, **docker, compose v2, lane, proxy** |
| `okcms config` | `-s, --set K=V` (repeatable) · `-l, --list` · `-S, --show-secrets` · `-n, --non-interactive` · `-x, --section ` · `-F, --force` | `.env` editing wizard — Enter keeps, Ctrl+C discards everything (exit 130) |

`--section` accepts: `app · database · redis · auth · storage · worker · cache ·
ports · theme · deploy`.

```bash
okcms config                          # interactive wizard
okcms config --list                   # keys with secrets masked
okcms config --set PORT=4000 --set JWT_SECRET=$(openssl rand -hex 32)
okcms config --section deploy -n      # programmatic, no TTY
```

### Update and deployment

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

Copy a complete theme directory into `themes/<theme-name>/` and synchronize it with the database.
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

### Database

| Command | Options | What it does |
|---|---|---|
| `okcms db:migrate` | `-d, --dir` · `-t, --tenant` | Applies the pending migrations from `migrations/` |
| `okcms db:rollback` | `-d, --dir` · `-t, --tenant` | Reverts the last migration |
| `okcms db:status` | `-t, --tenant` | Shows the migration state |
| `okcms db:backup` | `-o, --out` | Custom Postgres dump with timestamp |
| `okcms db:restore` | `-f, --file` (required) · `-c, --clean` | Restores a dump, optionally dropping first |

### Extensions

| Command | Options | What it does |
|---|---|---|
| `okcms plugin:create` | `-n, --name` (required) · `-d, --dir` | Minimal plugin scaffold |
| `okcms plugin:install` | `-n, --name` (required) | Installs from a local path + registers |
| `okcms plugin:list` · `plugin:search` | `-q, --query` | Lists installed / searches npm (`okcms-plugin`) |
| `okcms plugin:manage` | `-n, --name` (required) · `-i` · `-e` · `-d` · `-u` | Info; enable/disable (local state); uninstall |
| `okcms theme:create` | `-n, --name` (required) · `--engine react\|solid` · `-d, --dir` · `-s, --style css\|scss\|tailwind` | Isolated React/Solid theme scaffold |
| `okcms theme:list` · `theme:search` | `-q, --query` | Theme lookup |
| `okcms theme:manage` | `-n, --name` (required) · `-i` · `-d` · `-u` · `-s, --set-active` | Info; uninstall; tenant-scoped activation |
| `okcms theme:build` | `-n, --name` (required) · `-d, --themes-dir` | Compiles SSR artifact and isolated styles |

### Content and system

| Command | Options | What it does |
|---|---|---|
| `okcms user:create` | `-e, --email` · `-n, --name` · `-p, --password` (all required) · `-t, --tenant` | Creates a user and assigns a role in the tenant |
| `okcms seed` | — | Initial data (roles + settings) — idempotent |
| `okcms system:status` | — | Environment status + database health |
| `okcms media:migrate` | `-f, --from` · `-t, --to` (required) | Moves media between drivers (`local`, `s3`, `r2`, `minio`) |
| `okcms build` | `-a, --apps api,admin,web` | Builds the apps (monorepo only) |

### Conventions and exit codes

- `0` success · `1` error · `130` interrupted (Ctrl+C) — no artifact written.
- Every boolean option is `-x` or `--long`; options marked *repeatable* (`--set`)
  accumulate occurrences instead of overwriting.
- Commands that change state outside the process refuse to run **inside** a
  container (`okcms update`, `okcms redeploy`, `okcms config`); `--force` is the
  conscious escape hatch.
- Secrets never show up in `--list` without `--show-secrets`, and are never
  printed back in an error.
