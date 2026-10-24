import { describe, expect, it } from "vitest";
import { MOTIVOS_DO_PLANO, acertoDoDia, dividirPagamento } from "../src/caixa";
import {
  CICLOS_DO_CLIENTE,
  FORMAS_DA_ASSINATURA,
  FORMAS_DO_CAIXA,
  MAX_DIAS_DE_TESTE_DO_CLIENTE,
  SITUACOES_DO_ASSINANTE,
  assinanteUsaOPlano,
  dividirMensalidade,
  fimDoCiclo,
  parteDoPlano,
  problemaDoPlano,
  usosRestantes,
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

  it("os motivos das partes que só o plano gera", () => {
    expect(MOTIVOS_DO_PLANO).toEqual(["plano", "mensalidade"]);
  });

  it("o caixa aceita as formas da página pública e mais o plano", () => {
    expect(FORMAS_DO_CAIXA).toEqual(["pix", "dinheiro", "debito", "credito", "plano"]);
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
  // O plano da casa está na conta conectada pelo Gustavo (o dono): é ele
  // quem segura o dinheiro da casa, então é ele quem paga o fixo.
  it("mensalidade do plano do Gustavo (20% da casa): ele repassa a parte da casa", () => {
    const acerto = acertoDoDia([
      { recebidoPor: GUSTAVO, partes: dividirMensalidade({ precoCentavos: 9000, vendedor: GUSTAVO, parteDaCasa: 20 }) },
    ]);
    expect(acerto.repasses).toEqual([{ de: GUSTAVO, para: null, valorCentavos: 1800 }]);
  });

  it("plano da casa atendido pelo parceiro: o Gustavo repassa o fixo ao parceiro", () => {
    const acerto = acertoDoDia([
      { recebidoPor: GUSTAVO, partes: dividirMensalidade({ precoCentavos: 12000, vendedor: null, parteDaCasa: 0 }) },
      { recebidoPor: GUSTAVO, partes: parteDoPlano({ atendente: PARCEIRO, fixoCentavos: 2500 }) },
    ]);
    // A casa sempre por último (acertoDoDia).
    expect(acerto.repasses).toEqual([
      { de: GUSTAVO, para: PARCEIRO, valorCentavos: 2500 },
      { de: GUSTAVO, para: null, valorCentavos: 12000 },
    ]);
  });

  it("atendimento pelo plano com serviço à parte: o avulso se divide como hoje", () => {
    const avulso = dividirPagamento(
      { atendente: PARCEIRO, donoDoCliente: PARCEIRO, servicosCentavos: 3000, descontoCentavos: 0, gorjetaCentavos: 0 },
      { ativos: [GUSTAVO, PARCEIRO], parteDaCasa: {}, matriz: [] }
    );
    const acerto = acertoDoDia([
      { recebidoPor: PARCEIRO, partes: avulso },
      { recebidoPor: GUSTAVO, partes: parteDoPlano({ atendente: PARCEIRO, fixoCentavos: 2500 }) },
    ]);
    expect(acerto.repasses).toEqual([{ de: GUSTAVO, para: PARCEIRO, valorCentavos: 2500 }]);
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
