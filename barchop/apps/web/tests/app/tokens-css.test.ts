import { describe, expect, it } from "vitest";
import { cssDeTokens } from "../../app/tokens-css";
import { CURVA, DESLIZE, DURACAO, ESCALA } from "../../src/movimento/tokens";

describe("css de tokens", () => {
  it("tem o bloco da escolha manual por escuro", () => {
    expect(cssDeTokens).toContain('[data-theme="dark"]');
  });

  it("declara color-scheme nos três blocos, não só as cores", () => {
    // `color-scheme` é o que manda nas partes que o navegador desenha
    // sozinho — o ícone do relógio do <input type="time"> dos horários
    // de funcionamento, a barra de rolagem, o destaque de seleção.
    // Nenhuma custom property alcança esses controles: sem esta linha o
    // relógio sai claro sobre o fundo escuro e some.
    //
    // Os três blocos, e não um só: o `:root` cobre o claro, o `@media`
    // cobre quem está no escuro do sistema sem ter escolhido, e o
    // `[data-theme="dark"]` cobre quem escolheu escuro num sistema
    // claro. Faltando qualquer um, um desses três caminhos fica com o
    // esquema errado.
    // O `;` e a âncora de linha são necessários: um `contains` solto
    // casaria também com o `@media (prefers-color-scheme: dark)`, que é
    // a condição da regra e não uma declaração.
    expect(cssDeTokens.match(/^\s*color-scheme: light;$/gm)).toHaveLength(1);
    expect(cssDeTokens.match(/^\s*color-scheme: dark;$/gm)).toHaveLength(2);
  });

  it("tira as durações e curvas do mesmo lugar que a lib motion", () => {
    // CSS e JS não podem discordar do tempo: um menu que entra pela
    // lib e some pelo CSS teria dois ritmos na mesma tela.
    expect(cssDeTokens).toContain(`--duracao-instante: ${DURACAO.instante * 1000}ms;`);
    expect(cssDeTokens).toContain(`--duracao-curta: ${DURACAO.curta * 1000}ms;`);
    expect(cssDeTokens).toContain(`--duracao-media: ${DURACAO.media * 1000}ms;`);
    expect(cssDeTokens).toContain(`--duracao-longa: ${DURACAO.longa * 1000}ms;`);
    expect(cssDeTokens).toContain(`--curva-entrada: cubic-bezier(${CURVA.entrada.join(", ")});`);
  });

  it("e as escalas (janela, aperto) e os deslizes também (motion PR 2 e 3)", () => {
    expect(cssDeTokens).toContain(`--escala-janela: ${ESCALA.janela};`);
    expect(cssDeTokens).toContain(`--deslize-curto: ${DESLIZE.curto}px;`);
    expect(cssDeTokens).toContain(`--deslize-normal: ${DESLIZE.normal}px;`);
    expect(cssDeTokens).toContain(`--escala-aperto: ${ESCALA.aperto};`);
  });

  it("a media query cede para quem escolheu claro", () => {
    // Sem a guarda, um barbeiro que escolheu claro continua escurecendo
    // num sistema escuro: o @media venceria.
    expect(cssDeTokens).toContain(':root:not([data-theme="light"])');
  });
});
