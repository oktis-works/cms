# Referência da CLI — `okcms`

A CLI é a **única** superfície de operação do sistema: cria o projeto, sobe os
apps, migra o banco, configura o `.env`, instala extensões e faz deploy. Ela é
zero-dependências (sem lib de prompt), roda em **Node 22.23+ ou Bun 1.4.4+** e nunca
executa dentro de um container — deploy e configuração são sempre a partir do
host.

## Instalação

```bash
# global (permite `okcms ...` sem prefixo)
npm install -g @oktis-works/cms      # ou: bun add -g @oktis-works/cms

# criar um projeto sem instalação global
npx @oktis-works/cms@latest --help
# ou: bunx @oktis-works/cms@latest --help

# num projeto scaffoldado, a CLI fica disponível como `okcms`
okcms doctor
```

### Assistente interativo

Rode `okcms` **sem argumentos num terminal** e o assistente guiado abre —
todos os comandos, fluxos e campos da CLI, navegados com as setas (e
atalhos `1`-`9`):

```bash
okcms            # comando puro em TTY → o assistente
okcms menu       # alias explícito do mesmo assistente
```

- **Fluxos guiados** — `init`, `dev`, `deploy` (blue-green · simple · pm2) e
  `update`, com pré-cheagens (projeto, docker, portas ocupadas pelos apps
  locais) e escolha de doctor / retry / menu quando uma etapa falha.
- **Todos os comandos do CLI**, agrupados por área. Os destrutivos
  (`db:restore`, `db:rollback`, `rollback`, `update`) ganham ⚠ e uma confirmação
  extra além da normal. Cada execução imprime primeiro a linha exata
  `$ okcms …`, então tudo que foi feito na tela pode ser scriptado depois.
- **Entrevista do `.env`** — o schema completo (47 campos), cada um com uma
  explicação curta, o valor atual (segredos mascarados) e Enter mantendo-o.
  Nada é gravado até o resumo final ser confirmado uma única vez; Ctrl+C em
  qualquer ponto descarta o plano inteiro.
- **Status adaptativo** — o menu sonda docker, serviços do compose, apps
  rodando e `.env`, e sugere o próximo passo
  (init → env → infra → apps → deploy).
- **Idioma** — a UI começa em inglês e pode ser trocada para português (ou
  de volta) pelo menu; nomes de comandos e flags nunca são traduzidos.
  Durante um filho longo (`dev`, `start`) o Ctrl+C para o filho e volta ao
  menu em vez de matar o assistente.

Fora de um TTY (pipes, scripts, CI), `okcms` puro imprime o help estático —
o comportamento de automação nunca muda.

## Primeiros passos

```bash
npx @oktis-works/cms@latest init meu-site  # ou: bunx @oktis-works/cms@latest init meu-site
cd meu-site
$EDITOR .env                 # ajuste DB_PASSWORD e JWT_SECRET
bun run migrate             # aplica migrations/
bun run start                  # api + admin + web + worker
bun run doctor                 # se algo falhar
```

Ou faça a sequência inteira em um comando com o **`bun run dev`**: ele completa
o `.env` (gera os segredos que faltam, mantém os valores existentes), sobe a
infra do projeto (o MESMO compose que o `okcms deploy` reutiliza) e **espera
o Postgres aceitar conexões** antes das migrations, deixa o Redis alcançável
pelo host (o compose de infra o mantém só na rede interna, por design de
produção — o dev grava um override só-de-dev em `.data/dev-infra.override.yml`
que o `okcms deploy` nunca lê), aplica schema + seed + migrations, cria o
primeiro admin (`SUPER_ADMIN`) quando o banco está vazio, sobe os apps e
**imprime os endereços finais** (API · Admin · Web no localhost). É
reexecutável — depois de um `docker compose down -v` tudo é recriado na
próxima rodada — e fora de TTY exige `--yes` (com
`--email/--name/--password` para o primeiro usuário).

> **Dev → deploy.** O `bun run dev` prepara o MESMO estado que o
> `okcms deploy` consome (`.env` do projeto, compose de infra compartilhado,
> migrations versionadas, seed idempotente, o usuário admin) — nada é jogado
> fora. A única colisão: os processos do `start` ocupam as mesmas portas que
> os containers precisam, então rode `okcms stop` antes do `okcms deploy`.
> Sem Docker o passo de infra é pulado com dica (aponte para um Postgres
> seu); o `okcms dev` nunca grava workarounds "de dev" como
> `REDIS_HOST=disabled` no `.env` — valores existentes nunca são
> sobrescritos. O override do Redis fica em `.data/` (gitignored); o deploy
> roda o compose sem ele, então o Redis volta a ser só interno e o volume
> nomeado não é tocado.

O `init` pergunta em que língua escrever as docs (`README.md`, `PLUGIN.md`,
`THEME.md`): **inglês** ou **português**. Em script/CI (sem TTY) ele não
pergunta e o default é inglês — force com `--lang en` ou `--lang pt`. Só os
arquivos Markdown são traduzidos; comandos, flags e código continuam iguais.

Logo depois, ele pergunta se quer instalar as dependências do projeto agora
(mesmo menu de setas). Respondendo **Não** — ou passando `--no-install` — a
instalação é pulada. Com `bun` disponível ela roda com um loader ao vivo que
mostra a versão real de cada pacote conforme instala; sem bun, ele cai para o
`npm`.

## Referência de comandos

### Projeto e execução

| Comando | Opções | O que faz |
|---|---|---|
| `okcms init <dir> [nome]` | `-d, --dir` · `-l, --lang en\|pt` · `-n, --no-install` | Cria o projeto: configs, `.env`, compose, arquivos de deploy Docker, docs (em inglês ou português) e a instalação das dependências (bun, ou npm) |
| `okcms menu` | — | Abre o assistente interativo (igual a rodar `okcms` puro num terminal) |
| `okcms start` | `-A, --all` (default) · `-a, --api` · `-m, --admin` · `-w, --web` · `-W, --worker` | Sobe os apps como processos do host (pidfiles em `.data/`) |
| `okcms stop` | — | Para o que `start` subiu (pidfile + detecção) |
| `okcms status` | — | Estado dos processos + resumo do projeto |
| `okcms dev` | `-y, --yes` · `-s, --skip-start` · `-n, --no-infra` · `-e, --email` · `-N, --name` · `-p, --password` · `-F, --force` | Setup + run de dev num comando: completa `.env` → infra (espera o Postgres, publica o Redis em loopback p/ os apps de host) → schema/seed/migrations → primeiro admin → `start` + endereços finais (reexecutável; sem TTY exige `--yes`) |
| `okcms doctor` | — | Diagnóstico: node, `.env`, banco (`DB_*` ou `DATABASE_URL`), config, **docker, compose v2, lane, proxy** |
| `okcms config` | `-s, --set K=V` (repetível) · `-l, --list` · `-S, --show-secrets` · `-n, --non-interactive` · `-x, --section ` · `-F, --force` | Wizard de edição do `.env` — Enter mantém, Ctrl+C descarta tudo (exit 130) |

`--section` aceita: `app · database · redis · auth · storage · worker · cache ·
ports · theme · deploy`.

```bash
okcms config                          # wizard interativo
okcms config --list                   # chaves com segredos mascarados
okcms config --set PORT=4000 --set JWT_SECRET=$(openssl rand -hex 32)
okcms config --section deploy -n      # programático, sem TTY
```

### Atualização e deploy

| Comando | Opções | O que faz |
|---|---|---|
| `okcms deploy` | `-t, --target blue-green\|simple\|pm2` | **Primeiro deploy**: menu de setas (↑/↓ + Enter) escolhe o target; `--target` pula o menu |
| `okcms update` | — | Assistente de atualização: y/n por etapa — pacotes → migrations (sincroniza `./migrations`) → deploy |
| `okcms update -i` | `-i, --install` | Alias legado; a atualização completa já instala os pacotes |
| `okcms update --mode download` | `-m, --mode download\|deploy` | Pacotes + sync de migrations; nunca inicia o Docker |
| `okcms update --mode deploy` | `-t, --target blue-green\|simple\|pm2` | Deploy completo do target escolhido (ver abaixo) |
| `okcms redeploy` | `-p, --plugin <n>` · `-t, --theme <n>` · `-M, --skip-migrations` · `-B, --skip-theme-build` · `-n, --dry-run` · `-T, --target blue-green\|simple\|pm2` | Aplica plugin/tema recém-instalado: SQL do plugin → `migrations/`, `dist/theme.css` do tema e deploy (ver abaixo) |
| (flags de deploy) | `-c, --no-cache` · `-r, --remove-orphans` · `-k, --keep-orphans` · `-y, --yes` · `-F, --force` | `-c`/`-r`/`-k` valem só para `redeploy` e `update --mode deploy` — o primeiro `deploy` não os expõe, e as opções de órfãos só afetam o blue/green; `-y` e `-F` são para uso sem TTY |

```bash
okcms deploy --target simple      # primeiro deploy: menu, ou --target para pular
okcms update                     # assistente: y/n em pacotes → migrations → deploy
okcms update --mode download     # apenas pacotes
okcms update --mode deploy       # deploy: target do menu, --target ou salvo
okcms update --mode deploy --target pm2 --yes # CI: sem prompts, defaults

Copie o diretório completo do tema para `themes/<nome-do-tema>` e sincronize-o com o banco.
okcms redeploy                  # stage + build + deploy (o que fazer depois de instalar)
okcms redeploy --dry-run        # só mostra o plano
```

> **Sem TTY exige confirmação explícita.** Sem `--mode`, scripts precisam de
> `--yes` para executar a atualização completa. Use `--mode download` para
> atualizar apenas pacotes. Sem `--target`, um script reutiliza o target salvo
> (blue/green num projeto que nunca fez deploy) em vez de perguntar.

O `okcms update` pergunta etapa por etapa: instalar os pacotes
`@oktis-works/*` no host? baixar as migrations pendentes para
`./migrations`? fazer o deploy agora? Cada `n` pula a etapa — `n` no deploy
encerra sem tocar em Docker ou PM2. As migrations vêm embutidas no pacote do
CLI e são sincronizadas sem destruir: só entra o que falta; arquivo editado
localmente é mantido e o conflito é reportado. Com `y` no deploy, a
atualização faz o build da nova versão, aplica as migrations no host e
executa o deploy do target escolhido.

### Banco de dados

| Comando | Opções | O que faz |
|---|---|---|
| `okcms db:migrate` | `-d, --dir` · `-t, --tenant` | Aplica as migrations pendentes de `migrations/` |
| `okcms db:rollback` | `-d, --dir` · `-t, --tenant` | Reverte a última migration |
| `okcms db:status` | `-t, --tenant` | Mostra o estado das migrations |
| `okcms db:backup` | `-o, --out` | Dump custom do Postgres com timestamp |
| `okcms db:restore` | `-f, --file` (obrigatória) · `-c, --clean` | Restaura um dump, opcionalmente dropando antes |

### Extensões

| Comando | Opções | O que faz |
|---|---|---|
| `okcms plugin:create` | `-n, --name` (obrigatória) · `-d, --dir` | Scaffold mínimo de plugin |
| `okcms plugin:install` | `-n, --name` (obrigatória) | Instala de um caminho local + registra |
| `okcms plugin:list` · `plugin:search` | `-q, --query` | Lista instalados / busca no npm (`okcms-plugin`) |
| `okcms plugin:manage` | `-n, --name` (obrigatória) · `-i` · `-e` · `-d` · `-u` | Info; enable/disable (estado local); uninstall |
| `okcms theme:create` | `-n, --name` (obrigatória) · `--engine react\|solid` · `-d, --dir` · `-s, --style css\|scss\|tailwind` | Scaffold isolado de tema React/Solid |
| `okcms theme:list` · `theme:search` | `-q, --query` | Consulta de temas |
| `okcms theme:manage` | `-n, --name` (obrigatória) · `-i` · `-d` · `-u` · `-s, --set-active` | Info; uninstall; ativação por tenant |
| `okcms theme:build` | `-n, --name` (required) · `-d, --themes-dir` | Compila artifact SSR e estilos isolados |

### Conteúdo e sistema

| Comando | Opções | O que faz |
|---|---|---|
| `okcms user:create` | `-e, --email` · `-n, --name` · `-p, --password` (todos obrigatórios) · `-t, --tenant` | Cria usuário e atribui papel no tenant |
| `okcms seed` | — | Dados iniciais (roles + settings) — idempotente |
| `okcms system:status` | — | Status do ambiente + saúde do banco |
| `okcms media:migrate` | `-f, --from` · `-t, --to` (obrigatórios) | Move mídia entre drivers (`local`, `s3`, `r2`, `minio`) |
| `okcms build` | `-a, --apps api,admin,web` | Build dos apps (só em monorepo) |

### Convenções e exit codes

- `0` sucesso · `1` erro · `130` interrompido (Ctrl+C) — nenhum artefato gravado.
- Toda opção booleana é `-x` ou `--long`; opções marcadas *repetível* (`--set`)
  acumulam ocorrências em vez de sobrescrever.
- Comandos que alteram estado fora do processo recusam rodar **dentro** de um
  container (`okcms update`, `okcms redeploy`, `okcms config`); `--force` é o
  escape consciente.
- Segredos nunca aparecem em `--list` sem `--show-secrets`, e nunca são
  impressos de volta em erro.
