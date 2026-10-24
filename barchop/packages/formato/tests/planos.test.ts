import { describe, expect, it } from "vitest";
import {
  CICLOS,
  DIAS_DE_TESTE,
  IDS_DOS_PLANOS,
  PLANOS,
  RECURSOS,
  SITUACOES_DA_ASSINATURA,
  limiteDeProfissionais,
  planoEfetivo,
  precoDoPlano,
  precosDoCiclo,
  formatarReais,
  temRecurso,
} from "../src/planos";

// Os planos do BarChop (Onda 2, marco 1): preços em centavos, limite de
// profissionais e recursos num lugar só (ADR-0007). O site, o painel, a
// API e o script dos preços na Stripe leem daqui; os números dos testes
// são os do PRD e da pesquisa de preços de 12/10.

describe("listas fechadas", () => {
  it("planos, ciclos e situações, nesta ordem", () => {
    expect(IDS_DOS_PLANOS).toEqual(["gratis", "essencial", "completo"]);
    expect(CICLOS).toEqual(["mensal", "anual"]);
    expect(SITUACOES_DA_ASSINATURA).toEqual(["teste", "ativa", "em_atraso", "cancelada", "gratis"]);
  });

  it("o teste dura 14 dias", () => {
    expect(DIAS_DE_TESTE).toBe(14);
  });

  it("cada plano tem nome e o id da própria chave", () => {
    expect(PLANOS.gratis.nome).toBe("Grátis");
    expect(PLANOS.essencial.nome).toBe("Essencial");
    expect(PLANOS.completo.nome).toBe("Completo");
    for (const id of IDS_DOS_PLANOS) expect(PLANOS[id].id).toBe(id);
  });
});

describe("precoDoPlano", () => {
  it("mensal: base com 1 profissional, mais o extra por profissional a mais", () => {
    expect(precoDoPlano("essencial", "mensal", 1)).toBe(4490);
    expect(precoDoPlano("essencial", "mensal", 2)).toBe(5990);
    expect(precoDoPlano("essencial", "mensal", 3)).toBe(7490);
    expect(precoDoPlano("completo", "mensal", 1)).toBe(5490);
    expect(precoDoPlano("completo", "mensal", 2)).toBe(7490);
    expect(precoDoPlano("completo", "mensal", 4)).toBe(11490);
  });

  it("anual: 2 meses grátis, na base e no extra", () => {
    expect(precoDoPlano("essencial", "anual", 1)).toBe(44900);
    expect(precoDoPlano("completo", "anual", 1)).toBe(54900);
    expect(precoDoPlano("essencial", "anual", 2)).toBe(59900);
    expect(precoDoPlano("completo", "anual", 2)).toBe(74900);
  });

  it("o Grátis não custa nada", () => {
    expect(precoDoPlano("gratis", "mensal", 1)).toBe(0);
    expect(precoDoPlano("gratis", "anual", 1)).toBe(0);
  });

  it("o Completo não tem limite de profissionais", () => {
    expect(precoDoPlano("completo", "mensal", 20)).toBe(5490 + 19 * 2000);
  });

  it("recusa quantidade acima do limite do plano", () => {
    expect(() => precoDoPlano("gratis", "mensal", 2)).toThrow(RangeError);
    expect(() => precoDoPlano("essencial", "mensal", 4)).toThrow(RangeError);
  });

  it("recusa quantidade que não é um inteiro a partir de 1", () => {
    expect(() => precoDoPlano("completo", "mensal", 0)).toThrow(RangeError);
    expect(() => precoDoPlano("completo", "mensal", -1)).toThrow(RangeError);
    expect(() => precoDoPlano("completo", "mensal", 1.5)).toThrow(RangeError);
  });
});

describe("precosDoCiclo", () => {
  // Os degraus do preço graduado na Stripe: a 1ª unidade custa a base,
  // as demais o extra.
  it("base e extra de cada ciclo", () => {
    expect(precosDoCiclo("essencial", "mensal")).toEqual({ base: 4490, extra: 1500 });
    expect(precosDoCiclo("essencial", "anual")).toEqual({ base: 44900, extra: 15000 });
    expect(precosDoCiclo("completo", "mensal")).toEqual({ base: 5490, extra: 2000 });
    expect(precosDoCiclo("completo", "anual")).toEqual({ base: 54900, extra: 20000 });
  });
});

describe("limiteDeProfissionais", () => {
  it("Grátis 1, Essencial 3, Completo sem limite (null)", () => {
    expect(limiteDeProfissionais("gratis")).toBe(1);
    expect(limiteDeProfissionais("essencial")).toBe(3);
    expect(limiteDeProfissionais("completo")).toBeNull();
  });
});

describe("recursos", () => {
  it("a lista dos recursos que separam os planos", () => {
    expect(RECURSOS).toEqual(["caixa", "relatorios", "relatoriosCompletos", "whatsapp", "planosDaBarbearia"]);
  });

  it("o Grátis não tem nenhum", () => {
    for (const recurso of RECURSOS) expect(temRecurso("gratis", recurso)).toBe(false);
  });

  it("o Essencial tem o caixa e os relatórios básicos", () => {
    expect(temRecurso("essencial", "caixa")).toBe(true);
    expect(temRecurso("essencial", "relatorios")).toBe(true);
    expect(temRecurso("essencial", "relatoriosCompletos")).toBe(false);
    expect(temRecurso("essencial", "whatsapp")).toBe(false);
    expect(temRecurso("essencial", "planosDaBarbearia")).toBe(false);
  });

  it("o Completo tem todos", () => {
    for (const recurso of RECURSOS) expect(temRecurso("completo", recurso)).toBe(true);
  });
});

describe("planoEfetivo", () => {
  const AGORA = new Date("2026-11-01T12:00:00Z");
  const DEPOIS = new Date("2026-11-02T12:00:00Z");
  const ANTES = new Date("2026-10-31T12:00:00Z");

  it("teste vigente libera o Completo, seja qual for o plano escolhido", () => {
    expect(planoEfetivo({ situacao: "teste", plano: "gratis", testeTerminaEm: DEPOIS }, AGORA)).toBe("completo");
    expect(planoEfetivo({ situacao: "teste", plano: "essencial", testeTerminaEm: DEPOIS }, AGORA)).toBe(
      "completo"
    );
  });

  it("teste vencido cai no Grátis; o instante do fim já conta como vencido", () => {
    expect(planoEfetivo({ situacao: "teste", plano: "completo", testeTerminaEm: ANTES }, AGORA)).toBe("gratis");
    expect(planoEfetivo({ situacao: "teste", plano: "completo", testeTerminaEm: AGORA }, AGORA)).toBe("gratis");
  });

  it("teste sem data de fim cai no Grátis", () => {
    expect(planoEfetivo({ situacao: "teste", plano: "completo", testeTerminaEm: null }, AGORA)).toBe("gratis");
  });

  it("ativa ou em atraso vale o plano contratado", () => {
    expect(planoEfetivo({ situacao: "ativa", plano: "essencial", testeTerminaEm: null }, AGORA)).toBe("essencial");
    expect(planoEfetivo({ situacao: "em_atraso", plano: "completo", testeTerminaEm: null }, AGORA)).toBe(
      "completo"
    );
  });

  it("cancelada ou no Grátis vale o Grátis", () => {
    expect(planoEfetivo({ situacao: "cancelada", plano: "completo", testeTerminaEm: null }, AGORA)).toBe("gratis");
    expect(planoEfetivo({ situacao: "gratis", plano: "essencial", testeTerminaEm: null }, AGORA)).toBe("gratis");
  });

  it("no teste, o limite de profissionais é o do Completo (sem limite)", () => {
    const plano = planoEfetivo({ situacao: "teste", plano: "gratis", testeTerminaEm: DEPOIS }, AGORA);
    expect(limiteDeProfissionais(plano)).toBeNull();
  });
});

describe("formatarReais", () => {
  it("escreve os centavos em reais, como o brasileiro lê", () => {
    // O Intl separa o "R$" com espaço inquebrável.
    expect(formatarReais(3490)).toBe("R$\u00a034,90");
    expect(formatarReais(44900)).toBe("R$\u00a0449,00");
    expect(formatarReais(123456)).toBe("R$\u00a01.234,56");
    expect(formatarReais(0)).toBe("R$\u00a00,00");
  });
});
