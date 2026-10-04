> 📄 **Português (Brasil)** · [English](./docker-deploy.md)

# Deploy em Docker (blue/green)

O OkCMS roda em produção atrás de um proxy nginx, com **duas cópias
idênticas da aplicação** (lanes `blue` e `green`). Deploy é sempre:
construir a lane parada, healthcheck, trocar o proxy, drenar o worker e só
então derrubar a lane velha. Nenhum request é perdido na troca, e qualquer
falha deixa a lane que já estava servindo **no ar**.

Tudo isso é orquestrado pela CLI — que roda **no host**, sempre.

> Guia do operador (CLI completa): [operator-guide.md](./operator-guide.pt-BR.md)

## O que o `okcms init` escreve

O scaffolding já cria todos os arquivos de deploy. Você não escreve Docker
nada à mão:

| Arquivo | Papel |
|---|---|
| `docker/Dockerfile` | Imagem única `okcms/app` |
| `docker/entrypoint.sh` | Escolhe o entrypoint: `api` \| `admin` \| `web` \| `worker` |
| `.dockerignore` | Build context: preserva `dist/`, `plugins/`, `themes/`; deixa `deploy/` e `.env` de fora |
| `docker-compose.infra.yml` | Projeto `okcms`: rede `okcms-net`, postgres, redis, proxy |
| `docker-compose.deploy.yml` | Projeto das lanes: 8 services (api, web, admin, worker) × blue, green |
| `deploy/nginx/templates/default.conf.template` | Roteamento do proxy (envsubst no start) |
| `deploy/nginx/conf.d/00-upstreams.conf` | Upstreams da lane ativa — reescrito pela CLI no swap |
| `.deploy/state.json` | Lane ativa, lane anterior e histórico (gitignored) |

Os dois primeiros grupos são **gerados** a partir de
`packages/cli/src/assets.ts`. Se você mudar `infrastructure/**` no monorepo,
regenere com `bun scripts/sync-infrastructure.ts`.

## Imagem única, quatro entrypoints

Não existe `api.Dockerfile`, `web.Dockerfile` etc. Existe uma imagem
`okcms/app` e um `entrypoint.sh` que recebe o papel como argumento. O
compose da lane instancia essa mesma imagem quatro vezes:

| Service (por lane) | Container | Porta interna | Papel |
|---|---|---|---|
| `api-<lane>` | `okcms-api-<lane>` | `PORT` = 3000 | API Hono |
| `web-<lane>` | `okcms-web-<lane>` | `WEB_PORT` = 3001 | Site público |
| `admin-<lane>` | `okcms-admin-<lane>` | `ADMIN_PORT` = 3011 | Painel Astro |
| `worker-<lane>` | `okcms-worker-<lane>` | — | Filas (bullmq) |

O build é **local, no host** (`docker compose build`), porque é o host que
tem o `.env`, o `node_modules` e o estado. O container nunca builda nada.

### O que entra (e o que não entra) na imagem

O `.dockerignore` é deliberado:

- **não** ignora `dist/` — um plugin publicado roda do `plugins/<n>/dist`;
- **não** ignora `plugins/` nem `themes/` — entram pelo `COPY . .`, e é
  exatamente por isso que instalar extensão exige um **rebuild**
  ([redeploy](#redeploy-de-plugintema));
- ignora `.env`, `node_modules/`, `deploy/` (montado em runtime) e
  `docker-compose*.yml`.

## Três composes, três projetos

| Arquivo | Projeto Docker | Conteúdo |
|---|---|---|
| `docker-compose.yml` | (padrão) | Só a infra de **dev**: postgres + redis |
| `docker-compose.infra.yml` | `okcms` | Rede `okcms-net`, postgres, redis, **proxy** |
| `docker-compose.deploy.yml` | `okcms-blue` / `okcms-green` | As 8 services da aplicação |

As lanes usam a rede `okcms-net` como **externa**: só assim o nginx da lane
`blue` alcança o postgres do projeto `okcms`.

### Classificação por label

O compose não é parseado por palpite — a CLI classifica cada serviço pelos
labels declarados:

| Label | Valores | Uso |
|---|---|---|
| `okcms.role` | `edge` · `worker` · `data` · `proxy` | Quem tem healthcheck, quem drena, quem é infra |
| `okcms.lane` | `blue` · `green` | Separa as services por projeto/lane |

`okcms doctor` usa os mesmos labels para checar lane e proxy.

## Roteamento do proxy

Um nginx só, na frente das duas lanes:

| Rota | Vai para |
|---|---|
| `= /health` | `api` (é quem fala com o banco) |
| `/api/` | `api` |
| `/storage/` | rewrite → `/api/v1/media/file/$1` no `api` (cache 30d) |
| `/themes/` | `web` |
| `/` | `web` (SSR do site) |
| vhost `ADMIN_SERVER_NAME` | `admin` |
| porta `8080` | `admin` — funciona sem DNS nenhum |

Os upstreams ficam em `deploy/nginx/conf.d/00-upstreams.conf`, separados do
template de propósito: a CLI **reescreve só esse arquivo** e dá
`nginx -s reload`. É assim que a troca de lane acontece sem derrubar
conexão — o `nginx restart` (que zera tudo) é o último recurso, e só se o
reload falhar.

## A sequência do deploy

```bash
npx okcms update --mode deploy
```

| # | Passo | Se falhar |
|---|---|---|
| 1 | Preflight: `docker version` + `docker compose version` | nada executado |
| 2 | Rede `okcms-net` + infra (`postgres`, `redis`, `proxy`) e healthcheck deles (3 min) | nada no ar ainda |
| 3 | Pacotes `@oktis-works/*` **no host** (`bun add`, com queda para `npm install`) | nada no ar ainda |
| 4 | `docker compose build` da lane nova — **ainda sem tráfego** | lane atual segue servindo |
| 5 | `okcms db:migrate` **no host** | lane atual segue servindo, banco não tocado por container novo |
| 6 | Sobe o edge (`api`, `web`, `admin`) da lane nova e espera cada healthcheck | lane nova derrubada, atual segue servindo |
| 7 | Reescreve `00-upstreams.conf` + `nginx -s reload` | upstreams restaurados, lane nova derrubada |
| 8 | **Drena** o worker antigo: `stop` (SIGTERM) + espera do `stop_grace_period` de 30s | — (só aviso) |
| 9 | Sobe o worker novo | fila fica sem consumidor até o próximo deploy (edge segue no ar) |
| 10 | `down` da lane antiga — **nunca `-v`** — e grava `.deploy/state.json` | — |

Duas decisões que parecem detalhe e não são:

- **migrations antes de qualquer tráfego.** Rodam no host, entre o build e o
  `up` da lane nova. Uma migration que quebra derruba o deploy sem nunca ter
  servido código novo.
- **`down` sem `-v`.** O volume `okcms-storage` é **compartilhado** entre
  blue e green — derrubar a lane com volume apagaria a mídia das duas.

### Rollback

A `.deploy/state.json` guarda a lane anterior. O próximo deploy sempre vai
para **a outra** lane — é isso que mantém um caminho de rollback. Para voltar
manualmente:

```bash
# 1. aponta os upstreams para a lane que deve voltar
$EDITOR deploy/nginx/conf.d/00-upstreams.conf
docker exec okcms-proxy nginx -s reload

# 2. registra o estado
$EDITOR .deploy/state.json
```

Se o proxy não recarregar, a CLI cai para `docker restart okcms-proxy`
(conexões zeradas, mas o site volta).

## Redeploy de plugin/tema

`plugins/` e `themes/` entram na imagem no build, e `themes/<n>/dist/theme.css`
é compilado **no host**. Por isso instalar extensão nunca tem efeito em
produção até um rebuild:

```bash
npx okcms plugin:install -n ./meu-plugin   # ou: theme:install
npx okcms redeploy --dry-run               # só mostra o plano
npx okcms redeploy
```

O que ele faz antes do deploy normal:

1. **migrations do plugin** — copia `plugins/<n>/migrations/*.sql` para
   `migrations/` (o único diretório que o runner lê). Idempotente: arquivo
   idêntico não é tocado; arquivo divergente **não** é sobrescrito (a
   versão aplicada no banco tem checksum); nome fora de
   `V###__owner__nome.sql` **nunca** é copiado.
2. **build de estilo** — compila cada tema que tiver entrada de estilo e
   grava `themes/<n>/dist/theme.css`.
3. **deploy blue/green** — a mesma sequência da tabela acima, mas com
   `packages: []`: nada de `bun add`, porque o que mudou é conteúdo de
   extensão, não versão de pacote.

Falha nos passos 1 ou 2 aborta **antes** de tocar no Docker. Um `.sql` já
existente em `migrations/` fora do padrão também é detectado antes — ele
quebraria o `db:migrate` do passo 5, e é melhor descobrir agora.

Flags: `-p, --plugin <n>` / `-t, --theme <n>` restringem o **preparo** (o
rebuild é sempre global), `-M, --skip-migrations`, `-B, --skip-theme-build`,
`-n, --dry-run`, além de todas as [flags de deploy](#a-sequência-do-deploy).

## Segurança

| Regra | Como é garantido |
|---|---|
| A CLI nunca roda dentro de um container | `assertHostOnly()` em `update`, `redeploy` e `config` — `--force` é o escape consciente, registrado em log |
| A CLI não está na imagem | `docker/Dockerfile` não instala `@oktis-works/cms` |
| Nenhum compose monta `docker.sock` | `assertNoDockerSocket()` — montar o socket é escalação direta para root do host |
| Postgres só no loopback | `127.0.0.1:5432` no compose de infra; redis nem publica porta |
| Segredos nunca em log | `redact()` cobre `DATABASE_URL`, senhas, tokens e JWT |
| Rede de rede da CLI = registry npm oficial | allowlist em `registryAllowlist()` |

O motivo do `assertHostOnly`: dentro de um container comprometido, `okcms
update` viraria um executor de `bun add` (scripts de pós-install de
terceiros) **na rede do banco**, com o `.env` na mão.

## Diagnóstico

```bash
npx okcms doctor          # docker, compose v2, lane ativa e proxy
npx okcms status          # processos do host (dev)

# o que está no ar agora
docker ps --filter label=okcms.role=edge --format '{{.Names}}\t{{.Status}}'
cat .deploy/state.json
cat deploy/nginx/conf.d/00-upstreams.conf

# logs por lane
docker logs -f okcms-api-blue
docker logs -f okcms-proxy

# infra
docker ps --filter label=okcms.role=data
```

| Sintoma | Causa provável |
|---|---|
| `Docker não está acessível` no preflight | Docker parado ou CLI dentro de container (sem `--force`) |
| `Docker Compose v2 não está disponível` | `docker-compose` legado (v1) instalado — o deploy usa o plugin v2 |
| Lane nova não fica `healthy` | `docker logs okcms-api-<lane>`; falha aqui não move tráfego |
| 502 no proxy | upstream aponta para container que morreu — confira `00-upstreams.conf` |
| `db:migrate` falha no meio do deploy | nada foi trocado; a lane atual segue servindo |
| Tema sem CSS em produção | `dist/theme.css` não foi buildado no host — rode `okcms redeploy` |

