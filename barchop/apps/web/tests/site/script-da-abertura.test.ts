import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CHAVE_DA_ABERTURA,
  CLASSE_DA_ABERTURA,
  SCRIPT_DA_ABERTURA,
  TRAVA_DA_ABERTURA,
  VIVA,
} from "../../src/site/abertura/script";

// Home nova, marco 5: a abertura da navalha toca só na primeira visita da
// sessão. Quem decide é um script inline que roda antes da primeira
// pintura (como o SCRIPT_DE_TEMA): ele liga a classe no <html>, grava a
// marca na sessão e solta uma trava, pra página nunca ficar no escuro se
// o JS da abertura não chegar. O teste roda a string, como o navegador.

function rodar() {
  new Function(SCRIPT_DA_ABERTURA)();
}

function ambiente({
  reduzido = false,
  tipo = "navigate",
}: { reduzido?: boolean; tipo?: string } = {}) {
  vi.stubGlobal("matchMedia", (consulta: string) => ({
    matches: reduzido && consulta.includes("reduce"),
  }));
  vi.spyOn(performance, "getEntriesByType").mockReturnValue([{ type: tipo }] as unknown as PerformanceEntryList);
}

const html = () => document.documentElement;

describe("script da abertura", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    sessionStorage.clear();
    html().className = "";
    html().removeAttribute(VIVA);
    history.replaceState(null, "", "/");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("na primeira visita da sessão, liga a abertura e grava que já viu", () => {
    ambiente();
    rodar();

    expect(html().classList.contains(CLASSE_DA_ABERTURA)).toBe(true);
    expect(sessionStorage.getItem(CHAVE_DA_ABERTURA)).not.toBeNull();
  });

  it("quem já viu nesta sessão (F5, voltar à home) não vê de novo", () => {
    ambiente();
    sessionStorage.setItem(CHAVE_DA_ABERTURA, "1");
    rodar();

    expect(html().classList.contains(CLASSE_DA_ABERTURA)).toBe(false);
  });

  it("com \"reduzir movimento\", nunca toca", () => {
    ambiente({ reduzido: true });
    rodar();

    expect(html().classList.contains(CLASSE_DA_ABERTURA)).toBe(false);
    expect(sessionStorage.getItem(CHAVE_DA_ABERTURA)).toBeNull();
  });

  it("com âncora no endereço (#planos), vai direto pra seção", () => {
    ambiente();
    history.replaceState(null, "", "/#planos");
    rodar();

    expect(html().classList.contains(CLASSE_DA_ABERTURA)).toBe(false);
  });

  it("no voltar do navegador, não toca", () => {
    ambiente({ tipo: "back_forward" });
    rodar();

    expect(html().classList.contains(CLASSE_DA_ABERTURA)).toBe(false);
  });

  it("navegador que recusa o sessionStorage fica sem abertura, sem erro", () => {
    ambiente();
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });

    expect(rodar).not.toThrow();
    expect(html().classList.contains(CLASSE_DA_ABERTURA)).toBe(false);
  });

  it("se o JS da abertura não começar a tempo, a trava devolve a home de sempre", () => {
    ambiente();
    rodar();

    vi.advanceTimersByTime(TRAVA_DA_ABERTURA);

    expect(html().classList.contains(CLASSE_DA_ABERTURA)).toBe(false);
  });

  it("com a abertura já tocando, a trava não corta no meio", () => {
    ambiente();
    rodar();
    html().setAttribute(VIVA, "");

    vi.advanceTimersByTime(TRAVA_DA_ABERTURA);

    expect(html().classList.contains(CLASSE_DA_ABERTURA)).toBe(true);
  });
});
