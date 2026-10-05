> 📄 **English** · [Português](./maintainer-guide.pt-BR.md)

# Maintainer guide

Guide for those who **contribute code** to OkCMS — not for those who operate an
installation (see [operator-guide.md](./operator-guide.md)).

## Monorepo structure

```
okcms-v2/
├── apps/
│   ├── api/            # Hono API server (REST /api/v1)
│   ├── admin/          # Astro + SolidJS
│   ├── web/            # Public site (Astro SSR)
│   └── worker/         # Queues (bullmq): publishing, media, webhooks, cache
├── packages/
│   ├── types/ config/ utils/     # types, configuration, utilities
│   ├── database/                 # connection, migrations, RLS
│   ├── core/ auth/ api-client/   # bootstrap, JWT/RBAC, HTTP client
│   ├── plugin-sdk/ theme-sdk/    # public extension contracts
│   ├── plugin-runtime/           # plugin sandbox + loader
│   ├── theme-runtime/            # renderer, hierarchy, style-engine
│   ├── validation/               # CMS_VERSION + semver compatibility
│   └── cli/                      # `okcms` (bin of @oktis-works/cms)
├── plugins/ themes/              # extension workspaces
├── infrastructure/               # GENERATED from the CLI — do not edit
├── scripts/                      # sync-infrastructure, prepare-publish, e2e
├── docs/                         # documentation (en) + *.pt-BR.md
├── vitest.config.ts              # single test configuration
└── eslint.config.mjs
```

Bun workspace (`workspaces` in `package.json`: `apps/*`, `packages/*`,
`plugins/*`, `themes/*`).

## Local development

```bash
bun install                 # required — Bun is what resolves the workspaces

bun run dev                  # all apps in watch mode (filter @oktis-works/*)
bun run --filter @oktis-works/api dev   # just one app

bun run build                # build all packages/apps
bun run clean                # remove all node_modules
```

To test the CLI the way an operator uses it:

```bash
cd packages/cli && bun run build
node dist/index.js --help
# or, without a build, straight from source:
npx tsx packages/cli/src/index.ts --help   # (or bun packages/cli/src/index.ts)
```

## Reference ports

| App | Variable | Default |
|---|---|---|
| api | `PORT` | 3000 |
| web | `WEB_PORT` | 3001 |
| admin | `ADMIN_PORT` (Astro reads `PORT`) | 3011 |

The composes, the Dockerfile and the nginx template **mirror** these defaults;
if you change one, change both sides (see the next chapter).

## Quality

```bash
bun run test:run      # vitest run (unit + integration)
bun run typecheck     # tsc --noEmit (root)
bun run lint          # eslint .
bun run build         # tsc of the packages + build of the apps
```

CI (`.github/workflows/ci.yml`) runs this same sequence in stages:
tests → typecheck → lint → build. No merging with any one of them red.

### Tests

- framework: **Vitest 3**, single config in `vitest.config.ts`;
- include: `packages/*/src/**/*.test.ts`, `packages/*/tests/**`,
  `apps/*/src/**/*.test.ts`, `apps/*/tests/**`;
- `@oktis-works/*` resolves via alias **to `src/`** — tests do not depend
  on `dist`;
- plugins created in `/tmp` by tests are loaded natively (`external`).

CLI pattern (see `update.test.ts`, `bluegreen.test.ts`, `redeploy.test.ts`):
project in `mkdtempSync`, a fake `Runner` that records the calls, a non-TTY
`Prompt` with captured output and a deterministic `ContainerProbe` for the
container guard. No test talks to real Docker.

## Canonical CLI assets

The Dockerfile, `.dockerignore`, composes and the nginx template exist **in two
places**: as strings in `packages/cli/src/assets.ts` (the CLI is what writes
them into the operator's project) and as files in `infrastructure/**` (for
those who want to read/peek without running the CLI).

```
packages/cli/src/assets.ts   ← canonical source
        │  bun scripts/sync-infrastructure.ts
        ▼
infrastructure/{docker,compose,nginx}/…   ← generated, never edit by hand
```

`assets.test.ts` has a **sync test**: if you edit only one side, it fails.
Correct flow:

```bash
$EDITOR packages/cli/src/assets.ts
bun scripts/sync-infrastructure.ts
bun run test:run
```

If the image changes ports, the trio to look at is: `assets.ts` (composes +
`DEFAULT_UPSTREAM_PORTS`), `packages/cli/src/env-schema.ts` (`.env`
defaults) and `packages/cli/src/project-config.ts` (`defaultProjectConfig`).

## Adding a command to the CLI

1. Create the module in `packages/cli/src/<name>.ts` — pure, testable logic,
   no `process.exit` in the middle (return a code or throw);
2. register it in `packages/cli/src/commands.ts` in the `commands` array:
   `name`, `description`, `options` (`Option`: `name`, `alias`,
   `description`, `required`, `repeatable?`) and `handler`;
3. **dynamic** import inside the `handler` — keep the CLI boot cheap;
4. test `packages/cli/src/<name>.test.ts`;
5. document in `README.md` (reference table),
   `docs/operator-guide.md` and, where it fits, in `packages/cli/src/scaffold-docs.ts`
   (that's where the scaffolded project's README/PLUGIN/THEME comes from).

Flag conventions: `-x`/`--long` for booleans, `--set` repeatable
(accumulates, does not overwrite), alias `-F` reserved for `--force`.

## Documentation

| Where | What |
|---|---|
| `README.md` / `README.pt-BR.md` | overview + CLI reference |
| `docs/*.md` / `docs/*.pt-BR.md` | guides by audience (operator, deploy, maintainer, extensions) |
| `packages/cli/src/scaffold-docs.ts` | `projectReadme()`, `pluginDoc()`, `themeDoc()` — what `okcms init` writes into the project |

Every `.md` exists in both languages: the file with the "clean" name is
**English** and the `.pt-BR.md` suffix is **Portuguese**. When adding or
changing a guide, change **both** and keep the language banner at the top (a
link to the other version).

Only Markdown is localized. Inside the product, the language is chosen at
`okcms init` for the docs it writes (`README.md`, `PLUGIN.md`, `THEME.md`):
a menu appears on a TTY, `--lang en|pt` forces it, and without a TTY the
default is English. A second menu of the same kind asks whether to install
the dependencies (`--no-install` skips it). Commands, flags, logs and code
never change language.

After touching `scaffold-docs.ts`, regenerate the repository guides — the
script writes both languages, with the banner:

```bash
bun scripts/sync-docs.ts
```

## Versioning and publishing

The repository uses **Changesets** with a `fixed` group (lockstep): `core`,
`api-client`, `auth`, `cms` (the CLI), `config`, `database`, `plugin-runtime`,
`plugin-sdk`, `theme-runtime`, `theme-sdk` and `types` publish **on the same
version**. `admin` and `web` are in `ignore` and are versioned by hand; `ui`,
`validation`, `api` and `worker` are independent.

Four anchors must line up — `scripts/prepare-publish.mjs` blocks the
publish if they don't:

1. every publishable manifest version is semver `X.Y.Z`;
2. all packages in the `fixed` group on the **same** version;
3. the **root** version (`package.json`) === the `fixed` group version;
4. `CMS_VERSION` (`packages/validation/src/compatibility.ts`) === root version
   — that's the version the plugins/themes `compatibility.okcms` compares.

### Release flow

```bash
# 1. record what changed (before the merge, in each PR)
bun run changeset

# 2. bump the group + CHANGELOG
bun run version-packages

# 3. manual bump of what is outside changesets (admin, web, worker, api)
#    — editing the "version" of each package.json

# 4. full validation (never publish with a red gate)
bun run test:run && bun run typecheck && bun run lint && bun run build
node scripts/prepare-publish.mjs --check --tag v0.2.0

# 5. commit + tag + release on GitHub
git commit -am 'chore(release): v0.2.0'
git tag v0.2.0 && git push --follow-tags
gh release create v0.2.0 --title v0.2.0 --notes '…'

# 6. publish: the publish.yml workflow fires on the release (OIDC, no token)
```

`prepare-publish.mjs` **rewrites** `workspace:*` → `^version` before
`npm publish` (npm doesn't understand `workspace:`). Without `--check`, restore
with `git checkout -- .` after publishing locally.

Manual publish (outside CI):

```bash
bun run publish:all
```

## Code conventions

- header `// @oktis-works/<package> - <what it is>` on every new file;
- comments and messages in **Portuguese** (the code talks to the team);
- pure ESM, `moduleResolution: bundler`, `verbatimModuleSyntax`;
- `noUncheckedIndexedAccess` + `noPropertyAccessFromIndexSignature` — always
  index with brackets and always with `!`/guard when the context guarantees it;
- no silent `any` at the JSON boundary: validate before using;
- no new dependency in the CLI — it is **zero-dependency** (its own prompt and
  env);
- dynamic import on heavy routes (docker, theme-runtime, database).

## Non-negotiable rules

| Rule | Where it is guaranteed |
|---|---|
| CLI never runs inside a container | `guards.ts` → `assertHostOnly()` in `update`, `redeploy`, `config` |
| No compose mounts `docker.sock` | `guards.ts` → `assertNoDockerSocket()` |
| Lane `down` **never** with `-v` | `bluegreen.ts` (shared media volume) |
| Migrations on the host, **before** any traffic | `bluegreen.ts`, step 5 |
| Worker drained (SIGTERM + `stop_grace_period`) before bringing up the new one | `bluegreen.ts`, step 8 |
| `infrastructure/**` never edited by hand | `assets.test.ts` (sync test) |
| No TTY, `okcms update` never deploys by accident | `update.ts` (default `download`) |
