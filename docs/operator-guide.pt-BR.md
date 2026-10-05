> 📄 **Português (Brasil)** · [English](./operator-guide.md)

# Guia do operador

Guia de quem **hospeda uma instância** do OkCMS. Não exige ler código: é a
referência de operação — instalar, configurar, subir, migrar, instalar
extensão, atualizar, fazer backup e diagnosticar.

- Deploy em Docker (produção): [docker-deploy.md](./docker-deploy.pt-BR.md)
- Escrever plugin/tema: [plugin-development.md](./plugin-development.pt-BR.md) ·
  [theme-development.md](./theme-development.pt-BR.md)

## Pré-requisitos

| Necessário para | Requisito |
|---|---|
| sempre | **Node 20+** ou **Bun 1.3+** |
| sempre | **PostgreSQL 16+** |
| filas do worker | **Redis** (sem ele: `REDIS_HOST=disabled` — cache em memória, filas não funcionam) |
| deploy em Docker | **Docker** + **Docker Compose v2** (`docker compose version`) |

## Instalação da CLI

```bash
# global — permite `okcms ...` sem prefixo em qualquer pasta
npm install -g @oktis-works/cms      # ou: bun add -g @oktis-works/cms

# sem instalar — sempre funciona
npx okcms --help                     # bunx okcms --help com Bun
```

Num projeto criado com `okcms init` a CLI já está em `devDependencies`, então
`npx okcms ...` basta. Os atalhos do `package.json` também já existem:
`bun run start` · `bun run migrate` · `bun run doctor` · `bun run backup`.

> A CLI **nunca roda dentro de um container**: `update`, `redeploy` e
> `config` recusam (é o host que tem o `.env` e o Docker). `--force` é o
> escape consciente.

## Criando o projeto

```bash
npx okcms init meu-site
cd meu-site
$EDITOR .env            # DB_PASSWORD e JWT_SECRET, no mínimo
npx okcms db:migrate    # schema + seed idempotente
npx okcms start         # api + admin + web + worker
npx okcms doctor        # se algo falhar
```

O `init` cria a estrutura toda — inclusive os arquivos de deploy Docker — e
roda `bun install` (cai para `npm install` se não houver Bun).

Ele também pergunta em que língua escrever as docs do projeto (`README.md`,
`PLUGIN.md`, `THEME.md`): inglês ou português. Em script/CI (sem TTY) a
pergunta não aparece e o default é **inglês** — force com `--lang en` ou
`--lang pt`. Só os arquivos Markdown mudam de língua; comandos, flags e
mensagens de log continuam iguais.

```
meu-site/
├── okcms.config.json     # nome, ports, storage, dirs, tema ativo (sem credenciais)
├── .env                  # ÚNICA fonte de credenciais: banco, redis, JWT, ports
├── migrations/           # SQL aplicado por `okcms db:migrate`
├── plugins/  themes/     # extensões do projeto
├── docker-compose.yml    # infra de dev: postgres + redis
└── docker/ deploy/ docker-compose.app.yml …
                         # arquivos de deploy: lanes blue/green + stack simples (sem lanes) + proxy
```

## Configuração do `.env`

```bash
npx okcms config                          # wizard interativo
npx okcms config --list                   # chaves, com segredos mascarados
npx okcms config --show-secrets           # revela os valores
npx okcms config --set PORT=4000          # programático (repetível)
npx okcms config --section deploy -n      # sem TTY: não faz pergunta nenhuma
npx okcms config --set JWT_SECRET=$(openssl rand -hex 32)
```

Regras do wizard: **Enter mantém o valor atual** (nada de default escrito por
acidente), alterações são aplicadas só depois de validadas **todas** (a gravação
é atômica), e **Ctrl+C descarta tudo** com exit `130`.

`--section` aceita: `app · database · redis · auth · storage · worker · cache ·
ports · theme · deploy`.

Banco em dois formatos, escolha um — `DATABASE_URL` tem precedência:

```bash
# (a) variáveis separadas (default)
DB_HOST=localhost DB_PORT=5432 DB_NAME=okcms DB_USER=postgres DB_PASSWORD=…
# (b) URL única
DATABASE_URL=postgresql://postgres:senha@localhost:5432/okcms
```

## Rodando

```bash
npx okcms start              # tudo (api + admin + web + worker)
npx okcms start --api        # só um app (-a) · --admin (-m) · --web (-w) · --worker (-W)
npx okcms status             # o que está rodando (pidfiles em .data/)
npx okcms stop               # para o que o start subiu
npx okcms doctor             # node, .env, banco, config, docker, compose, lane, proxy
```

`okcms start` é **conveniência de dev**: não reinicia filhos que morrem e
mistura os logs. Em produção use pm2 ou o deploy em Docker — ver
[docker-deploy.md](./docker-deploy.pt-BR.md).

Portas padrão (ajustáveis no `.env`): **API 3000** (`PORT`) · **Web 3001**
(`WEB_PORT`) · **Admin 3011** (`ADMIN_PORT`).

## Banco de dados

```bash
npx okcms db:migrate                    # aplica migrations/ pendentes
npx okcms db:status                     # o que já foi aplicado
npx okcms db:rollback                   # reverte a última
npx okcms db:migrate --tenant outro     # migration selectiva (default: default)
npx okcms db:backup                     # dump com timestamp em backups/
npx okcms db:restore -f backups/arquivo.sql
npx okcms db:restore -f dump.sql --clean   # drop antes de restaurar
```

- O banco é **multi-tenant via Row-Level Security**; `--tenant` aceita o slug
  (`default`) e resolve para o UUID.
- **Migrations são imutáveis** depois de aplicadas: para mudar alguma coisa,
  crie uma nova. Reescrever o arquivo invalida o checksum registrado.
- Nome obrigatório: `V<numero>__<owner>__<nome>.sql` — `owner` = `core` para
  o schema do CMS, qualquer outro nome marca a migration como de plugin.
- Antes de mexer em produção: `db:backup`. Sempre.

## Extensões

```bash
# plugins
npx okcms plugin:create -n meu-plugin
npx okcms plugin:install -n ./caminho/para/meu-plugin
npx okcms plugin:list
npx okcms plugin:manage -n meu-plugin --info|--enable|--disable|--uninstall
npx okcms plugin:search -q galeria          # npm, keyword okcms-plugin

# temas
npx okcms theme:create -n meu-tema --style scss
npx okcms theme:install -n ./caminho/para/meu-tema
npx okcms theme:manage -n meu-tema --set-active
npx okcms theme:build -n meu-tema           # scss/tailwind → dist/theme.css
npx okcms theme:list
```

Instalar copia os arquivos para `plugins/` / `themes/` e valida
`compatibility.okcms` contra a versão do CMS — manifesto incompatível é
recusado.

### Depois de instalar: `okcms redeploy`

**Instalar não muda o que está no ar.** `plugins/` e `themes/` entram na
imagem no build, e `themes/<n>/dist/theme.css` é compilado no host (o
container não compila SCSS/Tailwind). Um plugin que mexe no banco precisa
além disso aplicar o SQL dele.

```bash
npx okcms redeploy --dry-run   # só mostra o plano
npx okcms redeploy             # stage + build + deploy (pergunta o target a cada execução)
```

1. copia `plugins/<n>/migrations/*.sql` para `migrations/` — idempotente;
   nome fora de `V###__owner__nome.sql` nunca é copiado, e um arquivo
   já existente fora do padrão **para o comando antes do deploy**;
2. compila o estilo de cada tema com entrada, gravando `dist/theme.css`;
3. roda o deploy do target escolhido (blue/green · simple · PM2) **sem
   `bun add`** (o que mudou é extensão, não
   versão de pacote).

| Flag | Efeito |
|---|---|
| `-n, --dry-run` | Só o plano, nada executado |
| `-p, --plugin <n>` / `-t, --theme <n>` | Restringe o **preparo** a uma extensão (o rebuild é sempre global) |
| `-M, --skip-migrations` | Não copia SQL de plugin |
| `-B, --skip-theme-build` | Não compila estilos |
| `-y, --yes` | Sem prompts (CI) |
| `-T, --target blue-green\|simple\|pm2` | Pula o menu de target (setas ↑/↓ + Enter, última escolha pré-selecionada) |
| flags de deploy | `-c/--no-cache` · `-r/--remove-orphans` · `-k/--keep-orphans` · `-F/--force` — **só** em `redeploy` e `update --mode deploy`: o primeiro `okcms deploy` não os expõe, e as opções de órfãos afetam só o blue/green |

Se o projeto não roda em Docker (dev no host), o ciclo é só:

```bash
npx okcms theme:build -n meu-tema
npx okcms db:migrate
npx okcms stop && npx okcms start
```

## Atualização

```bash
npx okcms update                     # com TTY: menu (download ou deploy)
npx okcms update -i                  # só baixa/aplica os pacotes (comportamento clássico)
npx okcms update --mode deploy       # deploy Docker completo — pergunta o target a cada execução
npx okcms update --mode deploy --target pm2 --yes # CI: sem prompts, sem menu
```

Toda execução pergunta o **target de deploy** num menu de setas (navegue com
↑/↓, confirme com Enter, última escolha já pré-selecionada): `blue-green`
(lanes, zero downtime) · `simple` (`docker-compose.app.yml`, restart breve) ·
`pm2` (processos no host). `-t, --target` pula o menu, e a escolha fica
guardada em `.deploy/state.json`.

> **Não-TTY nunca faz deploy por acidente.** Sem `--mode`, o default em script
> é `download` — um `-i` em cron continua fazendo exatamente o que sempre fez.
> Sem `--target`, um script reutiliza o target salvo (blue/green num projeto
> que nunca fez deploy) em vez de perguntar.

## Backup e recuperação

```bash
npx okcms db:backup                                   # dump com timestamp
npx okcms db:restore -f backups/okcms-2026-10-04.sql  # restaurar
```

Agende o `db:backup` (cron systemd) **e** copie o diretório de mídia
(`STORAGE_LOCAL_PATH`, default `.data/storage`) — o volume do Docker
`okcms-storage` é compartilhado entre as lanes e **nunca** é apagado pelo
deploy, mas backup fora do servidor é o único que aguenta perda da máquina.

## Referência de comandos

| Comando | O que faz |
|---|---|
| `okcms init <dir> [nome]` | Cria o projeto (configs, `.env`, compose, deploy, docs em inglês ou português — `--lang en\|pt`) + install |
| `okcms start` / `stop` / `status` | Sobe / para / mostra os processos do host |
| `okcms doctor` | Diagnóstico completo (node, `.env`, banco, config, docker, compose, lane, proxy) |
| `okcms config` | Wizard do `.env` (`--list`, `--set`, `--section`, `--show-secrets`) |
| `okcms deploy` | Primeiro deploy: menu de target — `--target blue-green\|simple\|pm2` (`-t`) pula o menu |
| `okcms update` | Só pacotes **ou** deploy (blue/green · simple · PM2 — target perguntado a cada execução) |
| `okcms redeploy` | Aplica plugin/tema novo: migrations do plugin + build de tema + deploy (`-T, --target`) |
| `okcms db:migrate` · `db:rollback` · `db:status` | Migrations de `migrations/` (`--tenant` opcional) |
| `okcms db:backup` · `db:restore -f <arquivo>` | Backup/restore do Postgres |
| `okcms plugin:create` · `plugin:install` · `plugin:list` · `plugin:search` · `plugin:manage` | Ciclo de vida de plugins |
| `okcms theme:create` · `theme:install` · `theme:list` · `theme:search` · `theme:manage` | Ciclo de vida de temas (`--set-active`) |
| `okcms theme:build -n <nome>` | Compila SCSS/Tailwind → `dist/theme.css` isolado |
| `okcms user:create` | Cria usuário e atribui papel no tenant |
| `okcms seed` | Roles + settings iniciais (idempotente) |
| `okcms system:status` | Status do ambiente + saúde do banco |
| `okcms media:migrate -f <de> -t <para>` | Move mídia entre drivers (`local`, `s3`, `r2`, `minio`) |
| `okcms prerender` | HTML estático das páginas publicadas (best-effort) |
| `okcms build` | Build dos apps (só em monorepo) |

## Exit codes e convenções

| Code | Significado |
|---|---|
| `0` | sucesso (ou recusa explícita do usuário num prompt) |
| `1` | erro — com a causa impressa; nenhuma metade de uma operação fica aplicada |
| `130` | interrompido (Ctrl+C) — nada foi gravado |

- Toda opção booleana aceita `-x` ou `--long`; `--set` é repetível e acumula.
- Segredos aparecem mascarados em `--list` e nunca voltam ao terminal em
  erro: o `redact()` cobre URLs com credencial, senhas e tokens.
- Comandos que mudam estado fora do processo recusam rodar **dentro** de um
  container; `--force` é o escape.

## Solução de problemas

| Sintoma | O que fazer |
|---|---|
| `init` falha no install | Rode `bun install` (ou `npm install`) à mão e veja o erro |
| `start` cai na hora | `npx okcms doctor` — quase sempre `.env` incompleto ou banco fora do ar |
| `403` logo após o primeiro registro | `npx okcms seed` — sem os roles da política, todo `requirePermission` nega |
| `db:migrate` diz `Invalid migration filename` | Algo em `migrations/` fora de `V###__owner__nome.sql`; renomeie |
| `etcd/ERR_CLIENT_RESPONSE_UNAUTHORIZED` no worker | Redis com senha errada no `.env` (`REDIS_PASSWORD`) |
| Deploy para de no healthcheck | `docker logs okcms-api-<lane>` — nada foi trocado, a lane atual segue no ar |
| 502 após deploy | `cat deploy/nginx/conf.d/00-upstreams.conf` + `docker ps --filter label=okcms.role=edge` |
| Tema sem CSS em produção | `npx okcms redeploy` — `dist/theme.css` precisa ser buildado no host |
| CLI recusa dentro de container | Esperado; rode no host ou use `--force` |

