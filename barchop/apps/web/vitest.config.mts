import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    // As funções de data leem o relógio do aparelho de propósito — é o
    // fuso do cliente que decide o que já passou. Sem fixar o fuso aqui,
    // as fixtures com offset -03:00 passariam nesta máquina e falhariam
    // em qualquer CI rodando em UTC.
    env: { TZ: "America/Sao_Paulo" },
    // O Node 25+ tem um localStorage global que, sem --localstorage-file,
    // cobre o do jsdom e quebra os testes que guardam coisa no navegador.
    execArgv: ["--no-experimental-webstorage"],
    // Os pacotes internos publicam TypeScript cru (main aponta pro
    // src/index.ts). Sem isto o Vitest os trataria como JS pronto.
    server: { deps: { inline: [/@barchop\//] } },
  },
});
