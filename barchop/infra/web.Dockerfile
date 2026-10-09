# syntax=docker/dockerfile:1
#
# Imagem do web (Next standalone, ver apps/web/next.config.js).
# Contexto: a pasta barchop/ (ver infra/compose.yaml e .dockerignore).

FROM node:22-bookworm-slim AS build
# A mesma versão do packageManager do package.json da raiz.
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile --filter "@barchop/web..."

# O Next embute as NEXT_PUBLIC_* no JavaScript na hora do build: elas
# entram como argumento de build, não como variável do contêiner — a
# imagem do web é por ambiente. Sem NEXT_PUBLIC_URL_DO_SITE as
# barbearias não abrem no próprio host (ver apps/web/src/tenant/rota.ts).
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_URL_DO_SITE
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
  NEXT_PUBLIC_URL_DO_SITE=$NEXT_PUBLIC_URL_DO_SITE \
  NEXT_TELEMETRY_DISABLED=1
# As fontes saem do repositório (font/, ver app/fontes.ts): o build não
# baixa nada do Google Fonts.
RUN pnpm --filter @barchop/web build

FROM node:22-bookworm-slim AS web
ENV NODE_ENV=production \
  NEXT_TELEMETRY_DISABLED=1 \
  HOSTNAME=0.0.0.0 \
  PORT=3000
WORKDIR /app
# O standalone não leva o .next/static: sem a cópia, a página abre sem
# CSS nem JavaScript. Não há pasta public/ no app.
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
