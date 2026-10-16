import { describe, expect, it } from "vitest";
import { MOTIVOS_DA_PARTE, acertoDoDia, dividirPagamento, type RegrasDeDivisao } from "../src/caixa";

// A conta do caixa (Onda 2, marco 2, plano `caixa-do-dia`): cada
// pagamento se divide entre quem atendeu, o profissional de quem o
// cliente é e a casa; o acerto do dia diz quanto cada um recebeu, quanto
// lhe cabe e quem repassa quanto a quem. Tudo em centavos inteiros.

const GUSTAVO = "gustavo";
const PARCEIRO = "parceiro";
const ANA = "ana";

// A regra da GR Barber (PRD da Onda 2): cliente do dono atendido pelo
// parceiro → 60% do dono; cliente do parceiro atendido pelo dono → nada
// pro parceiro; cada um com o próprio cliente fica com tudo.
const REGRAS_DA_GR: RegrasDeDivisao = {
  ativos: [GUSTAVO, PARCEIRO],
  parteDaCasa: {},
  matriz: [
    { donoDoCliente: GUSTAVO, atendente: PARCEIRO, percentual: 60 },
    { donoDoCliente: PARCEIRO, atendente: GUSTAVO, percentual: 0 },
  ],
};

function atendimento(parcial: {
  atendente: string;
  donoDoCliente: string | null;
  servicos?: number;
  desconto?: number;
  gorjeta?: number;
}) {
  return {
    atendente: parcial.atendente,
    donoDoCliente: parcial.donoDoCliente,
    servicosCentavos: parcial.servicos ?? 5000,
    descontoCentavos: parcial.desconto ?? 0,
    gorjetaCentavos: parcial.gorjeta ?? 0,
  };
}

function soma(partes: readonly { valorCentavos: number }[]): number {
  return partes.reduce((total, parte) => total + parte.valorCentavos, 0);
}

describe("MOTIVOS_DA_PARTE", () => {
  it("lista fechada, nesta ordem (vira CHECK no banco)", () => {
    expect(MOTIVOS_DA_PARTE).toEqual(["atendimento", "cliente", "casa", "gorjeta"]);
  });
});

describe("dividirPagamento — os quatro casos da GR Barber", () => {
  it("cliente do dono atendido pelo dono: 100% do dono", () => {
    expect(dividirPagamento(atendimento({ atendente: GUSTAVO, donoDoCliente: GUSTAVO }), REGRAS_DA_GR)).toEqual([
      { beneficiario: GUSTAVO, motivo: "atendimento", valorCentavos: 5000 },
    ]);
  });

  it("cliente do parceiro atendido pelo parceiro: 100% do parceiro", () => {
    expect(dividirPagamento(atendimento({ atendente: PARCEIRO, donoDoCliente: PARCEIRO }), REGRAS_DA_GR)).toEqual([
      { beneficiario: PARCEIRO, motivo: "atendimento", valorCentavos: 5000 },
    ]);
  });

  it("cliente do dono atendido pelo parceiro: 60% dono, 40% parceiro", () => {
    expect(dividirPagamento(atendimento({ atendente: PARCEIRO, donoDoCliente: GUSTAVO }), REGRAS_DA_GR)).toEqual([
      { beneficiario: PARCEIRO, motivo: "atendimento", valorCentavos: 2000 },
      { beneficiario: GUSTAVO, motivo: "cliente", valorCentavos: 3000 },
    ]);
  });

  it("cliente do parceiro atendido pelo dono: 100% do dono", () => {
    expect(dividirPagamento(atendimento({ atendente: GUSTAVO, donoDoCliente: PARCEIRO }), REGRAS_DA_GR)).toEqual([
      { beneficiario: GUSTAVO, motivo: "atendimento", valorCentavos: 5000 },
    ]);
  });
});

describe("dividirPagamento — o resto da conta", () => {
  it("par sem regra na matriz = 0%: quem atendeu fica com tudo", () => {
    const regras: RegrasDeDivisao = { ativos: [ANA, GUSTAVO], parteDaCasa: {}, matriz: [] };
    expect(dividirPagamento(atendimento({ atendente: ANA, donoDoCliente: GUSTAVO }), regras)).toEqual([
      { beneficiario: ANA, motivo: "atendimento", valorCentavos: 5000 },
    ]);
  });

  it("cliente sem dono: quem atendeu fica com tudo", () => {
    expect(dividirPagamento(atendimento({ atendente: PARCEIRO, donoDoCliente: null }), REGRAS_DA_GR)).toEqual([
      { beneficiario: PARCEIRO, motivo: "atendimento", valorCentavos: 5000 },
    ]);
  });

  it("dono do cliente inativo: sem divisão, quem atendeu fica com tudo", () => {
    const regras = { ...REGRAS_DA_GR, ativos: [PARCEIRO] };
    expect(dividirPagamento(atendimento({ atendente: PARCEIRO, donoDoCliente: GUSTAVO }), regras)).toEqual([
      { beneficiario: PARCEIRO, motivo: "atendimento", valorCentavos: 5000 },
    ]);
  });

  it("a parte da casa sai primeiro; a matriz divide o que sobra", () => {
    const regras: RegrasDeDivisao = { ...REGRAS_DA_GR, parteDaCasa: { [PARCEIRO]: 50 } };
    // base 5000 → casa 2500 → resto 2500 → dono do cliente 60% = 1500, parceiro 1000
    expect(dividirPagamento(atendimento({ atendente: PARCEIRO, donoDoCliente: GUSTAVO }), regras)).toEqual([
      { beneficiario: PARCEIRO, motivo: "atendimento", valorCentavos: 1000 },
      { beneficiario: GUSTAVO, motivo: "cliente", valorCentavos: 1500 },
      { beneficiario: null, motivo: "casa", valorCentavos: 2500 },
    ]);
  });

  it("a parte da casa é de quem atendeu, não do dono do cliente", () => {
    const regras: RegrasDeDivisao = { ...REGRAS_DA_GR, parteDaCasa: { [GUSTAVO]: 40 } };
    expect(dividirPagamento(atendimento({ atendente: PARCEIRO, donoDoCliente: PARCEIRO }), regras)).toEqual([
      { beneficiario: PARCEIRO, motivo: "atendimento", valorCentavos: 5000 },
    ]);
  });

  it("o desconto reduz a base antes da divisão", () => {
    // 5000 − 1000 = 4000 → dono 60% = 2400, parceiro 1600
    expect(
      dividirPagamento(atendimento({ atendente: PARCEIRO, donoDoCliente: GUSTAVO, desconto: 1000 }), REGRAS_DA_GR)
    ).toEqual([
      { beneficiario: PARCEIRO, motivo: "atendimento", valorCentavos: 1600 },
      { beneficiario: GUSTAVO, motivo: "cliente", valorCentavos: 2400 },
    ]);
  });

  it("a gorjeta vai inteira pra quem atendeu, fora da divisão e da casa", () => {
    const regras: RegrasDeDivisao = { ...REGRAS_DA_GR, parteDaCasa: { [PARCEIRO]: 50 } };
    const partes = dividirPagamento(
      atendimento({ atendente: PARCEIRO, donoDoCliente: GUSTAVO, gorjeta: 700 }),
      regras
    );
    expect(partes).toContainEqual({ beneficiario: PARCEIRO, motivo: "gorjeta", valorCentavos: 700 });
    expect(partes).toContainEqual({ beneficiario: null, motivo: "casa", valorCentavos: 2500 });
  });

  it("desconto do valor inteiro com gorjeta: só a gorjeta", () => {
    expect(
      dividirPagamento(
        atendimento({ atendente: PARCEIRO, donoDoCliente: GUSTAVO, desconto: 5000, gorjeta: 300 }),
        REGRAS_DA_GR
      )
    ).toEqual([{ beneficiario: PARCEIRO, motivo: "gorjeta", valorCentavos: 300 }]);
  });

  it("partes de zero centavo não aparecem", () => {
    const regras: RegrasDeDivisao = { ...REGRAS_DA_GR, parteDaCasa: { [GUSTAVO]: 100 } };
    expect(dividirPagamento(atendimento({ atendente: GUSTAVO, donoDoCliente: GUSTAVO }), regras)).toEqual([
      { beneficiario: null, motivo: "casa", valorCentavos: 5000 },
    ]);
  });

  it("centavo quebrado: cada parte arredonda pra baixo e a sobra fica com quem atendeu", () => {
    const regras: RegrasDeDivisao = {
      ativos: [GUSTAVO, PARCEIRO],
      parteDaCasa: { [PARCEIRO]: 33 },
      matriz: [{ donoDoCliente: GUSTAVO, atendente: PARCEIRO, percentual: 33 }],
    };
    // base 3333 → casa floor(1099,89) = 1099 → resto 2234 → dono floor(737,22) = 737 → parceiro 1497
    const partes = dividirPagamento(atendimento({ atendente: PARCEIRO, donoDoCliente: GUSTAVO, servicos: 3333 }), regras);
    expect(partes).toEqual([
      { beneficiario: PARCEIRO, motivo: "atendimento", valorCentavos: 1497 },
      { beneficiario: GUSTAVO, motivo: "cliente", valorCentavos: 737 },
      { beneficiario: null, motivo: "casa", valorCentavos: 1099 },
    ]);
  });

  it("a soma das partes é sempre o valor pago (serviços − desconto + gorjeta)", () => {
    const regras: RegrasDeDivisao = {
      ativos: [GUSTAVO, PARCEIRO],
      parteDaCasa: { [PARCEIRO]: 17 },
      matriz: [{ donoDoCliente: GUSTAVO, atendente: PARCEIRO, percentual: 61 }],
    };
    for (const servicos of [1, 7, 99, 101, 2999, 4490, 12345]) {
      for (const desconto of [0, 1, Math.floor(servicos / 3)]) {
        const partes = dividirPagamento(
          atendimento({ atendente: PARCEIRO, donoDoCliente: GUSTAVO, servicos, desconto, gorjeta: 13 }),
          regras
        );
        expect(soma(partes)).toBe(servicos - desconto + 13);
      }
    }
  });

  it("recusa valor negativo, quebrado ou desconto maior que os serviços", () => {
    expect(() => dividirPagamento(atendimento({ atendente: GUSTAVO, donoDoCliente: null, servicos: -1 }), REGRAS_DA_GR)).toThrow(RangeError);
    expect(() => dividirPagamento(atendimento({ atendente: GUSTAVO, donoDoCliente: null, servicos: 10.5 }), REGRAS_DA_GR)).toThrow(RangeError);
    expect(() => dividirPagamento(atendimento({ atendente: GUSTAVO, donoDoCliente: null, gorjeta: -5 }), REGRAS_DA_GR)).toThrow(RangeError);
    expect(() =>
      dividirPagamento(atendimento({ atendente: GUSTAVO, donoDoCliente: null, servicos: 100, desconto: 101 }), REGRAS_DA_GR)
    ).toThrow(RangeError);
  });

  it("recusa percentual fora de 0 a 100", () => {
    const casaDemais: RegrasDeDivisao = { ...REGRAS_DA_GR, parteDaCasa: { [GUSTAVO]: 101 } };
    expect(() => dividirPagamento(atendimento({ atendente: GUSTAVO, donoDoCliente: null }), casaDemais)).toThrow(RangeError);
    const matrizNegativa: RegrasDeDivisao = {
      ...REGRAS_DA_GR,
      matriz: [{ donoDoCliente: GUSTAVO, atendente: PARCEIRO, percentual: -1 }],
    };
    expect(() => dividirPagamento(atendimento({ atendente: PARCEIRO, donoDoCliente: GUSTAVO }), matrizNegativa)).toThrow(
      RangeError
    );
  });
});

describe("acertoDoDia", () => {
  it("dia vazio: ninguém no acerto, nenhum repasse", () => {
    expect(acertoDoDia([])).toEqual({ pessoas: [], repasses: [] });
  });

  it("quem recebeu o que é todo seu não deve nada", () => {
    const partes = dividirPagamento(atendimento({ atendente: GUSTAVO, donoDoCliente: GUSTAVO }), REGRAS_DA_GR);
    expect(acertoDoDia([{ recebidoPor: GUSTAVO, partes }])).toEqual({
      pessoas: [{ pessoa: GUSTAVO, recebeuCentavos: 5000, cabeCentavos: 5000, saldoCentavos: 0 }],
      repasses: [],
    });
  });

  it("um dia da GR: o parceiro repassa ao dono a parte dos clientes dele", () => {
    const pagamentos = [
      // parceiro atende cliente do dono e recebe: deve 3000 ao dono
      {
        recebidoPor: PARCEIRO,
        partes: dividirPagamento(atendimento({ atendente: PARCEIRO, donoDoCliente: GUSTAVO }), REGRAS_DA_GR),
      },
      // dono atende o próprio cliente e recebe
      {
        recebidoPor: GUSTAVO,
        partes: dividirPagamento(atendimento({ atendente: GUSTAVO, donoDoCliente: GUSTAVO, servicos: 4000 }), REGRAS_DA_GR),
      },
      // parceiro atende o próprio cliente, mas pagou na maquininha do dono: dono deve 2500 ao parceiro
      {
        recebidoPor: GUSTAVO,
        partes: dividirPagamento(atendimento({ atendente: PARCEIRO, donoDoCliente: PARCEIRO, servicos: 2500 }), REGRAS_DA_GR),
      },
    ];
    expect(acertoDoDia(pagamentos)).toEqual({
      pessoas: [
        { pessoa: PARCEIRO, recebeuCentavos: 5000, cabeCentavos: 4500, saldoCentavos: -500 },
        { pessoa: GUSTAVO, recebeuCentavos: 6500, cabeCentavos: 7000, saldoCentavos: 500 },
      ],
      // 3000 de um lado, 2500 do outro: compensa e sobra um repasse só
      repasses: [{ de: PARCEIRO, para: GUSTAVO, valorCentavos: 500 }],
    });
  });

  it("a casa entra no acerto: nunca recebe na mão, só tem a receber", () => {
    const regras: RegrasDeDivisao = { ativos: [ANA], parteDaCasa: { [ANA]: 40 }, matriz: [] };
    const partes = dividirPagamento(atendimento({ atendente: ANA, donoDoCliente: ANA, servicos: 10000 }), regras);
    expect(acertoDoDia([{ recebidoPor: ANA, partes }])).toEqual({
      pessoas: [
        { pessoa: ANA, recebeuCentavos: 10000, cabeCentavos: 6000, saldoCentavos: -4000 },
        { pessoa: null, recebeuCentavos: 0, cabeCentavos: 4000, saldoCentavos: 4000 },
      ],
      repasses: [{ de: ANA, para: null, valorCentavos: 4000 }],
    });
  });

  it("dívidas que se anulam não viram repasse", () => {
    const pagamentos = [
      {
        recebidoPor: GUSTAVO,
        partes: [{ beneficiario: PARCEIRO, motivo: "atendimento" as const, valorCentavos: 1000 }],
      },
      {
        recebidoPor: PARCEIRO,
        partes: [{ beneficiario: GUSTAVO, motivo: "atendimento" as const, valorCentavos: 1000 }],
      },
    ];
    expect(acertoDoDia(pagamentos).repasses).toEqual([]);
  });

  it("os saldos somam zero e os repasses fecham os saldos de cada um", () => {
    const regras: RegrasDeDivisao = {
      ativos: [GUSTAVO, PARCEIRO, ANA],
      parteDaCasa: { [ANA]: 30 },
      matriz: [
        { donoDoCliente: GUSTAVO, atendente: PARCEIRO, percentual: 60 },
        { donoDoCliente: GUSTAVO, atendente: ANA, percentual: 50 },
      ],
    };
    const pagamentos = [
      { recebidoPor: ANA, partes: dividirPagamento(atendimento({ atendente: ANA, donoDoCliente: GUSTAVO, gorjeta: 200 }), regras) },
      { recebidoPor: GUSTAVO, partes: dividirPagamento(atendimento({ atendente: ANA, donoDoCliente: ANA, servicos: 3000 }), regras) },
      { recebidoPor: PARCEIRO, partes: dividirPagamento(atendimento({ atendente: PARCEIRO, donoDoCliente: GUSTAVO }), regras) },
    ];
    const { pessoas, repasses } = acertoDoDia(pagamentos);
    expect(soma(pessoas.map((p) => ({ valorCentavos: p.saldoCentavos })))).toBe(0);
    for (const linha of pessoas) {
      const entra = repasses.filter((r) => r.para === linha.pessoa).reduce((t, r) => t + r.valorCentavos, 0);
      const sai = repasses.filter((r) => r.de === linha.pessoa).reduce((t, r) => t + r.valorCentavos, 0);
      expect(entra - sai).toBe(linha.saldoCentavos);
    }
  });
});
