import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// A tela do plano no desktop usa a largura (telas horizontais): o
// configurador e as perguntas à esquerda, o cartão do plano à direita.
// Antes, uma coluna de 880px colada à esquerda deixava metade da tela
// vazia. O jsdom não faz layout, então o teste lê a regra do CSS.
//
// Sem o CRLF do checkout no Windows: o fim do bloco é procurado por
// uma chave sozinha na linha.
const css = readFileSync(join(__dirname, "../../../src/telas/painel/Assinatura.module.css"), "utf8").replace(
  /\r\n/g,
  "\n"
);
const doDesktop = css.slice(css.indexOf("@media (min-width: 1100px)"));
const blocoDoDesktop = doDesktop.slice(0, doDesktop.indexOf("\n}\n") + 2);
const regraDaPagina = css.slice(css.indexOf(".pagina {"), css.indexOf("}", css.indexOf(".pagina {")));

describe("tela do plano no desktop", () => {
  it("a página não fica presa numa coluna estreita", () => {
    expect(regraDaPagina).not.toMatch(/max-width:\s*880px/);
  });

  it("a partir de 1100px, duas colunas: controles e perguntas à esquerda, o cartão do plano à direita", () => {
    expect(css).toContain("@media (min-width: 1100px)");
    expect(blocoDoDesktop).toMatch(/\.corpo\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) minmax\(/);
    expect(blocoDoDesktop).toMatch(/\.coluna\s*\{[^}]*display:\s*grid/);
  });

  it("no celular a coluna se desfaz e as perguntas descem pra baixo do cartão", () => {
    const foraDoDesktop = css.replace(blocoDoDesktop, "");
    expect(foraDoDesktop).toMatch(/\.coluna\s*\{[^}]*display:\s*contents/);
    expect(foraDoDesktop).toMatch(/\.perguntas\s*\{[^}]*order:\s*1/);
  });
});
