import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// A Agenda não pode ficar mais larga que a tela do celular (redesenho,
// PR 3). Achado na conferência a 360px: a barra do celular (☰, o mês
// inteiro, as setas, Hoje e Bloquear) pedia 351px onde cabiam 328. A
// coluna `auto` da página cedia e alargava tudo, a grade junto. O
// navegador do celular então encolhia a página pra caber, e a barra de
// baixo, presa ao pé, ficava com os rótulos cortados — o "rótulos
// cortados" do print de 31/10. O jsdom não faz layout: o teste lê a
// regra, como em pecas-no-celular.
function lerCss(caminho: string): string {
  return readFileSync(join(__dirname, "../../../src", caminho), "utf8").replace(/\r\n/g, "\n");
}

function regra(css: string, seletor: string): string {
  const inicio = css.search(new RegExp(`^${seletor.replace(/\./g, "\\.")}\\s*\\{`, "m"));
  if (inicio < 0) return "";
  return css.slice(inicio, css.indexOf("}", inicio) + 1);
}

describe("Agenda dentro da largura da tela", () => {
  const css = lerCss("telas/painel/Agenda.module.css");

  it("a coluna da página encolhe abaixo do mínimo dos filhos, em vez de alargar a página", () => {
    expect(regra(css, ".pagina")).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)/);
    expect(regra(css, ".topo")).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  });

  it("no celular estreito, o título da barra desce um passo pra caber o mês inteiro", () => {
    const barra = lerCss("telas/painel/agenda/BarraDaAgendaNoCelular.module.css");
    const inicio = barra.indexOf("@media (max-width: 374px)");
    const bloco = inicio < 0 ? "" : barra.slice(inicio, barra.indexOf("\n}\n", inicio) + 2);

    expect(bloco).toMatch(/\.titulo\s*\{[^}]*font-size:\s*var\(--texto-md\)/);
  });

  // Pendente do redesenho (01/11): setembro, novembro, dezembro e
  // fevereiro cortavam com "…" a 360px; medido a 390px, novembro (98px
  // pedidos, 94 de espaço) e dezembro também. Abaixo de 400px o mês sai
  // abreviado ("Set"); de 400px pra cima, inteiro.
  it("abaixo de 400px o mês sai abreviado, e acima, inteiro", () => {
    const barra = lerCss("telas/painel/agenda/BarraDaAgendaNoCelular.module.css");
    const inicio = barra.indexOf("@media (max-width: 399px)");
    const bloco = inicio < 0 ? "" : barra.slice(inicio, barra.indexOf("\n}\n", inicio) + 2);

    expect(regra(barra, ".curto")).toMatch(/display:\s*none/);
    expect(bloco).toMatch(/\.longo\s*\{[^}]*display:\s*none/);
    expect(bloco).toMatch(/\.curto\s*\{[^}]*display:\s*inline/);
  });
});
