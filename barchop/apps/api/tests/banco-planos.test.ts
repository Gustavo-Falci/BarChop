import { describe, expect, it } from "vitest";
import { prisma } from "@barchop/database";
import {
  CICLOS_DO_CLIENTE,
  FORMAS_DA_ASSINATURA,
  FORMAS_DE_PAGAMENTO,
  FORMAS_DO_CAIXA,
  MAX_DIAS_DE_TESTE_DO_CLIENTE,
  MODOS_DA_CONEXAO,
  PROVEDORES_DE_PAGAMENTO,
  SITUACOES_DO_ASSINANTE,
} from "@barchop/formato";
import { buildApp } from "../src/app";
import { dataParaDate } from "../src/lib/horas";
import { marcarPeloPainel, prepararAgenda } from "./helpers/agenda";
import { QUINTA } from "./helpers/datas";

// Os planos do cliente no banco (Onda 2, marco 3, PR 2 — migration
// 20261026120000_planos_de_assinatura). As rotas chegam nos PRs 3 a 6;
// aqui só o que o banco garante sozinho: os CHECKs com as listas do
// @barchop/formato, as chaves únicas e o que sai junto com o quê.

async function cenario() {
  const app = buildApp();
  const agenda = await prepararAgenda(app);
  const parceiro = await prisma.barbeiro.create({
    data: { barbeariaId: agenda.barbeariaId, nome: "Parceiro", papel: "profissional" },
  });
  return { app, agenda, parceiro };
}

type Cenario = Awaited<ReturnType<typeof cenario>>;

// Plano da casa por padrão; `vendedorId` faz o de barbeiro (sem fixo).
function dadosDoPlano(c: Cenario, extra: Record<string, unknown> = {}) {
  const deBarbeiro = typeof extra.vendedorId === "string";
  return {
    barbeariaId: c.agenda.barbeariaId,
    nome: "Corte ilimitado",
    ciclo: "mensal",
    precoCentavos: 12000,
    fixoPorAtendimentoCentavos: deBarbeiro ? null : 2500,
    ...extra,
  };
}

function dadosDaConexao(c: Cenario, extra: Record<string, unknown> = {}) {
  return {
    barbeariaId: c.agenda.barbeariaId,
    barbeiroId: c.agenda.barbeiroId,
    provedor: "asaas",
    modo: "teste",
    chaveCifrada: Buffer.from("cifrada"),
    chaveFinal: "9F3A",
    webhookTokenHash: "hash",
    ...extra,
  };
}

async function assinaturaNoBalcao(c: Cenario, planoId: string, extra: Record<string, unknown> = {}) {
  return prisma.assinaturaDoCliente.create({
    data: {
      barbeariaId: c.agenda.barbeariaId,
      planoId,
      clienteId: c.agenda.cliente.id,
      forma: "no_balcao",
      precoCentavos: 12000,
      ciclo: "mensal",
      ...extra,
    },
  });
}

function dadosDoPagamento(c: Cenario, agendamentoId: string, extra: Record<string, unknown> = {}) {
  return {
    barbeariaId: c.agenda.barbeariaId,
    agendamentoId,
    data: dataParaDate(QUINTA),
    atendenteId: c.agenda.barbeiroId,
    recebidoPorId: c.agenda.barbeiroId,
    registradoPorId: c.agenda.barbeiroId,
    forma: "pix",
    servicosCentavos: 4500,
    ...extra,
  };
}

describe("colunas novas", () => {
  it("membro nasce sem poder vender e a barbearia sem vitrine", async () => {
    const c = await cenario();
    expect(c.parceiro.podeVenderPlanos).toBe(false);
    const barbearia = await prisma.barbearia.findUniqueOrThrow({ where: { id: c.agenda.barbeariaId } });
    expect(barbearia.vitrineDePlanos).toBe(false);
    await c.app.close();
  });
});

describe("conexao_de_pagamento", () => {
  it("aceita todo provedor e modo do código, e nada fora deles", async () => {
    const c = await cenario();
    for (const provedor of PROVEDORES_DE_PAGAMENTO) {
      for (const modo of MODOS_DA_CONEXAO) {
        await prisma.conexaoDePagamento.deleteMany();
        await prisma.conexaoDePagamento.create({ data: dadosDaConexao(c, { provedor, modo }) });
      }
    }
    await prisma.conexaoDePagamento.deleteMany();
    await expect(prisma.conexaoDePagamento.create({ data: dadosDaConexao(c, { provedor: "paypal" }) })).rejects.toThrow();
    await expect(prisma.conexaoDePagamento.create({ data: dadosDaConexao(c, { modo: "producao" }) })).rejects.toThrow();
    await c.app.close();
  });

  it("uma conta da casa por barbearia, e o dono pode ter a da casa e a dele", async () => {
    const c = await cenario();
    await prisma.conexaoDePagamento.create({ data: dadosDaConexao(c, { daCasa: true }) });
    await prisma.conexaoDePagamento.create({ data: dadosDaConexao(c) });
    await expect(
      prisma.conexaoDePagamento.create({ data: dadosDaConexao(c, { daCasa: true, barbeiroId: c.parceiro.id }) })
    ).rejects.toThrow();
    await c.app.close();
  });

  it("uma conta por membro e provedor", async () => {
    const c = await cenario();
    await prisma.conexaoDePagamento.create({ data: dadosDaConexao(c, { barbeiroId: c.parceiro.id }) });
    await expect(
      prisma.conexaoDePagamento.create({ data: dadosDaConexao(c, { barbeiroId: c.parceiro.id, modo: "real" }) })
    ).rejects.toThrow();
    await c.app.close();
  });
});

describe("plano_de_assinatura", () => {
  it("aceita todo ciclo do código, e nada fora dele", async () => {
    const c = await cenario();
    for (const ciclo of CICLOS_DO_CLIENTE) {
      await prisma.planoDeAssinatura.create({ data: dadosDoPlano(c, { ciclo }) });
    }
    await expect(prisma.planoDeAssinatura.create({ data: dadosDoPlano(c, { ciclo: "semanal" }) })).rejects.toThrow();
    await c.app.close();
  });

  it("dias de teste até o máximo do código; preço maior que zero", async () => {
    const c = await cenario();
    await prisma.planoDeAssinatura.create({ data: dadosDoPlano(c, { diasDeTeste: MAX_DIAS_DE_TESTE_DO_CLIENTE }) });
    for (const ruim of [{ diasDeTeste: MAX_DIAS_DE_TESTE_DO_CLIENTE + 1 }, { diasDeTeste: -1 }, { precoCentavos: 0 }]) {
      await expect(prisma.planoDeAssinatura.create({ data: dadosDoPlano(c, ruim) })).rejects.toThrow();
    }
    await c.app.close();
  });

  it("o da casa tem fixo (0 vale) e o de barbeiro não tem", async () => {
    const c = await cenario();
    await prisma.planoDeAssinatura.create({ data: dadosDoPlano(c, { fixoPorAtendimentoCentavos: 0 }) });
    await prisma.planoDeAssinatura.create({ data: dadosDoPlano(c, { vendedorId: c.parceiro.id }) });
    for (const ruim of [
      { fixoPorAtendimentoCentavos: null },
      { fixoPorAtendimentoCentavos: -1 },
      { vendedorId: c.parceiro.id, fixoPorAtendimentoCentavos: 2500 },
    ]) {
      await expect(prisma.planoDeAssinatura.create({ data: dadosDoPlano(c, ruim) })).rejects.toThrow();
    }
    await c.app.close();
  });

  it("aceita online, no balcão ou os dois, nunca nenhum", async () => {
    const c = await cenario();
    await prisma.planoDeAssinatura.create({ data: dadosDoPlano(c, { aceitaOnline: false, aceitaNoBalcao: true }) });
    await expect(
      prisma.planoDeAssinatura.create({ data: dadosDoPlano(c, { aceitaOnline: false, aceitaNoBalcao: false }) })
    ).rejects.toThrow();
    await c.app.close();
  });

  it("os serviços: um por plano, usos nulo (ilimitado) ou a partir de 1", async () => {
    const c = await cenario();
    const plano = await prisma.planoDeAssinatura.create({ data: dadosDoPlano(c) });
    const base = { planoId: plano.id, servicoId: c.agenda.servico.id };
    await prisma.planoServico.create({ data: { ...base, usosPorCiclo: null } });
    await expect(prisma.planoServico.create({ data: { ...base, usosPorCiclo: 2 } })).rejects.toThrow();
    await prisma.planoServico.deleteMany();
    await expect(prisma.planoServico.create({ data: { ...base, usosPorCiclo: 0 } })).rejects.toThrow();
    await c.app.close();
  });

  it("apagar um vendedor com plano é recusado (membro sai com ativo = false)", async () => {
    const c = await cenario();
    await prisma.planoDeAssinatura.create({ data: dadosDoPlano(c, { vendedorId: c.parceiro.id }) });
    await expect(prisma.barbeiro.delete({ where: { id: c.parceiro.id } })).rejects.toThrow();
    await c.app.close();
  });
});

describe("assinatura_do_cliente", () => {
  it("aceita toda situação e forma do código, e nada fora delas", async () => {
    const c = await cenario();
    const plano = await prisma.planoDeAssinatura.create({ data: dadosDoPlano(c) });
    const conexao = await prisma.conexaoDePagamento.create({ data: dadosDaConexao(c, { daCasa: true }) });
    for (const situacao of SITUACOES_DO_ASSINANTE) {
      for (const forma of FORMAS_DA_ASSINATURA) {
        await prisma.assinaturaDoCliente.deleteMany();
        await assinaturaNoBalcao(c, plano.id, {
          situacao,
          forma,
          conexaoId: forma === "online" ? conexao.id : null,
        });
      }
    }
    await prisma.assinaturaDoCliente.deleteMany();
    await expect(assinaturaNoBalcao(c, plano.id, { situacao: "pausada" })).rejects.toThrow();
    await expect(assinaturaNoBalcao(c, plano.id, { forma: "boleto" })).rejects.toThrow();
    await expect(assinaturaNoBalcao(c, plano.id, { ciclo: "semanal" })).rejects.toThrow();
    await c.app.close();
  });

  it("online tem conta conectada; no balcão, não", async () => {
    const c = await cenario();
    const plano = await prisma.planoDeAssinatura.create({ data: dadosDoPlano(c) });
    const conexao = await prisma.conexaoDePagamento.create({ data: dadosDaConexao(c, { daCasa: true }) });
    await expect(assinaturaNoBalcao(c, plano.id, { forma: "online" })).rejects.toThrow();
    await expect(assinaturaNoBalcao(c, plano.id, { conexaoId: conexao.id })).rejects.toThrow();
    await c.app.close();
  });

  it("uma viva por cliente e plano; cancelada não conta", async () => {
    const c = await cenario();
    const plano = await prisma.planoDeAssinatura.create({ data: dadosDoPlano(c) });
    await assinaturaNoBalcao(c, plano.id, { situacao: "cancelada" });
    await assinaturaNoBalcao(c, plano.id, { situacao: "ativa" });
    await expect(assinaturaNoBalcao(c, plano.id, { situacao: "pendente" })).rejects.toThrow();
    await c.app.close();
  });

  it("o ciclo: os dois dias ou nenhum, e o fim depois do começo", async () => {
    const c = await cenario();
    const plano = await prisma.planoDeAssinatura.create({ data: dadosDoPlano(c) });
    const outubro = { cicloComecaEm: dataParaDate("2026-10-24"), cicloTerminaEm: dataParaDate("2026-11-24") };
    await assinaturaNoBalcao(c, plano.id, outubro);
    await prisma.assinaturaDoCliente.deleteMany();
    for (const ruim of [
      { cicloComecaEm: outubro.cicloComecaEm },
      { cicloComecaEm: outubro.cicloTerminaEm, cicloTerminaEm: outubro.cicloComecaEm },
    ]) {
      await expect(assinaturaNoBalcao(c, plano.id, ruim)).rejects.toThrow();
    }
    await c.app.close();
  });
});

describe("recebimento_do_plano", () => {
  async function comAssinatura() {
    const c = await cenario();
    const plano = await prisma.planoDeAssinatura.create({ data: dadosDoPlano(c) });
    const assinatura = await assinaturaNoBalcao(c, plano.id, { situacao: "ativa" });
    const receber = (extra: Record<string, unknown> = {}) =>
      prisma.recebimentoDoPlano.create({
        data: {
          barbeariaId: c.agenda.barbeariaId,
          assinaturaId: assinatura.id,
          data: dataParaDate(QUINTA),
          recebidoPorId: c.agenda.barbeiroId,
          valorCentavos: 12000,
          casaCentavos: 12000,
          forma: "pix",
          ...extra,
        },
      });
    return { c, receber };
  }

  it("aceita toda forma de pagamento do código, e nada fora dela (nem `plano`)", async () => {
    const { c, receber } = await comAssinatura();
    for (const forma of FORMAS_DE_PAGAMENTO) await receber({ forma });
    await expect(receber({ forma: "plano" })).rejects.toThrow();
    await c.app.close();
  });

  it("a parte da casa vai de 0 ao valor; valor maior que zero", async () => {
    const { c, receber } = await comAssinatura();
    await receber({ casaCentavos: 0 });
    for (const ruim of [{ casaCentavos: 12001 }, { casaCentavos: -1 }, { valorCentavos: 0, casaCentavos: 0 }]) {
      await expect(receber(ruim)).rejects.toThrow();
    }
    await c.app.close();
  });

  it("a mesma cobrança do provedor não entra duas vezes", async () => {
    const { c, receber } = await comAssinatura();
    await receber({ idExterno: "pay_1" });
    await expect(receber({ idExterno: "pay_1" })).rejects.toThrow();
    // No balcão não tem id: vários recebimentos sem ele.
    await receber();
    await receber();
    await c.app.close();
  });
});

describe("evento_do_provedor", () => {
  it("o mesmo evento do mesmo provedor uma vez só", async () => {
    await prisma.eventoDoProvedor.create({ data: { provedor: "asaas", id: "evt_1", tipo: "PAYMENT_RECEIVED" } });
    await expect(
      prisma.eventoDoProvedor.create({ data: { provedor: "asaas", id: "evt_1", tipo: "PAYMENT_RECEIVED" } })
    ).rejects.toThrow();
    await expect(prisma.eventoDoProvedor.create({ data: { provedor: "paypal", id: "evt_2", tipo: "x" } })).rejects.toThrow();
  });
});

describe("pagamento pelo plano", () => {
  async function comAgendamento() {
    const c = await cenario();
    const agendamento = await marcarPeloPainel(c.app, c.agenda, { data: QUINTA, horaInicio: "10:00" });
    const plano = await prisma.planoDeAssinatura.create({ data: dadosDoPlano(c) });
    const assinatura = await assinaturaNoBalcao(c, plano.id, { situacao: "ativa" });
    return { c, agendamento, assinatura };
  }

  it("aceita toda forma do caixa, `plano` inclusive", async () => {
    const { c, agendamento, assinatura } = await comAgendamento();
    for (const forma of FORMAS_DO_CAIXA) {
      await prisma.pagamento.deleteMany();
      await prisma.pagamento.create({
        data: dadosDoPagamento(c, agendamento.id, {
          forma,
          assinaturaId: assinatura.id,
          servicosCentavos: forma === "plano" ? 0 : 3000,
        }),
      });
    }
    await c.app.close();
  });

  it("`plano` só sem dinheiro e com a assinatura", async () => {
    const { c, agendamento, assinatura } = await comAgendamento();
    for (const ruim of [
      { servicosCentavos: 0 },
      { servicosCentavos: 3000, assinaturaId: assinatura.id },
      { servicosCentavos: 0, gorjetaCentavos: 500, assinaturaId: assinatura.id },
    ]) {
      await expect(
        prisma.pagamento.create({ data: dadosDoPagamento(c, agendamento.id, { forma: "plano", ...ruim }) })
      ).rejects.toThrow();
    }
    await c.app.close();
  });

  it("a parte `plano` (o fixo) entra; os usos saem junto com o pagamento", async () => {
    const { c, agendamento, assinatura } = await comAgendamento();
    const pagamento = await prisma.pagamento.create({
      data: dadosDoPagamento(c, agendamento.id, { forma: "plano", servicosCentavos: 0, assinaturaId: assinatura.id }),
    });
    await prisma.pagamentoParte.create({
      data: { pagamentoId: pagamento.id, beneficiarioId: c.parceiro.id, motivo: "plano", valorCentavos: 2500 },
    });
    await prisma.usoDoPlano.create({
      data: {
        pagamentoId: pagamento.id,
        assinaturaId: assinatura.id,
        servicoId: c.agenda.servico.id,
        data: dataParaDate(QUINTA),
      },
    });
    await expect(
      prisma.pagamentoParte.create({
        data: { pagamentoId: pagamento.id, beneficiarioId: null, motivo: "mensalidade", valorCentavos: 100 },
      })
    ).rejects.toThrow();

    await prisma.pagamento.delete({ where: { id: pagamento.id } });
    expect(await prisma.usoDoPlano.count()).toBe(0);
    expect(await prisma.pagamentoParte.count()).toBe(0);
    await c.app.close();
  });
});

describe("apagar a barbearia", () => {
  // Como no caixa: o agendamento sai antes (RESTRICT da init), levando o
  // pagamento e os usos; o resto dos planos vai com a barbearia.
  it("leva os planos inteiros junto", async () => {
    const c = await cenario();
    const agendamento = await marcarPeloPainel(c.app, c.agenda, { data: QUINTA, horaInicio: "10:00" });
    const conexao = await prisma.conexaoDePagamento.create({ data: dadosDaConexao(c, { daCasa: true }) });
    const plano = await prisma.planoDeAssinatura.create({ data: dadosDoPlano(c, { vendedorId: c.parceiro.id }) });
    await prisma.planoServico.create({ data: { planoId: plano.id, servicoId: c.agenda.servico.id, usosPorCiclo: 2 } });
    const assinatura = await assinaturaNoBalcao(c, plano.id, { situacao: "ativa", forma: "online", conexaoId: conexao.id });
    await prisma.recebimentoDoPlano.create({
      data: {
        barbeariaId: c.agenda.barbeariaId,
        assinaturaId: assinatura.id,
        data: dataParaDate(QUINTA),
        recebidoPorId: c.parceiro.id,
        valorCentavos: 9000,
        casaCentavos: 1800,
        forma: "credito",
      },
    });
    const pagamento = await prisma.pagamento.create({
      data: dadosDoPagamento(c, agendamento.id, { forma: "plano", servicosCentavos: 0, assinaturaId: assinatura.id }),
    });
    await prisma.usoDoPlano.create({
      data: { pagamentoId: pagamento.id, assinaturaId: assinatura.id, servicoId: c.agenda.servico.id, data: dataParaDate(QUINTA) },
    });

    await prisma.agendamento.delete({ where: { id: agendamento.id } });
    await prisma.barbearia.delete({ where: { id: c.agenda.barbeariaId } });

    expect(await prisma.conexaoDePagamento.count()).toBe(0);
    expect(await prisma.planoDeAssinatura.count()).toBe(0);
    expect(await prisma.planoServico.count()).toBe(0);
    expect(await prisma.assinaturaDoCliente.count()).toBe(0);
    expect(await prisma.recebimentoDoPlano.count()).toBe(0);
    expect(await prisma.usoDoPlano.count()).toBe(0);
    await c.app.close();
  });
});
