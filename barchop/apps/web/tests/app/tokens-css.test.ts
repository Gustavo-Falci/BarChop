import { describe, expect, it } from "vitest";
import { cssDeTokens } from "../../app/tokens-css";

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

  it("a media query cede para quem escolheu claro", () => {
    // Sem a guarda, um barbeiro que escolheu claro continua escurecendo
    // num sistema escuro: o @media venceria.
    expect(cssDeTokens).toContain(':root:not([data-theme="light"])');
  });
});
