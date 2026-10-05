> 📄 **Português (Brasil)** · [English](./maintainer-guide.md)

# Guia do mantenedor

Guia de quem **contribui com o código** do OkCMS — não de quem opera uma
instalação (veja [operator-guide.md](./operator-guide.pt-BR.md)).

## Estrutura do monorepo

```
okcms-v2/
├── apps/
│   ├── api/            # Hono API server (REST /api/v1)
│   ├── admin/          # Astro + SolidJS
│   ├── web/            # Site público (Astro SSR)
│   └── worker/         # Filas (bullmq): publicação, mídia, webhooks, cache
├── packages/
│   ├── types/ config/ utils/     # tipos, configuração, utilidades
│   ├── database/                 # conexão, migrations, RLS
│   ├── core/ auth/ api-client/   # bootstrap, JWT/RBAC, cliente HTTP
│   ├── plugin-sdk/ theme-sdk/    # contratos públicos de extensão
│   ├── plugin-runtime/           # sandbox + loader de plugins
│   ├── theme-runtime/            # renderer, hierarchy, style-engine
│   ├── validation/               # CMS_VERSION + compatibilidade semver
│   └── cli/                      # `okcms` (bin de @oktis-works/cms)
├── plugins/ themes/              # workspaces de extensões
├── infrastructure/               # GERADO a partir da CLI — não editar
├── scripts/                      # sync-infrastructure, prepare-publish, e2e
├── docs/                         # documentação (en) + *.pt-BR.md
├── vitest.config.ts              # configuração única de testes
└── eslint.config.mjs
```

Workspace Bun (`workspaces` em `package.json`: `apps/*`, `packages/*`,
`plugins/*`, `themes/*`).

## Desenvolvimento local

```bash
bun install                 # obrigatório — é o Bun que resolve os workspaces

bun run dev                  # todos os apps em watch (filter @oktis-works/*)
bun run --filter @oktis-works/api dev   # só um app

bun run build                # build de todos os pacotes/apps
bun run clean                # remove todos os node_modules
```

Para testar a CLI do jeito que um operador usa:

```bash
cd packages/cli && bun run build
node dist/index.js --help
# ou, sem build, direto do fonte:
npx tsx packages/cli/src/index.ts --help   # (ou bun packages/cli/src/index.ts)
```

## Portas de referência

| App | Variável | Default |
|---|---|---|
| api | `PORT` | 3000 |
| web | `WEB_PORT` | 3001 |
| admin | `ADMIN_PORT` (o Astro lê `PORT`) | 3011 |

Os composes, o Dockerfile e o template do nginx **espelham** esses defaults;
se você mudar um, mude os dois lados (ver próximo capítulo).

## Qualidade

```bash
bun run test:run      # vitest run (unit + integração)
bun run typecheck     # tsc --noEmit (raiz)
bun run lint          # eslint .
bun run build         # tsc dos pacotes + build dos apps
```

A CI (`.github/workflows/ci.yml`) roda essa mesma sequência em estágios:
testes → typecheck → lint → build. Nada de merge com uma delas vermelha.

### Testes

- framework: **Vitest 3**, config única em `vitest.config.ts`;
- include: `packages/*/src/**/*.test.ts`, `packages/*/tests/**`,
  `apps/*/src/**/*.test.ts`, `apps/*/tests/**`;
- `@oktis-works/*` resolve via alias **para `src/`** — os testes não dependem
  de `dist`;
- plugins criados em `/tmp` nos testes são carregados nativamente (`external`).

Padrão da CLI (ver `update.test.ts`, `bluegreen.test.ts`, `redeploy.test.ts`):
projeto em `mkdtempSync`, `Runner` fake que registra as chamadas, `Prompt`
não-TTY com saída capturada e um `ContainerProbe` determinístico para a
guarda de container. Nenhum teste fala com Docker de verdade.

## Assets canônicos da CLI

Dockerfile, `.dockerignore`, composes e template do nginx existem **em dois
lugares**: como strings em `packages/cli/src/assets.ts` (é a CLI que os
grava no projeto do operador) e como arquivos em `infrastructure/**` (para
quem quer ler/difar sem rodar a CLI).

```
packages/cli/src/assets.ts   ← fonte canônica
        │  bun scripts/sync-infrastructure.ts
        ▼
infrastructure/{docker,compose,nginx}/…   ← gerado, nunca editar à mão
```

`assets.test.ts` tem um **teste de sincronia**: se você editar um lado só,
ele falha. Fluxo correto:

```bash
$EDITOR packages/cli/src/assets.ts
bun scripts/sync-infrastructure.ts
bun run test:run
```

Se a imagem mudar de portas, o trio a olhar é: `assets.ts` (composes +
`DEFAULT_UPSTREAM_PORTS`), `packages/cli/src/env-schema.ts` (defaults do
`.env`) e `packages/cli/src/project-config.ts` (`defaultProjectConfig`).

## Adicionando um comando à CLI

1. Crie o módulo em `packages/cli/src/<nome>.ts` — lógica pura testável,
   sem `process.exit` no meio (devolver um código ou lançar);
2. registre em `packages/cli/src/commands.ts` no array `commands`:
   `name`, `description`, `options` (`Option`: `name`, `alias`,
   `description`, `required`, `repeatable?`) e `handler`;
3. import **dinâmico** dentro do `handler` — manter o boot da CLI barato;
4. teste `packages/cli/src/<nome>.test.ts`;
5. documente em `README.md` (tabela de referência),
   `docs/operator-guide.md` e, se couber, em `packages/cli/src/scaffold-docs.ts`
   (é de lá que sai o README/PLUGIN/THEME do projeto scaffoldado).

Convenções de flag: `-x`/`--long` para booleanos, `--set` repetível
(acumula, não sobrescreve), alias `-F` reservado para `--force`.

## Documentação

| Onde | O que |
|---|---|
| `README.md` / `README.pt-BR.md` | visão geral + referência da CLI |
| `docs/*.md` / `docs/*.pt-BR.md` | guias por público (operador, deploy, mantenedor, extensões) |
| `packages/cli/src/scaffold-docs.ts` | `projectReadme()`, `pluginDoc()`, `themeDoc()` — o que o `okcms init` escreve no projeto |

Todo `.md` existe nas duas línguas: o arquivo com o nome "limpo" é
**inglês** e o sufixo `.pt-BR.md` é **português**. Ao adicionar ou alterar um
guia, altere **os dois** e mantenha o banner de idioma no topo (um link para
a outra versão).

Só o Markdown é localizado. Dentro do produto, a língua é escolhida no
`okcms init` para as docs que ele escreve (`README.md`, `PLUGIN.md`,
`THEME.md`): com TTY aparece um menu, `--lang en|pt` força a escolha e sem
TTY o default é inglês. Um segundo menu do mesmo tipo pergunta se instala as
dependências (`--no-install` pula). Comandos, flags, logs e código nunca
mudam de língua.

Depois de mexer em `scaffold-docs.ts`, regenere os guias do repositório — o
script grava as duas línguas, com o banner:

```bash
bun scripts/sync-docs.ts
```

## Versionamento e publicação

O repositório usa **Changesets** com um grupo `fixed` (lockstep): `core`,
`api-client`, `auth`, `cms` (a CLI), `config`, `database`, `plugin-runtime`,
`plugin-sdk`, `theme-runtime`, `theme-sdk` e `types` publicam **na mesma
versão**. `admin` e `web` estão em `ignore` e são versionados à mão; `ui`,
`validation`, `api` e `worker` são independentes.

Quatro âncoras precisam bater — `scripts/prepare-publish.mjs` bloqueia a
publicação se não baterem:

1. versão de todo manifest publicável é semver `X.Y.Z`;
2. todos os pacotes do grupo `fixed` na **mesma** versão;
3. versão da **raiz** (`package.json`) === versão do grupo `fixed`;
4. `CMS_VERSION` (`packages/validation/src/compatibility.ts`) === versão raiz
   — é a versão que `compatibility.okcms` dos plugins/temas compara.

### Fluxo de release

```bash
# 1. registrar o que mudou (antes do merge, em cada PR)
bun run changeset

# 2. bump do grupo + CHANGELOG
bun run version-packages

# 3. bump manual do que está fora do changesets (admin, web, worker, api)
#    — editando a "version" de cada package.json

# 4. validação completa (nada de publicar com gate vermelho)
bun run test:run && bun run typecheck && bun run lint && bun run build
node scripts/prepare-publish.mjs --check --tag v0.2.0

# 5. commit + tag + release no GitHub
git commit -am 'chore(release): v0.2.0'
git tag v0.2.0 && git push --follow-tags
gh release create v0.2.0 --title v0.2.0 --notes '…'

# 6. publicação: o workflow publish.yml dispara na release (OIDC, sem token)
```

`prepare-publish.mjs` **reescreve** `workspace:*` → `^versão` antes do
`npm publish` (o npm não entende `workspace:`). Sem `--check`, restaure com
`git checkout -- .` depois de publicar localmente.

Publicação manual (fora do CI):

```bash
bun run publish:all
```

## Convenções de código

- cabeçalho `// @oktis-works/<pacote> - <o que é>` em todo arquivo novo;
- comentários e mensagens em **português** (o código fala com o time);
- ESM puro, `moduleResolution: bundler`, `verbatimModuleSyntax`;
- `noUncheckedIndexedAccess` + `noPropertyAccessFromIndexSignature` — index
  sempre com colchetes e sempre com `!`/guard quando o contexto garante;
- sem `any` silencioso em fronteira de JSON: validar antes de usar;
- sem dependência nova na CLI — ela é **zero-dependência** (prompt e env
  próprio);
- import dinâmico em rotas pesadas (docker, theme-runtime, database).

## Regras que não se negociam

| Regra | Onde é garantido |
|---|---|
| CLI nunca roda dentro de container | `guards.ts` → `assertHostOnly()` em `update`, `redeploy`, `config` |
| Nenhum compose monta `docker.sock` | `guards.ts` → `assertNoDockerSocket()` |
| `down` de lane **nunca** com `-v` | `bluegreen.ts` (volume de mídia compartilhado) |
| Migrations no host, **antes** de qualquer tráfego | `bluegreen.ts`, passo 5 |
| Worker drenado (SIGTERM + `stop_grace_period`) antes de subir o novo | `bluegreen.ts`, passo 8 |
| `infrastructure/**` nunca editado à mão | `assets.test.ts` (sincronia) |
| Sem TTY, `okcms update` nunca faz deploy por acidente | `update.ts` (default `download`) |
