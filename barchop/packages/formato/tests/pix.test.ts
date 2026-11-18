import { describe, expect, it } from "vitest";
import {
  brCodeDoPix,
  chaveMascarada,
  crc16DoPix,
  fimDoPeriodoDoPix,
  inicioDoDiaEmSaoPaulo,
  planoEfetivo,
  valorDaDiferenca,
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

// Profissional novo no meio do período pago no Pix (plano
// profissional-novo-pago, PR 1): o extra do ciclo pelos dias que faltam,
// contando hoje inteiro, sobre 30 dias (mensal) ou 365 (anual).
describe("valorDaDiferenca", () => {
  // 18/11, 10:00 em SP. O dia começa em 18/11 03:00 UTC.
  const agora = new Date("2026-11-18T13:00:00Z");
  const daqui = (dias: number) => new Date(Date.parse("2026-11-18T03:00:00Z") + dias * 24 * 60 * 60 * 1000);

  it("metade do mês: metade do extra", () => {
    expect(valorDaDiferenca({ plano: "completo", ciclo: "mensal", extras: 1, agora, fim: daqui(15) })).toBe(1000);
    expect(valorDaDiferenca({ plano: "essencial", ciclo: "mensal", extras: 1, agora, fim: daqui(15) })).toBe(750);
  });

  it("o período inteiro: o extra cheio", () => {
    expect(valorDaDiferenca({ plano: "completo", ciclo: "mensal", extras: 1, agora, fim: daqui(30) })).toBe(2000);
  });

  it("cada profissional a mais soma um extra", () => {
    expect(valorDaDiferenca({ plano: "completo", ciclo: "mensal", extras: 2, agora, fim: daqui(15) })).toBe(2000);
  });

  it("hoje conta inteiro, e o centavo arredonda pra cima", () => {
    // Termina hoje às 23:00 em SP: falta 1 dia; 2000 / 30 = 66,67.
    const hojeANoite = new Date("2026-11-19T02:00:00Z");
    expect(valorDaDiferenca({ plano: "completo", ciclo: "mensal", extras: 1, agora, fim: hojeANoite })).toBe(67);
  });

  it("anual: o extra do ano sobre 365 dias", () => {
    // 20000 × 100 / 365 = 5479,45.
    expect(valorDaDiferenca({ plano: "completo", ciclo: "anual", extras: 1, agora, fim: daqui(100) })).toBe(5480);
  });

  it("fim no meio do dia (o do teste) conta o dia", () => {
    const meioDoDia = new Date(daqui(2).getTime() + 11 * 60 * 60 * 1000);
    expect(valorDaDiferenca({ plano: "completo", ciclo: "mensal", extras: 1, agora, fim: meioDoDia })).toBe(200);
  });

  it("período já acabado não cobra nada", () => {
    expect(valorDaDiferenca({ plano: "completo", ciclo: "mensal", extras: 1, agora, fim: daqui(0) })).toBe(0);
  });

  it("extras precisa ser um inteiro a partir de 1", () => {
    expect(() => valorDaDiferenca({ plano: "completo", ciclo: "mensal", extras: 0, agora, fim: daqui(15) })).toThrow(
      RangeError
    );
    expect(() => valorDaDiferenca({ plano: "completo", ciclo: "mensal", extras: 1.5, agora, fim: daqui(15) })).toThrow(
      RangeError
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
