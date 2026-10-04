# syntax=docker/dockerfile:1
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
# Manifest + lock primeiro: trocar só o código não invalida este `install`.
FROM base AS deps
COPY package.json bun.lock* package-lock.json* yarn.lock* pnpm-lock.yaml* ./
# Fallbacks: lock ausente/divergente (npm/yarn) ou bun antigo sem --production
RUN bun install --production --frozen-lockfile \
 || bun install --production \
 || bun install

# --- runtime ----------------------------------------------------------------
FROM base AS runtime
# 1. código do projeto (.dockerignore remove .env, node_modules e .data)
COPY . .
# 2. node_modules limpo do estágio de deps, por cima — nunca o do host
COPY --from=deps /app/node_modules ./node_modules

RUN mkdir -p /app/.data/storage /app/.data/cache /app/logs

EXPOSE 3000 3001 3011

# `docker compose ... command: api` escolhe o papel; ver docker/entrypoint.sh
ENTRYPOINT ["/app/docker/entrypoint.sh"]
CMD ["api"]
