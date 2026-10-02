import { beforeEach, describe, expect, it } from "vitest";
import {
  aplicarBarra,
  CHAVE_DA_BARRA,
  gravarBarra,
  lerBarra,
  SCRIPT_DA_BARRA,
} from "../../src/painel/barra";

// Roda o script como o navegador roda: a string solta que vai pro
// <head>, não uma versão importada da lógica. Ver tests/painel/tema.test.ts.
function rodarScriptDaBarra(): void {
  new Function(SCRIPT_DA_BARRA)();
}

describe("estado da barra lateral", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-barra");
  });

  it("sem escolha gravada, lerBarra devolve null", () => {
    expect(lerBarra()).toBeNull();
  });

  it("grava e lê a escolha", () => {
    gravarBarra("recolhida");

    expect(localStorage.getItem(CHAVE_DA_BARRA)).toBe("recolhida");
    expect(lerBarra()).toBe("recolhida");
  });

  it("ignora valor estragado no localStorage", () => {
    localStorage.setItem(CHAVE_DA_BARRA, "banana");

    expect(lerBarra()).toBeNull();
  });

  it("aplicarBarra escreve no <html>, que é quem o CSS lê", () => {
    // O seletor mora no CSS Module como :global(html[data-barra=...]).
    // Numa div do shell, a regra não alcançaria a barra.
    aplicarBarra("recolhida");

    expect(document.documentElement.getAttribute("data-barra")).toBe("recolhida");
  });

  it("aplicarBarra('expandida') limpa o atributo em vez de escrever o valor", () => {
    // Expandida é o padrão do CSS. Deixar data-barra="expandida" no
    // <html> criaria um segundo estado a manter em cada regra.
    aplicarBarra("recolhida");

    aplicarBarra("expandida");

    expect(document.documentElement.hasAttribute("data-barra")).toBe(false);
  });

  describe("o script inline", () => {
    it("com 'recolhida' gravado, escreve o atributo antes da primeira pintura", () => {
      localStorage.setItem(CHAVE_DA_BARRA, "recolhida");

      rodarScriptDaBarra();

      expect(document.documentElement.getAttribute("data-barra")).toBe("recolhida");
    });

    it("sem nada gravado, não escreve nada — expandida é o padrão", () => {
      rodarScriptDaBarra();

      expect(document.documentElement.hasAttribute("data-barra")).toBe(false);
    });

    it("com valor estragado gravado, não escreve o lixo no <html>", () => {
      localStorage.setItem(CHAVE_DA_BARRA, "banana");

      rodarScriptDaBarra();

      expect(document.documentElement.hasAttribute("data-barra")).toBe(false);
    });
  });
});
