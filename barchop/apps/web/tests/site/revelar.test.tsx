import { act, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Revelar } from "../../src/site/Revelar";

// Motion PR 6: as seções do site sobem 8px com fade quando entram na
// tela — mas o HTML do servidor sai visível (crawler, sem JS, print do
// link), e o que já está na primeira dobra nunca se esconde.

type Ouvinte = (entradas: { isIntersecting: boolean }[]) => void;
let ouvintes: Ouvinte[] = [];

class ObservadorFalso {
  constructor(ouvinte: Ouvinte) {
    ouvintes.push(ouvinte);
  }
  observe() {}
  disconnect() {}
  unobserve() {}
}

function posicionar(topo: number) {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ top: topo } as DOMRect);
}

describe("Revelar", () => {
  beforeEach(() => {
    ouvintes = [];
    vi.stubGlobal("IntersectionObserver", ObservadorFalso);
    vi.stubGlobal("innerHeight", 800);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("no HTML do servidor, o conteúdo sai visível, sem estilo escondido", () => {
    const html = renderToString(
      <Revelar como="section" className="secao">
        <h2>Como funciona</h2>
      </Revelar>
    );

    expect(html).toContain("Como funciona");
    expect(html).not.toContain("opacity");
  });

  it("o que está na primeira dobra não se esconde", () => {
    posicionar(100);
    render(
      <Revelar como="section">
        <h2>Topo</h2>
      </Revelar>
    );

    expect(screen.getByText("Topo").closest("section")!.style.opacity).toBe("");
  });

  it("abaixo da dobra, espera escondido e aparece quando entra na tela", () => {
    posicionar(2000);
    render(
      <Revelar como="section">
        <h2>Perguntas</h2>
      </Revelar>
    );
    const secao = screen.getByText("Perguntas").closest("section")!;
    expect(secao.style.opacity).toBe("0");

    act(() => ouvintes.forEach((ouvinte) => ouvinte([{ isIntersecting: true }])));

    expect(secao.style.opacity).toBe("");
  });

  it("quem pediu menos movimento no sistema vê tudo parado", () => {
    posicionar(2000);
    vi.stubGlobal("matchMedia", (consulta: string) => ({ matches: consulta.includes("reduce") }));
    render(
      <Revelar como="section">
        <h2>Recursos</h2>
      </Revelar>
    );

    expect(screen.getByText("Recursos").closest("section")!.style.opacity).toBe("");
  });
});
