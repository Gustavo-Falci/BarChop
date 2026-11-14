import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, render, screen, within } from "@testing-library/react";
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

  it("a marca volta pra home; a pílula leva às seções; Entrar e o convite à direita", () => {
    render(<CabecalhoDaHome topo="topo-da-home" />);
    expect(screen.getByRole("link", { name: "BarChop" })).toHaveAttribute("href", "/");
    const secoes = within(screen.getByRole("navigation", { name: "Seções" })).getAllByRole("link");
    expect(secoes.map((a) => [a.textContent, a.getAttribute("href")])).toEqual([
      ["O problema", "#dores"],
      ["Como funciona", "#como-funciona"],
      ["Começar", "#comecar"],
    ]);
    expect(screen.queryByRole("link", { name: "Preços" })).toBeNull();
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

  // O jsdom não faz layout: as caixas das seções são de mentira.
  function secaoEm(id: string, top: number, bottom: number) {
    const el = document.createElement("section");
    el.id = id;
    el.getBoundingClientRect = () => ({ top, bottom }) as DOMRect;
    document.body.append(el);
  }

  it("marca na pílula a seção que está no meio da tela", async () => {
    Object.defineProperty(window, "innerHeight", { value: 800, configurable: true });
    secaoEm("dores", -100, 300);
    secaoEm("como-funciona", 300, 900);
    secaoEm("comecar", 900, 1400);
    render(<CabecalhoDaHome topo="topo-da-home" />);

    expect(await screen.findByRole("link", { name: "Como funciona" })).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("link", { name: "O problema" })).not.toHaveAttribute("aria-current");
  });

  it("sobre o fecho escuro, volta ao escuro mesmo com o topo lá em cima", () => {
    const topo = comTopo();
    Object.defineProperty(window, "innerHeight", { value: 800, configurable: true });
    secaoEm("comecar", 0, 800);
    render(<CabecalhoDaHome topo="topo-da-home" />);
    topoDebaixoDoCabecalho(false, topo);

    expect(cabecalho()).toHaveAttribute("data-tema", "escuro");
  });

  it("escondido, sobe pra fora da tela; com o foco dentro, volta", () => {
    expect(css()).toMatch(/\.cabecalho\[data-escondido\]\s*\{[^}]*translate:\s*0 -130%/);
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
    expect(screen.getByRole("link", { name: "BarChop" }).querySelector("[class*=nomeDaMarca]")).toHaveTextContent("BarChop");
    expect(screen.getByRole("link", { name: "BarChop" })).toHaveAttribute("href", "/");
  });

  it("no celular, a pílula sai e ficam a marca e os convites", () => {
    expect(css()).toMatch(/@media \(max-width: 760px\)\s*\{[^@]*\.pilula\s*\{[^}]*display:\s*none/);
  });
});
