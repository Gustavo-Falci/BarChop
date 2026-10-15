import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Faturas no desktop usa a largura, como no Barbeiro.app: a etapa e o
// resto (comparativo, perguntas) à esquerda, o Seu pedido à direita. A
// grade tem duas linhas explícitas — a da etapa (`auto`) e a do resto
// (`1fr`) —, então o lado alto não abre buraco entre a etapa e o resto.
// No celular, uma coluna: etapa, pedido, resto, na ordem do HTML. O
// jsdom não faz layout, então o teste lê a regra do CSS.
//
// Sem o CRLF do checkout no Windows: o fim do bloco é procurado por
// uma chave sozinha na linha.
const css = readFileSync(join(__dirname, "../../../src/telas/painel/Faturas.module.css"), "utf8").replace(
  /\r\n/g,
  "\n"
);
const doDesktop = css.slice(css.indexOf("@media (min-width: 1100px)"));
const blocoDoDesktop = doDesktop.slice(0, doDesktop.indexOf("\n}\n") + 2);

describe("Faturas no desktop", () => {
  it("a partir de 1100px, duas colunas: etapa e resto à esquerda, o pedido à direita", () => {
    expect(css).toContain("@media (min-width: 1100px)");
    expect(blocoDoDesktop).toMatch(/\.corpo\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) minmax\(/);
    expect(blocoDoDesktop).toMatch(/\.corpo\s*\{[^}]*grid-template-areas:\s*"etapa lado"\s*"resto lado"/);
    expect(blocoDoDesktop).toMatch(/\.corpo\s*\{[^}]*grid-template-rows:\s*auto 1fr/);
  });

  it("cada parte no seu lugar da grade", () => {
    expect(blocoDoDesktop).toMatch(/\.etapa\s*\{[^}]*grid-area:\s*etapa/);
    expect(blocoDoDesktop).toMatch(/\.lado\s*\{[^}]*grid-area:\s*lado/);
    expect(blocoDoDesktop).toMatch(/\.resto\s*\{[^}]*grid-area:\s*resto/);
  });
});
