# syntax=docker/dockerfile:1
#
# Imagem da API (com o worker da fila, que roda no mesmo processo — ver
# apps/api/src/server.ts) e da migração. Montada na própria VM (ARM).
# Desde o Prisma 7 não há motor nativo: o cliente fala com o banco pelo
# driver `pg`, e o compilador de queries é wasm, igual em qualquer CPU.
#
# Contexto: a pasta barchop/ (ver infra/compose.yaml e .dockerignore).

# Debian e não Alpine, como sempre foi (o motor do Prisma 5 pedia glibc;
# o 7 não pede mais, e trocar de base não é assunto desta imagem).
# Node ≥ 22.12 porque o pg-boss é ESM e a API é CJS (require(esm)).
FROM node:26-bookworm-slim@sha256:5df79989ed685e09f0a98019db4cebfb22fb9df1a53c0161664a011f7ff6b0f1 AS base
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
# A mesma versão do packageManager do package.json da raiz. Pelo npm e
# não pelo corepack: o Node parou de trazer o corepack no 25.
RUN npm install -g pnpm@9.0.0
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
