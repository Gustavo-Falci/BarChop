import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// As peças comuns no celular (redesenho, PR 1). O jsdom não faz layout,
// então o teste lê a regra do CSS, como em grade-de-tempo-no-celular.
//
// Sem o CRLF do checkout no Windows: o fim do bloco é procurado por
// uma chave sozinha na linha.
function lerCss(arquivo: string): string {
  return readFileSync(join(__dirname, "../../src/componentes", arquivo), "utf8").replace(/\r\n/g, "\n");
}

function blocoDaMedia(css: string, abertura: string): string {
  const inicio = css.indexOf(abertura);
  if (inicio < 0) return "";
  const resto = css.slice(inicio);
  return resto.slice(0, resto.indexOf("\n}\n") + 2);
}

describe("Tabela no celular", () => {
  const celular = blocoDaMedia(lerCss("Tabela.module.css"), "@media (max-width: 640px)");

  it("o nome alinha com as outras linhas do cartão: o botão não soma o recuo dele ao do cartão", () => {
    // Antes: o cartão tinha 16px de lado e o botão do nome mais 16px, e o
    // nome ficava 32px pra dentro, desalinhado do telefone embaixo dele.
    expect(celular).toMatch(/\.tabela td:first-child button\s*\{[^}]*padding-inline:\s*0/);
    expect(celular).toMatch(/\.tabela td:first-child button\s*\{[^}]*min-height:\s*44px/);
  });

  it("o título do grupo é um título de seção, e não um cartão com outra caixa dentro", () => {
    expect(celular).toMatch(
      /\.tabela tr\.linhaDoGrupo\s*\{[^}]*border:\s*0[^}]*background:\s*none[^}]*padding:\s*0/
    );
    expect(celular).toMatch(/\.tabela tbody th\.grupo[^{]*\{[^}]*background:\s*none/);
  });
});

describe("CabecalhoDaPagina no celular", () => {
  const celular = blocoDaMedia(lerCss("CabecalhoDaPagina.module.css"), "@media (max-width: 560px)");

  it("título curto e um botão dividem a linha; só desce o que não cabe", () => {
    // Em coluna, cada tela gastava título + botão largo + régua antes do
    // conteúdo. Com quebra, Serviços e Equipe (dois botões) ainda descem.
    expect(celular).toMatch(/\.cabecalho\s*\{[^}]*flex-wrap:\s*wrap/);
    expect(celular).not.toMatch(/flex-direction:\s*column/);
    expect(celular).toMatch(/\.textos\s*\{[^}]*flex:\s*1 1 \d+px/);
  });
});

describe("CampoDeBusca sem teclado", () => {
  const css = lerCss("CampoDeBusca.module.css");

  it("a dica da tecla / some onde não há teclado físico, mas fica na janela estreita do desktop", () => {
    const toque = blocoDaMedia(css, "@media (hover: none)");
    expect(toque).toMatch(/\.atalho\s*\{[^}]*display:\s*none/);
  });
});
