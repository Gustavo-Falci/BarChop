import { beforeEach, describe, expect, it } from "vitest";
import { APARENCIA_PADRAO } from "@barchop/formato";
import {
  MENSAGEM_DA_APARENCIA,
  aplicarPrevia,
  deveAceitar,
  lerMensagemDaPrevia,
  origemDoPainel,
} from "../../src/fluxo/previa";

// A prévia ao vivo da Aparência (marco E): o painel abre a página de
// verdade num iframe e manda o rascunho por postMessage. Em produção é
// cross-origin (painel.<site> → <slug>.<site>): a página só aceita
// mensagem da janela-mãe e do painel, e só mexe no visual dela.

describe("origemDoPainel", () => {
  it("com o site configurado, o subdomínio painel do site", () => {
    expect(origemDoPainel("https://barchop.com.br", "https://gr-barber.barchop.com.br")).toBe(
      "https://painel.barchop.com.br"
    );
  });

  it("sem site (desenvolvimento), a própria origem", () => {
    expect(origemDoPainel(undefined, "http://localhost:3000")).toBe("http://localhost:3000");
  });
});

describe("lerMensagemDaPrevia", () => {
  it("aceita a aparência e o modo, normalizados", () => {
    const lida = lerMensagemDaPrevia({
      tipo: MENSAGEM_DA_APARENCIA,
      aparencia: { tema: "oceano", cantos: "estrela" },
      modo: "escuro",
    });
    expect(lida).toEqual({ aparencia: { ...APARENCIA_PADRAO, tema: "oceano" }, modo: "escuro" });
  });

  it.each([
    ["outro tipo", { tipo: "outra-coisa", aparencia: {}, modo: "claro" }],
    ["modo desconhecido", { tipo: MENSAGEM_DA_APARENCIA, aparencia: {}, modo: "sepia" }],
    ["nada", null],
    ["texto", "barchop"],
  ])("recusa %s", (_, dados) => {
    expect(lerMensagemDaPrevia(dados)).toBeNull();
  });
});

describe("deveAceitar", () => {
  const pai = {} as Window;

  it("só da janela-mãe e da origem do painel", () => {
    expect(deveAceitar({ origin: "https://painel.barchop.com.br", source: pai }, "https://painel.barchop.com.br", pai)).toBe(true);
    expect(deveAceitar({ origin: "https://outro.com", source: pai }, "https://painel.barchop.com.br", pai)).toBe(false);
    expect(deveAceitar({ origin: "https://painel.barchop.com.br", source: {} as Window }, "https://painel.barchop.com.br", pai)).toBe(false);
  });
});

describe("aplicarPrevia", () => {
  beforeEach(() => {
    document.head.innerHTML = "";
    document.body.innerHTML = '<style id="aparencia-publicada">:root{--cor-accent:#0369A1;}</style>';
    document.documentElement.removeAttribute("data-theme");
  });

  it("põe o CSS do rascunho, desliga o publicado e fixa o modo", () => {
    aplicarPrevia(document, { aparencia: { ...APARENCIA_PADRAO, tema: "menta" }, modo: "escuro" });

    const previa = document.getElementById("aparencia-previa")!;
    expect(previa.textContent).toContain("--cor-accent:");
    expect(document.getElementById("aparencia-publicada")).toHaveAttribute("media", "not all");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("o rascunho no padrão volta pros tokens da casa (sem o publicado por cima)", () => {
    aplicarPrevia(document, { aparencia: APARENCIA_PADRAO, modo: "claro" });

    expect(document.getElementById("aparencia-previa")!.textContent).toBe("");
    expect(document.getElementById("aparencia-publicada")).toHaveAttribute("media", "not all");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("aplicar de novo troca, não empilha", () => {
    aplicarPrevia(document, { aparencia: { ...APARENCIA_PADRAO, tema: "menta" }, modo: "claro" });
    aplicarPrevia(document, { aparencia: { ...APARENCIA_PADRAO, tema: "cobre" }, modo: "claro" });

    expect(document.querySelectorAll("#aparencia-previa")).toHaveLength(1);
  });
});
