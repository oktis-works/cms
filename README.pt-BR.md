> 📄 **Português (Brasil)** · [English](./README.md)

# OkCMS v1.0.4

Hybrid, modular, API-first, extensible CMS com plataforma de temas isolada em React/Solid, backend Node.js/TypeScript, PostgreSQL, implantações Docker imutáveis, sistemas de extensão de plugins e temas, e multi-tenancy. Temas públicos são projetos isolados em React ou Solid compilados com `okcms theme:build` e conectados ao host apenas através do `ThemeSdkBridge`.

## Documentação

| Público | Guia |
|---|---|
| **Operador** (hospeda uma instalação) | [Operator Guide](./docs/operator-guide.pt-BR.md) — pré-requisitos, CLI completa, config, update, backup |
| **Operador** (deploy em Docker) | [Docker Deploy](./docs/docker-deploy.pt-BR.md) — targets de deploy, imagem única, lanes blue/green, rollback, segurança |
| Mantenedor (contribui com o código) | [Maintainer Guide](./docs/maintainer-guide.pt-BR.md) — dev local, qualidade, publicação npm/Docker |
| Desenvolvedor de extensões | [Plugin Development](./docs/plugin-development.pt-BR.md) · [Theme Development](./docs/theme-development.pt-BR.md) |
| Referência de comandos CLI | [CLI Reference](./docs/cli-reference.pt-BR.md) — todos os comandos, opções e flags |

---

## CLI `okcms`

A CLI é a **única** superfície de operação do sistema: cria o projeto, sobe os apps, migra o banco, configura o `.env`, instala extensões e faz deploy. Ela é zero-dependências (sem lib de prompt), roda em **Node 22.23+ ou Bun 1.4.4+** e nunca executa dentro de um container — deploy e configuração são sempre a partir do host.

### Instalação

```bash
# global (permite `okcms ...` sem prefixo)
npm install -g @oktis-works/cms      # ou: bun add -g @oktis-works/cms

# criar um projeto sem instalação global
npx @oktis-works/cms@latest init meu-site
# ou: bunx @oktis-works/cms@latest init meu-site

# num projeto scaffoldado, a CLI fica disponível como `okcms`
okcms doctor
```

### Uso local do projeto (recomendado)

```bash
# 1. Crie um novo projeto
npx @oktis-works/cms@latest init meu-site
cd meu-site

# 2. Configure o ambiente (ajuste DB_PASSWORD e JWT_SECRET)
$EDITOR .env

# 3. Aplique migrações do banco
bun run migrate

# 4. Suba todos os apps (API + Admin + Web + Worker)
bun run start

# 5. Execute diagnósticos se algo falhar
bun run doctor
```

**Ou faça tudo de uma vez com `bun run dev`:**

```bash
npx @oktis-works/cms@latest init meu-site
cd meu-site
bun run dev
```

O `bun run dev` completa o `.env` (gera os segredos que faltam, mantém os valores existentes), sobe a infra do projeto (o MESMO compose que o `okcms deploy` reutiliza) e **espera o Postgres aceitar conexões** antes das migrations, deixa o Redis alcançável pelo host (o compose de infra o mantém só na rede interna, por design de produção — o dev grava um override só-de-dev em `.data/dev-infra.override.yml` que o `okcms deploy` nunca lê), aplica schema + seed + migrations, cria o primeiro admin (`SUPER_ADMIN`) quando o banco está vazio, sobe os apps e **imprime os endereços finais** (API · Admin · Web no localhost). É reexecutável — depois de um `docker compose down -v` tudo é recriado na próxima rodada — e fora de TTY exige `--yes` (com `--email/--name/--password` para o primeiro usuário).

O `init` pergunta em que língua escrever as docs (`README.md`, `PLUGIN.md`, `THEME.md`): **inglês** ou **português**. Em script/CI (sem TTY) ele não pergunta e o default é inglês — force com `--lang en` ou `--lang pt`. Só os arquivos Markdown são traduzidos; comandos, flags e código continuam iguais.

Logo depois, ele pergunta se quer instalar as dependências do projeto agora (mesmo menu de setas). Respondendo **Não** — ou passando `--no-install` — a instalação é pulada. Com `bun` disponível ela roda com um loader ao vivo que mostra a versão real de cada pacote conforme instala; sem bun, ele cai para o `npm`.

### Assistente interativo

Rode `okcms` **sem argumentos num terminal** e o assistente guiado abre — todos os comandos, fluxos e campos da CLI, navegados com as setas (e atalhos `1`-`9`):

```bash
okcms            # comando puro em TTY → o assistente
okcms menu       # alias explícito do mesmo assistente
```

- **Fluxos guiados** — `init`, `dev`, `deploy` (blue-green · simple · pm2) e `update`, com pré-cheagens (projeto, docker, portas ocupadas pelos apps locais) e escolha de doctor / retry / menu quando uma etapa falha.
- **Todos os comandos do CLI**, agrupados por área. Os destrutivos (`db:restore`, `db:rollback`, `rollback`, `update`) ganham ⚠ e uma confirmação extra além da normal. Cada execução imprime primeiro a linha exata `$ okcms …`, então tudo que foi feito na tela pode ser scriptado depois.
- **Entrevista do `.env`** — o schema completo (47 campos), cada um com uma explicação curta, o valor atual (segredos mascarados) e Enter mantendo-o. Nada é gravado até o resumo final ser confirmado uma única vez; Ctrl+C em qualquer ponto descarta o plano inteiro.
- **Status adaptativo** — o menu sonda docker, serviços do compose, apps rodando e `.env`, e sugere o próximo passo (init → env → infra → apps → deploy).
- **Idioma** — a UI começa em inglês e pode ser trocada para português (ou de volta) pelo menu; nomes de comandos e flags nunca são traduzidos. Durante um filho longo (`dev`, `start`) o Ctrl+C para o filho e volta ao menu em vez de matar o assistente.

Fora de um TTY (pipes, scripts, CI), `okcms` puro imprime o help estático — o comportamento de automação nunca muda.

---

## Deploy em Docker

O `okcms init` suporta **três targets de deploy**. Toda execução de `okcms deploy`, `okcms update --mode deploy` e `okcms redeploy` pergunta qual usar num menu de setas (navegue com ↑/↓, confirme com Enter, última escolha já pré-selecionada), e `--target blue-green|simple|pm2` pula o menu — a escolha fica guardada em `.deploy/state.json`:

- **blue/green** — lanes blue/green atrás do proxy nginx, troca sem downtime;
- **simple** — um stack só, sem lanes, em `docker-compose.app.yml` (projeto Docker `okcms-app`, containers `okcms-api`/`okcms-web`/`okcms-admin`/`okcms-worker`) com o nginx apontando para ele, restart breve em vez de troca sem downtime;
- **pm2** — processos no host via `pm2 startOrReload ecosystem.config.js --update-env`.

A sequência abaixo é a do target blue/green — o `okcms init` já escreve tudo que o deploy precisa:

```
meu-site/
├── docker/Dockerfile              # imagem única okcms/app (4 entrypoints)
├── docker/entrypoint.sh           # roteia api | admin | web | worker
├── docker-compose.infra.yml       # projeto `okcms`: rede, postgres, redis, proxy
├── docker-compose.deploy.yml      # projeto das lanes: 8 services blue/green
├── docker-compose.app.yml         # stack simples: projeto `okcms-app` (sem lanes)
├── deploy/nginx/templates/…       # template do proxy (envsubst)
├── deploy/nginx/conf.d/00-upstreams.conf   # reescrito pela CLI no swap
└── .deploy/state.json             # lane ativa + target + histórico (gitignored)
```

> ### `docker/` vs `infrastructure/` — o que é o que
>
> Dois diretórios contêm arquivos Docker, e eles são **intencionalmente diferentes**:
>
> | Diretório | Propósito | Gerado a partir de |
> |-----------|-----------|-------------------|
> | `docker/` (raiz do projeto) | Imagem de desenvolvimento local para checkout do monorepo. Copia todos os workspaces (`apps`, `packages`, `plugins`) e instala com `--filter '@oktis-works/*'`. | `packages/cli/src/assets.ts` (string `DOCKERFILE`) |
> | `infrastructure/` (monorepo) | Espelho dos mesmos artefatos de deploy, mantido no repositório para auditoria. Regenerado por `bun scripts/sync-infrastructure.ts`. Validado no CI para nunca divergir do `assets.ts`. | `packages/cli/src/assets.ts` (mesmas strings) |
>
> **Nunca edite `infrastructure/` ou `docker/` diretamente.** Para mudar qualquer artefato de deploy, edite `packages/cli/src/assets.ts`, rode `bun scripts/sync-infrastructure.ts`, então commite ambos. O CI impõe isso com `git diff --exit-code`.
>
> O que o `okcms init` escreve no **seu projeto** (ex.: `meu-site/`) vem de `assets.ts` via `deployAssets()` — `docker/Dockerfile`, `docker/entrypoint.sh`, `docker-compose.infra.yml`, `docker-compose.deploy.yml`, `docker-compose.app.yml`, e `deploy/nginx/`. Ele não copia do `infrastructure/`.

```bash
okcms deploy --target blue-green     # primeiro deploy
okcms update --mode deploy           # o mesmo, a cada update
```

O que acontece, nesta ordem (blue/green):

1. preflight (docker + compose v2) e rede `okcms-net`;
2. infraestrutura no ar (postgres, redis, proxy) e healthcheck;
3. pacotes `@oktis-works/*` atualizados **no host**;
4. `docker compose build` da lane nova — ainda sem tráfego;
5. `okcms db:migrate` **no host** — falhou aqui e nada mudou;
6. sobe o edge (`api`, `web`, `admin`) da lane nova e espera cada healthcheck;
7. troca do proxy: `00-upstreams.conf` + `nginx -s reload` (conexões vivas);
8. **drena** o worker antigo (SIGTERM + `stop_grace_period`), sobe o novo;
9. derruba a lane antiga com `down` — **sem `-v`**, o volume de mídia é compartilhado;
10. grava `.deploy/state.json` (a lane antiga vira o caminho de rollback).

Qualquer falha nos passos 4–7 desfaz o que já foi feito e deixa a lane atual servindo. Detalhes completos em **[docs/docker-deploy.md](./docs/docker-deploy.pt-BR.md)**.

### Aplicando um plugin ou tema novo

Instalar extensão **não muda o que está no ar**: `plugins/` e `themes/` entram na imagem pelo `COPY . .` do build, e `themes/<n>/dist/theme.css` é compilado **no host** (o container não compila SCSS/Tailwind). Um plugin que mexe no banco precisa aplicar o SQL dele.

```bash
Copie diretórios completos de temas para `themes/`; a instalação de temas é somente por arquivos.
okcms redeploy
```

O `okcms redeploy` faz o ciclo completo, nesta ordem:

1. copia `plugins/<n>/migrations/*.sql` para `migrations/` — idempotente, e um nome fora de `V###__owner__nome.sql` **nunca** é copiado (quebraria todo `db:migrate`);
2. compila o estilo de cada tema que tiver entrada, gravando `themes/<n>/dist/theme.css`;
3. roda o deploy do target escolhido — o mesmo do `okcms update --mode deploy`, só que **sem** `bun add` — o que mudou é conteúdo de extensão, não versão de pacote.

Falha no preparo (1 ou 2) aborta antes de tocar no deploy; falha no deploy faz rollback, como sempre. Opções úteis:

| Flag | Efeito |
|---|---|
| `-n, --dry-run` | Mostra o plano (o que seria copiado/compilado) e sai |
| `-p, --plugin <n>` / `-t, --theme <n>` | Restringe o **preparo** a uma extensão (o rebuild é sempre global) |
| `-M, --skip-migrations` | Não copia SQL de plugin para `migrations/` |
| `-B, --skip-theme-build` | Não compila estilos (só para rebuild de plugin) |
| `-y, --yes` | Sem prompts (CI) — as flags de deploy valem igual |

---

## Arquitetura

- **Frontend público**: host neutro + temas SSR isolados em React/Solid
- **Backend**: Node.js + TypeScript + Hono
- **Banco de dados**: PostgreSQL com Row-Level Security
- **Cache/Fila**: Redis
- **Build**: Docker immutable builds com cache de camadas
- **Monorepo**: Bun workspaces

```mermaid
flowchart TD
    subgraph Client ["Camada Cliente"]
        Browser[Browser / Web]
        Admin[Painel Admin]
        APIClient[API Clients / SDKs]
    end

    subgraph Edge ["Edge / Público (Web)"]
        Web[Web SSR React/Solid]
        Themes[Temas Públicos]
    end

    subgraph API ["Camada API (Hono)"]
        Auth[Auth & API Keys]
        Content[Content API]
        Media[Media API]
        Plugins[Plugin Routes]
        Hooks[Hooks / Filters Catalog]
    end

    subgraph AdminUI ["Admin UI (Astro + Solid)"]
        Dashboard[Dashboard]
        Settings[Settings]
        ThemeCustomizer[Theme Customizer]
        PluginManager[Plugin Manager]
    end

    subgraph Core ["Core Services"]
        Tenant[Tenant Context / RLS]
        Events[Event Store]
        Cache[Tagged Cache]
        Queue[Job Queue]
        Storage[Storage Drivers]
    end

    subgraph DB ["Banco de Dados (PostgreSQL)"]
        Tables[Tabelas + Políticas RLS]
        Migrations[Migrations]
    end

    subgraph Infra ["Infraestrutura"]
        Redis[Redis]
        Worker[Processo Worker]
        Docker[Docker Compose]
    end

    Client --> Edge
    Client --> API
    Client --> AdminUI
    Edge --> API
    AdminUI --> API
    API --> Core
    Core --> DB
    Core --> Infra
    API --> Infra
    Worker --> DB
    Worker --> Redis
    Themes --> Edge
    Plugins --> API
    Hooks --> API
```

## Estrutura do Projeto

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
│   ├── cli/           # `okcms` CLI (assets canônicos de deploy em src/assets.ts)
│   ├── validation/    # CMS_VERSION / compatibilidade
│   └── utils/         # Shared utilities
├── infrastructure/    # Espelhos gerados da CLI (docker/, compose/, nginx/)
├── plugins/           # Plugin packages
├── themes/            # Theme packages
├── docs/              # Documentação
└── tests/             # Integration tests
```

`infrastructure/**` é **gerado** a partir de `packages/cli/src/assets.ts` — não edite à mão:

```bash
bun scripts/sync-infrastructure.ts
```

## Começando

### Pré-requisitos

- Node.js 22.23+
- Bun 1.4.4+
- Docker & Docker Compose v2 (para os targets `blue-green` e `simple` — `pm2` não precisa)
- PostgreSQL 16+

### Desenvolvimento

1. Clone o repositório
2. Instale as dependências:

   ```bash
   bun install
   ```

3. Inicie o ambiente de desenvolvimento:

   ```bash
   docker compose up -d
   ```

4. Execute o servidor API:

   ```bash
   bun run --filter @oktis-works/api dev
   ```

### Build

```bash
# Build de todos os pacotes
bun run build

# Build de um pacote específico
bun run --filter @oktis-works/api build

# Imagem Docker (equivalente à usada no deploy)
docker build -f infrastructure/docker/Dockerfile -t okcms/app .
```

### Testes

```bash
bun run test:run
bun run typecheck
bun run lint
```

## Variáveis de Ambiente

```bash
# Banco de dados (formato (a) variáveis, ou (b) DATABASE_URL com precedência)
DB_HOST=localhost
DB_PORT=5432
DB_NAME=okcms
DB_USER=postgres
DB_PASSWORD=
# DATABASE_URL=postgresql://user:password@localhost:5432/okcms

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Autenticação
JWT_SECRET=your-secret-key

# Aplicação
NODE_ENV=development
PORT=3000        # api
WEB_PORT=3001    # site público
ADMIN_PORT=3011  # painel admin
```

Edite com o wizard: `okcms config`.

## Endpoints da API

### Health
- `GET /health` - Health check
- `GET /health/ready` - Readiness check
- `GET /health/live` - Liveness check

### Autenticação
- `POST /api/v1/auth/register` - Registra usuário
- `POST /api/v1/auth/login` - Login
- `POST /api/v1/auth/api-key-login` - Troca uma API key por access + refresh JWT (veja abaixo)
- `POST /api/v1/auth/refresh` - Refresh token
- `POST /api/v1/auth/logout` - Logout

### API Keys (clientes API-first)
- `GET /api/v1/api-keys` - Lista as keys emitidas (requer `read:apikey`)
- `POST /api/v1/api-keys` - Emite uma key (requer `create:apikey`) — o valor claro é retornado **uma única vez**
- `DELETE /api/v1/api-keys/:id` - Revoga uma key (requer `delete:apikey`)

A key nunca autoriza requests diretamente. Use-a uma vez para obter os JWTs:

```bash
curl -X POST http://localhost:3000/api/v1/auth/api-key-login \
  -H 'Content-Type: application/json' \
  -d '{"apiKey":"okcms_<prefix>_<secret>"}'
# → { accessToken, refreshToken, user, tenantId }
# depois use Authorization: Bearer <accessToken> e POST /api/v1/auth/refresh
```

Keys podem ser de uso único (`oneTime`) e/ou expirar em data definida. Apenas o hash SHA-256 é persistido; gerencie as keys no admin em **Settings → API keys**.

### Content
- `GET /api/v1/content` - Lista conteúdo
- `GET /api/v1/content/:id` - Obtém conteúdo por ID
- `GET /api/v1/content/slug/:slug` - Obtém conteúdo por slug
- `POST /api/v1/content` - Cria conteúdo
- `PUT /api/v1/content/:id` - Atualiza conteúdo
- `DELETE /api/v1/content/:id` - Deleta conteúdo
- `GET /api/v1/content/:id/versions` - Obtém versões do conteúdo

## Leia mais

Quer se aprofundar? Esses guias entram em detalhes sobre tópicos específicos:

| O que você quer saber | Guia |
|---|---|
| Referência completa de comandos CLI (todos, opções, flags) | [docs/cli-reference.pt-BR.md](./docs/cli-reference.pt-BR.md) |
| Deploy em Docker — targets, lanes, rollback, segurança | [docs/docker-deploy.pt-BR.md](./docs/docker-deploy.pt-BR.md) |
| Contribuir com código — dev local, qualidade, publicação | [docs/maintainer-guide.pt-BR.md](./docs/maintainer-guide.pt-BR.md) |
| Construindo plugins — manifest, hooks, admin UI, tipos de campo | [docs/plugin-development.pt-BR.md](./docs/plugin-development.pt-BR.md) |
| Construindo temas — React/Solid, SDK bridge, herança | [docs/theme-development.pt-BR.md](./docs/theme-development.pt-BR.md) |
| Contratos, segurança de migração, contexto do tenant, event store | [docs/settings-contract.md](./docs/settings-contract.md) · [docs/theme-preview.md](./docs/theme-preview.md) |
| Mapeamento conceitual WordPress → OkCMS | [docs/wordpress-conceptual-mapping.md](./docs/wordpress-conceptual-mapping.md) |
| Matriz de provedores e versões de banco | [docs/provider-matrix.pt-BR.md](./docs/provider-matrix.pt-BR.md) |

---

## Licença

O OkCMS é software livre licenciado sob a GNU General Public License, versão 2 ou qualquer versão posterior (GPL-2.0-or-later), a mesma licença usada pelo WordPress. Consulte [LICENSE](LICENSE) para o texto completo da licença.