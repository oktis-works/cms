# @oktis-works/api - Production image (multi-stage, bun workspace)
FROM oven/bun:1-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/
COPY packages/types/package.json packages/types/
COPY packages/config/package.json packages/config/
COPY packages/database/package.json packages/database/
COPY packages/auth/package.json packages/auth/
COPY packages/core/package.json packages/core/
COPY packages/plugin-sdk/package.json packages/plugin-sdk/
COPY packages/plugin-runtime/package.json packages/plugin-runtime/
COPY packages/theme-sdk/package.json packages/theme-sdk/
COPY packages/theme-runtime/package.json packages/theme-runtime/
RUN bun install --frozen-lockfile --filter @oktis-works/api

FROM deps AS build
COPY tsconfig.json ./
COPY packages packages
COPY apps/api apps/api
# schema.sql precisa existir no build do @oktis-works/database
RUN mkdir -p packages/database/src/schema && touch packages/database/src/schema/schema.sql
RUN bun run --filter @oktis-works/api build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps/api ./apps/api
EXPOSE 3000
CMD ["bun", "apps/api/dist/index.js"]
