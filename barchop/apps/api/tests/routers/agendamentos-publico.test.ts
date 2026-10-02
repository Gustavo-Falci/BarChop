import { describe, expect, it } from "vitest";
import { prisma } from "@barchop/database";
import { buildApp } from "../../src/app";
import { auth, criarBarbeariaComToken } from "../helpers/barbearia";
import { QUINTA, quintaPassada } from "../helpers/datas";
import type { App } from "../../src/tipos";

// Mesmo cenário do teste do walk-in: aberta de segunda a sábado,
// 09:00–18:00, um serviço de 45 minutos. QUINTA é a próxima quinta
// com uma semana de folga — data fixa passaria e cairia no
// garantirFuturo.
async function prepararAgenda(app: App, sufixo = "um") {
  const barbearia = await criarBarbeariaComToken(app, sufixo);

  await app.inject({
    method: "PUT",
    url: "/barbearias/me/horarios",
    headers: auth(barbearia.token),
    payload: {
      horarios: [1, 2, 3, 4, 5, 6].map((diaSemana) => ({
        diaSemana,
        horaAbertura: "09:00",
        horaFechamento: "18:00",
      })),
    },
  });

  const servico = (
    await app.inject({
      method: "POST",
      url: "/servicos",
      headers: auth(barbearia.token),
      payload: { nome: "Corte", duracaoMinutos: 45, preco: "45.00" },
    })
  ).json();

  return { ...barbearia, servico };
}

function corpo(agenda: Awaited<ReturnType<typeof prepararAgenda>>, extra = {}) {
  return {
    barbeiroId: agenda.barbeiroId,
    servicoIds: [agenda.servico.id],
    data: QUINTA,
    horaInicio: "10:00",
    cliente: { nome: "João da Silva", telefone: "11999998888" },
    ...extra,
  };
}

describe("POST /barbearias/:slug/agendamentos", () => {
  it("cria o agendamento e o cliente, sem token", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    const resposta = await app.inject({
      method: "POST",
      url: "/barbearias/barbearia-um/agendamentos",
      payload: corpo(agenda),
    });

    expect(resposta.statusCode).toBe(201);

    const criado = resposta.json();
    expect(criado.horaInicio).toBe("10:00");
    expect(criado.horaFim).toBe("10:45");
    // Fixa em "cliente": é o que a tela de Agenda usa pra distinguir
    // quem agendou sozinho de quem o barbeiro registrou.
    expect(criado.origem).toBe("cliente");

    const cliente = await prisma.cliente.findFirstOrThrow();
    expect(cliente.nome).toBe("João da Silva");
    expect(cliente.barbeariaId).toBe(agenda.barbeariaId);

    await app.close();
  });

  it("reaproveita o cliente pelo telefone e não sobrescreve o nome", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    await app.inject({
      method: "POST",
      url: "/barbearias/barbearia-um/agendamentos",
      payload: corpo(agenda),
    });

    await app.inject({
      method: "POST",
      url: "/barbearias/barbearia-um/agendamentos",
      payload: corpo(agenda, {
        horaInicio: "11:00",
        cliente: { nome: "Jonas", telefone: "11999998888" },
      }),
    });

    // Um cadastro só: telefone repetido é o mesmo cliente, e é isso que
    // faz o barbeiro enxergar o cliente recorrente.
    expect(await prisma.cliente.count()).toBe(1);
    // E o nome cadastrado ganha do que veio no corpo: quem digita
    // "Jonas" no formulário não renomeia o cadastro que o barbeiro já
    // ajustou.
    expect((await prisma.cliente.findFirstOrThrow()).nome).toBe(
      "João da Silva"
    );

    await app.close();
  });

  it("não devolve o histórico do cliente", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    await app.inject({
      method: "POST",
      url: "/barbearias/barbearia-um/agendamentos",
      payload: corpo(agenda),
    });

    const segunda = await app.inject({
      method: "POST",
      url: "/barbearias/barbearia-um/agendamentos",
      payload: corpo(agenda, { horaInicio: "11:00" }),
    });

    // Quem sabe o telefone de alguém não pode puxar a agenda dessa
    // pessoa: a resposta é só o agendamento recém-criado.
    expect(segunda.json()).not.toHaveProperty("cliente");
    expect(segunda.json()).not.toHaveProperty("agendamentos");

    await app.close();
  });

  it("não deixa cliente cadastrado quando o agendamento é recusado", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    const resposta = await app.inject({
      method: "POST",
      url: "/barbearias/barbearia-um/agendamentos",
      payload: corpo(agenda, { horaInicio: "08:00" }),
    });

    expect(resposta.statusCode).toBe(422);
    // O upsert do cliente e a criação do agendamento estão na mesma
    // transação — é o que impede a base de encher de cliente fantasma a
    // cada tentativa recusada.
    expect(await prisma.cliente.count()).toBe(0);

    await app.close();
  });

  it("recusa data passada com 422 horario_passado, sem cadastrar o cliente", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    const resposta = await app.inject({
      method: "POST",
      url: "/barbearias/barbearia-um/agendamentos",
      payload: corpo(agenda, { data: quintaPassada() }),
    });

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json().erro).toBe("horario_passado");
    expect(await prisma.cliente.count()).toBe(0);

    await app.close();
  });

  it("recusa origem, barbeariaId ou clienteId no corpo com 400", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    for (const extra of [
      { origem: "barbeiro" },
      { barbeariaId: agenda.barbeariaId },
      { clienteId: "11111111-1111-4111-8111-111111111111" },
    ]) {
      const resposta = await app.inject({
        method: "POST",
        url: "/barbearias/barbearia-um/agendamentos",
        payload: corpo(agenda, extra),
      });

      expect(resposta.statusCode).toBe(400);
    }

    await app.close();
  });

  it("devolve 404 pra slug que não existe", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    const resposta = await app.inject({
      method: "POST",
      url: "/barbearias/nao-existe/agendamentos",
      payload: corpo(agenda),
    });

    expect(resposta.statusCode).toBe(404);

    await app.close();
  });

  it("devolve 422 pra barbeiro de outra barbearia", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app, "um");
    const outra = await prepararAgenda(app, "outra");

    // Sem token nenhum nesta rota: o barbeiroId vem do corpo, e é o
    // criarAgendamento que confere se ele é desta barbearia.
    const resposta = await app.inject({
      method: "POST",
      url: "/barbearias/barbearia-um/agendamentos",
      payload: corpo(agenda, { barbeiroId: outra.barbeiroId }),
    });

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json().erro).toBe("barbeiro_invalido");
    expect(await prisma.agendamento.count()).toBe(0);

    await app.close();
  });

  it("recusa telefone fora do formato com 400", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    const resposta = await app.inject({
      method: "POST",
      url: "/barbearias/barbearia-um/agendamentos",
      payload: corpo(agenda, {
        cliente: { nome: "João", telefone: "telefone" },
      }),
    });

    expect(resposta.statusCode).toBe(400);

    await app.close();
  });
});
