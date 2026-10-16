import { describe, expect, it } from "vitest";
import { prisma } from "@barchop/database";
import { FORMAS_DE_PAGAMENTO, MOTIVOS_DA_PARTE } from "@barchop/formato";
import { buildApp } from "../src/app";
import { dataParaDate } from "../src/lib/horas";
import { marcarPeloPainel, prepararAgenda } from "./helpers/agenda";
import { QUINTA } from "./helpers/datas";

// O caixa no banco (Onda 2, marco 2, PR 2 — migration 20261017120000_caixa).
// As rotas chegam nos PRs 3 a 5; aqui só o que o banco garante sozinho:
// os CHECKs com as listas do @barchop/formato, as chaves únicas e o que
// sai junto com o quê.

async function cenario() {
  const app = buildApp();
  const agenda = await prepararAgenda(app);
  const agendamento = await marcarPeloPainel(app, agenda, { data: QUINTA, horaInicio: "10:00" });
  const parceiro = await prisma.barbeiro.create({
    data: { barbeariaId: agenda.barbeariaId, nome: "Parceiro", papel: "profissional" },
  });
  return { app, agenda, agendamento, parceiro };
}

function dadosDoPagamento(
  c: Awaited<ReturnType<typeof cenario>>,
  extra: Record<string, unknown> = {}
) {
  return {
    barbeariaId: c.agenda.barbeariaId,
    agendamentoId: c.agendamento.id,
    data: dataParaDate(QUINTA),
    atendenteId: c.agenda.barbeiroId,
    donoDoClienteId: null,
    recebidoPorId: c.agenda.barbeiroId,
    registradoPorId: c.agenda.barbeiroId,
    forma: "pix",
    servicosCentavos: 4500,
    descontoCentavos: 0,
    gorjetaCentavos: 0,
    ...extra,
  };
}

describe("colunas novas", () => {
  it("cliente nasce sem profissional e membro nasce com parte da casa 0", async () => {
    const c = await cenario();
    const cliente = await prisma.cliente.findUniqueOrThrow({ where: { id: c.agenda.cliente.id } });
    expect(cliente.profissionalId).toBeNull();
    expect(c.parceiro.parteDaCasa).toBe(0);
    await c.app.close();
  });

  it("parte da casa vai de 0 a 100", async () => {
    const c = await cenario();
    await prisma.barbeiro.update({ where: { id: c.parceiro.id }, data: { parteDaCasa: 100 } });
    await expect(prisma.barbeiro.update({ where: { id: c.parceiro.id }, data: { parteDaCasa: 101 } })).rejects.toThrow();
    await expect(prisma.barbeiro.update({ where: { id: c.parceiro.id }, data: { parteDaCasa: -1 } })).rejects.toThrow();
    await c.app.close();
  });
});

describe("regra_de_divisao", () => {
  it("guarda o percentual por par e recusa o par com a mesma pessoa", async () => {
    const c = await cenario();
    const base = { barbeariaId: c.agenda.barbeariaId };
    await prisma.regraDeDivisao.create({
      data: { ...base, donoDoClienteId: c.agenda.barbeiroId, atendenteId: c.parceiro.id, percentual: 60 },
    });
    await expect(
      prisma.regraDeDivisao.create({
        data: { ...base, donoDoClienteId: c.agenda.barbeiroId, atendenteId: c.parceiro.id, percentual: 50 },
      })
    ).rejects.toThrow();
    await expect(
      prisma.regraDeDivisao.create({
        data: { ...base, donoDoClienteId: c.parceiro.id, atendenteId: c.parceiro.id, percentual: 10 },
      })
    ).rejects.toThrow();
    await expect(
      prisma.regraDeDivisao.create({
        data: { ...base, donoDoClienteId: c.parceiro.id, atendenteId: c.agenda.barbeiroId, percentual: 101 },
      })
    ).rejects.toThrow();
    await c.app.close();
  });
});

describe("pagamento", () => {
  it("aceita toda forma de pagamento do código, e nada fora dela", async () => {
    const c = await cenario();
    for (const forma of FORMAS_DE_PAGAMENTO) {
      await prisma.pagamento.deleteMany();
      await prisma.pagamento.create({ data: dadosDoPagamento(c, { forma }) });
    }
    await prisma.pagamento.deleteMany();
    await expect(prisma.pagamento.create({ data: dadosDoPagamento(c, { forma: "cheque" }) })).rejects.toThrow();
    await c.app.close();
  });

  it("um pagamento por agendamento", async () => {
    const c = await cenario();
    await prisma.pagamento.create({ data: dadosDoPagamento(c) });
    await expect(prisma.pagamento.create({ data: dadosDoPagamento(c) })).rejects.toThrow();
    await c.app.close();
  });

  it("recusa valor negativo e desconto maior que os serviços", async () => {
    const c = await cenario();
    for (const ruim of [
      { servicosCentavos: -1 },
      { descontoCentavos: -1 },
      { gorjetaCentavos: -1 },
      { servicosCentavos: 1000, descontoCentavos: 1001 },
    ]) {
      await expect(prisma.pagamento.create({ data: dadosDoPagamento(c, ruim) })).rejects.toThrow();
    }
    await prisma.pagamento.create({ data: dadosDoPagamento(c, { servicosCentavos: 1000, descontoCentavos: 1000 }) });
    await c.app.close();
  });

  it("as partes aceitam todo motivo do código, a casa sem beneficiário, e nada negativo", async () => {
    const c = await cenario();
    const pagamento = await prisma.pagamento.create({ data: dadosDoPagamento(c) });
    for (const motivo of MOTIVOS_DA_PARTE) {
      await prisma.pagamentoParte.create({
        data: {
          pagamentoId: pagamento.id,
          beneficiarioId: motivo === "casa" ? null : c.agenda.barbeiroId,
          motivo,
          valorCentavos: 100,
        },
      });
    }
    await expect(
      prisma.pagamentoParte.create({
        data: { pagamentoId: pagamento.id, beneficiarioId: null, motivo: "bonus", valorCentavos: 100 },
      })
    ).rejects.toThrow();
    await expect(
      prisma.pagamentoParte.create({
        data: { pagamentoId: pagamento.id, beneficiarioId: null, motivo: "casa", valorCentavos: -1 },
      })
    ).rejects.toThrow();
    await c.app.close();
  });

  it("apagar o agendamento leva o pagamento e as partes junto", async () => {
    const c = await cenario();
    const pagamento = await prisma.pagamento.create({ data: dadosDoPagamento(c) });
    await prisma.pagamentoParte.create({
      data: { pagamentoId: pagamento.id, beneficiarioId: c.agenda.barbeiroId, motivo: "atendimento", valorCentavos: 4500 },
    });
    await prisma.agendamento.delete({ where: { id: c.agendamento.id } });
    expect(await prisma.pagamento.count()).toBe(0);
    expect(await prisma.pagamentoParte.count()).toBe(0);
    await c.app.close();
  });
});

describe("fechamento_do_dia", () => {
  it("um por barbearia e dia, com a foto do acerto", async () => {
    const c = await cenario();
    const dados = {
      barbeariaId: c.agenda.barbeariaId,
      data: dataParaDate(QUINTA),
      fechadoPorId: c.agenda.barbeiroId,
      acerto: { pessoas: [], repasses: [] },
    };
    const fechamento = await prisma.fechamentoDoDia.create({ data: dados });
    expect(fechamento.acerto).toEqual({ pessoas: [], repasses: [] });
    await expect(prisma.fechamentoDoDia.create({ data: dados })).rejects.toThrow();
    await c.app.close();
  });
});

describe("apagar a barbearia", () => {
  it("leva o caixa inteiro junto", async () => {
    const c = await cenario();
    await prisma.cliente.update({ where: { id: c.agenda.cliente.id }, data: { profissionalId: c.parceiro.id } });
    await prisma.regraDeDivisao.create({
      data: { barbeariaId: c.agenda.barbeariaId, donoDoClienteId: c.parceiro.id, atendenteId: c.agenda.barbeiroId, percentual: 0 },
    });
    const pagamento = await prisma.pagamento.create({ data: dadosDoPagamento(c, { donoDoClienteId: c.parceiro.id }) });
    await prisma.pagamentoParte.create({
      data: { pagamentoId: pagamento.id, beneficiarioId: c.agenda.barbeiroId, motivo: "atendimento", valorCentavos: 4500 },
    });
    await prisma.fechamentoDoDia.create({
      data: { barbeariaId: c.agenda.barbeariaId, data: dataParaDate(QUINTA), fechadoPorId: c.agenda.barbeiroId, acerto: {} },
    });

    await prisma.barbearia.delete({ where: { id: c.agenda.barbeariaId } });

    expect(await prisma.pagamento.count()).toBe(0);
    expect(await prisma.pagamentoParte.count()).toBe(0);
    expect(await prisma.regraDeDivisao.count()).toBe(0);
    expect(await prisma.fechamentoDoDia.count()).toBe(0);
    await c.app.close();
  });
});
