// @oktis-works/cms - Documentação gerada no scaffold do projeto
// README.md (uso local/Docker + visão do sistema), PLUGIN.md e THEME.md
// (guias de desenvolvimento de extensões). Só escreve se o arquivo não existir.

/** README.md do projeto scaffoldado. */
export function projectReadme(projectName: string): string {
  return `# ${projectName}

Projeto OkCMS criado com \`okcms init\`. Este guia explica o sistema e como
rodar em desenvolvimento local e com Docker.

## O que é o OkCMS

CMS API-first, multi-tenant e extensível. Quatro apps + uma CLI:

| App | Pacote | Função |
|---|---|---|
| **API** | \`@oktis-works/api\` | Servidor REST (Hono) em \`/api/v1\`: conteúdo, auth, mídia, plugins |
| **Admin** | \`@oktis-works/admin\` | Painel de administração (Astro + SolidJS) |
| **Web** | \`@oktis-works/web\` | Site público (Astro) |
| **Worker** | \`@oktis-works/worker\` | Filas/jobs em background (bullmq): publicação, mídia, webhooks, cache |
| **CLI** | \`@oktis-works/cms\` | \`okcms\` — init, start, banco, extensões, update |

- **Banco:** PostgreSQL (Row-Level Security, multi-tenant)
- **Cache e filas:** Redis
- **Extensões:** [plugins](./PLUGIN.md) (hooks/filters no runtime) e [temas](./THEME.md) (templates + estilos isolados)

## Estrutura do projeto

| Caminho | O que é |
|---|---|
| \`okcms.config.json\` | Estrutura: nome, ports, storage, dirs, tema ativo. **Sem credenciais de banco.** |
| \`.env\` | **Fonte única de conexão**: banco (\`DB_*\` ou \`DATABASE_URL\`), Redis, JWT, ports |
| \`package.json\` | Apps do CMS (\`api\`, \`admin\`, \`web\`, \`worker\`) + CLI em devDependencies |
| \`plugins/\`, \`themes/\` | Extensões do projeto |
| \`migrations/\` | SQL de migrations (\`okcms db:migrate\`) |
| \`docker-compose.yml\` | Infra local: PostgreSQL + Redis (com healthcheck e volume) |

## Começando (desenvolvimento local)

Pré-requisitos: **Node 20+** ou **Bun 1.3+** · **PostgreSQL 16+** (obrigatório) ·
**Redis** (opcional — só para filas do worker).

\`\`\`bash
# 1. Banco no .env — escolha UM formato:
#    (a) variáveis separadas (default)
DB_HOST=localhost
DB_PORT=5432
DB_NAME=okcms
DB_USER=postgres
#    (b) URL única — tem precedência sobre as DB_* acima
# DATABASE_URL=postgresql://postgres:senha@localhost:5432/okcms

# 2. Suba a infra (Postgres + Redis) — com Docker:
docker compose up -d
# Sem Docker: aponte DB_* para um Postgres seu. Sem Redis, use:
#   REDIS_HOST=disabled   (cache em memória; filas do worker exigem Redis)

# 3. Migrações
okcms db:migrate

# 4. Sobe tudo: api + admin + web + worker
okcms start

# 5. Se algo falhar
okcms doctor
\`\`\`

Ports padrão (ajustáveis no \`.env\`): **API 3000** (\`PORT\`) · **Admin 3001**
(\`ADMIN_PORT\`) · **Web 3002** (\`WEB_PORT\`).

## Começando (Docker)

\`\`\`bash
docker compose up -d   # só a infra: postgres:16 + redis:7 (healthcheck + volumes)
okcms db:migrate
okcms start            # apps rodam como processos normais, fora do compose
\`\`\`

O \`.env\` gerado já aponta para \`localhost\`, que é onde o compose expõe as
portas do Postgres (5432) e do Redis (6379). Os apps em si rodam via
\`okcms start\` — o compose é só a infraestrutura.

## Produção

Em produção **não use \`okcms start\` como supervisor** — ele é conveniência
de dev: não reinicia filhos que morrem e mistura os logs de todos os apps num
único fluxo. Escolha um dos caminhos abaixo.

### Caminho 1: pm2 (processos no host)

Um processo pm2 **por app** — restart em crash, log por processo, \`pm2
startup\` na inicialização do servidor e \`pm2 reload\` individual
(zero-downtime). Requer **Bun instalado no servidor** (os apps sobem via
\`bunx\`).

\`\`\`js
// ecosystem.config.js
module.exports = {
  apps: [
    { name: 'okcms-api',    script: 'bunx', args: '@oktis-works/api',    env: { NODE_ENV: 'production', PORT: 3000 } },
    { name: 'okcms-admin',  script: 'bunx', args: '@oktis-works/admin',  env: { NODE_ENV: 'production', PORT: 3001 } },
    { name: 'okcms-web',    script: 'bunx', args: '@oktis-works/web',    env: { NODE_ENV: 'production', PORT: 3002 } },
    { name: 'okcms-worker', script: 'bunx', args: '@oktis-works/worker', env: { NODE_ENV: 'production', WORKER_MODE: 'pm2' } },
  ],
};
\`\`\`

\`\`\`bash
pm2 start ecosystem.config.js
pm2 save && pm2 startup              # sobe com o servidor
pm2 reload okcms-api                 # atualiza sem downtime (por app)
pm2 logs okcms-api                   # log por processo
pm2 unmonitor okcms-api && pm2 delete okcms-api   # remover
\`\`\`

- O worker tem **modo pm2 nativo**: \`WORKER_MODE=pm2\` (cluster) combinado com
  \`WORKER_COUNT\` e \`WORKER_CONCURRENCY\`.
- Como cada app é um executável independente, o \`okcms start\` não é
  necessário em produção — o pm2 supervisoria cada um diretamente.

### Caminho 2: Docker imutável

Deploy por **imagem**: builda → sobe → troca; nunca se atualiza pacote dentro
de um container rodando. O template de imagem da API é multi-stage (bun,
\`NODE_ENV=production\`, expõe 3000) e fica em \`apps/api/Dockerfile\` no
repositório do OkCMS — o build precisa do contexto do monorepo:

\`\`\`bash
git clone https://github.com/oktis-works/cms.git
cd cms
docker build -f apps/api/Dockerfile -t okcms-api:v1 .
docker run -d --env-file /caminho/para/.env -p 3000:3000 okcms-api:v1
\`\`\`

- **Atualização** = build da imagem nova + subir + desligar a antiga;
  **rollback** = voltar à imagem anterior (tague cada build).
- Postgres/Redis de produção: serviços gerenciados ou containers próprios com
  volume e backup — não use o \`docker-compose.yml\` de dev.
- **Migração como passo de deploy**: \`okcms db:migrate\` antes de subir a
  versão nova da aplicação.

### Checklist (ambos os caminhos)

- [ ] \`NODE_ENV=production\` e \`JWT_SECRET\` forte e único
- [ ] \`.env\` fora do versionamento; credenciais nunca em \`okcms.config.json\`
- [ ] Proxy reverso com TLS (nginx/caddy) na frente de api/admin/web
- [ ] Versões fixas no \`package.json\` do projeto (nada de \`@latest\` em deploy)
- [ ] \`okcms db:migrate\` no pipeline de deploy e \`okcms db:backup\` agendado
- [ ] Redis real em produção (as filas do worker não funcionam sem Redis)
- [ ] \`okcms doctor\` verde no ambiente de destino
- [ ] Logs com destino (pm2 logrotate, ou stdout do container coletado)

## Comandos da CLI

| Comando | O que faz |
|---|---|
| \`okcms init <dir>\` | Cria o projeto (arquivos + docs) e instala as dependências |
| \`okcms start [--api\|--admin\|--web\|--worker\|--all]\` | Sobe os apps (default: todos) |
| \`okcms stop\` / \`okcms status\` | Para / mostra os processos (pidfiles) |
| \`okcms doctor\` | Diagnóstico: node, \`.env\`, database (\`DB_*\` ou \`DATABASE_URL\`), config |
| \`okcms db:migrate\` · \`db:rollback\` · \`db:status\` | Migrations da pasta \`migrations/\` (\`--tenant\` opcional) |
| \`okcms db:backup\` · \`db:restore -f <arquivo>\` | Backup/restore do Postgres |
| \`okcms plugin:create -n <nome>\` | Scaffold de plugin — guia em [PLUGIN.md](./PLUGIN.md) |
| \`okcms plugin:install -n <caminho>\` | Instala plugin de um caminho local + registra |
| \`okcms plugin:list\` · \`plugin:search\` · \`plugin:manage\` | Lista, busca (npm) e habilita/desabilita plugins |
| \`okcms theme:create -n <nome> --style css\|scss\|tailwind\` | Scaffold de tema — guia em [THEME.md](./THEME.md) |
| \`okcms theme:install\` · \`theme:list\` · \`theme:search\` · \`theme:manage\` | Gestão de temas (\`--set-active\` define o ativo) |
| \`okcms theme:build -n <nome>\` | Compila SCSS/Tailwind → \`dist/theme.css\` isolado |
| \`okcms update [-i]\` | Lista/atualiza os pacotes \`@oktis-works/*\` do projeto |

## Banco de dados

- **Conexão** (no \`.env\`, escolha um formato): \`DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD\`
  **ou** \`DATABASE_URL\` (tem precedência). O \`okcms doctor\` valida os dois.
- **Migrations**: arquivos SQL em \`migrations/\`; \`okcms db:migrate\` aplica,
  \`db:rollback\` reverte, \`db:status\` mostra o estado. \`--tenant\` selectiva
  (default \`default\`) — o banco é multi-tenant via Row-Level Security.
- **Backup**: \`okcms db:backup\` gera dump com timestamp; \`db:restore -f <arquivo>\` restaura.

## Atualizando

\`\`\`bash
okcms update      # lista pacotes @oktis-works/* com versão nova
okcms update -i   # aplica a atualização
\`\`\`

## Próximos passos

- Extender o CMS com plugins → [PLUGIN.md](./PLUGIN.md)
- Criar/ativar um tema → [THEME.md](./THEME.md)
`;
}

/** PLUGIN.md — guia de desenvolvimento de plugins. */
export const PLUGIN_DOC = `# Desenvolvendo um Plugin

Plugin é a extensão que se registra no runtime do CMS e participa do sistema
de **hooks e filters** (transformar dados, reagir a eventos de conteúdo etc.).
O catálogo de hooks disponíveis é servido pela API em
\`GET /api/v1/hooks/catalog\`.

## Estrutura gerada

\`\`\`bash
okcms plugin:create --name meu-plugin
\`\`\`

\`\`\`
plugins/meu-plugin/
├── manifest.json   # identidade + permissões + compatibilidade
├── index.js        # entrypoint: module.exports.register(registry)
└── README.md
\`\`\`

### manifest.json

\`\`\`json
{
  "name": "meu-plugin",
  "version": "0.1.0",
  "description": "Plugin meu-plugin para OkCMS",
  "type": "plugin",
  "main": "index.js",
  "scope": "tenant",
  "permissions": [],
  "compatibility": { "okcms": "^0.1.x" }
}
\`\`\`

| Campo | Significado |
|---|---|
| \`type\` | \`"plugin"\` (fixo — temas usam \`"theme"\`) |
| \`main\` | Arquivo de entrada com o registro |
| \`scope\` | Escopo de atuação no multi-tenant (ex.: \`tenant\`) |
| \`permissions\` | Permissões que o plugin pede (vazio = nenhuma) |
| \`compatibility.okcms\` | Range semver exigido do CMS. **O scaffold preenche com a versão atual automaticamente** e o valor é validado no scaffold e em cada instalação — manifesto incompatível é rejeitado. |

### index.js

\`\`\`js
'use strict';

module.exports.register = function register(registry) {
  registry.addFilter('theme:data:posts', (value) => value);
};
\`\`\`

O \`register(registry)\` é chamado quando o plugin é carregado. Use o registro
para expor filters (transformações) — veja o que existe em
\`GET /api/v1/hooks/catalog\` para os nomes e contratos disponíveis.

## Fluxo de desenvolvimento

\`\`\`bash
# 1. Crie (em ./plugins do projeto, ou num workspace externo com --dir)
okcms plugin:create --name meu-plugin

# 2. Implemente plugins/meu-plugin/index.js

# 3. Se criou FORA do projeto, instale (valida compatibilidade e copia para plugins/)
okcms plugin:install --name ../meu-plugin-fonte

# 4. Gestão
okcms plugin:list                                # instalados + status
okcms plugin:manage -n meu-plugin --info         # informações do manifesto
okcms plugin:manage -n meu-plugin --disable      # desabilita (mantém os arquivos)
okcms plugin:manage -n meu-plugin --enable       # habilita de novo
okcms plugin:manage -n meu-plugin --uninstall    # remove arquivos + registro

# 5. Busca no npm (pacotes com a keyword okcms-plugin)
okcms plugin:search -q galeria
\`\`\`

## Publicando

Empacote o diretório do plugin como pacote npm com a keyword
\`okcms-plugin\` (é o que o \`okcms plugin:search\` consulta) e mantenha
\`compatibility.okcms\` atualizado para a linha do CMS que você suporta.
`;

/** THEME.md — guia de desenvolvimento de temas. */
export const THEME_DOC = `# Desenvolvendo um Tema

Tema é o visual do site público: **templates** (hierarquia de páginas) +
**estilos**, com isolamento por \`[data-theme]\` para que um tema nunca vaze
CSS para outro.

## Estrutura gerada

\`\`\`bash
okcms theme:create --name meu-tema --style css   # css | scss | tailwind
\`\`\`

\`\`\`
themes/meu-tema/
├── theme.json               # manifest (type: theme + compatibilidade)
├── templates/
│   ├── index.html           # listagem (home)
│   └── single.html          # página única (post/conteúdo)
├── style.css                # engine css — ou styles/main.scss — ou src/input.css
└── README.md
\`\`\`

### theme.json

\`\`\`json
{
  "name": "meu-tema",
  "version": "0.1.0",
  "description": "Tema meu-tema para OkCMS",
  "type": "theme",
  "compatibility": { "okcms": "^0.1.x" }
}
\`\`\`

Com \`--style scss\` ou \`--style tailwind\`, o manifesto ganha também
\`stylesConfig\` (\`engine\`, \`entry\`, \`output\`, \`isolation\`) apontando para a
entrada de estilos. \`compatibility.okcms\` é preenchido e validado
automaticamente, como nos plugins.

### Templates

Sintaxe de template com variáveis e laços:

\`\`\`html
<main class="site">
  {{#each posts}}
    <article>
      <h2>{{this.title}}</h2>
      <p>{{this.excerpt}}</p>
    </article>
  {{/each}}
</main>
\`\`\`

- \`templates/index.html\` — listagem (ex.: \`{{#each posts}}\`)
- \`templates/single.html\` — item individual (ex.: \`{{title}}\`, \`{{content}}\`)

## Estilos por engine

| \`--style\` | Arquivo gerado | Build |
|---|---|---|
| \`css\` (default) | \`style.css\` | nenhum — servido direto |
| \`scss\` | \`styles/main.scss\` (+ \`components.scss\`) | \`okcms theme:build -n meu-tema\` |
| \`tailwind\` | \`src/input.css\` + \`tailwind.config.js\` | \`okcms theme:build -n meu-tema\` |

O build compila para \`dist/theme.css\` **com isolamento
\`[data-theme="meu-tema"]\`** (sem vazar estilos entre temas; o Tailwind já
sai com \`preflight: false\`).

## Fluxo de desenvolvimento

\`\`\`bash
# 1. Crie
okcms theme:create --name meu-tema --style scss

# 2. Edite templates/ e estilos

# 3. Compile os estilos (scss/tailwind)
okcms theme:build --name meu-tema

# 4. Ative (grava activeTheme no okcms.config.json)
okcms theme:manage --name meu-tema --set-active
#    (equivalente: ACTIVE_THEME=meu-tema no .env)

# 5. Gestão
okcms theme:list                               # instalados + status
okcms theme:manage -n meu-tema --info          # informações do theme.json
okcms theme:manage -n meu-tema --disable|enable
okcms theme:manage -n meu-tema --uninstall
okcms theme:search -q blog                     # busca no npm (keyword okcms-theme)

# Se criou FORA do projeto:
okcms theme:install --name ../meu-tema-fonte
\`\`\`

## Publicando

Publique como pacote npm com a keyword \`okcms-theme\` (alvo do
\`okcms theme:search\`) e mantenha \`compatibility.okcms\` na linha suportada
do CMS. O \`theme:build\` deve ser executado no seu processo de release para
que \`dist/theme.css\` vá junto no pacote.
`;
