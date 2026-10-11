import { beforeEach, describe, expect, it } from "vitest";
import { APARENCIA_PADRAO, paletaDaAparencia, type Aparencia } from "@barchop/formato";
import { chaveDoModo, cssDaAparencia, scriptDoModo } from "../../src/fluxo/aparenciaDaPagina";

// A Aparência na página pública (marco C): o layout de /[slug] põe um
// <style> com a paleta da barbearia e um <script> com o modo padrão.
// Barbearia que nunca mexeu continua igual: nenhum dos dois sai.

function com(mudancas: Partial<Aparencia>): Aparencia {
  return { ...APARENCIA_PADRAO, ...mudancas };
}

describe("cssDaAparencia", () => {
  it("o padrão não gera CSS nenhum (a página fica com os tokens de hoje)", () => {
    expect(cssDaAparencia(APARENCIA_PADRAO)).toBe("");
  });

  it("um tema gera os três blocos dos tokens, com a paleta dele", () => {
    const css = cssDaAparencia(com({ tema: "oceano" }));
    const paleta = paletaDaAparencia(com({ tema: "oceano" }));

    expect(css).toContain(`--cor-accent: ${paleta.claro.accent};`);
    expect(css).toContain(`--cor-paper: ${paleta.escuro.paper};`);
    expect(css).toContain(`--cor-on-accent: ${paleta.claro.onAccent};`);
    // A mesma forma do tokens-css: sem o @media e o [data-theme], o tema
    // escuro do sistema (ou do botão) voltaria pra paleta da casa.
    expect(css).toMatch(/^:root \{/);
    expect(css).toContain('@media (prefers-color-scheme: dark)');
    expect(css).toContain(':root:not([data-theme="light"])');
    expect(css).toContain('[data-theme="dark"] {');
  });

  it("o BarChop com a marca trocada também gera", () => {
    expect(cssDaAparencia(com({ cores: { claro: { marca: "#2563EB" }, escuro: {} } }))).toContain(
      "--cor-accent: #2563EB;"
    );
  });

  it("só sai hex: o que vier forjado não vira CSS", () => {
    // O CSS entra por dangerouslySetInnerHTML. A API já recusa, e quem
    // lê normaliza; aqui é a última guarda.
    const forjada = {
      ...APARENCIA_PADRAO,
      cores: { claro: { marca: "#000000;}body{display:none" }, escuro: { fundo: "</style><script>" } },
    } as unknown as Aparencia;

    const css = cssDaAparencia(forjada);

    expect(css).not.toContain("body{");
    expect(css).not.toContain("</style");
    for (const [, valor] of css.matchAll(/--cor-[a-z-]+: ([^;]*);/g)) {
      expect(valor).toMatch(/^#[0-9A-F]{6}$/);
    }
  });
});

describe("scriptDoModo", () => {
  beforeEach(() => {
    document.documentElement.removeAttribute("data-theme");
    window.localStorage.clear();
  });

  function rodar(script: string) {
    // eslint-disable-next-line no-new-func -- é o que o <script> inline faz
    new Function(script)();
  }

  it("automático e sem botão (o padrão): nenhum script", () => {
    expect(scriptDoModo("gr-barber", APARENCIA_PADRAO)).toBe("");
  });

  it("modo fixo no escuro: põe o data-theme dark", () => {
    rodar(scriptDoModo("gr-barber", com({ modoPadrao: "escuro" })));
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("modo fixo no claro: põe o data-theme light", () => {
    rodar(scriptDoModo("gr-barber", com({ modoPadrao: "claro" })));
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("com o botão ligado, vale o que o visitante escolheu nesta barbearia", () => {
    window.localStorage.setItem(chaveDoModo("gr-barber"), "escuro");
    rodar(scriptDoModo("gr-barber", com({ modoPadrao: "claro", clienteTrocaModo: true })));
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("com o botão ligado e nada escolhido, automático segue o sistema (sem atributo)", () => {
    document.documentElement.setAttribute("data-theme", "dark");
    rodar(scriptDoModo("gr-barber", com({ clienteTrocaModo: true })));
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });

  it("com o botão desligado, uma escolha antiga do visitante não vale mais", () => {
    window.localStorage.setItem(chaveDoModo("gr-barber"), "escuro");
    rodar(scriptDoModo("gr-barber", com({ modoPadrao: "claro" })));
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("a escolha é por barbearia, e nunca a do painel", () => {
    expect(chaveDoModo("gr-barber")).not.toBe(chaveDoModo("outra"));
    expect(chaveDoModo("gr-barber")).not.toBe("painel.tema");
  });
});
