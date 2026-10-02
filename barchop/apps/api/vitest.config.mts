import { fileURLToPath } from "node:url";
import { config as carregarEnv } from "dotenv";
import { defineConfig } from "vitest/config";

// O .env.test guarda a URL do banco de TESTE. Carregado aqui, antes de
// qualquer teste, porque o PrismaClient lê DATABASE_URL na construção —
// e a construção acontece no import de @barchop/database.
carregarEnv({ path: fileURLToPath(new URL(".env.test", import.meta.url)) });

export default defineConfig({
  test: {
    globalSetup: ["./tests/global-setup.ts"],
    setupFiles: ["./tests/setup.ts"],
    // Um arquivo por vez: todos compartilham o mesmo banco e truncam as
    // tabelas entre si. Em paralelo, um apagaria os dados do outro.
    fileParallelism: false,
    env: {
      DATABASE_URL: process.env.DATABASE_URL ?? "",
      JWT_SECRET: process.env.JWT_SECRET ?? "",
    },
    server: {
      // Os pacotes internos publicam TypeScript cru. Isso força o
      // vitest a transformá-los em vez de tratá-los como JS pronto.
      deps: { inline: [/@barchop\//] },
    },
  },
});
