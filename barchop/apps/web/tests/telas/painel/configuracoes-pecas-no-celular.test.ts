import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Redesenho das Configurações, PR 1: as peças comuns. O jsdom não faz
// layout, então o teste lê a regra do CSS (como em pecas-no-celular).
// Sem o CRLF do checkout no Windows: o fim do bloco é uma chave sozinha
// na linha.
function lerCss(caminho: string): string {
  return readFileSync(join(__dirname, "../../../src", caminho), "utf8").replace(/\r\n/g, "\n");
}

function blocoDaMedia(css: string, abertura: string): string {
  const inicio = css.indexOf(abertura);
  if (inicio < 0) return "";
  const resto = css.slice(inicio);
  return resto.slice(0, resto.indexOf("\n}\n") + 2);
}

function regra(css: string, seletor: string): string {
  const escapado = seletor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return css.match(new RegExp(`(?:^|\\n)${escapado}\\s*\\{([^}]*)\\}`))?.[1] ?? "";
}

describe("Configurações no celular: peças comuns", () => {
  it("a página das áreas não passa da largura da tela", () => {
    // Dados do negócio abria com 656px num celular de 390: a coluna
    // `auto` do grid crescia com o .ladoALado.
    const pagina = regra(lerCss("telas/painel/configuracoes/Configuracoes.module.css"), ".pagina");
    expect(pagina).toMatch(/grid-template-columns:\s*minmax\(0, 1fr\)/);
  });

  it("no celular, a sobra de altura fica com o conteúdo, e não com o topo", () => {
    // Em tela curta (Seu perfil), `auto auto` repartia a sobra dos 100vh
    // entre o topo e o conteúdo: ~72px vazios acima do título.
    const celular = blocoDaMedia(lerCss("painel/NavegacaoDoPainel.module.css"), "@media (max-width: 900px)");
    expect(regra(celular, "  .coluna")).toMatch(/grid-template-rows:\s*auto 1fr/);
  });

  it("no celular, a barra de salvar fica numa linha: o resumo encolhe ao lado dos botões", () => {
    // Com `flex: 1 1 240px`, o resumo não cabia ao lado de Descartar e
    // Salvar em 358px, e os botões desciam pra uma segunda linha.
    const celular = blocoDaMedia(lerCss("componentes/BarraDeMudancas.module.css"), "@media (max-width: 640px)");
    expect(regra(celular, "  .resumo")).toMatch(/flex-basis:\s*0/);
  });

  it("o seletor com preencher vira colunas iguais no celular", () => {
    const celular = blocoDaMedia(lerCss("componentes/SeletorEmPilulas.module.css"), "@media (max-width: 640px)");
    const trilho = regra(celular, "  .opcoes[data-preencher]");
    expect(trilho).toMatch(/display:\s*grid/);
    expect(trilho).toMatch(/grid-template-columns:\s*repeat\(var\(--colunas\), minmax\(0, 1fr\)\)/);
    expect(regra(celular, "  .opcoes[data-preencher] .pilula")).toMatch(/min-height:\s*44px/);
  });
});
