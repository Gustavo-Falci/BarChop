import { describe, expect, it } from "vitest";
import { prisma } from "@barchop/database";
import { buildApp } from "../../src/app";
import { dataParaDate, horaParaDate } from "../../src/lib/horas";
import { auth, criarBarbeariaComToken, criarMembroComToken } from "../helpers/barbearia";
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

// De quem o cliente "é" no caixa (Onda 2, marco 2, PR 5 do plano
// caixa-do-dia): aparece no detalhe e só o dono troca. Vale um membro
// ativo que atende, ou `null` (de ninguém).
describe("o profissional do cliente", () => {
  async function cenario() {
    const app = buildApp();
    const dono = await criarBarbeariaComToken(app, "um");
    const parceiro = await criarMembroComToken(app, dono.barbeariaId, "profissional", "parceiro");
    const recepcao = await criarMembroComToken(app, dono.barbeariaId, "recepcao", "balcao");
    const cliente = await criarCliente(app, dono.token);
    return { app, dono, parceiro, recepcao, cliente };
  }

  function trocar(app: App, token: string, clienteId: string, corpo: Record<string, unknown>) {
    return app.inject({ method: "PATCH", url: `/clientes/${clienteId}`, headers: auth(token), payload: corpo });
  }

  async function profissionalNoDetalhe(app: App, token: string, clienteId: string) {
    const resposta = await app.inject({ method: "GET", url: `/clientes/${clienteId}`, headers: auth(token) });
    return resposta.json().profissional;
  }

  it("começa de ninguém; o dono passa para um membro e depois limpa", async () => {
    const c = await cenario();
    expect(await profissionalNoDetalhe(c.app, c.dono.token, c.cliente.id)).toBeNull();

    const trocou = await trocar(c.app, c.dono.token, c.cliente.id, { profissionalId: c.parceiro.barbeiroId });
    expect(trocou.statusCode).toBe(200);
    expect(await profissionalNoDetalhe(c.app, c.dono.token, c.cliente.id)).toEqual({
      id: c.parceiro.barbeiroId,
      nome: "Membro parceiro",
    });

    expect((await trocar(c.app, c.dono.token, c.cliente.id, { profissionalId: null })).statusCode).toBe(200);
    expect(await profissionalNoDetalhe(c.app, c.dono.token, c.cliente.id)).toBeNull();
    await c.app.close();
  });

  it("profissional e recepção não trocam (403), mas seguem editando o resto", async () => {
    const c = await cenario();

    for (const token of [c.parceiro.token, c.recepcao.token]) {
      const resposta = await trocar(c.app, token, c.cliente.id, { profissionalId: c.parceiro.barbeiroId });
      expect(resposta.statusCode).toBe(403);
      expect(resposta.json().erro).toBe("sem_permissao");
    }
    expect((await trocar(c.app, c.parceiro.token, c.cliente.id, { nome: "João Souza" })).statusCode).toBe(200);
    const cliente = await prisma.cliente.findUniqueOrThrow({ where: { id: c.cliente.id } });
    expect(cliente.profissionalId).toBeNull();
    expect(cliente.nome).toBe("João Souza");
    await c.app.close();
  });

  it("recepção, membro que saiu ou de outra barbearia é 422 membro_invalido", async () => {
    const c = await cenario();
    const outra = await criarBarbeariaComToken(c.app, "outra");
    const saiu = await criarMembroComToken(c.app, c.dono.barbeariaId, "profissional", "saiu");
    await prisma.barbeiro.update({ where: { id: saiu.barbeiroId }, data: { ativo: false } });

    for (const profissionalId of [c.recepcao.barbeiroId, saiu.barbeiroId, outra.barbeiroId]) {
      const resposta = await trocar(c.app, c.dono.token, c.cliente.id, { profissionalId });
      expect(resposta.statusCode).toBe(422);
      expect(resposta.json().erro).toBe("membro_invalido");
    }
    expect((await trocar(c.app, c.dono.token, c.cliente.id, { profissionalId: "nao-e-uuid" })).statusCode).toBe(400);
    await c.app.close();
  });
});
