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

  it("o BarChop personalizado leva a paleta escura inteira (tokens em minúsculas também)", () => {
    // Os tokens da casa têm hex em minúsculas (#3d3410). Filtrados fora,
    // o bloco escuro ficava sem eles e o claro vazava: fundo de destaque
    // amarelo-claro com texto claro, no escuro.
    const css = cssDaAparencia(com({ cores: { claro: { marca: "#1C1C1C" }, escuro: {} } }));
    const escuro = css.slice(css.indexOf('[data-theme="dark"] {'));
    for (const nome of ["pale-yellow", "ink-soft", "muted", "line", "placeholder"]) {
      expect(escuro).toMatch(new RegExp(`--cor-${nome}: #[0-9A-F]{6};`));
    }
    expect(escuro).toContain("--cor-pale-yellow: #3D3410;");
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

describe("ajuste fino no CSS", () => {
  // Cantos, botão e cards viram variáveis que os componentes leem com o
  // valor de hoje como reserva: sem elas, nada muda (nem no painel).
  it("os padrões (arredondados, sólido, elevado) não geram nada", () => {
    expect(cssDaAparencia(com({ cantos: "arredondados", botao: "solido", cards: "elevado" }))).toBe("");
  });

  it("cantos retos e em pílula", () => {
    const retos = cssDaAparencia(com({ cantos: "retos" }));
    expect(retos).toContain("--raio-botao: 4px;");
    expect(retos).toContain("--raio-cartao: 4px;");
    expect(retos).toContain("--raio-campo: 4px;");
    const pilula = cssDaAparencia(com({ cantos: "pilula" }));
    expect(pilula).toContain("--raio-botao: 999px;");
    expect(pilula).toContain("--raio-cartao: 20px;");
  });

  it("botão em contorno: fundo do card e a marca como texto, por modo", () => {
    const css = cssDaAparencia(com({ botao: "contorno" }));
    expect(css).toContain("--botao-fundo: var(--cor-surface);");
    expect(css).toContain("--botao-texto: var(--cor-accent-text);");
    expect(css).toMatch(/--cor-accent-text: #[0-9A-F]{6};/);
    expect(css).toContain('[data-theme="dark"] {');
  });

  it("botão em gradiente", () => {
    const css = cssDaAparencia(com({ botao: "gradiente" }));
    expect(css).toContain("--botao-fundo: linear-gradient(135deg, var(--cor-accent), var(--cor-accent-fim));");
    expect(css).toMatch(/--cor-accent-fim: #[0-9A-F]{6};/);
  });

  it("cards planos e com borda", () => {
    const plano = cssDaAparencia(com({ cards: "plano" }));
    expect(plano).toContain("--cartao-borda: transparent;");
    expect(plano).toContain("--cartao-sombra: none;");
    const borda = cssDaAparencia(com({ cards: "borda" }));
    expect(borda).toContain("--cartao-sombra: none;");
    expect(borda).not.toContain("--cartao-borda: transparent;");
  });
});

describe("scriptDoModo", () => {
  beforeEach(() => {
    document.documentElement.removeAttribute("data-theme");
    window.localStorage.clear();
  });

  function rodar(script: string) {
    // É o que o <script> inline faz.
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
