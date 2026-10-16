import { describe, expect, it } from "vitest";
import { prisma } from "@barchop/database";
import { buildApp } from "../../src/app";
import { dataParaDate } from "../../src/lib/horas";
import { marcarPeloPainel, prepararAgenda } from "../helpers/agenda";
import { auth, criarBarbeariaComToken, criarMembroComToken } from "../helpers/barbearia";
import { QUINTA } from "../helpers/datas";

// O caixa do dia (Onda 2, marco 2, PR 4 do plano caixa-do-dia): o que
// entrou no dia, por forma de pagamento; o acerto (quanto cada um
// recebeu, quanto lhe cabe e quem repassa quanto a quem); as pendências
// (atendimento concluído sem pagamento ou ainda marcado); e o fechamento,
// que grava a foto do acerto. Só o dono fecha e reabre; o profissional
// vê só o que é dele.

// O dia da GR: o cliente é do dono. O dono atende às 10:00 (R$ 45,
// pix, no caixa dele); o parceiro atende às 11:00 (R$ 100, dinheiro, na
// mão dele) e a matriz dá 60% ao dono.
async function cenario() {
  const app = buildApp();
  const agenda = await prepararAgenda(app);
  const doDono = await marcarPeloPainel(app, agenda, { data: QUINTA, horaInicio: "10:00" });
  const parceiro = await criarMembroComToken(app, agenda.barbeariaId, "profissional", "parceiro");
  const doParceiro = await marcarDireto(agenda.barbeariaId, parceiro.barbeiroId, agenda.cliente.id, agenda.servico.id, "11:00");
  await prisma.cliente.update({ where: { id: agenda.cliente.id }, data: { profissionalId: agenda.barbeiroId } });
  await prisma.regraDeDivisao.create({
    data: {
      barbeariaId: agenda.barbeariaId,
      donoDoClienteId: agenda.barbeiroId,
      atendenteId: parceiro.barbeiroId,
      percentual: 60,
    },
  });
  return { app, agenda, doDono, doParceiro, parceiro };
}

type Cenario = Awaited<ReturnType<typeof cenario>>;

// Direto no banco: o painel exigiria jornada e serviços de cada membro.
function marcarDireto(
  barbeariaId: string,
  barbeiroId: string,
  clienteId: string,
  servicoId: string,
  horaInicio: string,
  status: "pendente" | "confirmado" | "concluido" | "cancelado" | "no_show" = "confirmado"
) {
  return prisma.agendamento.create({
    data: {
      barbeariaId,
      barbeiroId,
      clienteId,
      data: dataParaDate(QUINTA),
      horaInicio: new Date(`1970-01-01T${horaInicio}:00Z`),
      horaFim: new Date(`1970-01-01T${horaInicio.slice(0, 2)}:45:00Z`),
      status,
      origem: "barbeiro",
      servicos: { create: [{ servicoId, precoNoMomento: "100.00", duracaoNoMomento: 45 }] },
    },
  });
}

async function pagarODia(c: Cenario) {
  const pagar = (id: string, corpo: Record<string, unknown>) =>
    c.app.inject({
      method: "PUT",
      url: `/agendamentos/${id}/pagamento`,
      headers: auth(c.agenda.token),
      payload: corpo,
    });
  expect((await pagar(c.doDono.id, { forma: "pix" })).statusCode).toBe(200);
  expect(
    (await pagar(c.doParceiro.id, { forma: "dinheiro", recebidoPorId: c.parceiro.barbeiroId })).statusCode
  ).toBe(200);
}

function verCaixa(c: Cenario, token = c.agenda.token, data = QUINTA) {
  return c.app.inject({ method: "GET", url: `/barbearias/me/caixa?data=${data}`, headers: auth(token) });
}

function fechar(c: Cenario, token = c.agenda.token) {
  return c.app.inject({ method: "POST", url: `/barbearias/me/caixa/${QUINTA}/fechamento`, headers: auth(token) });
}

function reabrir(c: Cenario, token = c.agenda.token) {
  return c.app.inject({ method: "DELETE", url: `/barbearias/me/caixa/${QUINTA}/fechamento`, headers: auth(token) });
}

type LinhaNaResposta = {
  pessoa: { id: string } | null;
  recebeuCentavos: number;
  cabeCentavos: number;
  saldoCentavos: number;
};

describe("GET /barbearias/me/caixa", () => {
  it("o dia inteiro: pagamentos, totais por forma, acerto e repasses", async () => {
    const c = await cenario();
    await pagarODia(c);

    const resposta = await verCaixa(c);

    expect(resposta.statusCode).toBe(200);
    const caixa = resposta.json();
    expect(caixa.data).toBe(QUINTA);
    expect(caixa.fechamento).toBeNull();
    expect(caixa.pendencias).toEqual([]);

    // Na ordem do dia, com o cliente e a hora.
    expect(caixa.pagamentos.map((p: { agendamentoId: string }) => p.agendamentoId)).toEqual([
      c.doDono.id,
      c.doParceiro.id,
    ]);
    expect(caixa.pagamentos[1]).toMatchObject({
      horaInicio: "11:00",
      cliente: { id: c.agenda.cliente.id, nome: "João da Silva" },
      forma: "dinheiro",
      totalCentavos: 10000,
    });

    expect(caixa.totais).toEqual({
      totalCentavos: 14500,
      porForma: [
        { forma: "pix", quantidade: 1, valorCentavos: 4500 },
        { forma: "dinheiro", quantidade: 1, valorCentavos: 10000 },
        { forma: "debito", quantidade: 0, valorCentavos: 0 },
        { forma: "credito", quantidade: 0, valorCentavos: 0 },
      ],
    });

    // Parceiro: recebeu 100, cabe 40 (o dono leva 60 do cliente dele).
    expect(
      caixa.acerto.pessoas.map((l: LinhaNaResposta) => [
        l.pessoa?.id ?? null,
        l.recebeuCentavos,
        l.cabeCentavos,
        l.saldoCentavos,
      ])
    ).toEqual([
      [c.agenda.barbeiroId, 4500, 10500, 6000],
      [c.parceiro.barbeiroId, 10000, 4000, -6000],
    ]);
    expect(caixa.acerto.pessoas[0].pessoa.nome).toEqual(expect.any(String));
    expect(caixa.acerto.repasses).toEqual([
      {
        de: { id: c.parceiro.barbeiroId, nome: "Membro parceiro" },
        para: { id: c.agenda.barbeiroId, nome: expect.any(String) },
        valorCentavos: 6000,
      },
    ]);
    await c.app.close();
  });

  it("pendências: concluído sem pagamento e o que ainda está marcado; cancelado e falta não", async () => {
    const c = await cenario();
    const { barbeariaId, barbeiroId, cliente, servico } = c.agenda;
    await marcarDireto(barbeariaId, barbeiroId, cliente.id, servico.id, "13:00", "concluido");
    await marcarDireto(barbeariaId, barbeiroId, cliente.id, servico.id, "14:00", "pendente");
    await marcarDireto(barbeariaId, barbeiroId, cliente.id, servico.id, "15:00", "cancelado");
    await marcarDireto(barbeariaId, barbeiroId, cliente.id, servico.id, "16:00", "no_show");

    const caixa = (await verCaixa(c)).json();

    expect(
      caixa.pendencias.map((p: { horaInicio: string; status: string; barbeiro: { id: string } }) => [
        p.horaInicio,
        p.status,
        p.barbeiro.id,
      ])
    ).toEqual([
      ["10:00", "confirmado", barbeiroId],
      ["11:00", "confirmado", c.parceiro.barbeiroId],
      ["13:00", "concluido", barbeiroId],
      ["14:00", "pendente", barbeiroId],
    ]);
    expect(caixa.pendencias[0]).toMatchObject({
      agendamentoId: c.doDono.id,
      cliente: { id: cliente.id, nome: "João da Silva" },
    });
    expect(caixa.pagamentos).toEqual([]);
    expect(caixa.totais.totalCentavos).toBe(0);
    expect(caixa.acerto).toEqual({ pessoas: [], repasses: [] });
    await c.app.close();
  });

  it("o profissional vê só o que é dele: os pagamentos em que entra, a linha dele e os repasses dele", async () => {
    const c = await cenario();
    await pagarODia(c);
    await marcarDireto(c.agenda.barbeariaId, c.agenda.barbeiroId, c.agenda.cliente.id, c.agenda.servico.id, "14:00");

    const caixa = (await verCaixa(c, c.parceiro.token)).json();

    expect(caixa.pagamentos.map((p: { agendamentoId: string }) => p.agendamentoId)).toEqual([c.doParceiro.id]);
    expect(caixa.totais.totalCentavos).toBe(10000);
    expect(caixa.acerto.pessoas).toEqual([
      {
        pessoa: { id: c.parceiro.barbeiroId, nome: "Membro parceiro" },
        recebeuCentavos: 10000,
        cabeCentavos: 4000,
        saldoCentavos: -6000,
      },
    ]);
    expect(caixa.acerto.repasses).toHaveLength(1);
    expect(caixa.acerto.repasses[0].valorCentavos).toBe(6000);
    expect(caixa.pendencias).toEqual([]);
    await c.app.close();
  });

  it("a recepção vê o dia inteiro", async () => {
    const c = await cenario();
    await pagarODia(c);
    const recepcao = await criarMembroComToken(c.app, c.agenda.barbeariaId, "recepcao", "balcao");

    const caixa = (await verCaixa(c, recepcao.token)).json();

    expect(caixa.pagamentos).toHaveLength(2);
    expect(caixa.acerto.pessoas).toHaveLength(2);
    await c.app.close();
  });

  it("outra barbearia não vê nada deste dia", async () => {
    const c = await cenario();
    await pagarODia(c);
    const outra = await criarBarbeariaComToken(c.app, "outra");

    const caixa = (await verCaixa(c, outra.token)).json();

    expect(caixa.pagamentos).toEqual([]);
    expect(caixa.pendencias).toEqual([]);
    expect(caixa.acerto).toEqual({ pessoas: [], repasses: [] });
    await c.app.close();
  });

  it("data que não existe é 422; sem data, 400", async () => {
    const c = await cenario();

    const inexistente = await verCaixa(c, c.agenda.token, "2026-02-30");
    expect(inexistente.statusCode).toBe(422);
    expect(inexistente.json().erro).toBe("data_invalida");

    const semData = await c.app.inject({ method: "GET", url: "/barbearias/me/caixa", headers: auth(c.agenda.token) });
    expect(semData.statusCode).toBe(400);
    await c.app.close();
  });
});

describe("fechar e reabrir o dia", () => {
  it("o dono fecha: grava a foto do acerto, e o dia passa a recusar mudança no pagamento", async () => {
    const c = await cenario();
    await pagarODia(c);

    const resposta = await fechar(c);

    expect(resposta.statusCode).toBe(201);
    expect(resposta.json().fechamento).toMatchObject({ fechadoPor: { id: c.agenda.barbeiroId } });
    expect(resposta.json().fechamento.fechadoEm).toEqual(expect.any(String));

    const foto = await prisma.fechamentoDoDia.findUniqueOrThrow({
      where: { barbeariaId_data: { barbeariaId: c.agenda.barbeariaId, data: dataParaDate(QUINTA) } },
    });
    expect(foto.fechadoPorId).toBe(c.agenda.barbeiroId);
    expect(foto.acerto).toEqual({
      pessoas: [
        { pessoa: c.agenda.barbeiroId, recebeuCentavos: 4500, cabeCentavos: 10500, saldoCentavos: 6000 },
        { pessoa: c.parceiro.barbeiroId, recebeuCentavos: 10000, cabeCentavos: 4000, saldoCentavos: -6000 },
      ],
      repasses: [{ de: c.parceiro.barbeiroId, para: c.agenda.barbeiroId, valorCentavos: 6000 }],
    });

    const depois = await c.app.inject({
      method: "DELETE",
      url: `/agendamentos/${c.doDono.id}/pagamento`,
      headers: auth(c.agenda.token),
    });
    expect(depois.statusCode).toBe(409);
    expect(depois.json().erro).toBe("dia_fechado");
    await c.app.close();
  });

  it("dia fechado mostra o acerto da foto, não uma conta nova", async () => {
    const c = await cenario();
    await pagarODia(c);
    await fechar(c);
    // Ninguém muda pagamento de dia fechado pela API; aqui, à mão, só
    // pra provar de onde o acerto sai.
    await prisma.pagamentoParte.updateMany({ where: { motivo: "cliente" }, data: { valorCentavos: 1 } });

    const caixa = (await verCaixa(c)).json();

    expect(caixa.fechamento).not.toBeNull();
    expect(caixa.acerto.repasses[0].valorCentavos).toBe(6000);
    expect(caixa.acerto.pessoas[0].cabeCentavos).toBe(10500);
    await c.app.close();
  });

  it("fecha com pendência; fechar de novo é 409 dia_fechado", async () => {
    const c = await cenario();

    expect((await fechar(c)).statusCode).toBe(201);
    const deNovo = await fechar(c);
    expect(deNovo.statusCode).toBe(409);
    expect(deNovo.json().erro).toBe("dia_fechado");
    expect(await prisma.fechamentoDoDia.count()).toBe(1);
    await c.app.close();
  });

  it("reabrir apaga o fechamento e o pagamento volta a mudar; reabrir dia aberto não é erro", async () => {
    const c = await cenario();
    await pagarODia(c);
    await fechar(c);

    expect((await reabrir(c)).statusCode).toBe(204);
    expect(await prisma.fechamentoDoDia.count()).toBe(0);
    expect((await verCaixa(c)).json().fechamento).toBeNull();
    const remover = await c.app.inject({
      method: "DELETE",
      url: `/agendamentos/${c.doDono.id}/pagamento`,
      headers: auth(c.agenda.token),
    });
    expect(remover.statusCode).toBe(204);

    expect((await reabrir(c)).statusCode).toBe(204);
    await c.app.close();
  });

  it("só o dono fecha e reabre", async () => {
    const c = await cenario();
    const recepcao = await criarMembroComToken(c.app, c.agenda.barbeariaId, "recepcao", "balcao");

    for (const token of [c.parceiro.token, recepcao.token]) {
      for (const resposta of [await fechar(c, token), await reabrir(c, token)]) {
        expect(resposta.statusCode).toBe(403);
        expect(resposta.json().erro).toBe("sem_permissao");
      }
    }
    expect(await prisma.fechamentoDoDia.count()).toBe(0);
    await c.app.close();
  });

  it("data que não existe é 422", async () => {
    const c = await cenario();
    const resposta = await c.app.inject({
      method: "POST",
      url: "/barbearias/me/caixa/2026-02-30/fechamento",
      headers: auth(c.agenda.token),
    });
    expect(resposta.statusCode).toBe(422);
    expect(resposta.json().erro).toBe("data_invalida");
    await c.app.close();
  });
});

describe("plano sem caixa (Grátis)", () => {
  it("ver, fechar e reabrir dão 403 recurso_do_plano", async () => {
    const c = await cenario();
    await prisma.assinatura.update({
      where: { barbeariaId: c.agenda.barbeariaId },
      data: { situacao: "gratis", plano: "gratis", testeTerminaEm: null },
    });

    for (const resposta of [await verCaixa(c), await fechar(c), await reabrir(c)]) {
      expect(resposta.statusCode).toBe(403);
      expect(resposta.json().erro).toBe("recurso_do_plano");
    }
    await c.app.close();
  });
});
