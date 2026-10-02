import { beforeEach } from "vitest";
import { limparBanco } from "./helpers/limpar-banco";

// Cada caso de teste começa com o banco vazio.
beforeEach(async () => {
  await limparBanco();
});
