import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";

// `next/font/local` e `next/font/google` só existem de verdade dentro do
// build do Next — fora dele os módulos não exportam função nenhuma e o
// `app/fontes.ts` explode na importação. Os dublês devolvem só o
// `.variable`, que é tudo que o layout usa das fontes.
vi.mock("next/font/local", () => ({
  default: () => ({ variable: "fonte-display" }),
}));

vi.mock("next/font/google", () => ({
  Inter: () => ({ variable: "fonte-corpo" }),
}));

import RootLayout from "../../app/layout";

// Os tipos do React 19 deixam `props` como `unknown` num ReactElement
// sem parâmetro. Aqui só se lê chave solta, então Record basta.
type ElementoSolto = ReactElement<Record<string, unknown>>;

// O layout raiz é componente de servidor sem async, então dá pra chamar
// como função e inspecionar o elemento que ele devolve. É o único jeito
// de ver `suppressHydrationWarning`: a prop é só do React, nunca vira
// atributo no DOM nem sai no renderToString — um teste que renderize e
// olhe o HTML passa exista ela ou não.
function htmlDoLayout(): ElementoSolto {
  return RootLayout({ children: null }) as ElementoSolto;
}

describe("layout raiz", () => {
  it("silencia o aviso de hidratação no <html>", () => {
    // O SCRIPT_DE_TEMA roda no <head> antes da primeira pintura e
    // escreve data-theme no <html>. O HTML do servidor não tem esse
    // atributo — ele nasce no navegador, instantes antes de o React
    // hidratar. Sem a prop, toda rota abre o console com "A tree
    // hydrated but some attributes of the server rendered HTML didn't
    // match the client properties".
    //
    // `toBe(true)` e não `not.toBe(false)`: com a prop removida a
    // leitura é undefined, e undefined !== false deixaria passar.
    expect(htmlDoLayout().props.suppressHydrationWarning).toBe(true);
  });

  it("injeta o script da barra lateral, também antes do estilo dos tokens", () => {
    // Sem ele a barra nasce com 260px e salta pra 76px quando o React
    // monta — o mesmo pisca que o script do tema existe pra evitar.
    const filhos = htmlDoLayout().props.children as ElementoSolto[];
    const dentroDoHead = filhos[0].props.children as ElementoSolto[];

    const scripts = dentroDoHead
      .filter((filho) => filho.type === "script")
      .map((filho) => {
        const html = filho.props.dangerouslySetInnerHTML as { __html: string };
        return html.__html;
      });

    expect(scripts.some((texto) => texto.includes("data-barra"))).toBe(true);
    // O estilo dos tokens continua por último: os dois scripts escrevem
    // atributos no <html> que o CSS abaixo lê.
    expect(dentroDoHead[dentroDoHead.length - 1].type).toBe("style");
  });

  it("mantém todo script antes do estilo dos tokens", () => {
    // A ordem importa: os atributos precisam estar no <html> antes de o
    // CSS que os lê ser aplicado, senão pisca o tema (ou a largura da
    // barra) errado.
    //
    // Comparação por tipo e não por índice: eram um script e um estilo,
    // e a checagem posicional quebrava a cada script novo no <head> sem
    // que a ordem tivesse regredido.
    const filhos = htmlDoLayout().props.children as ElementoSolto[];
    const head = filhos[0];
    const dentroDoHead = head.props.children as ElementoSolto[];

    // `findLastIndex` não existe no lib que este projeto compila.
    const tipos = dentroDoHead.map((filho) => filho.type);
    const ultimoScript = tipos.lastIndexOf("script");
    const primeiroEstilo = tipos.indexOf("style");

    expect(ultimoScript).toBeGreaterThanOrEqual(0);
    expect(primeiroEstilo).toBeGreaterThan(ultimoScript);
  });
});
