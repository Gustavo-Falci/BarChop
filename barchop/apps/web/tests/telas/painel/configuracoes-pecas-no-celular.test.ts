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

  it("a barra de salvar no celular corta o resumo em duas linhas", () => {
    // "1 mudança · Segunda: fechado → 09:00–18:00" ao lado de Descartar e
    // Salvar virava quatro linhas e a barra cobria meia tela.
    const celular = blocoDaMedia(lerCss("componentes/BarraDeMudancas.module.css"), "@media (max-width: 640px)");
    expect(regra(celular, "  .resumo")).toMatch(/-webkit-line-clamp:\s*2/);
    // A lista do que mudou sai da vista, mas não do leitor de tela.
    expect(regra(celular, "  .detalhes")).toMatch(/clip-path:\s*inset\(50%\)/);
  });

  it("o texto de apoio solto não vai pra segunda linha da seção", () => {
    // A regra do celular que desce o resumo do índice pra baixo do nome
    // valia pra todo `.valor`, e "Nenhuma data especial" caía embaixo do
    // botão "Nova data".
    const css = lerCss("telas/painel/configuracoes/Configuracoes.module.css");
    const celular = blocoDaMedia(css, "@media (max-width: 720px)");
    expect(regra(celular, "  .valor")).toBe("");
    expect(regra(celular, "  .linha .valor")).toMatch(/grid-row:\s*2/);
  });

  it("dia fechado no celular fica numa linha só: nome, Fechado e o interruptor", () => {
    const celular = blocoDaMedia(lerCss("telas/painel/configuracoes/Configuracoes.module.css"), "@media (max-width: 560px)");
    expect(regra(celular, "  .dia:has(.fechado)")).toMatch(/grid-template-areas:\s*"nome horas chave"/);
  });

  it("no celular, as abas rolam de lado numa fileira, sem quebrar linha", () => {
    // PR 6 (Aparência): a 360px, "Ajuste fino" descia sozinho pra uma
    // segunda linha de abas.
    const celular = blocoDaMedia(lerCss("componentes/Abas.module.css"), "@media (max-width: 560px)");
    const abas = regra(celular, "  .abas");
    expect(abas).toMatch(/flex-wrap:\s*nowrap/);
    expect(abas).toMatch(/overflow-x:\s*auto/);
    expect(regra(celular, "  .aba")).toMatch(/white-space:\s*nowrap/);
  });

  it("a folha de escolha sobe de baixo no celular e fica no meio no computador", () => {
    // PR 4 (Regras). Presa embaixo, na largura da tela; com muitas opções
    // (os sete prazos) rola por dentro em vez de passar do topo. O espaço
    // de dentro fica num filho: o toque no fundo fecha a folha, e um toque
    // no próprio padding da <dialog> contaria como fundo.
    const css = lerCss("componentes/FolhaDeEscolha.module.css");
    const folha = regra(css, ".folha");
    expect(folha).toMatch(/inset:\s*auto 0 0 0/);
    expect(folha).toMatch(/max-height:/);
    expect(folha).toMatch(/overflow-y:\s*auto/);
    expect(folha).toMatch(/padding:\s*0/);
    // Acima do corte do celular, uma faixa de 1280px seria demais.
    const largo = blocoDaMedia(css, "@media (min-width: 721px)");
    expect(regra(largo, "  .folha")).toMatch(/inset:\s*0/);
    expect(regra(largo, "  .folha")).toMatch(/width:\s*min\(28rem/);
  });
});
