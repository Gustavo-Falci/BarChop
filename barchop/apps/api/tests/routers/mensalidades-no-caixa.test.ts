import { describe, expect, it } from "vitest";
import { prisma } from "@barchop/database";
import { buildApp } from "../../src/app";
import { agoraNaBarbearia, dataParaDate } from "../../src/lib/horas";
import { prepararAgenda } from "../helpers/agenda";
import { auth, criarMembroComToken } from "../helpers/barbearia";

// As mensalidades no caixa (Onda 2, marco 3, PR 6b do plano
// planos-de-assinatura). Cada "recebi" entra no caixa do dia dele com a
// parte da casa congelada: no acerto, quem recebeu segura a mensalidade
// inteira, a casa leva a parte dela e o vendedor o resto. Elas entram
// também nos totais por forma (é dinheiro na mão de alguém) e na foto
// do fechamento.
//
// O dia da tela Caixa (o mesmo do teste "o dia da tela Caixa" no
// @barchop/formato): Gustavo e Lucas com 20% da casa. O Gustavo corta
// (R$ 45, dinheiro); o Lucas atende uma assinante do plano da casa e
// cobra a barba à parte (R$ 30, pix); o Gustavo recebe duas
// mensalidades no pix: R$ 90 do plano dele e R$ 120 do plano da casa.

const HOJE = agoraNaBarbearia().data;

async function cenario() {
  const app = buildApp();
  const agenda = await prepararAgenda(app);
  const gustavo = { id: agenda.barbeiroId, token: agenda.token };
  const lucas = await criarMembroComToken(app, agenda.barbeariaId, "profissional", "lucas");
  await prisma.barbeiro.updateMany({
    where: { id: { in: [gustavo.id, lucas.barbeiroId] } },
    data: { parteDaCasa: 20 },
  });
  const barba = (
    await app.inject({
      method: "POST",
      url: "/servicos",
      headers: auth(agenda.token),
      payload: { nome: "Barba", duracaoMinutos: 30, preco: "30.00" },
    })
  ).json() as { id: string };
  const novoCliente = async (nome: string, telefone: string) =>
    (
      await app.inject({
        method: "POST",
        url: "/clientes",
        headers: auth(agenda.token),
        payload: { nome, telefone },
      })
    ).json() as { id: string };
  const ana = await novoCliente("Ana Souza", "11955550001");
  const bia = await novoCliente("Bia Lima", "11955550002");

  const daCasa = await prisma.planoDeAssinatura.create({
    data: {
      barbeariaId: agenda.barbeariaId,
      nome: "Corte ilimitado",
      ciclo: "mensal",
      precoCentavos: 12000,
      fixoPorAtendimentoCentavos: 2500,
      aceitaNoBalcao: true,
      servicos: { create: [{ servicoId: agenda.servico.id, usosPorCiclo: null }] },
    },
  });
  const doGustavo = await prisma.planoDeAssinatura.create({
    data: {
      barbeariaId: agenda.barbeariaId,
      vendedorId: gustavo.id,
      nome: "2 cortes",
      ciclo: "mensal",
      precoCentavos: 9000,
      aceitaNoBalcao: true,
      servicos: { create: [{ servicoId: agenda.servico.id, usosPorCiclo: 2 }] },
    },
  });
  return { app, agenda, gustavo, lucas, barba, ana, bia, daCasa, doGustavo };
}

type Cenario = Awaited<ReturnType<typeof cenario>>;

async function assinarERecebi(c: Cenario, clienteId: string, planoId: string) {
  const assinatura = (
    await c.app.inject({
      method: "POST",
      url: `/clientes/${clienteId}/assinaturas`,
      headers: auth(c.gustavo.token),
      payload: { planoId },
    })
  ).json() as { id: string };
  const recebi = await c.app.inject({
    method: "POST",
    url: `/assinaturas/${assinatura.id}/recebimentos`,
    headers: auth(c.gustavo.token),
    payload: { forma: "pix" },
  });
  expect(recebi.statusCode).toBe(201);
  return assinatura;
}

// Direto no banco: o painel exigiria jornada de cada um.
function atendimento(
  c: Cenario,
  barbeiroId: string,
  clienteId: string,
  horaInicio: string,
  servicos: { id: string; preco: string }[]
) {
  return prisma.agendamento.create({
    data: {
      barbeariaId: c.agenda.barbeariaId,
      barbeiroId,
      clienteId,
      data: dataParaDate(HOJE),
      horaInicio: new Date(`1970-01-01T${horaInicio}:00Z`),
      horaFim: new Date(`1970-01-01T${horaInicio.slice(0, 2)}:45:00Z`),
      status: "confirmado",
      origem: "barbeiro",
      servicos: {
        create: servicos.map((s) => ({ servicoId: s.id, precoNoMomento: s.preco, duracaoNoMomento: 30 })),
      },
    },
  });
}

async function oDiaDaTelaCaixa(c: Cenario) {
  const daAna = await assinarERecebi(c, c.ana.id, c.daCasa.id);
  await assinarERecebi(c, c.bia.id, c.doGustavo.id);

  const corte = await atendimento(c, c.gustavo.id, c.agenda.cliente.id, "10:00", [
    { id: c.agenda.servico.id, preco: "45.00" },
  ]);
  const comPlano = await atendimento(c, c.lucas.barbeiroId, c.ana.id, "11:00", [
    { id: c.agenda.servico.id, preco: "45.00" },
    { id: c.barba.id, preco: "30.00" },
  ]);
  const pagar = (id: string, corpo: object) =>
    c.app.inject({ method: "PUT", url: `/agendamentos/${id}/pagamento`, headers: auth(c.gustavo.token), payload: corpo });
  expect((await pagar(corte.id, { forma: "dinheiro" })).statusCode).toBe(200);
  expect((await pagar(comPlano.id, { forma: "pix", assinaturaId: daAna.id })).statusCode).toBe(200);
}

function caixa(c: Cenario, token = c.gustavo.token) {
  return c.app.inject({ method: "GET", url: `/barbearias/me/caixa?data=${HOJE}`, headers: auth(token) });
}

const membro = (id: string) => ({ id, nome: expect.any(String) });

describe("as mensalidades no caixa do dia", () => {
  it("o dia da tela Caixa: os repasses compensam casa e Lucas, como no @barchop/formato", async () => {
    const c = await cenario();
    await oDiaDaTelaCaixa(c);

    const dia = (await caixa(c)).json();
    expect(dia.acerto.repasses).toEqual([
      { de: membro(c.gustavo.id), para: null, valorCentavos: 14700 },
      { de: null, para: membro(c.lucas.barbeiroId), valorCentavos: 1900 },
    ]);
    expect(dia.acerto.pessoas).toEqual([
      { pessoa: membro(c.gustavo.id), recebeuCentavos: 25500, cabeCentavos: 10800, saldoCentavos: -14700 },
      { pessoa: membro(c.lucas.barbeiroId), recebeuCentavos: 3000, cabeCentavos: 4900, saldoCentavos: 1900 },
      { pessoa: null, recebeuCentavos: 2500, cabeCentavos: 15300, saldoCentavos: 12800 },
    ]);
    await c.app.close();
  });

  it("entram nos totais por forma e na lista, com o que é da casa e de quem vende", async () => {
    const c = await cenario();
    await oDiaDaTelaCaixa(c);

    const dia = (await caixa(c)).json();
    expect(dia.totais.totalCentavos).toBe(28500);
    expect(dia.totais.porForma).toEqual([
      { forma: "pix", quantidade: 3, valorCentavos: 24000 },
      { forma: "dinheiro", quantidade: 1, valorCentavos: 4500 },
      { forma: "debito", quantidade: 0, valorCentavos: 0 },
      { forma: "credito", quantidade: 0, valorCentavos: 0 },
    ]);
    expect(dia.mensalidades).toEqual([
      expect.objectContaining({
        data: HOJE,
        forma: "pix",
        valorCentavos: 12000,
        casaCentavos: 12000,
        recebidoPor: membro(c.gustavo.id),
        cliente: { id: c.ana.id, nome: "Ana Souza" },
        plano: { id: c.daCasa.id, nome: "Corte ilimitado", daCasa: true, vendedor: null },
      }),
      expect.objectContaining({
        valorCentavos: 9000,
        casaCentavos: 1800,
        cliente: { id: c.bia.id, nome: "Bia Lima" },
        plano: { id: c.doGustavo.id, nome: "2 cortes", daCasa: false, vendedor: membro(c.gustavo.id) },
      }),
    ]);
    expect(dia.mensalidades[0].registradoEm).toEqual(expect.any(String));
    await c.app.close();
  });

  it("o profissional vê as mensalidades que recebeu ou dos planos dele", async () => {
    const c = await cenario();
    await oDiaDaTelaCaixa(c);
    expect((await caixa(c, c.lucas.token)).json().mensalidades).toEqual([]);

    await prisma.recebimentoDoPlano.updateMany({
      where: { barbeariaId: c.agenda.barbeariaId, valorCentavos: 12000 },
      data: { recebidoPorId: c.lucas.barbeiroId },
    });
    const doLucas = (await caixa(c, c.lucas.token)).json();
    expect(doLucas.mensalidades.map((m: { valorCentavos: number }) => m.valorCentavos)).toEqual([12000]);
    await c.app.close();
  });

  it("a foto do fechamento leva as mensalidades", async () => {
    const c = await cenario();
    await oDiaDaTelaCaixa(c);
    const fechou = await c.app.inject({
      method: "POST",
      url: `/barbearias/me/caixa/${HOJE}/fechamento`,
      headers: auth(c.gustavo.token),
    });
    expect(fechou.statusCode).toBe(201);
    const foto = await prisma.fechamentoDoDia.findFirstOrThrow({ where: { barbeariaId: c.agenda.barbeariaId } });
    expect((foto.acerto as { repasses: unknown[] }).repasses).toEqual([
      { de: c.gustavo.id, para: null, valorCentavos: 14700 },
      { de: null, para: c.lucas.barbeiroId, valorCentavos: 1900 },
    ]);
    await c.app.close();
  });

  it("dia sem nada: lista vazia", async () => {
    const c = await cenario();
    expect((await caixa(c)).json().mensalidades).toEqual([]);
    await c.app.close();
  });
});
