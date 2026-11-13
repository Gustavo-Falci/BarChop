import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DURACAO_DA_ABERTURA } from "../../src/site/abertura/linhaDoTempo";
import { CLASSE_DA_ABERTURA, VIVA } from "../../src/site/abertura/script";
import { tocar } from "../../src/site/abertura/tocar";

// Home nova, marco 5: quem toca a abertura. O relógio anda quadro a
// quadro (requestAnimationFrame), pular acelera 5×, e no fim tudo volta
// ao topo de sempre: sem a classe, sem estilo deixado pra trás e com a
// rolagem solta.

let quadros: FrameRequestCallback[] = [];
let agora = 0;

// Avança `segundos` de relógio, em quadros de 1/60 s.
function passar(segundos: number) {
  const fim = agora + segundos * 1000;
  while (agora < fim && quadros.length) {
    agora += 1000 / 60;
    const pendentes = quadros;
    quadros = [];
    for (const q of pendentes) q(agora);
  }
}

function montar() {
  document.body.innerHTML = `
    <header><a href="/"><span data-marca-da-nav=""><svg></svg></span></a></header>
    <section data-topo="">
      <div data-agenda=""><span data-bloco=""></span></div>
      <svg data-fios=""></svg>
      <svg data-navalha=""><g data-lamina=""><path data-aco=""></path><path data-gume=""></path><g data-detalhe=""></g></g></svg>
      <div data-cantos=""><b data-contador="">8</b></div>
      <button type="button" data-pular="">Pular abertura</button>
      <span data-metade="bar">Bar</span><span data-metade="chop">Chop</span>
      <picture><img alt="" /></picture>
      <h1 data-peca="promessa">Sua barbearia agenda sozinha.</h1>
      <p data-peca="status"></p>
      <div data-peca="base"></div>
    </section>`;
  return {
    topo: document.querySelector<HTMLElement>("[data-topo]")!,
    cabecalho: document.querySelector<HTMLElement>("header"),
  };
}

const html = () => document.documentElement;

describe("tocar", () => {
  beforeEach(() => {
    quadros = [];
    agora = 0;
    vi.stubGlobal("requestAnimationFrame", (q: FrameRequestCallback) => {
      quadros.push(q);
      return quadros.length;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {});
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    html().classList.add(CLASSE_DA_ABERTURA);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    html().classList.remove(CLASSE_DA_ABERTURA);
    html().removeAttribute(VIVA);
    document.body.innerHTML = "";
  });

  it("marca o <html> como viva (a trava não corta) e prende a rolagem enquanto toca", async () => {
    await tocar(montar());
    passar(0.5);

    expect(html()).toHaveAttribute(VIVA);
    expect(document.body.style.overflow).toBe("hidden");
  });

  it("no fim, volta ao topo de sempre e não deixa nada pra trás", async () => {
    const { topo } = montar();
    await tocar({ topo, cabecalho: document.querySelector("header") });
    passar(DURACAO_DA_ABERTURA + 0.2);

    expect(html().classList.contains(CLASSE_DA_ABERTURA)).toBe(false);
    expect(html()).not.toHaveAttribute(VIVA);
    expect(document.body.style.overflow).toBe("");
    for (const el of topo.querySelectorAll<HTMLElement>("[data-metade], [data-peca], img")) {
      expect(el.getAttribute("style") ?? "").toBe("");
    }
    expect(document.querySelector<HTMLElement>("header")!.getAttribute("style") ?? "").toBe("");
  });

  it("pular (botão) acelera até o fim, bem antes dos 4,3 s", async () => {
    await tocar(montar());
    passar(0.3);
    document.querySelector<HTMLButtonElement>("[data-pular]")!.click();
    passar(1.2);

    expect(html().classList.contains(CLASSE_DA_ABERTURA)).toBe(false);
  });

  it.each(["Escape", " ", "Enter", "ArrowDown", "PageDown"])("a tecla \"%s\" também pula", async (tecla) => {
    await tocar(montar());
    passar(0.3);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: tecla }));
    passar(1.2);

    expect(html().classList.contains(CLASSE_DA_ABERTURA)).toBe(false);
  });

  it("a roda do mouse e o primeiro toque também pulam", async () => {
    await tocar(montar());
    passar(0.3);
    window.dispatchEvent(new Event("wheel"));
    passar(1.2);
    expect(html().classList.contains(CLASSE_DA_ABERTURA)).toBe(false);

    html().classList.add(CLASSE_DA_ABERTURA);
    await tocar(montar());
    passar(0.3);
    window.dispatchEvent(new Event("touchstart"));
    passar(1.2);
    expect(html().classList.contains(CLASSE_DA_ABERTURA)).toBe(false);
  });

  it("sem pular, ainda está tocando no meio", async () => {
    await tocar(montar());
    passar(2);

    expect(html().classList.contains(CLASSE_DA_ABERTURA)).toBe(true);
  });

  it("com \"reduzir movimento\" (ligado depois que o script decidiu), encerra na hora", async () => {
    vi.stubGlobal("matchMedia", (consulta: string) => ({ matches: consulta.includes("reduce") }));
    await tocar(montar());

    expect(html().classList.contains(CLASSE_DA_ABERTURA)).toBe(false);
  });
});
