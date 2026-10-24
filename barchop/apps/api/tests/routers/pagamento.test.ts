import { describe, expect, it } from "vitest";
import { prisma } from "@barchop/database";
import { buildApp } from "../../src/app";
import { dataParaDate } from "../../src/lib/horas";
import { marcarPeloPainel, prepararAgenda } from "../helpers/agenda";
import { auth, criarBarbeariaComToken, criarMembroComToken } from "../helpers/barbearia";
import { QUINTA } from "../helpers/datas";

// Registrar o pagamento de um atendimento (Onda 2, marco 2, PR 3 do
// plano caixa-do-dia). Registrar conclui o atendimento, passa o cliente
// sem dono para quem atendeu e grava a divisão congelada (a conta é
// `dividirPagamento`, do @barchop/formato). Dia fechado não muda; plano
// sem `caixa` não registra nem vê.

async function cenario() {
  const app = buildApp();
  const agenda = await prepararAgenda(app);
  const agendamento = await marcarPeloPainel(app, agenda, { data: QUINTA, horaInicio: "10:00" });
  const parceiro = await criarMembroComToken(app, agenda.barbeariaId, "profissional", "parceiro");
  return { app, agenda, agendamento, parceiro };
}

type Cenario = Awaited<ReturnType<typeof cenario>>;

// Um atendimento do parceiro, direto no banco: o painel exigiria
// jornada e serviços dele, e o que importa aqui é o pagamento.
async function atendimentoDoParceiro(c: Cenario, horaInicio = "11:00") {
  const agendamento = await prisma.agendamento.create({
    data: {
      barbeariaId: c.agenda.barbeariaId,
      barbeiroId: c.parceiro.barbeiroId,
      clienteId: c.agenda.cliente.id,
      data: dataParaDate(QUINTA),
      horaInicio: new Date(`1970-01-01T${horaInicio}:00Z`),
      horaFim: new Date(`1970-01-01T${horaInicio.slice(0, 2)}:45:00Z`),
      status: "confirmado",
      origem: "barbeiro",
      servicos: {
        create: [{ servicoId: c.agenda.servico.id, precoNoMomento: "100.00", duracaoNoMomento: 45 }],
      },
    },
  });
  return agendamento;
}

function registrar(c: Cenario, agendamentoId: string, corpo: Record<string, unknown>, token = c.agenda.token) {
  return c.app.inject({
    method: "PUT",
    url: `/agendamentos/${agendamentoId}/pagamento`,
    headers: auth(token),
    payload: corpo,
  });
}

function remover(c: Cenario, agendamentoId: string, token = c.agenda.token) {
  return c.app.inject({
    method: "DELETE",
    url: `/agendamentos/${agendamentoId}/pagamento`,
    headers: auth(token),
  });
}

function ler(c: Cenario, agendamentoId: string, token = c.agenda.token) {
  return c.app.inject({
    method: "GET",
    url: `/agendamentos/${agendamentoId}/pagamento`,
    headers: auth(token),
  });
}

function fecharODia(c: Cenario) {
  return prisma.fechamentoDoDia.create({
    data: {
      barbeariaId: c.agenda.barbeariaId,
      data: dataParaDate(QUINTA),
      fechadoPorId: c.agenda.barbeiroId,
      acerto: { pessoas: [], repasses: [] },
    },
  });
}

function irParaOGratis(c: Cenario) {
  return prisma.assinatura.update({
    where: { barbeariaId: c.agenda.barbeariaId },
    data: { situacao: "gratis", plano: "gratis", testeTerminaEm: null },
  });
}

type ParteNaResposta = { beneficiario: { id: string } | null; motivo: string; valorCentavos: number };

describe("PUT /agendamentos/:id/pagamento", () => {
  it("registra com a soma dos serviços, conclui e passa o cliente sem dono para quem atendeu", async () => {
    const c = await cenario();

    const resposta = await registrar(c, c.agendamento.id, { forma: "pix" });

    expect(resposta.statusCode).toBe(200);
    const pagamento = resposta.json();
    expect(pagamento).toMatchObject({
      agendamentoId: c.agendamento.id,
      data: QUINTA,
      forma: "pix",
      servicosCentavos: 4500,
      descontoCentavos: 0,
      gorjetaCentavos: 0,
      totalCentavos: 4500,
      atendente: { id: c.agenda.barbeiroId },
      donoDoCliente: { id: c.agenda.barbeiroId },
      recebidoPor: { id: c.agenda.barbeiroId },
      registradoPor: { id: c.agenda.barbeiroId },
    });
    expect(pagamento.partes).toEqual([
      { beneficiario: { id: c.agenda.barbeiroId, nome: expect.any(String) }, motivo: "atendimento", valorCentavos: 4500 },
    ]);

    const agendamento = await prisma.agendamento.findUniqueOrThrow({ where: { id: c.agendamento.id } });
    expect(agendamento.status).toBe("concluido");
    const cliente = await prisma.cliente.findUniqueOrThrow({ where: { id: c.agenda.cliente.id } });
    expect(cliente.profissionalId).toBe(c.agenda.barbeiroId);
    await c.app.close();
  });

  it("divide pela regra: cliente do dono atendido pelo parceiro, com parte da casa e gorjeta", async () => {
    const c = await cenario();
    await prisma.cliente.update({ where: { id: c.agenda.cliente.id }, data: { profissionalId: c.agenda.barbeiroId } });
    await prisma.barbeiro.update({ where: { id: c.parceiro.barbeiroId }, data: { parteDaCasa: 10 } });
    await prisma.regraDeDivisao.create({
      data: {
        barbeariaId: c.agenda.barbeariaId,
        donoDoClienteId: c.agenda.barbeiroId,
        atendenteId: c.parceiro.barbeiroId,
        percentual: 60,
      },
    });
    const doParceiro = await atendimentoDoParceiro(c);

    const resposta = await registrar(c, doParceiro.id, {
      forma: "dinheiro",
      gorjetaCentavos: 500,
      recebidoPorId: c.agenda.barbeiroId,
    });

    expect(resposta.statusCode).toBe(200);
    const pagamento = resposta.json();
    expect(pagamento.servicosCentavos).toBe(10000);
    expect(pagamento.totalCentavos).toBe(10500);
    expect(pagamento.atendente.id).toBe(c.parceiro.barbeiroId);
    expect(pagamento.donoDoCliente.id).toBe(c.agenda.barbeiroId);
    expect(pagamento.recebidoPor.id).toBe(c.agenda.barbeiroId);
    // base 10000 → casa 1000; resto 9000 → dono 5400; parceiro 3600 + 500.
    expect(
      pagamento.partes.map((p: ParteNaResposta) => [p.beneficiario?.id ?? null, p.motivo, p.valorCentavos])
    ).toEqual([
      [c.parceiro.barbeiroId, "atendimento", 3600],
      [c.agenda.barbeiroId, "cliente", 5400],
      [null, "casa", 1000],
      [c.parceiro.barbeiroId, "gorjeta", 500],
    ]);

    // O cliente segue de quem já era.
    const cliente = await prisma.cliente.findUniqueOrThrow({ where: { id: c.agenda.cliente.id } });
    expect(cliente.profissionalId).toBe(c.agenda.barbeiroId);
    await c.app.close();
  });

  it("dono do cliente que saiu da equipe não leva parte", async () => {
    const c = await cenario();
    await prisma.cliente.update({ where: { id: c.agenda.cliente.id }, data: { profissionalId: c.parceiro.barbeiroId } });
    await prisma.regraDeDivisao.create({
      data: {
        barbeariaId: c.agenda.barbeariaId,
        donoDoClienteId: c.parceiro.barbeiroId,
        atendenteId: c.agenda.barbeiroId,
        percentual: 50,
      },
    });
    await prisma.barbeiro.update({ where: { id: c.parceiro.barbeiroId }, data: { ativo: false } });

    const pagamento = (await registrar(c, c.agendamento.id, { forma: "credito" })).json();

    expect(pagamento.donoDoCliente.id).toBe(c.parceiro.barbeiroId);
    expect(pagamento.partes).toEqual([
      { beneficiario: { id: c.agenda.barbeiroId, nome: expect.any(String) }, motivo: "atendimento", valorCentavos: 4500 },
    ]);
    await c.app.close();
  });

  it("editar mantém o pagamento e refaz as partes com as regras de agora", async () => {
    const c = await cenario();
    const primeiro = (await registrar(c, c.agendamento.id, { forma: "pix" })).json();
    await prisma.barbeiro.update({ where: { id: c.agenda.barbeiroId }, data: { parteDaCasa: 20 } });

    const resposta = await registrar(c, c.agendamento.id, {
      forma: "debito",
      servicosCentavos: 5000,
      descontoCentavos: 1000,
    });

    expect(resposta.statusCode).toBe(200);
    const editado = resposta.json();
    expect(editado.id).toBe(primeiro.id);
    expect(editado).toMatchObject({ forma: "debito", servicosCentavos: 5000, descontoCentavos: 1000, totalCentavos: 4000 });
    expect(editado.partes.map((p: ParteNaResposta) => [p.motivo, p.valorCentavos])).toEqual([
      ["atendimento", 3200],
      ["casa", 800],
    ]);
    expect(await prisma.pagamento.count()).toBe(1);
    expect(await prisma.pagamentoParte.count()).toBe(2);
    await c.app.close();
  });

  it("quem recebeu pode ser a recepção; membro inativo ou de outra barbearia é recusado", async () => {
    const c = await cenario();
    const recepcao = await criarMembroComToken(c.app, c.agenda.barbeariaId, "recepcao", "balcao");
    const outra = await criarBarbeariaComToken(c.app, "outra");

    const peloBalcao = await registrar(c, c.agendamento.id, { forma: "pix", recebidoPorId: recepcao.barbeiroId });
    expect(peloBalcao.statusCode).toBe(200);
    expect(peloBalcao.json().recebidoPor.id).toBe(recepcao.barbeiroId);

    const deFora = await registrar(c, c.agendamento.id, { forma: "pix", recebidoPorId: outra.barbeiroId });
    expect(deFora.statusCode).toBe(422);
    expect(deFora.json().erro).toBe("membro_invalido");

    await prisma.barbeiro.update({ where: { id: recepcao.barbeiroId }, data: { ativo: false } });
    const inativo = await registrar(c, c.agendamento.id, { forma: "pix", recebidoPorId: recepcao.barbeiroId });
    expect(inativo.statusCode).toBe(422);
    expect(inativo.json().erro).toBe("membro_invalido");
    await c.app.close();
  });

  it("recusa desconto maior que os serviços (422) e corpo fora do formato (400)", async () => {
    const c = await cenario();

    const desconto = await registrar(c, c.agendamento.id, { forma: "pix", descontoCentavos: 4501 });
    expect(desconto.statusCode).toBe(422);
    expect(desconto.json().erro).toBe("valor_invalido");

    for (const ruim of [
      {},
      { forma: "cheque" },
      { forma: "pix", servicosCentavos: -1 },
      { forma: "pix", gorjetaCentavos: 1.5 },
      { forma: "pix", extra: true },
    ]) {
      expect((await registrar(c, c.agendamento.id, ruim)).statusCode).toBe(400);
    }
    expect(await prisma.pagamento.count()).toBe(0);
    await c.app.close();
  });

  it("profissional registra no próprio atendimento; o do colega e o de outra barbearia são 404", async () => {
    const c = await cenario();
    const outra = await criarBarbeariaComToken(c.app, "outra");
    const doParceiro = await atendimentoDoParceiro(c);

    expect((await registrar(c, c.agendamento.id, { forma: "pix" }, c.parceiro.token)).statusCode).toBe(404);
    expect((await registrar(c, doParceiro.id, { forma: "pix" }, c.parceiro.token)).statusCode).toBe(200);
    expect((await registrar(c, c.agendamento.id, { forma: "pix" }, outra.token)).statusCode).toBe(404);
    await c.app.close();
  });

  it("a recepção registra em qualquer atendimento", async () => {
    const c = await cenario();
    const recepcao = await criarMembroComToken(c.app, c.agenda.barbeariaId, "recepcao", "balcao");
    const doParceiro = await atendimentoDoParceiro(c);

    const resposta = await registrar(c, doParceiro.id, { forma: "pix" }, recepcao.token);

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().registradoPor.id).toBe(recepcao.barbeiroId);
    expect(resposta.json().recebidoPor.id).toBe(c.parceiro.barbeiroId);
    await c.app.close();
  });

  it("dia fechado: 409 dia_fechado, e nada muda", async () => {
    const c = await cenario();
    await fecharODia(c);

    const resposta = await registrar(c, c.agendamento.id, { forma: "pix" });

    expect(resposta.statusCode).toBe(409);
    expect(resposta.json().erro).toBe("dia_fechado");
    expect(await prisma.pagamento.count()).toBe(0);
    const agendamento = await prisma.agendamento.findUniqueOrThrow({ where: { id: c.agendamento.id } });
    expect(agendamento.status).not.toBe("concluido");
    await c.app.close();
  });
});

describe("DELETE /agendamentos/:id/pagamento", () => {
  it("remove o pagamento e o atendimento segue concluído (vira pendência no caixa)", async () => {
    const c = await cenario();
    await registrar(c, c.agendamento.id, { forma: "pix" });

    expect((await remover(c, c.agendamento.id)).statusCode).toBe(204);
    expect(await prisma.pagamento.count()).toBe(0);
    expect(await prisma.pagamentoParte.count()).toBe(0);
    const agendamento = await prisma.agendamento.findUniqueOrThrow({ where: { id: c.agendamento.id } });
    expect(agendamento.status).toBe("concluido");

    // Sem pagamento, remover de novo não é erro.
    expect((await remover(c, c.agendamento.id)).statusCode).toBe(204);
    await c.app.close();
  });

  it("dia fechado: 409 dia_fechado e o pagamento fica", async () => {
    const c = await cenario();
    await registrar(c, c.agendamento.id, { forma: "pix" });
    await fecharODia(c);

    const resposta = await remover(c, c.agendamento.id);

    expect(resposta.statusCode).toBe(409);
    expect(resposta.json().erro).toBe("dia_fechado");
    expect(await prisma.pagamento.count()).toBe(1);
    await c.app.close();
  });

  it("o atendimento do colega é 404 para o profissional", async () => {
    const c = await cenario();
    await registrar(c, c.agendamento.id, { forma: "pix" });

    expect((await remover(c, c.agendamento.id, c.parceiro.token)).statusCode).toBe(404);
    expect(await prisma.pagamento.count()).toBe(1);
    await c.app.close();
  });
});

describe("GET /agendamentos/:id/pagamento", () => {
  it("devolve o pagamento (ou null) e se o dia está fechado", async () => {
    const c = await cenario();

    const antes = await ler(c, c.agendamento.id);
    expect(antes.statusCode).toBe(200);
    expect(antes.json()).toEqual({ pagamento: null, diaFechado: false, assinaturas: [] });

    const registrado = (await registrar(c, c.agendamento.id, { forma: "pix" })).json();
    await fecharODia(c);

    const depois = (await ler(c, c.agendamento.id)).json();
    expect(depois.diaFechado).toBe(true);
    expect(depois.pagamento).toEqual(registrado);
    await c.app.close();
  });

  it("o atendimento do colega é 404 para o profissional", async () => {
    const c = await cenario();
    expect((await ler(c, c.agendamento.id, c.parceiro.token)).statusCode).toBe(404);
    await c.app.close();
  });
});

describe("plano sem caixa (Grátis)", () => {
  it("registrar, remover e ler dão 403 recurso_do_plano", async () => {
    const c = await cenario();
    await irParaOGratis(c);

    for (const resposta of [
      await registrar(c, c.agendamento.id, { forma: "pix" }),
      await remover(c, c.agendamento.id),
      await ler(c, c.agendamento.id),
    ]) {
      expect(resposta.statusCode).toBe(403);
      expect(resposta.json().erro).toBe("recurso_do_plano");
    }
    expect(await prisma.pagamento.count()).toBe(0);
    await c.app.close();
  });
});

describe("PATCH /agendamentos/:id e o pagamento", () => {
  function mudarStatus(c: Cenario, status: string) {
    return c.app.inject({
      method: "PATCH",
      url: `/agendamentos/${c.agendamento.id}`,
      headers: auth(c.agenda.token),
      payload: { status },
    });
  }

  it("sair do concluído apaga o pagamento", async () => {
    const c = await cenario();
    await registrar(c, c.agendamento.id, { forma: "pix" });

    const resposta = await mudarStatus(c, "confirmado");

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().status).toBe("confirmado");
    expect(await prisma.pagamento.count()).toBe(0);
    await c.app.close();
  });

  it("com o dia fechado, sair do concluído é 409 dia_fechado e nada muda", async () => {
    const c = await cenario();
    await registrar(c, c.agendamento.id, { forma: "pix" });
    await fecharODia(c);

    const resposta = await mudarStatus(c, "cancelado");

    expect(resposta.statusCode).toBe(409);
    expect(resposta.json().erro).toBe("dia_fechado");
    expect(await prisma.pagamento.count()).toBe(1);
    const agendamento = await prisma.agendamento.findUniqueOrThrow({ where: { id: c.agendamento.id } });
    expect(agendamento.status).toBe("concluido");
    await c.app.close();
  });

  it("continuar concluído ou mudar só as observações não mexe no pagamento", async () => {
    const c = await cenario();
    await registrar(c, c.agendamento.id, { forma: "pix" });
    await fecharODia(c);

    expect((await mudarStatus(c, "concluido")).statusCode).toBe(200);
    const observacoes = await c.app.inject({
      method: "PATCH",
      url: `/agendamentos/${c.agendamento.id}`,
      headers: auth(c.agenda.token),
      payload: { observacoes: "pagou certinho" },
    });
    expect(observacoes.statusCode).toBe(200);
    expect(await prisma.pagamento.count()).toBe(1);
    await c.app.close();
  });

  it("sem pagamento, sair do concluído com o dia fechado segue livre", async () => {
    const c = await cenario();
    await mudarStatus(c, "concluido");
    await fecharODia(c);

    expect((await mudarStatus(c, "confirmado")).statusCode).toBe(200);
    await c.app.close();
  });
});
