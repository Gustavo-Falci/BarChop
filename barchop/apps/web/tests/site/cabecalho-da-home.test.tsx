import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CabecalhoDaHome } from "../../src/site/CabecalhoDaHome";
import { avisarTopoClaro } from "../../src/site/cena/topoClaro";

// Home nova, marco 2: a home tem cabeçalho próprio, fixo, escuro sobre o
// topo escuro e claro (papel e tinta, como o das outras páginas) quando o
// topo sai de baixo dele. Quem diz isso é o IntersectionObserver de olho
// no topo da home.

type Ouvinte = (entradas: { isIntersecting: boolean; target: Element }[]) => void;
let ouvintes: Ouvinte[] = [];
let observados: Element[] = [];
let opcoes: IntersectionObserverInit[] = [];

class ObservadorFalso {
  constructor(ouvinte: Ouvinte, init: IntersectionObserverInit) {
    ouvintes.push(ouvinte);
    opcoes.push(init);
  }
  observe(el: Element) {
    observados.push(el);
  }
  disconnect() {}
  unobserve() {}
}

function comTopo() {
  const topo = document.createElement("section");
  topo.id = "topo-da-home";
  document.body.append(topo);
  return topo;
}

function topoDebaixoDoCabecalho(sim: boolean, topo: Element) {
  act(() => ouvintes.at(-1)!([{ isIntersecting: sim, target: topo }]));
}

const cabecalho = () => screen.getByRole("banner");

describe("cabeçalho da home", () => {
  beforeEach(() => {
    ouvintes = [];
    observados = [];
    opcoes = [];
    vi.stubGlobal("IntersectionObserver", ObservadorFalso);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("a marca volta pra home, e os links são os do site", () => {
    render(<CabecalhoDaHome topo="topo-da-home" />);
    expect(screen.getByRole("link", { name: "BarChop" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Preços" })).toHaveAttribute("href", "/precos");
    expect(screen.getByRole("link", { name: "Entrar" })).toHaveAttribute("href", "/painel/entrar");
    // O cabeçalho aparece fora do corpo da home: sem ?origem=home, como o
    // de sempre (só os convites do corpo contam como vindos da home).
    expect(screen.getByRole("link", { name: "Criar barbearia" })).toHaveAttribute(
      "href",
      "/painel/cadastro"
    );
  });

  it("no HTML do servidor sai escuro, sobre o topo", () => {
    const html = renderToString(<CabecalhoDaHome topo="topo-da-home" />);
    expect(html).toContain('data-tema="escuro"');
  });

  it("olha o topo da home, numa faixa da altura do próprio cabeçalho", () => {
    const topo = comTopo();
    render(<CabecalhoDaHome topo="topo-da-home" />);
    expect(observados).toContain(topo);
    // A faixa vai do alto da tela até a base do cabeçalho: a margem de
    // baixo encolhe o resto da tela.
    expect(opcoes.at(-1)?.rootMargin).toMatch(/^0px 0px -\d+px 0px$/);
  });

  it("clareia quando o topo sai de baixo dele, e escurece quando volta", () => {
    const topo = comTopo();
    render(<CabecalhoDaHome topo="topo-da-home" />);
    expect(cabecalho()).toHaveAttribute("data-tema", "escuro");

    topoDebaixoDoCabecalho(false, topo);
    expect(cabecalho()).toHaveAttribute("data-tema", "claro");

    topoDebaixoDoCabecalho(true, topo);
    expect(cabecalho()).toHaveAttribute("data-tema", "escuro");
  });

  // Marco 3: com a cadeira 3D, o topo fica preso debaixo do cabeçalho até
  // a névoa acabar; quem diz que já clareou é o próprio topo.
  it("com o topo preso, clareia quando o topo avisa que a névoa chegou", () => {
    const topo = comTopo();
    render(<CabecalhoDaHome topo="topo-da-home" />);
    topoDebaixoDoCabecalho(true, topo);

    act(() => avisarTopoClaro(true));
    expect(cabecalho()).toHaveAttribute("data-tema", "claro");

    act(() => avisarTopoClaro(false));
    expect(cabecalho()).toHaveAttribute("data-tema", "escuro");
  });

  it("some ao descer e volta ao subir; perto do alto fica sempre", () => {
    render(<CabecalhoDaHome topo="topo-da-home" />);
    const rolarAte = (y: number) =>
      act(() => {
        Object.defineProperty(window, "scrollY", { value: y, configurable: true });
        window.dispatchEvent(new Event("scroll"));
      });

    rolarAte(100);
    expect(cabecalho()).not.toHaveAttribute("data-escondido");
    rolarAte(400);
    expect(cabecalho()).toHaveAttribute("data-escondido");
    rolarAte(300);
    expect(cabecalho()).not.toHaveAttribute("data-escondido");
    rolarAte(900);
    expect(cabecalho()).toHaveAttribute("data-escondido");
    rolarAte(60);
    expect(cabecalho()).not.toHaveAttribute("data-escondido");
  });

  it("escondido, sobe pra fora da tela; com o foco dentro, volta", () => {
    expect(css()).toMatch(/\.cabecalho\[data-escondido\]\s*\{[^}]*translate:\s*0 -100%/);
    expect(css()).toMatch(/\.cabecalho\[data-escondido\]:focus-within\s*\{[^}]*translate:\s*none/);
  });

  it("com reduzir movimento, some e volta sem deslizar", () => {
    expect(css()).toMatch(
      /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.cabecalho\s*\{[^}]*transition-property:\s*background-color,\s*border-color,\s*color/
    );
  });

  it("sem o observer no navegador, fica escuro (não quebra)", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    comTopo();
    render(<CabecalhoDaHome topo="topo-da-home" />);
    expect(cabecalho()).toHaveAttribute("data-tema", "escuro");
  });

  // O jsdom não faz layout: os testes de CSS leem as regras.
  const css = () =>
    readFileSync(join(__dirname, "../../src/site/CabecalhoDaHome.module.css"), "utf8").replace(
      /\r\n/g,
      "\n"
    );

  it("fica fixo no alto da tela", () => {
    expect(css()).toMatch(/\.cabecalho\s*\{[^}]*position:\s*fixed/);
  });

  it("em 320px, o nome da marca fica só pro leitor de tela, e o link continua com nome", () => {
    expect(css()).toMatch(/@media \(max-width: 359px\)\s*\{\s*\.nomeDaMarca\s*\{[^}]*clip-path:\s*inset\(50%\)/);
    render(<CabecalhoDaHome topo="topo-da-home" />);
    expect(screen.getByText("BarChop").className).toMatch(/nomeDaMarca/);
    expect(screen.getByRole("link", { name: "BarChop" })).toHaveAttribute("href", "/");
  });

  it("no celular estreito, o Preços sai pra caber, como no cabeçalho de sempre", () => {
    expect(css()).toMatch(/@media \(max-width: 419px\)\s*\{[^}]*\.precos\s*\{[^}]*display:\s*none/);
    render(<CabecalhoDaHome topo="topo-da-home" />);
    expect(screen.getByRole("link", { name: "Preços" }).className).toMatch(/precos/);
  });
});
