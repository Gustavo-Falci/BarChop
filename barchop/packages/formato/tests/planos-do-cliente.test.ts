import { describe, expect, it } from "vitest";
import { MOTIVOS_DO_PLANO, acertoDoDia, dividirPagamento } from "../src/caixa";
import {
  CICLOS_DO_CLIENTE,
  DIAS_PARA_CANCELAR,
  FORMAS_DA_ASSINATURA,
  FORMAS_DA_MENSALIDADE,
  FORMAS_DO_CAIXA,
  MAX_DIAS_DE_TESTE_DO_CLIENTE,
  MEIOS_DO_ONLINE,
  MODOS_DA_CONEXAO,
  PROVEDORES_DE_PAGAMENTO,
  SITUACOES_DO_ASSINANTE,
  SITUACOES_DO_LINK,
  assinanteUsaOPlano,
  cicloEmAtraso,
  cicloPagoOnline,
  dividirMensalidade,
  fimDoCiclo,
  parteDoPlano,
  preverPeloPlano,
  problemaDoPlano,
  problemaDoRecebimento,
  usosRestantes,
  type AssinaturaParaPrever,
  type HorarioParaPrever,
  type PlanoParaConferir,
} from "../src/planos-do-cliente";

// Os planos que a barbearia e os barbeiros vendem ao cliente (Onda 2,
// marco 3, plano `planos-de-assinatura`). Plano de barbeiro: a
// mensalidade é dele, menos a parte da casa; vale só com ele. Plano da
// casa: a mensalidade é da casa, e quem atende ganha um valor fixo.
// Tudo em centavos inteiros.

const GUSTAVO = "gustavo";
const PARCEIRO = "parceiro";

function soma(partes: readonly { valorCentavos: number }[]): number {
  return partes.reduce((total, parte) => total + parte.valorCentavos, 0);
}

describe("listas fechadas", () => {
  it("ciclos, situações e formas, nesta ordem (viram CHECK no banco)", () => {
    expect(CICLOS_DO_CLIENTE).toEqual(["mensal", "trimestral", "anual"]);
    expect(SITUACOES_DO_ASSINANTE).toEqual(["pendente", "teste", "ativa", "em_atraso", "cancelada"]);
    expect(FORMAS_DA_ASSINATURA).toEqual(["online", "no_balcao"]);
  });

  it("provedores e modos da conta conectada (viram CHECK no banco)", () => {
    expect(PROVEDORES_DE_PAGAMENTO).toEqual(["asaas", "stripe", "infinitepay"]);
    expect(MODOS_DA_CONEXAO).toEqual(["teste", "real"]);
  });

  // A InfinitePay (plano pagamentos-online-infinitepay, PR 3): um link
  // por ciclo, e quem vende escolhe em quantos dias de atraso cancela.
  it("o link do ciclo e os dias para cancelar (viram CHECK no banco)", () => {
    expect(SITUACOES_DO_LINK).toEqual(["aberto", "pago", "fechado"]);
    expect(DIAS_PARA_CANCELAR).toEqual({ minimo: 3, maximo: 30, padrao: 10 });
  });

  it("os motivos das partes que só o plano gera", () => {
    expect(MOTIVOS_DO_PLANO).toEqual(["plano", "mensalidade"]);
  });

  it("o caixa aceita as formas da página pública e mais o plano", () => {
    expect(FORMAS_DO_CAIXA).toEqual(["pix", "dinheiro", "debito", "credito", "plano"]);
  });

  it("a mensalidade aceita as formas da página pública e mais o online", () => {
    expect(FORMAS_DA_MENSALIDADE).toEqual(["pix", "dinheiro", "debito", "credito", "online"]);
    expect(MEIOS_DO_ONLINE).toEqual(["pix", "cartao", "boleto", "outra"]);
  });

  it("o teste do plano vai até 30 dias", () => {
    expect(MAX_DIAS_DE_TESTE_DO_CLIENTE).toBe(30);
  });
});

describe("assinanteUsaOPlano", () => {
  it("só ativa e teste usam; em atraso é atendido como avulso", () => {
    expect(SITUACOES_DO_ASSINANTE.filter(assinanteUsaOPlano)).toEqual(["teste", "ativa"]);
  });
});

describe("dividirMensalidade", () => {
  it("plano de barbeiro: a casa leva a parte da casa dele, o resto é dele", () => {
    expect(dividirMensalidade({ precoCentavos: 9000, vendedor: GUSTAVO, parteDaCasa: 20 })).toEqual([
      { beneficiario: GUSTAVO, motivo: "mensalidade", valorCentavos: 7200 },
      { beneficiario: null, motivo: "casa", valorCentavos: 1800 },
    ]);
  });

  it("plano de barbeiro sem parte da casa: tudo dele", () => {
    expect(dividirMensalidade({ precoCentavos: 9000, vendedor: GUSTAVO, parteDaCasa: 0 })).toEqual([
      { beneficiario: GUSTAVO, motivo: "mensalidade", valorCentavos: 9000 },
    ]);
  });

  it("plano da casa: tudo da casa, seja qual for a parte informada", () => {
    expect(dividirMensalidade({ precoCentavos: 12000, vendedor: null, parteDaCasa: 20 })).toEqual([
      { beneficiario: null, motivo: "casa", valorCentavos: 12000 },
    ]);
  });

  it("a parte da casa arredonda pra baixo e a soma é o preço", () => {
    const partes = dividirMensalidade({ precoCentavos: 9999, vendedor: GUSTAVO, parteDaCasa: 33 });
    expect(partes).toContainEqual({ beneficiario: null, motivo: "casa", valorCentavos: 3299 });
    expect(soma(partes)).toBe(9999);
  });

  it("recusa preço sem centavos inteiros e percentual fora de 0..100", () => {
    expect(() => dividirMensalidade({ precoCentavos: 90.5, vendedor: GUSTAVO, parteDaCasa: 0 })).toThrow(RangeError);
    expect(() => dividirMensalidade({ precoCentavos: -1, vendedor: GUSTAVO, parteDaCasa: 0 })).toThrow(RangeError);
    expect(() => dividirMensalidade({ precoCentavos: 9000, vendedor: GUSTAVO, parteDaCasa: 101 })).toThrow(RangeError);
  });
});

describe("parteDoPlano", () => {
  it("plano da casa: quem atendeu ganha o fixo", () => {
    expect(parteDoPlano({ atendente: PARCEIRO, fixoCentavos: 2500 })).toEqual([
      { beneficiario: PARCEIRO, motivo: "plano", valorCentavos: 2500 },
    ]);
  });

  it("plano de barbeiro (sem fixo): nada, ele já recebeu a mensalidade", () => {
    expect(parteDoPlano({ atendente: GUSTAVO, fixoCentavos: null })).toEqual([]);
  });

  it("fixo zero não vira parte", () => {
    expect(parteDoPlano({ atendente: PARCEIRO, fixoCentavos: 0 })).toEqual([]);
  });

  it("recusa fixo sem centavos inteiros", () => {
    expect(() => parteDoPlano({ atendente: PARCEIRO, fixoCentavos: 10.5 })).toThrow(RangeError);
  });
});

describe("o acerto do dia com planos — cenários da GR Barber", () => {
  // A mensalidade do plano da casa cai na conta conectada pelo Gustavo:
  // ele segura o dinheiro da casa e repassa. O fixo sai do dinheiro da
  // casa, não do bolso de quem segura: no acerto, quem paga é a casa
  // (`recebidoPor: null`).
  it("mensalidade do plano do Gustavo (20% da casa): ele repassa a parte da casa", () => {
    const acerto = acertoDoDia([
      { recebidoPor: GUSTAVO, partes: dividirMensalidade({ precoCentavos: 9000, vendedor: GUSTAVO, parteDaCasa: 20 }) },
    ]);
    expect(acerto.repasses).toEqual([{ de: GUSTAVO, para: null, valorCentavos: 1800 }]);
  });

  it("plano da casa atendido pelo parceiro: o Gustavo repassa a mensalidade, a casa paga o fixo", () => {
    const acerto = acertoDoDia([
      { recebidoPor: GUSTAVO, partes: dividirMensalidade({ precoCentavos: 12000, vendedor: null, parteDaCasa: 0 }) },
      { recebidoPor: null, partes: parteDoPlano({ atendente: PARCEIRO, fixoCentavos: 2500 }) },
    ]);
    expect(acerto.repasses).toEqual([
      { de: GUSTAVO, para: null, valorCentavos: 12000 },
      { de: null, para: PARCEIRO, valorCentavos: 2500 },
    ]);
    // O Gustavo não perde nada; a casa fica com a mensalidade menos o fixo.
    expect(acerto.pessoas).toContainEqual({ pessoa: GUSTAVO, recebeuCentavos: 12000, cabeCentavos: 0, saldoCentavos: -12000 });
    expect(acerto.pessoas).toContainEqual({ pessoa: null, recebeuCentavos: 2500, cabeCentavos: 12000, saldoCentavos: 9500 });
  });

  it("o fixo só pela casa, num dia sem mensalidade: a casa deve ao parceiro", () => {
    const acerto = acertoDoDia([{ recebidoPor: null, partes: parteDoPlano({ atendente: PARCEIRO, fixoCentavos: 2500 }) }]);
    expect(acerto.repasses).toEqual([{ de: null, para: PARCEIRO, valorCentavos: 2500 }]);
  });

  // O dia do desenho da tela Caixa (24/10): parte da casa de 20% para os
  // dois; o Lucas atende uma assinante do plano da casa e cobra a barba à
  // parte. A casa deve o fixo ao Lucas e o Lucas deve à casa a parte da
  // barba: compensado, a casa repassa só a diferença.
  it("o dia da tela Caixa: os repasses compensam casa e Lucas", () => {
    const LUCAS = PARCEIRO;
    const regras = { ativos: [GUSTAVO, LUCAS], parteDaCasa: { [GUSTAVO]: 20, [LUCAS]: 20 }, matriz: [] };
    const corte = dividirPagamento(
      { atendente: GUSTAVO, donoDoCliente: GUSTAVO, servicosCentavos: 4500, descontoCentavos: 0, gorjetaCentavos: 0 },
      regras
    );
    const barba = dividirPagamento(
      { atendente: LUCAS, donoDoCliente: LUCAS, servicosCentavos: 3000, descontoCentavos: 0, gorjetaCentavos: 0 },
      regras
    );
    const acerto = acertoDoDia([
      { recebidoPor: GUSTAVO, partes: corte },
      { recebidoPor: LUCAS, partes: barba },
      { recebidoPor: null, partes: parteDoPlano({ atendente: LUCAS, fixoCentavos: 2500 }) },
      { recebidoPor: GUSTAVO, partes: dividirMensalidade({ precoCentavos: 9000, vendedor: GUSTAVO, parteDaCasa: 20 }) },
      { recebidoPor: GUSTAVO, partes: dividirMensalidade({ precoCentavos: 12000, vendedor: null, parteDaCasa: 20 }) },
    ]);
    expect(acerto.repasses).toEqual([
      { de: GUSTAVO, para: null, valorCentavos: 14700 },
      { de: null, para: LUCAS, valorCentavos: 1900 },
    ]);
    expect(acerto.pessoas).toEqual([
      { pessoa: GUSTAVO, recebeuCentavos: 25500, cabeCentavos: 10800, saldoCentavos: -14700 },
      { pessoa: LUCAS, recebeuCentavos: 3000, cabeCentavos: 4900, saldoCentavos: 1900 },
      { pessoa: null, recebeuCentavos: 2500, cabeCentavos: 15300, saldoCentavos: 12800 },
    ]);
  });

  it("atendimento pelo plano com serviço à parte: o avulso se divide como hoje", () => {
    const avulso = dividirPagamento(
      { atendente: PARCEIRO, donoDoCliente: PARCEIRO, servicosCentavos: 3000, descontoCentavos: 0, gorjetaCentavos: 0 },
      { ativos: [GUSTAVO, PARCEIRO], parteDaCasa: {}, matriz: [] }
    );
    const acerto = acertoDoDia([
      { recebidoPor: PARCEIRO, partes: avulso },
      { recebidoPor: null, partes: parteDoPlano({ atendente: PARCEIRO, fixoCentavos: 2500 }) },
    ]);
    expect(acerto.repasses).toEqual([{ de: null, para: PARCEIRO, valorCentavos: 2500 }]);
  });
});

describe("fimDoCiclo", () => {
  it("mensal, trimestral e anual a partir do dia de início", () => {
    expect(fimDoCiclo("2026-10-24", "mensal")).toBe("2026-11-24");
    expect(fimDoCiclo("2026-10-24", "trimestral")).toBe("2027-01-24");
    expect(fimDoCiclo("2026-10-24", "anual")).toBe("2027-10-24");
  });

  it("dia que não existe no mês cai no último dia", () => {
    expect(fimDoCiclo("2026-01-31", "mensal")).toBe("2026-02-28");
    expect(fimDoCiclo("2028-01-31", "mensal")).toBe("2028-02-29");
    expect(fimDoCiclo("2026-11-30", "trimestral")).toBe("2027-02-28");
    expect(fimDoCiclo("2028-02-29", "anual")).toBe("2029-02-28");
  });

  it("com o dia de vencimento, volta pro dia certo depois de um mês curto", () => {
    expect(fimDoCiclo("2026-02-28", "mensal", 31)).toBe("2026-03-31");
    expect(fimDoCiclo("2026-04-30", "mensal", 31)).toBe("2026-05-31");
  });

  it("recusa data torta e dia de vencimento fora de 1..31", () => {
    expect(() => fimDoCiclo("2026-02-30", "mensal")).toThrow(RangeError);
    expect(() => fimDoCiclo("24/10/2026", "mensal")).toThrow(RangeError);
    expect(() => fimDoCiclo("2026-10-24", "mensal", 0)).toThrow(RangeError);
    expect(() => fimDoCiclo("2026-10-24", "mensal", 32)).toThrow(RangeError);
  });
});

describe("usosRestantes", () => {
  it("ilimitado continua ilimitado", () => {
    expect(usosRestantes(null, 7)).toBeNull();
  });

  it("conta o que sobra no ciclo, sem ficar negativo", () => {
    expect(usosRestantes(4, 0)).toBe(4);
    expect(usosRestantes(4, 3)).toBe(1);
    expect(usosRestantes(4, 4)).toBe(0);
    expect(usosRestantes(4, 5)).toBe(0);
  });
});

describe("problemaDoPlano", () => {
  const daCasa: PlanoParaConferir = {
    daCasa: true,
    precoCentavos: 12000,
    diasDeTeste: 0,
    fixoPorAtendimentoCentavos: 2500,
    servicos: [{ usosPorCiclo: null }],
    aceitaOnline: true,
    aceitaNoBalcao: false,
  };
  const doBarbeiro: PlanoParaConferir = { ...daCasa, daCasa: false, fixoPorAtendimentoCentavos: null };

  it("plano da casa e de barbeiro certos passam", () => {
    expect(problemaDoPlano(daCasa)).toBeNull();
    expect(problemaDoPlano(doBarbeiro)).toBeNull();
  });

  it("preço precisa ser positivo, em centavos inteiros", () => {
    expect(problemaDoPlano({ ...daCasa, precoCentavos: 0 })).toBe("preco");
    expect(problemaDoPlano({ ...daCasa, precoCentavos: 99.9 })).toBe("preco");
  });

  it("dias de teste de 0 a 30", () => {
    expect(problemaDoPlano({ ...daCasa, diasDeTeste: 30 })).toBeNull();
    expect(problemaDoPlano({ ...daCasa, diasDeTeste: 31 })).toBe("dias_de_teste");
    expect(problemaDoPlano({ ...daCasa, diasDeTeste: -1 })).toBe("dias_de_teste");
  });

  it("o fixo é só do plano da casa, e o da casa precisa dele", () => {
    expect(problemaDoPlano({ ...doBarbeiro, fixoPorAtendimentoCentavos: 2500 })).toBe("fixo");
    expect(problemaDoPlano({ ...daCasa, fixoPorAtendimentoCentavos: null })).toBe("fixo");
    expect(problemaDoPlano({ ...daCasa, fixoPorAtendimentoCentavos: -1 })).toBe("fixo");
    expect(problemaDoPlano({ ...daCasa, fixoPorAtendimentoCentavos: 0 })).toBeNull();
  });

  it("precisa de pelo menos um serviço, com usos inteiros de 1 em diante", () => {
    expect(problemaDoPlano({ ...daCasa, servicos: [] })).toBe("servicos");
    expect(problemaDoPlano({ ...daCasa, servicos: [{ usosPorCiclo: 0 }] })).toBe("usos");
    expect(problemaDoPlano({ ...daCasa, servicos: [{ usosPorCiclo: 1.5 }] })).toBe("usos");
    expect(problemaDoPlano({ ...daCasa, servicos: [{ usosPorCiclo: 4 }, { usosPorCiclo: null }] })).toBeNull();
  });

  it("aceita online, no balcão ou os dois — nenhum, não", () => {
    expect(problemaDoPlano({ ...daCasa, aceitaOnline: false, aceitaNoBalcao: true })).toBeNull();
    expect(problemaDoPlano({ ...daCasa, aceitaOnline: false, aceitaNoBalcao: false })).toBe("formas");
  });
});

// No balcão, o fim do ciclo é o dia da renovação: até ele a assinatura
// está em dia; no dia seguinte, sem "recebi", fica em atraso.
describe("o ciclo no balcão", () => {
  it("em atraso só depois do dia da renovação", () => {
    expect(cicloEmAtraso("2026-11-24", "2026-11-23")).toBe(false);
    expect(cicloEmAtraso("2026-11-24", "2026-11-24")).toBe(false);
    expect(cicloEmAtraso("2026-11-24", "2026-11-25")).toBe(true);
  });

  it("o \"recebi\" vale a partir do dia da renovação; antes, o ciclo está em dia", () => {
    const hoje = "2026-11-24";
    expect(problemaDoRecebimento({ situacao: "pendente", cicloTerminaEm: null }, hoje)).toBeNull();
    expect(problemaDoRecebimento({ situacao: "em_atraso", cicloTerminaEm: "2026-11-10" }, hoje)).toBeNull();
    for (const situacao of ["ativa", "teste"] as const) {
      expect(problemaDoRecebimento({ situacao, cicloTerminaEm: "2026-11-24" }, hoje)).toBeNull();
      expect(problemaDoRecebimento({ situacao, cicloTerminaEm: "2026-11-20" }, hoje)).toBeNull();
      expect(problemaDoRecebimento({ situacao, cicloTerminaEm: "2026-11-25" }, hoje)).toBe("ciclo_em_dia");
    }
    expect(problemaDoRecebimento({ situacao: "cancelada", cicloTerminaEm: null }, hoje)).toBe("cancelada");
  });
});

describe("o ciclo pago online", () => {
  const ATIVA = { cicloComecaEm: "2026-10-24", cicloTerminaEm: "2026-11-24", pagoAte: null };

  it("a primeira cobrança abre o ciclo no vencimento, mesmo paga dias depois", () => {
    const pendente = { cicloComecaEm: null, cicloTerminaEm: null, pagoAte: null };
    expect(cicloPagoOnline(pendente, "2026-10-24", "mensal", "2026-10-24")).toEqual(ATIVA);
    expect(cicloPagoOnline(pendente, "2026-10-24", "mensal", "2026-10-27")).toEqual(ATIVA);
    expect(cicloPagoOnline(pendente, "2026-10-24", "trimestral", "2026-10-24")).toEqual({
      ...ATIVA,
      cicloTerminaEm: "2027-01-24",
    });
  });

  it("a cobrança da renovação, paga no dia ou atrasada, abre o ciclo seguinte no vencimento", () => {
    const seguinte = { cicloComecaEm: "2026-11-24", cicloTerminaEm: "2026-12-24", pagoAte: null };
    expect(cicloPagoOnline(ATIVA, "2026-11-24", "mensal", "2026-11-24")).toEqual(seguinte);
    expect(cicloPagoOnline(ATIVA, "2026-11-24", "mensal", "2026-11-28")).toEqual(seguinte);
  });

  it("paga antes da renovação, o ciclo de agora segue e o seguinte fica guardado", () => {
    expect(cicloPagoOnline(ATIVA, "2026-11-24", "mensal", "2026-11-20")).toEqual({ ...ATIVA, pagoAte: "2026-12-24" });
  });

  it("paga durante o teste grátis, o teste segue até o fim", () => {
    const teste = { cicloComecaEm: "2026-10-24", cicloTerminaEm: "2026-10-31", pagoAte: null };
    expect(cicloPagoOnline(teste, "2026-10-31", "mensal", "2026-10-26")).toEqual({ ...teste, pagoAte: "2026-11-30" });
  });

  it("o vencimento volta pro dia certo depois de um mês curto, como o fimDoCiclo", () => {
    const pendente = { cicloComecaEm: null, cicloTerminaEm: null, pagoAte: null };
    expect(cicloPagoOnline(pendente, "2027-01-31", "mensal", "2027-01-31")?.cicloTerminaEm).toBe("2027-02-28");
  });

  it("a cobrança de um ciclo que já passou não mexe no ciclo", () => {
    expect(cicloPagoOnline(ATIVA, "2026-09-24", "mensal", "2026-10-30")).toBeNull();
  });
});

describe("preverPeloPlano", () => {
  // O ciclo de 24/10 a 23/11 (renova em 24/11), no balcão, com o Gustavo
  // atendendo.
  const ATIVA: AssinaturaParaPrever = {
    situacao: "ativa",
    forma: "no_balcao",
    ciclo: "mensal",
    cicloComecaEm: "2026-10-24",
    cicloTerminaEm: "2026-11-24",
    pagoAte: null,
    vendedorId: null,
    servicos: [{ servicoId: "corte", usosPorCiclo: 4 }],
    usados: {},
  };
  let vez = 0;
  const horario = (extra: Partial<HorarioParaPrever> = {}): HorarioParaPrever => ({
    id: `h${++vez}`,
    data: "2026-10-30",
    horaInicio: "17:00",
    barbeiroId: "gustavo",
    servicoIds: ["corte"],
    ...extra,
  });
  const prever = (assinaturas: AssinaturaParaPrever[], horarios: HorarioParaPrever[]) =>
    Object.fromEntries(preverPeloPlano(assinaturas, horarios));

  it("marca o que o plano cobre; o resto do horário é avulso", () => {
    const h = horario({ servicoIds: ["corte", "barba"] });
    expect(prever([ATIVA], [h])).toEqual({ [h.id]: ["corte"] });
  });

  it("sem serviço do plano, o horário fica sem marca", () => {
    expect(prever([ATIVA], [horario({ servicoIds: ["barba"] })])).toEqual({});
  });

  it("só no ciclo: do primeiro dia até a véspera da renovação", () => {
    const dentro = [horario({ data: "2026-10-24" }), horario({ data: "2026-11-23" })];
    const fora = [horario({ data: "2026-10-23" }), horario({ data: "2026-11-24" })];
    expect(Object.keys(prever([ATIVA], [...dentro, ...fora]))).toEqual(dentro.map((h) => h.id));
  });

  it("vale como no balcão: ativa e teste, nunca pendente, em atraso ou cancelada", () => {
    for (const situacao of ["ativa", "teste"] as const) {
      expect(Object.keys(prever([{ ...ATIVA, situacao }], [horario()]))).toHaveLength(1);
    }
    for (const situacao of ["pendente", "em_atraso", "cancelada"] as const) {
      expect(prever([{ ...ATIVA, situacao }], [horario()])).toEqual({});
    }
    expect(prever([{ ...ATIVA, cicloComecaEm: null, cicloTerminaEm: null }], [horario()])).toEqual({});
  });

  it("o plano de barbeiro só nos horários com quem vende", () => {
    const doGustavo = { ...ATIVA, vendedorId: "gustavo" };
    const comGustavo = horario();
    expect(prever([doGustavo], [comGustavo, horario({ barbeiroId: "rafael" })])).toEqual({ [comGustavo.id]: ["corte"] });
  });

  it("os usos que sobram vão pros horários mais cedo, em qualquer ordem que cheguem", () => {
    const tarde = horario({ data: "2026-11-02", horaInicio: "09:00" });
    const cedo = horario({ data: "2026-11-01", horaInicio: "18:00" });
    const mesmoDiaMaisCedo = horario({ data: "2026-11-01", horaInicio: "10:00" });
    const sobraUm = { ...ATIVA, usados: { corte: 3 } };
    expect(prever([sobraUm], [tarde, cedo, mesmoDiaMaisCedo])).toEqual({ [mesmoDiaMaisCedo.id]: ["corte"] });
    expect(prever([{ ...ATIVA, usados: { corte: 4 } }], [tarde])).toEqual({});
  });

  it("o mesmo serviço duas vezes gasta dois usos; sem limite, cobre tudo", () => {
    const duasVezes = horario({ servicoIds: ["corte", "corte"] });
    expect(prever([{ ...ATIVA, usados: { corte: 3 } }], [duasVezes])).toEqual({ [duasVezes.id]: ["corte"] });
    const ilimitado = { ...ATIVA, servicos: [{ servicoId: "corte", usosPorCiclo: null }], usados: { corte: 40 } };
    expect(prever([ilimitado], [duasVezes])).toEqual({ [duasVezes.id]: ["corte", "corte"] });
  });

  it("no balcão, depois da renovação não tem marca: o ciclo seguinte depende do \"recebi\"", () => {
    expect(prever([ATIVA], [horario({ data: "2026-11-24" }), horario({ data: "2026-12-30" })])).toEqual({});
  });

  it("no online, que renova sozinho, cada ciclo seguinte começa com os usos zerados", () => {
    const online = { ...ATIVA, forma: "online" as const, usados: { corte: 4 } };
    const agora = horario({ data: "2026-11-20" });
    const seguinte = [1, 2, 3, 4, 5].map((dia) => horario({ data: `2026-11-2${dia + 4}` }));
    const doisCiclosDepois = horario({ data: "2027-01-10" });
    expect(prever([online], [agora, ...seguinte, doisCiclosDepois])).toEqual({
      ...Object.fromEntries(seguinte.slice(0, 4).map((h) => [h.id, ["corte"]])),
      [doisCiclosDepois.id]: ["corte"],
    });
  });

  it("no online, o ciclo seguinte já pago conta como os outros, e o depois dele também", () => {
    const pagoAdiantado = { ...ATIVA, forma: "online" as const, pagoAte: "2026-12-24", usados: { corte: 4 } };
    const agora = horario({ data: "2026-11-20" });
    const seguinte = horario({ data: "2026-11-24" });
    const depois = horario({ data: "2026-12-24" });
    expect(prever([pagoAdiantado], [agora, seguinte, depois])).toEqual({
      [seguinte.id]: ["corte"],
      [depois.id]: ["corte"],
    });
  });

  it("os ciclos seguintes seguem o ciclo do plano, e a online em atraso não tem marca", () => {
    const trimestral = { ...ATIVA, forma: "online" as const, ciclo: "trimestral" as const, usados: { corte: 4 } };
    // 24/11 a 23/02 é um ciclo só: os 4 usos vão pros 4 primeiros.
    const horarios = ["2026-11-24", "2026-12-10", "2027-01-05", "2027-02-01", "2027-02-23"].map((data) =>
      horario({ data })
    );
    const proximoTrimestre = horario({ data: "2027-02-24" });
    expect(Object.keys(prever([trimestral], [...horarios, proximoTrimestre]))).toEqual([
      ...horarios.slice(0, 4).map((h) => h.id),
      proximoTrimestre.id,
    ]);
    expect(prever([{ ...trimestral, situacao: "em_atraso" }], horarios)).toEqual({});
  });

  it("com duas assinaturas, a primeira que cobre o horário fica com ele", () => {
    const daCasa = { ...ATIVA, servicos: [{ servicoId: "corte", usosPorCiclo: 1 }] };
    const doRafael = { ...ATIVA, vendedorId: "rafael", servicos: [{ servicoId: "barba", usosPorCiclo: 4 }] };
    const barbaComRafael = horario({ barbeiroId: "rafael", servicoIds: ["barba"] });
    const corte1 = horario({ data: "2026-11-01" });
    const corte2 = horario({ data: "2026-11-02" });
    expect(prever([doRafael, daCasa], [barbaComRafael, corte1, corte2])).toEqual({
      [barbaComRafael.id]: ["barba"],
      [corte1.id]: ["corte"],
    });
  });
});
