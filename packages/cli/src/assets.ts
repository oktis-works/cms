// @oktis-works/cms - Assets canônicos de deploy embutidos na CLI
//
// Um projeto gerado pelo `okcms init` não tem (e não pode ter) acesso a este
// repositório — então os arquivos de infraestrutura viajam DENTRO do pacote
// npm como strings e são escritos em disco pelo scaffold/update.
//
// Estes textos são a fonte canônica. `infrastructure/**` espelha cada um deles
// e o teste `assets.test.ts` falha se divergirem: sem isso a cópia em
// infraestrutura vira documentação morta que ninguém atualiza.
//
// Escapamento: dentro dos template literals todo `${...}` do shell/compose
// precisa virar `\${...}` para não virar interpolação do TypeScript.

/** Espelhos em disco (mantidos em sincronia por teste). */
export const ASSET_MIRROR = {
  dockerfile: 'infrastructure/docker/Dockerfile',
  entrypoint: 'infrastructure/docker/entrypoint.sh',
  dockerignore: 'infrastructure/docker/.dockerignore',
  composeInfra: 'infrastructure/compose/docker-compose.infra.yml',
  composeDeploy: 'infrastructure/compose/docker-compose.deploy.yml',
  nginxTemplate: 'infrastructure/nginx/templates/default.conf.template',
} as const;

// ---------------------------------------------------------------------------
// Imagem única — 4 entrypoints (api | admin | web | worker)
// ---------------------------------------------------------------------------

/**
 * Uma imagem para os quatro papéis: mesma camada de dependências em cache,
 * processo escolhido pelo `command` do compose. Quatro Dockerfiles seriam
 * quatro builds idênticos consumindo o mesmo node_modules.
 */
export const DOCKERFILE = `# syntax=docker/dockerfile:1
# @oktis-works - Imagem única do OkCMS (entrypoints: api | admin | web | worker)
#
# Gerada pelo scaffold da CLI. Canônica em
# infrastructure/docker/Dockerfile neste monorepo.
#
# SEGURANÇA: a ferramenta de linha de comando NÃO entra nesta imagem. O
# container expõe apenas os processos da aplicação — sem instalador de
# pacotes, sem acesso ao socket do Docker, sem capacidade de alterar o
# próprio estado. Deploy e configuração sempre rodam no host.
FROM oven/bun:1-alpine AS base
WORKDIR /app
ENV NODE_ENV=production

# --- dependências -----------------------------------------------------------
# Manifest + lock primeiro: trocar só o código não invalida este \`install\`.
FROM base AS deps
COPY package.json bun.lock* package-lock.json* yarn.lock* pnpm-lock.yaml* ./
# Fallbacks: lock ausente/divergente (npm/yarn) ou bun antigo sem --production
RUN bun install --production --frozen-lockfile \\
 || bun install --production \\
 || bun install

# --- runtime ----------------------------------------------------------------
FROM base AS runtime
# 1. código do projeto (.dockerignore remove .env, node_modules e .data)
COPY . .
# 2. node_modules limpo do estágio de deps, por cima — nunca o do host
COPY --from=deps /app/node_modules ./node_modules

RUN mkdir -p /app/.data/storage /app/.data/cache /app/logs

EXPOSE 3000 3001 3011

# \`docker compose ... command: api\` escolhe o papel; ver docker/entrypoint.sh
ENTRYPOINT ["/app/docker/entrypoint.sh"]
CMD ["api"]
`;

/** Dispatcher de papéis. Fora da lista, executa o comando literal. */
export const ENTRYPOINT_SH = `#!/bin/sh
# @oktis-works - Entrada única da imagem okcms/app
#
# O compose escolhe o papel com \`command: api|web|admin|worker\`. Qualquer
# outro valor é repassado literalmente (\`docker run okcms/app sh\`), o que
# mantem o container inspecionável sem reescrever a imagem.
set -eu

api_entry="node_modules/@oktis-works/api/dist/index.js"
web_entry="node_modules/@oktis-works/web/dist/index.js"
admin_entry="node_modules/@oktis-works/admin/bin/admin.js"
worker_entry="node_modules/@oktis-works/worker/dist/index.js"

case "\${1:-api}" in
  api)
    shift
    exec bun "$api_entry" "$@"
    ;;
  web)
    shift
    exec bun "$web_entry" "$@"
    ;;
  admin)
    shift
    exec bun "$admin_entry" "$@"
    ;;
  worker)
    shift
    exec bun "$worker_entry" "$@"
    ;;
  *)
    exec "$@"
    ;;
esac
`;

/**
 * Camada de segurança do build: além do ganho de cache, impede dois acidentes
 * caros — assinar a imagem com o `.env` real e instalar `node_modules` do host
 * (arquitetura diferente / código não auditado).
 */
export const DOCKERIGNORE = `# @oktis-works - build context da imagem okcms/app
# .env NUNCA entra na imagem: ele carrega senha de banco e JWT_SECRET e a
# imagem é distribuída/copiada. Em runtime ele vem do host via env_file.

.env
.env.*
!.env.example

# dependências do host (a imagem instala as suas)
node_modules
**/node_modules
.tsbuildinfo
**/*.tsbuildinfo
# NB: NÃO ignorar dist/ — plugins instalados em plugins/*/dist são runtime.

# dados e estado local
.data
**/.data
logs
**/logs
*.log
coverage
**/coverage

# montado em runtime, não copiado
deploy/

# VCS e tooling — não é código de runtime
.git
.github
.gitignore
.sdd
.vscode
.idea
.claude
*.md
!README.md

# infraestrutura montada em runtime, não copiada para dentro
docker-compose*.yml
deploy/nginx/certs
`;

// ---------------------------------------------------------------------------
// Infra compartilhada (projeto Docker `okcms`)
// ---------------------------------------------------------------------------

/**
 * Banco, cache e proxy — únicos e estáveis por toda a vida do site. Moram num
 * projeto PRÓPRIO para que `docker compose -p okcms-blue down` não derrube o
 * banco junto com a lane antiga.
 */
export const COMPOSE_INFRA = `# @oktis-works - Infraestrutura compartilhada do deploy em produção
# Gerada pela CLI. Canônica em infrastructure/compose/docker-compose.infra.yml
#
# Projeto Docker PRÓPRIO (okcms): postgres, redis e proxy únicos. As lanes
# blue/green são projetos separados (okcms-blue / okcms-green) que entram
# nesta rede como externa — por isso \`down\` numa lane nunca toca no banco.
#
#   docker compose -p okcms -f docker-compose.infra.yml up -d
name: okcms

services:
  postgres:
    image: postgres:16-alpine
    container_name: okcms-postgres
    restart: unless-stopped
    environment:
      POSTGRES_DB: \${DB_NAME:-okcms}
      POSTGRES_USER: \${DB_USER:-postgres}
      POSTGRES_PASSWORD: \${DB_PASSWORD:?defina DB_PASSWORD no .env}
    volumes:
      - postgres-data:/var/lib/postgresql/data
    ports:
      # Somente loopback: o host consegue rodar \`okcms db:migrate\` e
      # \`db:backup\` sem expor o Postgres para a rede. Em produção gerenciada
      # remova este bloco e aponte DB_HOST/DATABASE_URL para o provedor.
      - "127.0.0.1:\${DB_HOST_PORT:-5432}:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $\${POSTGRES_USER} -d $\${POSTGRES_DB}"]
      interval: 10s
      timeout: 5s
      retries: 10
    labels:
      # classificação lida pelo \`okcms update\`: data = intocável
      okcms.role: data
    networks: [okcms]

  redis:
    image: redis:7-alpine
    container_name: okcms-redis
    restart: unless-stopped
    environment:
      REDIS_PASSWORD: \${REDIS_PASSWORD:-}
    command:
      - sh
      - -c
      - |
        if [ -n "$\${REDIS_PASSWORD:-}" ]; then
          exec redis-server --appendonly yes --requirepass "$$REDIS_PASSWORD"
        else
          exec redis-server --appendonly yes
        fi
    # Nenhuma porta publicada: só quem está em okcms-net alcança o Redis.
    volumes:
      - redis-data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 10
    labels:
      okcms.role: data
    networks: [okcms]

  proxy:
    image: nginx:1.27-alpine
    container_name: okcms-proxy
    restart: unless-stopped
    ports:
      - "80:80"
      - "8080:8080"
    environment:
      # entram no envsubst nativo do nginx → gravam conf.d/default.conf
      SERVER_NAME: \${SERVER_NAME:-_}
      ADMIN_SERVER_NAME: \${ADMIN_SERVER_NAME:-admin.localhost}
    volumes:
      - ./deploy/nginx/templates:/etc/nginx/templates:ro
      # conf.d precisa ser gravável: a CLI reescreve 00-upstreams.conf no swap
      - ./deploy/nginx/conf.d:/etc/nginx/conf.d:rw
    labels:
      okcms.role: proxy
    networks: [okcms]

networks:
  okcms:
    # nome fixo — as lanes o declaram como external
    name: okcms-net

volumes:
  postgres-data:
    name: okcms-postgres-data
  redis-data:
    name: okcms-redis-data
`;

// ---------------------------------------------------------------------------
// Lanes blue/green (projetos Docker `okcms-blue` / `okcms-green`)
// ---------------------------------------------------------------------------

/**
 * Um arquivo, dois projetos Docker. O "lane" é o NOME DO PROJETO — não há
 * serviço repetido por perfil nem perfil a ativar manualmente; basta
 * `-p okcms-blue` ou `-p okcms-green`. Os containers herdam o prefixo
 * `okcms-<lane>-`, que é exatamente o que os upstreams do nginx apontam.
 */
export const COMPOSE_DEPLOY = `# @oktis-works - Lanes blue/green do OkCMS
# Gerada pela CLI. Canônica em infrastructure/compose/docker-compose.deploy.yml
#
# Um ARQUIVO, DOIS projetos Docker. O lane é o nome do projeto:
#
#   docker compose -p okcms-blue  -f docker-compose.deploy.yml up -d --build
#   docker compose -p okcms-green -f docker-compose.deploy.yml up -d --build
#
# Containers ficam okcms-<lane>-<serviço> — os upstreams do nginx apontam
# para esses nomes (gerados em deploy/nginx/conf.d/00-upstreams.conf).
#
# A rede okcms-net é EXTERNA (criada pelo docker-compose.infra.yml) e os
# serviços de infra NÃO aparecem aqui de propósito: sem isso, \`down\` de uma
# lane derrubaria o banco junto com a lane antiga.
#
# Papéis (label okcms.role, lida pelo \`okcms update\`):
#   edge   api/web/admin → trocados por completo a cada deploy (blue/green)
#   worker fila BullMQ   → NUNCA blue/green; drenado com SIGTERM no swap
#   data   postgres/redis→ intocáveis; moram no docker-compose.infra.yml
#
# NB: o \`down\` de lane derruba CONTAINERS e REDES, mas nunca passa de
# \`\`\` -v \`\`\`: o volume okcms-storage é compartilhado entre blue e green,
# é ele que mantém a mídia viva através dos deploys.

x-app: &app
  image: okcms/app:\${OKCMS_VERSION:-latest}
  build:
    context: .
    dockerfile: docker/Dockerfile
  env_file:
    # .env primeiro (portas do operador) — o environment abaixo sobrescreve
    - .env
  restart: unless-stopped
  networks: [okcms]
  environment:
    NODE_ENV: production
    DB_HOST: postgres
    REDIS_HOST: redis
  volumes:
    - ./plugins:/app/plugins
    - ./themes:/app/themes
    # mídia compartilhada entre as duas lanes: deploy não perde arquivo
    - storage-data:/app/.data/storage
    - cache-data:/app/.data/cache

x-api-health: &api-health
  test:
    - CMD
    - bun
    - -e
    - "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
  interval: 10s
  timeout: 5s
  retries: 12
  start_period: 25s

x-web-health: &web-health
  test:
    - CMD
    - bun
    - -e
    - "fetch('http://127.0.0.1:'+(process.env.WEB_PORT||3001)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
  interval: 10s
  timeout: 5s
  retries: 12
  start_period: 25s

x-admin-health: &admin-health
  # o admin é Astro standalone: serve / e não tem /health dedicado
  test:
    - CMD
    - bun
    - -e
    - "fetch('http://127.0.0.1:'+(process.env.PORT||3011)+'/').then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"
  interval: 10s
  timeout: 5s
  retries: 12
  start_period: 30s

services:
  # ---------------------------------------------------------------- api
  api-blue:
    <<: *app
    container_name: okcms-api-blue
    command: ["api"]
    labels:
      okcms.role: edge
      okcms.lane: blue
      okcms.service: api
    healthcheck: *api-health

  api-green:
    <<: *app
    container_name: okcms-api-green
    command: ["api"]
    labels:
      okcms.role: edge
      okcms.lane: green
      okcms.service: api
    healthcheck: *api-health

  # ---------------------------------------------------------------- web
  web-blue:
    <<: *app
    container_name: okcms-web-blue
    command: ["web"]
    labels:
      okcms.role: edge
      okcms.lane: blue
      okcms.service: web
    healthcheck: *web-health

  web-green:
    <<: *app
    container_name: okcms-web-green
    command: ["web"]
    labels:
      okcms.role: edge
      okcms.lane: green
      okcms.service: web
    healthcheck: *web-health

  # -------------------------------------------------------------- admin
  # admin lê \`PORT\` (astro standalone) e não \`ADMIN_PORT\`: o environment do
  # service substitui o do anchor \`<<\`, então os três comuns são repetidos.
  admin-blue:
    <<: *app
    container_name: okcms-admin-blue
    command: ["admin"]
    environment:
      NODE_ENV: production
      DB_HOST: postgres
      REDIS_HOST: redis
      PORT: \${ADMIN_PORT:-3011}
    labels:
      okcms.role: edge
      okcms.lane: blue
      okcms.service: admin
    healthcheck: *admin-health

  admin-green:
    <<: *app
    container_name: okcms-admin-green
    command: ["admin"]
    environment:
      NODE_ENV: production
      DB_HOST: postgres
      REDIS_HOST: redis
      PORT: \${ADMIN_PORT:-3011}
    labels:
      okcms.role: edge
      okcms.lane: green
      okcms.service: admin
    healthcheck: *admin-health

  # ------------------------------------------------------------- worker
  # Uma fila não suporta duas instâncias "fantasma": o worker só sobe depois
  # do swap e o da lane antiga drena com SIGTERM (stop_grace_period) antes.
  worker-blue:
    <<: *app
    container_name: okcms-worker-blue
    command: ["worker"]
    stop_grace_period: 30s
    labels:
      okcms.role: worker
      okcms.lane: blue
      okcms.service: worker

  worker-green:
    <<: *app
    container_name: okcms-worker-green
    command: ["worker"]
    stop_grace_period: 30s
    labels:
      okcms.role: worker
      okcms.lane: green
      okcms.service: worker

networks:
  okcms:
    name: okcms-net
    external: true

volumes:
  # compartilhado entre blue e green de propósito: mídia sobrevive ao deploy
  storage-data:
    name: okcms-storage
  cache-data:
    name: okcms-cache
`;

// ---------------------------------------------------------------------------
// Proxy nginx (projeto do operador: deploy/nginx/)
// ---------------------------------------------------------------------------

/**
 * Roteamento production. Os upstreams ficam em arquivo SEPARADO
 * (`00-upstreams.conf`) justamente para que o swap seja uma reescrita de um
 * arquivo minúsculo + `nginx -s reload` — sem tocar no `server` block e sem
 * reiniciar o container.
 *
 * `SERVER_NAME` / `ADMIN_SERVER_NAME` entram pelo envsubst nativo do nginx;
 * as variáveis em `$host`/`$upstream_*` são do nginx e ficam intactas porque
 * o envsubst só substitui a lista de variáveis definidas no ambiente.
 */
export const NGINX_TEMPLATE = `# @oktis-works - Roteamento do proxy OkCMS (template)
# Gerado pela CLI. Canônica em infrastructure/nginx/templates/default.conf.template
#
# O nginx oficial processa /etc/nginx/templates/*.template no start, com
# envsubst limitado às variáveis definidas no ambiente (SERVER_NAME e
# ADMIN_SERVER_NAME, vindas do .env). Tudo que for \$host, \$remote_addr ou
# \$upstream_* é do nginx e NÃO é substituído.
#
# Os upstreams moram em conf.d/00-upstreams.conf: a CLI os reescreve no swap
# e recarrega com \`nginx -s reload\` — troca de lane sem derrubar conexão.

map \$http_upgrade \$connection_upgrade {
  default upgrade;
  ''      close;
}

# ---------------------------------------------------------------- admin ----
# O admin é um Astro standalone servido na RAIZ (não em /admin): ele gera
# URLs /_astro/... e não tem base path configurado, então publicá-lo em
# /admin/ quebraria os assets. Ele precisa de host próprio.
server {
  listen 80;
  server_name \${ADMIN_SERVER_NAME};

  location / {
    proxy_pass \$upstream_admin;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_set_header X-Forwarded-Host \$host;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection \$connection_upgrade;
    proxy_read_timeout 120s;
  }
}

# admin por porta — funciona sem DNS nenhum (http://<host>:8080/)
server {
  listen 8080 default_server;
  server_name _;

  location / {
    proxy_pass \$upstream_admin;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection \$connection_upgrade;
    proxy_read_timeout 120s;
  }
}

# ---------------------------------------------------------- site público ---
server {
  listen 80 default_server;
  server_name \${SERVER_NAME};

  client_max_body_size 100m;
  gzip on;
  gzip_types text/plain text/css application/json application/javascript
             image/svg+xml;

  # healthcheck do edge: sempre no api (é quem fala com o banco)
  location = /health {
    access_log off;
    proxy_pass \$upstream_api;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
  }

  # API + mídia (/api/v1/media/file/<tenant>/<arquivo>)
  location /api/ {
    proxy_pass \$upstream_api;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_set_header X-Forwarded-Host \$host;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection \$connection_upgrade;
    proxy_read_timeout 120s;
  }

  # STORAGE_PUBLIC_BASE=/storage → rota o mesmo arquivo para a API.
  # O local driver publica <base>/<tenant>/<arquivo>, que é exatamente o
  # formato de /api/v1/media/file/<tenant>/<arquivo>.
  location /storage/ {
    rewrite ^/storage/(.*)\$ /api/v1/media/file/\$1 break;
    proxy_pass \$upstream_api;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_cache_valid 200 30d;
    expires 30d;
  }

  # assets de tema servidos pelo web (resolver de path do Theme SDK)
  location /themes/ {
    proxy_pass \$upstream_web;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Forwarded-Proto \$scheme;
  }

  # SSR do site público
  location / {
    proxy_pass \$upstream_web;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_set_header X-Forwarded-Host \$host;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection \$connection_upgrade;
    proxy_read_timeout 120s;
  }
}
`;

export type Lane = 'blue' | 'green';

export interface UpstreamPorts {
  api: number;
  web: number;
  admin: number;
}

export const DEFAULT_UPSTREAM_PORTS: UpstreamPorts = { api: 3000, web: 3001, admin: 3011 };

/**
 * Conteúdo de `deploy/nginx/conf.d/00-upstreams.conf`.
 *
 * Só a linha de cada `map` muda no swap — é esse o truque do blue/green via
 * arquivo: reescrever 3 linhas é atômico e `nginx -s reload` re-lê sem
 * fechar conexão estabelecida.
 */
export function renderUpstreams(lane: Lane, ports: UpstreamPorts = DEFAULT_UPSTREAM_PORTS): string {
  return `# @oktis-works - Upstreams ativos (GERADO pela CLI — não edite à mão)
#
# Reescrito pelo \`okcms update\` no momento do swap e recarregado com
#   docker exec okcms-proxy nginx -s reload
# Aponta para containers do projeto Docker okcms-<lane> na rede okcms-net.
# Mídia, cache e banco NÃO são blue/green — moram no projeto \`okcms\`.

map \$host \$upstream_api {
  default http://okcms-api-${lane}:${ports.api};
}

map \$host \$upstream_web {
  default http://okcms-web-${lane}:${ports.web};
}

map \$host \$upstream_admin {
  default http://okcms-admin-${lane}:${ports.admin};
}
`;
}

// ---------------------------------------------------------------------------
// Caminhos no projeto do operador + montagem dos assets
// ---------------------------------------------------------------------------

export const DEPLOY_PATHS = {
  dockerignore: '.dockerignore',
  dockerfile: 'docker/Dockerfile',
  entrypoint: 'docker/entrypoint.sh',
  composeInfra: 'docker-compose.infra.yml',
  composeDeploy: 'docker-compose.deploy.yml',
  nginxTemplate: 'deploy/nginx/templates/default.conf.template',
  nginxUpstreams: 'deploy/nginx/conf.d/00-upstreams.conf',
} as const;

/** Arquivo gerado pelo envsubst no start do nginx — fica fora do git. */
export const NGINX_GENERATED = 'deploy/nginx/conf.d/default.conf';

/** Entradas de `.gitignore` que evitam commitar artefato gerado. */
export const DEPLOY_GITIGNORE = [
  NGINX_GENERATED,
  'docker-compose.override.yml',
  '.data/',
  // estado de runtime da lane ativa — varia por máquina, conflita em merge
  '.deploy/',
];

export interface ProjectAsset {
  path: string;
  content: string;
  /** permissão no disco — só o entrypoint é executável. */
  mode?: number;
}

/** Lê as portas reais do `.env`, com fallback para os defaults dos apps. */
export function portsFromEnv(record: Record<string, string>): UpstreamPorts {
  const port = (value: string | undefined, fallback: number): number => {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 && parsed <= 65535 ? parsed : fallback;
  };
  return {
    api: port(record['PORT'], DEFAULT_UPSTREAM_PORTS.api),
    web: port(record['WEB_PORT'], DEFAULT_UPSTREAM_PORTS.web),
    admin: port(record['ADMIN_PORT'], DEFAULT_UPSTREAM_PORTS.admin),
  };
}

/**
 * Todos os arquivos de deploy do projeto, prontos para escrita.
 * `lane`/`ports` só definem o upstream INICIAL (lane vazia → blue); depois
 * disso quem reescreve esse arquivo é o `okcms update`, a cada swap.
 *
 * `00-upstreams.conf` é versionado de propósito (sem segredo, aponta para um
 * container que ainda vai existir) — sem ele um clone limpo sobe um nginx
 * sem upstream nenhum. Já `default.conf` é gerado pelo envsubst e fica fora.
 */
export function deployAssets(
  lane: Lane = 'blue',
  ports: UpstreamPorts = DEFAULT_UPSTREAM_PORTS
): ProjectAsset[] {
  return [
    { path: DEPLOY_PATHS.dockerignore, content: DOCKERIGNORE },
    { path: DEPLOY_PATHS.dockerfile, content: DOCKERFILE },
    { path: DEPLOY_PATHS.entrypoint, content: ENTRYPOINT_SH, mode: 0o755 },
    { path: DEPLOY_PATHS.composeInfra, content: COMPOSE_INFRA },
    { path: DEPLOY_PATHS.composeDeploy, content: COMPOSE_DEPLOY },
    { path: DEPLOY_PATHS.nginxTemplate, content: NGINX_TEMPLATE },
    { path: DEPLOY_PATHS.nginxUpstreams, content: renderUpstreams(lane, ports) },
  ];
}
