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
