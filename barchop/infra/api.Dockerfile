# syntax=docker/dockerfile:1
#
# Imagem da API (com o worker da fila, que roda no mesmo processo — ver
# apps/api/src/server.ts) e da migração. Montada na própria VM (ARM):
# o `prisma generate` daqui escolhe o motor da arquitetura da máquina.
#
# Contexto: a pasta barchop/ (ver infra/compose.yaml e .dockerignore).

# Debian e não Alpine: o motor do Prisma é ligado à glibc e ao OpenSSL.
# Node 22 porque o pg-boss é ESM e a API é CJS (require(esm), ≥ 22.12).
FROM node:22-bookworm-slim AS base
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
# A mesma versão do packageManager do package.json da raiz.
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
WORKDIR /app

FROM base AS build
COPY . .
# Só a API e o que ela usa: sem o filtro viria o Expo do apps/mobile.
RUN pnpm install --frozen-lockfile --filter "@barchop/api..."
RUN pnpm --filter @barchop/database generate
RUN pnpm --filter @barchop/api build

# Roda uma vez a cada `docker compose up` e sai (ver compose.yaml). O
# prisma é devDependency, e por isso a migração tem imagem própria em
# vez de rodar na da API.
FROM build AS migrar
WORKDIR /app/packages/database
# Com o node-linker=hoisted (.npmrc) o binário mora no node_modules da
# raiz, não no do pacote.
CMD ["/app/node_modules/.bin/prisma", "migrate", "deploy"]

# A API leva o node_modules da instalação filtrada inteiro, e não um
# `pnpm deploy --prod`: o deploy reinstala e perde o cliente que o
# `prisma generate` escreveu. Imagem maior, sem surpresa no arranque.
FROM base AS api
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
# O que o pnpm não conseguiu subir pra raiz (versão em conflito) fica
# no node_modules do próprio app.
COPY --from=build /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
WORKDIR /app/apps/api
USER node
EXPOSE 3333
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3333/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "dist/server.js"]
