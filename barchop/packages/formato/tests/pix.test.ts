import { describe, expect, it } from "vitest";
import {
  brCodeDoPix,
  chaveMascarada,
  crc16DoPix,
  fimDoPeriodoDoPix,
  inicioDoDiaEmSaoPaulo,
  planoEfetivo,
} from "../src";

// O Pix do BarChop (plano pix-do-barchop, PR 1): o BR Code estático com
// o valor exato, gerado pelo BarChop na chave do BarChop, e o período
// que um Pix paga.

describe("crc16DoPix", () => {
  it("é o CRC-16/CCITT-FALSE (polinômio 0x1021, início 0xFFFF)", () => {
    // O valor de conferência do catálogo de CRCs.
    expect(crc16DoPix("123456789")).toBe("29B1");
  });

  it("bate com o exemplo do Manual de Padrões para Iniciação do Pix (item 2.6.3)", () => {
    // Copiado do manual do Bacen (II_ManualdePadroesparaIniciacaodoPix.pdf),
    // sem os 4 últimos caracteres, que são o próprio CRC.
    const exemplo =
      "00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-426655440000" +
      "5204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***6304";
    expect(crc16DoPix(exemplo)).toBe("1D3D");
  });
});

describe("brCodeDoPix", () => {
  const BASE = {
    chave: "123e4567-e12b-12d1-a456-426655440000",
    nome: "Fulano de Tal",
    cidade: "BRASILIA",
    valorCentavos: 4490,
    identificador: "K7Q2MX",
  };

  it("monta o BR Code estático com valor, na ordem do manual", () => {
    const codigo = brCodeDoPix(BASE);
    expect(codigo).toBe(
      "000201" +
        "26580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-426655440000" +
        "52040000" +
        "5303986" +
        "540544.90" +
        "5802BR" +
        "5913Fulano de Tal" +
        "6008BRASILIA" +
        "62100506K7Q2MX" +
        "6304" +
        crc16DoPix(codigo.slice(0, -4))
    );
  });

  it("sem identificador, usa *** como o manual pede", () => {
    const sem = brCodeDoPix({ ...BASE, valorCentavos: null, identificador: null });
    expect(sem).toBe(
      "00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-426655440000" +
        "5204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***63041D3D"
    );
  });

  it("tira acentos e corta nome em 25 e cidade em 15", () => {
    const codigo = brCodeDoPix({
      ...BASE,
      nome: "BarChop Tecnologia e Serviços Ltda",
      cidade: "São José dos Campos",
    });
    expect(codigo).toContain("5925BarChop Tecnologia e Serv");
    expect(codigo).toContain("6015Sao Jose dos Ca");
  });

  it("valor com centavos sempre em duas casas", () => {
    expect(brCodeDoPix({ ...BASE, valorCentavos: 100 })).toContain("54041.00");
    expect(brCodeDoPix({ ...BASE, valorCentavos: 44900 })).toContain("5406449.00");
  });

  it("recusa identificador fora de [A-Za-z0-9] ou maior que 25", () => {
    expect(() => brCodeDoPix({ ...BASE, identificador: "AB-12" })).toThrow(RangeError);
    expect(() => brCodeDoPix({ ...BASE, identificador: "A".repeat(26) })).toThrow(RangeError);
  });
});

describe("chaveMascarada", () => {
  it("e-mail mostra a primeira letra e o domínio", () => {
    expect(chaveMascarada("financeiro@barchop.com.br")).toBe("f•••@barchop.com.br");
  });

  it("o resto mostra só o fim", () => {
    expect(chaveMascarada("12345678000199")).toBe("•••0199");
    expect(chaveMascarada("+5511988887777")).toBe("•••7777");
  });
});

describe("período do Pix", () => {
  it("o dia começa à meia-noite de São Paulo", () => {
    // 22:30 em SP de 09/11 = 01:30 UTC de 10/11.
    expect(inicioDoDiaEmSaoPaulo(new Date("2026-11-10T01:30:00Z")).toISOString()).toBe("2026-11-09T03:00:00.000Z");
    expect(inicioDoDiaEmSaoPaulo(new Date("2026-11-10T03:00:00Z")).toISOString()).toBe("2026-11-10T03:00:00.000Z");
  });

  it("mensal soma um mês; anual, doze", () => {
    const inicio = new Date("2026-11-09T03:00:00Z");
    expect(fimDoPeriodoDoPix(inicio, "mensal").toISOString()).toBe("2026-12-09T03:00:00.000Z");
    expect(fimDoPeriodoDoPix(inicio, "anual").toISOString()).toBe("2027-11-09T03:00:00.000Z");
  });

  it("31 de janeiro vira o último dia de fevereiro, sem pular pra março", () => {
    expect(fimDoPeriodoDoPix(new Date("2027-01-31T03:00:00Z"), "mensal").toISOString()).toBe(
      "2027-02-28T03:00:00.000Z"
    );
    expect(fimDoPeriodoDoPix(new Date("2028-01-31T03:00:00Z"), "mensal").toISOString()).toBe(
      "2028-02-29T03:00:00.000Z"
    );
  });

  it("começar no meio do dia (fim do teste) mantém a hora", () => {
    expect(fimDoPeriodoDoPix(new Date("2026-11-15T14:43:00Z"), "mensal").toISOString()).toBe(
      "2026-12-15T14:43:00.000Z"
    );
  });
});

describe("planoEfetivo com Pix", () => {
  const AGORA = new Date("2026-11-01T12:00:00Z");

  it("Pix vale o plano até o fim do período e cai no Grátis no instante do fim", () => {
    const base = { situacao: "ativa", plano: "essencial", testeTerminaEm: null, forma: "pix" } as const;
    expect(planoEfetivo({ ...base, periodoTerminaEm: new Date("2026-11-02T00:00:00Z") }, AGORA)).toBe("essencial");
    expect(planoEfetivo({ ...base, periodoTerminaEm: AGORA }, AGORA)).toBe("gratis");
    expect(planoEfetivo({ ...base, periodoTerminaEm: null }, AGORA)).toBe("gratis");
  });

  it("cartão com período vencido (webhook atrasado) segue no plano", () => {
    expect(
      planoEfetivo(
        {
          situacao: "ativa",
          plano: "completo",
          testeTerminaEm: null,
          forma: "cartao",
          periodoTerminaEm: new Date("2026-10-01T00:00:00Z"),
        },
        AGORA
      )
    ).toBe("completo");
  });
});
