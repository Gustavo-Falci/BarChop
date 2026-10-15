import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// O site em 375px. O botão grande ("Criar minha barbearia grátis") não
// quebra linha e não cabia na caixa final: a grade sem limite crescia
// até 389px e a página rolava pro lado. Agora a coluna tem limite e o
// botão quebra linha no celular estreito. O jsdom não faz layout: os
// testes leem as regras do CSS (sem o CRLF do checkout no Windows).
function css(arquivo: string): string {
  return readFileSync(join(__dirname, "../../src/site", arquivo), "utf8").replace(/\r\n/g, "\n");
}

describe("site no celular", () => {
  it("a coluna da Home e das páginas de preço não cresce além da tela", () => {
    expect(css("Home.module.css")).toMatch(/\.home\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/);
    expect(css("PaginaDePreco.module.css")).toMatch(/\.pagina\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/);
  });

  it("no celular estreito, o botão grande quebra linha", () => {
    expect(css("LinkDeAcao.module.css")).toMatch(
      /@media \(max-width: 419px\)\s*\{\s*\.link\s*\{[^}]*white-space:\s*normal/
    );
  });
});
