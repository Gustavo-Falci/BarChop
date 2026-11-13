import { act, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TituloDaSecao } from "../../src/site/TituloDaSecao";

// Home nova, marco 4: as seções de baixo têm um rótulo pequeno em cima e
// um título em duas metades, a leve e a pesada, cujas palavras sobem do
// desfoque quando entram na tela (o titulos.js do protótipo, sem GSAP).
// Como o Revelar: o HTML do servidor sai visível, o que já está na
// primeira dobra nunca se esconde e "reduzir movimento" deixa parado.

type Entrada = { isIntersecting: boolean; boundingClientRect: { top: number } };
type Ouvinte = (entradas: Entrada[]) => void;
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

function avisar(entrada: Entrada) {
  act(() => ouvintes.forEach((ouvinte) => ouvinte([entrada])));
}

const PASSOS = (
  <TituloDaSecao id="passos" rotulo="Como funciona" leve="Três passos" forte="e a agenda anda." />
);

describe("TituloDaSecao", () => {
  beforeEach(() => {
    ouvintes = [];
    vi.stubGlobal("IntersectionObserver", ObservadorFalso);
    vi.stubGlobal("innerHeight", 800);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("o título é a frase inteira, com a metade leve antes da pesada", () => {
    posicionar(100);
    render(PASSOS);

    const titulo = screen.getByRole("heading", { level: 2, name: "Três passos e a agenda anda." });
    expect(titulo).toHaveAttribute("id", "passos-titulo");
  });

  it("o rótulo fica em cima, com o id que a seção usa como nome", () => {
    posicionar(100);
    render(PASSOS);

    expect(screen.getByText("Como funciona")).toHaveAttribute("id", "passos-rotulo");
  });

  it("sem rótulo, só o título", () => {
    posicionar(100);
    render(<TituloDaSecao id="fecho" leve="Comece hoje," forte="sem falar com ninguém." />);

    expect(document.getElementById("fecho-rotulo")).toBeNull();
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Comece hoje, sem falar com ninguém.");
  });

  it("cada palavra entra na sua vez: a leve primeiro, a pesada depois", () => {
    posicionar(100);
    render(PASSOS);

    const vezes = ["Três", "passos", "e", "a", "agenda", "anda."].map((palavra) =>
      screen.getByText(palavra).style.getPropertyValue("--i")
    );
    expect(vezes).toEqual(["0", "1", "2", "3", "4", "5"]);
  });

  it("no HTML do servidor, o título sai visível", () => {
    const html = renderToString(PASSOS);

    expect(html).toContain("agenda");
    expect(html).not.toContain("data-estado");
  });

  it("o que está na primeira dobra não se esconde", () => {
    posicionar(100);
    render(PASSOS);

    expect(screen.getByRole("heading", { level: 2 })).not.toHaveAttribute("data-estado");
  });

  it("abaixo da dobra, espera escondido, sobe ao entrar e sai de novo ao voltar pra cima", () => {
    posicionar(2000);
    render(PASSOS);
    const titulo = screen.getByRole("heading", { level: 2 });
    expect(titulo).toHaveAttribute("data-estado", "escondido");

    avisar({ isIntersecting: true, boundingClientRect: { top: 600 } });
    expect(titulo).toHaveAttribute("data-estado", "visivel");

    // Saiu por cima (a pessoa continuou descendo): fica como está.
    avisar({ isIntersecting: false, boundingClientRect: { top: -200 } });
    expect(titulo).toHaveAttribute("data-estado", "visivel");

    // Saiu por baixo (a pessoa voltou pra cima): esconde pra subir de novo.
    avisar({ isIntersecting: false, boundingClientRect: { top: 900 } });
    expect(titulo).toHaveAttribute("data-estado", "escondido");
  });

  it("quem pediu menos movimento no sistema vê o título parado", () => {
    posicionar(2000);
    vi.stubGlobal("matchMedia", (consulta: string) => ({ matches: consulta.includes("reduce") }));
    render(PASSOS);

    expect(screen.getByRole("heading", { level: 2 })).not.toHaveAttribute("data-estado");
  });

  it("sem o IntersectionObserver no navegador, fica parado e visível", () => {
    posicionar(2000);
    vi.stubGlobal("IntersectionObserver", undefined);
    render(PASSOS);

    expect(screen.getByRole("heading", { level: 2 })).not.toHaveAttribute("data-estado");
  });
});
