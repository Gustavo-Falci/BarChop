import { describe, expect, it } from "vitest";
import { PADRAO_SLUG, slugReservado, sugerirSlug } from "../src/index";

// O cadastro do dono preenche o link a partir do nome da barbearia, até
// o dono mexer nele. A sugestão sai no formato que a API aceita.
describe("sugerirSlug", () => {
  it("minúsculas, sem acento, hífen no lugar dos espaços", () => {
    expect(sugerirSlug("Barbearia do Zé")).toBe("barbearia-do-ze");
    expect(sugerirSlug("Cortes & Navalha São João")).toBe("cortes-navalha-sao-joao");
  });

  it("junta separadores repetidos e apara as pontas", () => {
    expect(sugerirSlug("  GR -- Barber!  ")).toBe("gr-barber");
  });

  it("corta em 80 sem deixar hífen no fim", () => {
    const sugestao = sugerirSlug(`${"a".repeat(79)} b`);
    expect(sugestao).toBe("a".repeat(79));
    expect(sugestao.length).toBeLessThanOrEqual(80);
  });

  it("nome sem nada aproveitável vira vazio", () => {
    expect(sugerirSlug("!!!")).toBe("");
    expect(sugerirSlug("")).toBe("");
  });
});

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

  it("reserva as rotas da página da barbearia", () => {
    // No host da barbearia, `/agendar` é dela; `agendar.barchop.com.br/agendar`
    // não saberia se o caminho já traz o nome ou não (proxy.ts do web).
    for (const slug of ["agendar", "lembrete", "entrar", "minha-conta"]) {
      expect(slugReservado(slug)).toBe(true);
    }
  });

  it("libera o slug de uma barbearia comum", () => {
    expect(slugReservado("gr-barber")).toBe(false);
    expect(slugReservado("barbearia-do-ze")).toBe(false);
  });
});
