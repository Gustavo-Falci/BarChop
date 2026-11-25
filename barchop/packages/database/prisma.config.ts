import "dotenv/config";
import { defineConfig } from "prisma/config";

// Configuração do CLI do Prisma (generate, migrate, studio). O app não
// lê este arquivo: o PrismaClient recebe a URL em src/index.ts.
//
// O `dotenv/config` lê o .env da pasta de onde o CLI roda (este pacote)
// e não sobrescreve variável que já existe — o DATABASE_URL do banco de
// teste, que o global-setup da API repassa, continua valendo.
//
// `process.env` e não o `env()` do prisma/config: o `env()` lança sem a
// variável, e o `prisma generate` do Docker e do CI roda sem banco. Sem
// URL, quem precisa dela (migrate, studio) falha na conexão.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DATABASE_URL ?? "",
  },
});
