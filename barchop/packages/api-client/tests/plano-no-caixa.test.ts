import { describe, expect, it } from "vitest";
import type { AssinaturaDoPainel, MembroDaEquipe, PagamentoDoAgendamento, PlanoDoPainel } from "@barchop/types";
import { ErroDaApi, criarApiClientFalso } from "../src/index";

// O plano de assinatura no caixa do dublê (Onda 2, marco 3, PR 7c do
// plano planos-de-assinatura): as assinaturas no GET do pagamento, o
// "pelo plano" no registrar e as mensalidades no caixa do dia, como em
// apps/api/src/lib/caixa.ts e lib/planos-do-cliente.ts.

const membro = (id: string, nome: string, papel: "dono" | "profissional"): MembroDaEquipe => ({
  id,
  nome,
  email: `${id}@gr.com`,
  telefone: null,
  papel,
  atende: true,
  ativo: true,
  fotoUrl: null,
  convitePendente: false,
  podeVenderPlanos: papel === "profissional",
});

// Da casa: corte sem limite, R$ 25,00 pra quem atende.
const daCasa: PlanoDoPainel = {
  id: "pl1",
  daCasa: true,
  vendedor: null,
  nome: "Corte ilimitado",
  descricao: null,
  ciclo: "mensal",
  precoCentavos: 12000,
  diasDeTeste: 0,
  fixoPorAtendimentoCentavos: 2500,
  aceitaOnline: false,
  aceitaNoBalcao: true,
  ativo: true,
  servicos: [{ servicoId: "s1", nome: "Corte", usosPorCiclo: null }],
  assinantes: 2,
};

// Do Gustavo: 2 cortes por ciclo, sem fixo.
const doGustavo: PlanoDoPainel = {
  ...daCasa,
  id: "pl2",
  daCasa: false,
  vendedor: { id: "bb0", nome: "Gustavo" },
  nome: "2 cortes",
  precoCentavos: 9000,
  fixoPorAtendimentoCentavos: null,
  servicos: [{ servicoId: "s1", nome: "Corte", usosPorCiclo: 2 }],
  assinantes: 1,
};

const assinatura = (
  id: string,
  cliente: { id: string; nome: string },
  plano: PlanoDoPainel,
  extra: Partial<AssinaturaDoPainel> = {}
): AssinaturaDoPainel => ({
  id,
  situacao: "ativa",
  forma: "no_balcao",
  precoCentavos: plano.precoCentavos,
  ciclo: "mensal",
  cicloComecaEm: "2026-10-10",
  cicloTerminaEm: "2026-11-10",
  canceladaEm: null,
  criadoEm: "2026-10-10T12:00:00.000Z",
  cliente: { ...cliente, telefone: "(11) 99999-0000" },
  plano: { id: plano.id, nome: plano.nome, daCasa: plano.daCasa, vendedor: plano.vendedor },
  ...extra,
});

const ana = { id: "c1", nome: "Ana Souza" };
const bruno = { id: "c2", nome: "Bruno Lima" };
const carlos = { id: "c3", nome: "Carlos Mendes" };

const agendamento = (
  id: string,
  clienteId: string,
  barbeiro: { id: string; nome: string },
  servicos: { servicoId: string; nome: string; preco: string }[]
) => ({
  id,
  clienteId,
  data: "2026-10-24",
  horaInicio: "14:30",
  horaFim: "15:30",
  status: "confirmado" as const,
  origem: "barbeiro" as const,
  observacoes: null,
  barbeiro,
  servicos: servicos.map((s) => ({ servicoId: s.servicoId, nome: s.nome, precoNoMomento: s.preco, duracaoNoMomento: 30 })),
});

const corte = { servicoId: "s1", nome: "Corte", preco: "45.00" };
const barba = { servicoId: "s2", nome: "Barba", preco: "30.00" };
const gustavo = { id: "bb0", nome: "Gustavo" };
const rafael = { id: "bb1", nome: "Rafael" };

// Dois usos do Bruno já gastos neste ciclo, num pagamento antigo.
const doisCortesDoBruno: PagamentoDoAgendamento = {
  id: "p9",
  agendamentoId: "a9",
  data: "2026-10-15",
  forma: "plano",
  servicosCentavos: 0,
  descontoCentavos: 0,
  gorjetaCentavos: 0,
  totalCentavos: 0,
  atendente: gustavo,
  donoDoCliente: gustavo,
  recebidoPor: gustavo,
  registradoPor: gustavo,
  registradoEm: "2026-10-15T15:00:00.000Z",
  partes: [],
  assinatura: { id: "as2", plano: { id: "pl2", nome: "2 cortes" } },
  servicosPeloPlano: [
    { id: "s1", nome: "Corte" },
    { id: "s1", nome: "Corte" },
  ],
};

function semear(papel: "dono" | "profissional" = "dono", extra: Parameters<typeof criarApiClientFalso>[0] = {}) {
  return criarApiClientFalso({
    papel,
    hoje: "2026-10-24",
    equipe: [membro("bb1", "Rafael", papel === "dono" ? "dono" : "profissional"), membro("bb0", "Gustavo", papel === "dono" ? "profissional" : "dono")],
    clientes: [ana, bruno, carlos].map((c) => ({ ...c, telefone: "(11) 99999-0000", email: null, temConta: false })),
    planos: [daCasa, doGustavo],
    assinaturas: [
      assinatura("as1", ana, daCasa),
      assinatura("as2", bruno, doGustavo),
      assinatura("as3", carlos, daCasa, { situacao: "pendente", cicloComecaEm: null, cicloTerminaEm: null }),
    ],
    agendamentos: [
      agendamento("a1", "c1", gustavo, [corte, barba]),
      agendamento("a2", "c2", rafael, [corte]),
      agendamento("a3", "c2", gustavo, [corte]),
      agendamento("a4", "c3", gustavo, [corte]),
    ],
    divisao: { parteDaCasa: { bb0: 20 }, matriz: [] },
    donosDosClientes: { c1: "bb0", c2: "bb0", c3: "bb0" },
    ...extra,
  });
}

async function erroDe(promessa: Promise<unknown>): Promise<ErroDaApi> {
  try {
    await promessa;
  } catch (erro) {
    return erro as ErroDaApi;
  }
  throw new Error("esperava um erro");
}

describe("dublê — assinaturas no GET do pagamento", () => {
  it("traz as vivas do cliente, se valem no dia e com quem atende, e os usos que sobram", async () => {
    const api = semear("dono", { pagamentos: [doisCortesDoBruno] });

    const daAna = (await api.barbeiro.pagamentoDoAgendamento("a1")).assinaturas;
    expect(daAna).toEqual([
      {
        id: "as1",
        situacao: "ativa",
        cicloComecaEm: "2026-10-10",
        cicloTerminaEm: "2026-11-10",
        noCiclo: true,
        valeComOAtendente: true,
        plano: { id: "pl1", nome: "Corte ilimitado", daCasa: true, vendedor: null },
        servicos: [{ servicoId: "s1", nome: "Corte", usosPorCiclo: null, usosRestantes: null }],
      },
    ]);

    // O Bruno com o Rafael: o plano é do Gustavo. E os dois cortes já foram.
    const [doBruno] = (await api.barbeiro.pagamentoDoAgendamento("a2")).assinaturas;
    expect(doBruno.valeComOAtendente).toBe(false);
    expect(doBruno.servicos[0].usosRestantes).toBe(0);

    // A pendente vem, fora do ciclo.
    const [doCarlos] = (await api.barbeiro.pagamentoDoAgendamento("a4")).assinaturas;
    expect(doCarlos).toMatchObject({ situacao: "pendente", noCiclo: false });
  });

  it("o profissional recebe os planos da casa e os dele", async () => {
    const api = semear("profissional");
    expect((await api.barbeiro.pagamentoDoAgendamento("a1")).assinaturas.map((a) => a.id)).toEqual(["as1"]);
    expect((await api.barbeiro.pagamentoDoAgendamento("a2")).assinaturas).toEqual([]);
  });
});

describe("dublê — pelo plano no registrar", () => {
  it("o plano cobre o corte; a barba é cobrada à parte; a casa paga o fixo a quem atendeu", async () => {
    const api = semear();
    const pago = await api.barbeiro.registrarPagamento("a1", { forma: "pix", assinaturaId: "as1", servicosCentavos: 3000 });

    expect(pago.assinatura).toEqual({ id: "as1", plano: { id: "pl1", nome: "Corte ilimitado" } });
    expect(pago.servicosPeloPlano).toEqual([{ id: "s1", nome: "Corte" }]);
    expect(pago.totalCentavos).toBe(3000);
    expect(pago.partes).toContainEqual({ beneficiario: gustavo, motivo: "plano", valorCentavos: 2500 });

    // Sem servicosCentavos, vale o que o plano não cobriu.
    const semValor = await api.barbeiro.registrarPagamento("a1", { forma: "pix", assinaturaId: "as1" });
    expect(semValor.servicosCentavos).toBe(3000);
  });

  it("nada cobrado é pelo plano; a forma errada é recusada, nunca trocada", async () => {
    const api = semear();
    const tudo = await api.barbeiro.registrarPagamento("a3", { forma: "plano", assinaturaId: "as2" });
    expect(tudo).toMatchObject({ forma: "plano", totalCentavos: 0, servicosPeloPlano: [{ id: "s1", nome: "Corte" }] });
    // Plano de barbeiro: a mensalidade já pagou o vendedor, sem fixo.
    expect(tudo.partes.some((p) => p.motivo === "plano")).toBe(false);

    expect((await erroDe(api.barbeiro.registrarPagamento("a1", { forma: "plano" }))).codigo).toBe("forma_invalida");
    expect(
      (await erroDe(api.barbeiro.registrarPagamento("a1", { forma: "plano", assinaturaId: "as1", servicosCentavos: 3000 })))
        .codigo
    ).toBe("forma_invalida");
    expect(
      (await erroDe(api.barbeiro.registrarPagamento("a1", { forma: "pix", assinaturaId: "as1", servicosCentavos: 0 }))).codigo
    ).toBe("forma_invalida");
  });

  it("recusa como a API: outro cliente, inativa, plano de outro barbeiro, usos esgotados", async () => {
    const api = semear("dono", { pagamentos: [doisCortesDoBruno] });
    const codigo = async (id: string, assinaturaId: string) =>
      (await erroDe(api.barbeiro.registrarPagamento(id, { forma: "pix", assinaturaId }))).codigo;

    expect(await codigo("a1", "as2")).toBe("assinatura_de_outro_cliente");
    expect(await codigo("a4", "as3")).toBe("assinatura_inativa");
    expect(await codigo("a2", "as2")).toBe("plano_de_outro_barbeiro");
    expect(await codigo("a3", "as2")).toBe("usos_esgotados");
    expect(await codigo("a1", "nenhuma")).toBe("nao_encontrado");
  });

  it("refazer com a mesma assinatura não confere de novo: cancelada depois, a correção passa", async () => {
    const api = semear();
    await api.barbeiro.registrarPagamento("a1", { forma: "pix", assinaturaId: "as1", servicosCentavos: 3000 });
    await api.barbeiro.cancelarAssinaturaDoPlano("as1");

    const refeito = await api.barbeiro.registrarPagamento("a1", {
      forma: "dinheiro",
      assinaturaId: "as1",
      servicosCentavos: 3000,
      gorjetaCentavos: 500,
    });
    expect(refeito).toMatchObject({ forma: "dinheiro", totalCentavos: 3500, servicosPeloPlano: [{ id: "s1" }] });
    // O GET segue trazendo o que o pagamento usou.
    expect((await api.barbeiro.pagamentoDoAgendamento("a1")).pagamento?.assinatura?.id).toBe("as1");
  });

  it("os usos gastos contam no GET dos outros atendimentos, sem contar o próprio", async () => {
    const api = semear();
    await api.barbeiro.registrarPagamento("a3", { forma: "plano", assinaturaId: "as2" });
    const [doBruno] = (await api.barbeiro.pagamentoDoAgendamento("a3")).assinaturas;
    expect(doBruno.servicos[0].usosRestantes).toBe(2);
    const [noOutro] = (await api.barbeiro.pagamentoDoAgendamento("a2")).assinaturas;
    expect(noOutro.servicos[0].usosRestantes).toBe(1);
  });
});

describe("dublê — mensalidades no caixa", () => {
  it("o Recebi entra no caixa, nos totais e no acerto; o fixo vira repasse da casa", async () => {
    const api = semear();
    await api.barbeiro.registrarPagamento("a1", { forma: "pix", assinaturaId: "as1", servicosCentavos: 3000 });
    await api.barbeiro.receberMensalidade("as3", "pix");

    const caixa = await api.barbeiro.caixaDoDia("2026-10-24");
    expect(caixa.mensalidades).toEqual([
      expect.objectContaining({
        assinaturaId: "as3",
        data: "2026-10-24",
        forma: "pix",
        valorCentavos: 12000,
        casaCentavos: 12000,
        recebidoPor: rafael,
        cliente: carlos,
        plano: { id: "pl1", nome: "Corte ilimitado", daCasa: true, vendedor: null },
      }),
    ]);
    expect(caixa.totais.porForma[0]).toEqual({ forma: "pix", quantidade: 2, valorCentavos: 15000 });
    expect(caixa.totais.totalCentavos).toBe(15000);
    expect(caixa.acerto.repasses).toContainEqual({ de: null, para: gustavo, valorCentavos: 2500 });
  });

  it("o profissional vê as que recebeu ou dos planos dele", async () => {
    const mensalidade = (id: string, recebidoPor: { id: string; nome: string }) => ({
      id,
      assinaturaId: "as1",
      data: "2026-10-24",
      registradoEm: "2026-10-24T13:00:00.000Z",
      forma: "pix" as const,
      valorCentavos: 12000,
      casaCentavos: 12000,
      recebidoPor,
      cliente: ana,
      plano: { id: "pl1", nome: "Corte ilimitado", daCasa: true, vendedor: null },
    });
    // Rafael (bb1) é o profissional logado: vê a que recebeu, não a do Gustavo.
    const api = semear("profissional", { mensalidades: [mensalidade("m1", rafael), mensalidade("m2", gustavo)] });
    expect((await api.barbeiro.caixaDoDia("2026-10-24")).mensalidades.map((m) => m.id)).toEqual(["m1"]);
  });
});
