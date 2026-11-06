import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// As abas do suporte no computador começam na mesma linha do título da
// página: o texto da aba (padding de 12px no link) cai na borda da
// coluna de 1240px com o padding lg das páginas. Antes elas ficavam
// presas a 16px da janela, à esquerda do título. O jsdom não faz
// layout: o teste lê a regra do CSS.
const css = readFileSync(join(__dirname, "../../../src/suporte/CascaDoSuporte.module.css"), "utf8").replace(
  /\r\n/g,
  "\n"
);
const doDesktop = css.slice(css.indexOf("@media (min-width: 700px)"));
const bloco = doDesktop.slice(0, doDesktop.indexOf("\n}\n") + 2);

describe("abas do suporte no computador", () => {
  it("a partir de 700px, alinham o texto com a coluna das páginas", () => {
    expect(css).toContain("@media (min-width: 700px)");
    expect(bloco).toMatch(
      /\.abas\s*\{[^}]*padding-inline:\s*max\(\s*calc\(var\(--espaco-lg\) - 12px\),\s*calc\(\(100% - 1240px\) \/ 2 \+ var\(--espaco-lg\) - 12px\)\s*\)/
    );
  });
});
