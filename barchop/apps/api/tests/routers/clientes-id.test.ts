import { describe, expect, it } from "vitest";
import { prisma } from "@barchop/database";
import { buildApp } from "../../src/app";
import { dataParaDate, horaParaDate } from "../../src/lib/horas";
import { auth, criarBarbeariaComToken } from "../helpers/barbearia";
import type { App } from "../../src/tipos";

const JOAO = { nome: "João da Silva", telefone: "11999998888" };

async function criarCliente(app: App, token: string, dados = JOAO) {
  const resposta = await app.inject({
    method: "POST",
    url: "/clientes",
    headers: auth(token),
    payload: dados,
  });
  return resposta.json();
}

// A fase 4 é quem cria agendamento por HTTP. Aqui o registro é semeado
// direto no banco, com as datas passando por lib/horas.ts — o mesmo
// caminho que a rota vai usar.
async function semearAgendamento(params: {
  barbeariaId: string;
  barbeiroId: string;
  clienteId: string;
}) {
  const servico = await prisma.servico.create({
    data: {
      barbeariaId: params.barbeariaId,
      nome: "Corte",
      duracaoMinutos: 45,
      preco: "45.00",
    },
  });

  return prisma.agendamento.create({
    data: {
      barbeariaId: params.barbeariaId,
      barbeiroId: params.barbeiroId,
      clienteId: params.clienteId,
      data: dataParaDate("2026-09-10"),
      horaInicio: horaParaDate("10:00"),
      horaFim: horaParaDate("10:45"),
      servicos: {
        create: [
          {
            servicoId: servico.id,
            precoNoMomento: "45.00",
            duracaoNoMomento: 45,
          },
        ],
      },
    },
  });
}

describe("GET /clientes/:id", () => {
  it("devolve o cliente com o histórico de agendamentos", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");
    const cliente = await criarCliente(app, um.token);
    await semearAgendamento({
      barbeariaId: um.barbeariaId,
      barbeiroId: um.barbeiroId,
      clienteId: cliente.id,
    });

    const resposta = await app.inject({
      method: "GET",
      url: `/clientes/${cliente.id}`,
      headers: auth(um.token),
    });

    expect(resposta.statusCode).toBe(200);

    const corpo = resposta.json();
    expect(corpo.nome).toBe("João da Silva");
    expect(corpo.agendamentos).toHaveLength(1);
    expect(corpo.agendamentos[0]).toMatchObject({
      data: "2026-09-10",
      horaInicio: "10:00",
      horaFim: "10:45",
      status: "confirmado",
    });
    expect(corpo.agendamentos[0].servicos[0]).toEqual({
      servicoId: expect.any(String),
      nome: "Corte",
      precoNoMomento: "45.00",
      duracaoNoMomento: 45,
    });

    await app.close();
  });

  it("devolve histórico vazio pra cliente novo", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");
    const cliente = await criarCliente(app, um.token);

    const resposta = await app.inject({
      method: "GET",
      url: `/clientes/${cliente.id}`,
      headers: auth(um.token),
    });

    expect(resposta.json().agendamentos).toEqual([]);

    await app.close();
  });

  it("devolve 404 pra cliente de outra barbearia", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");
    const outra = await criarBarbeariaComToken(app, "outra");
    const alheio = await criarCliente(app, outra.token);

    const resposta = await app.inject({
      method: "GET",
      url: `/clientes/${alheio.id}`,
      headers: auth(um.token),
    });

    // O histórico de um cliente é justamente o que a decisão 4 da spec
    // não quer expor fora da barbearia dele.
    expect(resposta.statusCode).toBe(404);
    expect(resposta.json().erro).toBe("nao_encontrado");

    await app.close();
  });

  it("recusa id fora do formato UUID com 400", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");

    const resposta = await app.inject({
      method: "GET",
      url: "/clientes/nao-e-uuid",
      headers: auth(um.token),
    });

    expect(resposta.statusCode).toBe(400);

    await app.close();
  });

  it("recusa requisição sem token com 401", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");
    const cliente = await criarCliente(app, um.token);

    const resposta = await app.inject({
      method: "GET",
      url: `/clientes/${cliente.id}`,
    });

    expect(resposta.statusCode).toBe(401);

    await app.close();
  });
});

describe("PATCH /clientes/:id", () => {
  it("edita nome, telefone e email", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");
    const cliente = await criarCliente(app, um.token);

    const resposta = await app.inject({
      method: "PATCH",
      url: `/clientes/${cliente.id}`,
      headers: auth(um.token),
      payload: {
        nome: "João Silva",
        telefone: "11977776666",
        email: "Joao@Exemplo.com",
      },
    });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toMatchObject({
      nome: "João Silva",
      telefone: "(11) 97777-6666",
      email: "joao@exemplo.com",
    });

    await app.close();
  });

  it("recusa telefone já usado por outro cliente da barbearia, com 409", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");
    const joao = await criarCliente(app, um.token);
    await criarCliente(app, um.token, {
      nome: "Maria",
      telefone: "11922222222",
    });

    const resposta = await app.inject({
      method: "PATCH",
      url: `/clientes/${joao.id}`,
      headers: auth(um.token),
      payload: { telefone: "11922222222" },
    });

    expect(resposta.statusCode).toBe(409);

    await app.close();
  });

  it("devolve 404 pra cliente de outra barbearia, sem editar", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");
    const outra = await criarBarbeariaComToken(app, "outra");
    const alheio = await criarCliente(app, outra.token);

    const resposta = await app.inject({
      method: "PATCH",
      url: `/clientes/${alheio.id}`,
      headers: auth(um.token),
      payload: { nome: "Invadido" },
    });

    expect(resposta.statusCode).toBe(404);

    const intacto = await prisma.cliente.findUniqueOrThrow({
      where: { id: alheio.id },
    });
    expect(intacto.nome).toBe("João da Silva");

    await app.close();
  });

  it("recusa corpo vazio com 400", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");
    const cliente = await criarCliente(app, um.token);

    const resposta = await app.inject({
      method: "PATCH",
      url: `/clientes/${cliente.id}`,
      headers: auth(um.token),
      payload: {},
    });

    expect(resposta.statusCode).toBe(400);

    await app.close();
  });

  it("recusa requisição sem token com 401", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");
    const cliente = await criarCliente(app, um.token);

    const resposta = await app.inject({
      method: "PATCH",
      url: `/clientes/${cliente.id}`,
      payload: { nome: "Sem token" },
    });

    expect(resposta.statusCode).toBe(401);

    await app.close();
  });
});
