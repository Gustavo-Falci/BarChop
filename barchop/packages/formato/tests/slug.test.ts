import { describe, expect, it } from "vitest";
import { PADRAO_SLUG, slugReservado } from "../src/index";

describe("PADRAO_SLUG", () => {
  const padrao = new RegExp(PADRAO_SLUG);

  it("aceita minúsculas, números e hífen, de 3 a 80", () => {
    expect(padrao.test("gr-barber")).toBe(true);
    expect(padrao.test("abc")).toBe(true);
    expect(padrao.test("a".repeat(80))).toBe(true);
  });

  it("recusa maiúscula, espaço, acento e tamanho fora da faixa", () => {
    expect(padrao.test("GR-Barber")).toBe(false);
    expect(padrao.test("gr barber")).toBe(false);
    expect(padrao.test("barbearia-do-zé")).toBe(false);
    expect(padrao.test("ab")).toBe(false);
    expect(padrao.test("a".repeat(81))).toBe(false);
  });
});

describe("slugReservado", () => {
  it("reserva os subdomínios e rotas do próprio sistema", () => {
    for (const slug of ["www", "admin", "api", "app", "painel", "docs", "blog"]) {
      expect(slugReservado(slug)).toBe(true);
    }
  });

  it("reserva as páginas do site de marketing", () => {
    for (const slug of ["precos", "gratis", "funcionalidades", "comparar", "termos"]) {
      expect(slugReservado(slug)).toBe(true);
    }
  });

  it("libera o slug de uma barbearia comum", () => {
    expect(slugReservado("gr-barber")).toBe(false);
    expect(slugReservado("barbearia-do-ze")).toBe(false);
  });
});
