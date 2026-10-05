> 📄 **English** · [Português](./docker-deploy.pt-BR.md)

# Docker deploy (blue/green)

OkCMS runs in production behind an nginx proxy, with **two identical
copies of the application** (lanes `blue` and `green`) — the blue/green
target. There, deploy is always:
build the stopped lane, healthcheck, swap the proxy, drain the worker and only
then take down the old lane. No request is lost in the swap, and any
failure leaves the lane that was already serving **up**.

All of this is orchestrated by the CLI — which runs **on the host**, always.

> Operator guide (full CLI): [operator-guide.md](./operator-guide.md)

## Deploy targets

Three targets, chosen in the arrow-key menu of `okcms deploy`,
`okcms update --mode deploy` and `okcms redeploy` (↑/↓ + Enter, last choice
pre-selected), skipped with `--target blue-green|simple|pm2` and remembered in
`.deploy/state.json`: **blue/green** keeps the two lanes behind the nginx proxy
with the zero-downtime swap; **simple** runs one lane-less stack from
`docker-compose.app.yml` (project `okcms-app`, containers
`okcms-api`/`okcms-web`/`okcms-admin`/`okcms-worker`, same ports) with the proxy
pointing at it and a brief restart instead of a swap; **pm2** runs the processes
on the host (`pm2 startOrReload ecosystem.config.js --update-env`) and needs no
Docker at all. Everything below describes blue/green.

## What `okcms init` writes

The scaffolding already creates every deploy file. You don't write any Docker
by hand:

| File | Role |
|---|---|
| `docker/Dockerfile` | Single image `okcms/app` |
| `docker/entrypoint.sh` | Picks the entrypoint: `api` \| `admin` \| `web` \| `worker` |
| `.dockerignore` | Build context: keeps `dist/`, `plugins/`, `themes/`; leaves `deploy/` and `.env` out |
| `docker-compose.infra.yml` | Project `okcms`: network `okcms-net`, postgres, redis, proxy |
| `docker-compose.deploy.yml` | Lanes project: 8 services (api, web, admin, worker) × blue, green |
| `docker-compose.app.yml` | Simple stack: project `okcms-app`, one copy of each service (no lanes) |
| `deploy/nginx/templates/default.conf.template` | Proxy routing (envsubst at start) |
| `deploy/nginx/conf.d/00-upstreams.conf` | Upstreams of the active lane — rewritten by the CLI on swap |
| `.deploy/state.json` | Active lane, previous lane, deploy target and history (gitignored) |

The first two groups are **generated** from
`packages/cli/src/assets.ts`. If you change `infrastructure/**` in the monorepo,
regenerate with `bun scripts/sync-infrastructure.ts`.

## One image, four entrypoints

There is no `api.Dockerfile`, `web.Dockerfile` etc. There is one `okcms/app`
image and an `entrypoint.sh` that receives the role as an argument. The lane
compose instantiates that same image four times:

| Service (per lane) | Container | Internal port | Role |
|---|---|---|---|
| `api-<lane>` | `okcms-api-<lane>` | `PORT` = 3000 | Hono API |
| `web-<lane>` | `okcms-web-<lane>` | `WEB_PORT` = 3001 | Public site |
| `admin-<lane>` | `okcms-admin-<lane>` | `ADMIN_PORT` = 3011 | Astro panel |
| `worker-<lane>` | `okcms-worker-<lane>` | — | Queues (bullmq) |

The build is **local, on the host** (`docker compose build`), because it is the host
that has the `.env`, the `node_modules` and the state. The container never builds
anything.

### What goes into (and what doesn't) the image

The `.dockerignore` is deliberate:

- does **not** ignore `dist/` — a published plugin runs from `plugins/<n>/dist`;
- does **not** ignore `plugins/` or `themes/` — they come in via `COPY . .`, and it is
  exactly because of that that installing an extension requires a **rebuild**
  ([redeploy](#redeploy-of-plugintheme));
- ignores `.env`, `node_modules/`, `deploy/` (mounted at runtime) and
  `docker-compose*.yml`.

## Composes and projects

| File | Docker project | Contents |
|---|---|---|
| `docker-compose.yml` | (default) | Only the **dev** infra: postgres + redis |
| `docker-compose.infra.yml` | `okcms` | Network `okcms-net`, postgres, redis, **proxy** |
| `docker-compose.deploy.yml` | `okcms-blue` / `okcms-green` | The 8 application services (blue/green target) |
| `docker-compose.app.yml` | `okcms-app` | The same 4 services, no lanes (simple target) |

The lanes use the `okcms-net` network as **external**: only that way does the lane
`blue` nginx reach the postgres of the `okcms` project.

### Classification by label

The compose is not parsed by guesswork — the CLI classifies each service by the
declared labels:

| Label | Values | Use |
|---|---|---|
| `okcms.role` | `edge` · `worker` · `data` · `proxy` | Who gets a healthcheck, who drains, who is infra |
| `okcms.lane` | `blue` · `green` | Separates the services by project/lane |

`okcms doctor` uses the same labels to check lane and proxy.

## Proxy routing

A single nginx, in front of both lanes:

| Route | Goes to |
|---|---|
| `= /health` | `api` (it is the one that talks to the database) |
| `/api/` | `api` |
| `/storage/` | rewrite → `/api/v1/media/file/$1` on the `api` (30d cache) |
| `/themes/` | `web` |
| `/` | `web` (SSR of the site) |
| vhost `ADMIN_SERVER_NAME` | `admin` |
| port `8080` | `admin` — works with no DNS at all |

The upstreams live in `deploy/nginx/conf.d/00-upstreams.conf`, deliberately
separated from the template: the CLI **rewrites only that file** and runs
`nginx -s reload`. That is how the lane swap happens without dropping
connections — the `nginx restart` (which zeroes everything) is the last resort, and
only if the reload fails.

## The deploy sequence

```bash
npx okcms update --mode deploy
```

| # | Step | If it fails |
|---|---|---|
| 1 | Preflight: `docker version` + `docker compose version` | nothing executed |
| 2 | Network `okcms-net` + infra (`postgres`, `redis`, `proxy`) and their healthcheck (3 min) | nothing up yet |
| 3 | `@oktis-works/*` packages **on the host** (`bun add`, falling back to `npm install`) | nothing up yet |
| 4 | `docker compose build` of the new lane — **still with no traffic** | current lane keeps serving |
| 5 | `okcms db:migrate` **on the host** | current lane keeps serving, database not touched by a new container |
| 6 | Starts the edge (`api`, `web`, `admin`) of the new lane and waits for each healthcheck | new lane taken down, current keeps serving |
| 7 | Rewrites `00-upstreams.conf` + `nginx -s reload` | upstreams restored, new lane taken down |
| 8 | **Drains** the old worker: `stop` (SIGTERM) + waits for the 30s `stop_grace_period` | — (warning only) |
| 9 | Starts the new worker | queue is left without a consumer until the next deploy (edge stays up) |
| 10 | `down` of the old lane — **never `-v`** — and writes `.deploy/state.json` | — |

Two decisions that look like details and are not:

- **migrations before any traffic.** They run on the host, between the build and the
  `up` of the new lane. A migration that breaks takes down the deploy without ever having
  served new code.
- **`down` without `-v`.** The `okcms-storage` volume is **shared** between
  blue and green — taking the lane down with the volume would erase the media of both.

### Rollback

`.deploy/state.json` keeps the previous lane. The next deploy always goes to
**the other** lane — that is what keeps a rollback path. To go back
manually:

```bash
# 1. points the upstreams at the lane that should come back
$EDITOR deploy/nginx/conf.d/00-upstreams.conf
docker exec okcms-proxy nginx -s reload

# 2. records the state
$EDITOR .deploy/state.json
```

If the proxy does not reload, the CLI falls back to `docker restart okcms-proxy`
(connections zeroed, but the site comes back).

## Redeploy of plugin/theme

`plugins/` and `themes/` go into the image at build, and `themes/<n>/dist/theme.css`
is compiled **on the host**. That is why installing an extension never has any effect in
production until a rebuild:

```bash
npx okcms plugin:install -n ./meu-plugin   # or: theme:install
npx okcms redeploy --dry-run               # only shows the plan
npx okcms redeploy
```

What it does before the normal deploy:

1. **plugin migrations** — copies `plugins/<n>/migrations/*.sql` into
   `migrations/` (the only directory the runner reads). Idempotent: an identical
   file is not touched; a diverging file is **not** overwritten (the
   version applied in the database has a checksum); a name outside
   `V###__owner__nome.sql` is **never** copied.
2. **style build** — compiles every theme that has a style entry and
   writes `themes/<n>/dist/theme.css`.
3. **deploy of the chosen target** — for blue/green, the same sequence as the
   table above, but with
   `packages: []`: no `bun add`, because what changed is extension
   content, not a package version (simple and PM2 have their own, shorter
   order).

A failure in steps 1 or 2 aborts **before** touching Docker. A `.sql` already
existing in `migrations/` outside the pattern is also detected beforehand — it would
break the `db:migrate` of step 5, and it is better to find out now.

Flags: `-p, --plugin <n>` / `-t, --theme <n>` restrict the **prep** (the
rebuild is always global), `-M, --skip-migrations`, `-B, --skip-theme-build`,
`-n, --dry-run`, besides all the [deploy flags](#the-deploy-sequence).

## Security

| Rule | How it is guaranteed |
|---|---|
| The CLI never runs inside a container | `assertHostOnly()` in `update`, `redeploy` and `config` — `--force` is the deliberate escape hatch, logged |
| The CLI is not in the image | `docker/Dockerfile` does not install `@oktis-works/cms` |
| No compose mounts `docker.sock` | `assertNoDockerSocket()` — mounting the socket is direct escalation to host root |
| Postgres only on loopback | `127.0.0.1:5432` in the infra compose; redis does not even publish a port |
| Secrets never in a log | `redact()` covers `DATABASE_URL`, passwords, tokens and JWT |
| The CLI's network = official npm registry | allowlist in `registryAllowlist()` |

The reason for `assertHostOnly`: inside a compromised container, `okcms
update` would become an executor of `bun add` (third-party post-install
scripts) **on the database network**, with the `.env` in hand.

## Diagnostics

```bash
npx okcms doctor          # docker, compose v2, active lane and proxy
npx okcms status          # host processes (dev)

# what is up right now
docker ps --filter label=okcms.role=edge --format '{{.Names}}\t{{.Status}}'
cat .deploy/state.json
cat deploy/nginx/conf.d/00-upstreams.conf

# logs per lane
docker logs -f okcms-api-blue
docker logs -f okcms-proxy

# infra
docker ps --filter label=okcms.role=data
```

| Symptom | Likely cause |
|---|---|
| `Docker não está acessível` in the preflight | Docker stopped or CLI inside a container (without `--force`) |
| `Docker Compose v2 não está disponível` | legacy `docker-compose` (v1) installed — the deploy uses the v2 plugin |
| New lane does not become `healthy` | `docker logs okcms-api-<lane>`; a failure here does not move traffic |
| 502 on the proxy | upstream points to a container that died — check `00-upstreams.conf` |
| `db:migrate` fails mid-deploy | nothing was swapped; the current lane keeps serving |
| Theme with no CSS in production | `dist/theme.css` was not built on the host — run `okcms redeploy` |
