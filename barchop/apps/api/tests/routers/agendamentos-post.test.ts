import { describe, expect, it } from "vitest";
import { prisma } from "@barchop/database";
import { buildApp } from "../../src/app";
import { auth, criarBarbeariaComToken } from "../helpers/barbearia";
import type { App } from "../../src/tipos";

// Telefone único por cadastro. Deriva de um contador, e não do sufixo:
// `sufixo.length` colidiria entre dois sufixos do mesmo tamanho, e o
// erro só apareceria quando alguém acrescentasse um cenário novo.
let sequenciaDeTelefone = 0;
function proximoTelefone(): string {
  sequenciaDeTelefone += 1;
  return `1199999${String(sequenciaDeTelefone).padStart(4, "0")}`;
}

// Barbearia pronta pra agendar: aberta de segunda a sábado, 09:00–18:00,
// com um serviço de 45 minutos e um cliente cadastrado.
// 2026-09-10 é uma quinta-feira.
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

  const cliente = (
    await app.inject({
      method: "POST",
      url: "/clientes",
      headers: auth(barbearia.token),
      payload: { nome: "João da Silva", telefone: proximoTelefone() },
    })
  ).json();

  return { ...barbearia, servico, cliente };
}

function corpo(agenda: Awaited<ReturnType<typeof prepararAgenda>>, extra = {}) {
  return {
    barbeiroId: agenda.barbeiroId,
    clienteId: agenda.cliente.id,
    servicoIds: [agenda.servico.id],
    data: "2026-09-10",
    horaInicio: "10:00",
    ...extra,
  };
}

describe("POST /agendamentos", () => {
  it("cria o agendamento do walk-in com origem barbeiro", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    const resposta = await app.inject({
      method: "POST",
      url: "/agendamentos",
      headers: auth(agenda.token),
      payload: corpo(agenda),
    });

    expect(resposta.statusCode).toBe(201);

    const criado = resposta.json();
    expect(criado.data).toBe("2026-09-10");
    expect(criado.horaInicio).toBe("10:00");
    expect(criado.horaFim).toBe("10:45");
    expect(criado.status).toBe("confirmado");
    // Fixa em "barbeiro": o corpo não tem como pedir outra coisa.
    expect(criado.origem).toBe("barbeiro");
    expect(criado.cliente.nome).toBe("João da Silva");
    expect(criado.servicos[0]).toMatchObject({
      nome: "Corte",
      precoNoMomento: "45.00",
      duracaoNoMomento: 45,
    });

    await app.close();
  });

  it("aceita observações", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    const resposta = await app.inject({
      method: "POST",
      url: "/agendamentos",
      headers: auth(agenda.token),
      payload: corpo(agenda, { observacoes: "cliente pediu máquina 2" }),
    });

    expect(resposta.json().observacoes).toBe("cliente pediu máquina 2");

    await app.close();
  });

  it("recusa origem no corpo com 400", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    // `origem` no corpo é justamente o que a spec tira do DTO: se
    // passasse, o fluxo público mandaria origem: "barbeiro".
    const resposta = await app.inject({
      method: "POST",
      url: "/agendamentos",
      headers: auth(agenda.token),
      payload: corpo(agenda, { origem: "cliente" }),
    });

    expect(resposta.statusCode).toBe(400);

    await app.close();
  });

  it("recusa barbeariaId no corpo com 400", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    const resposta = await app.inject({
      method: "POST",
      url: "/agendamentos",
      headers: auth(agenda.token),
      payload: corpo(agenda, { barbeariaId: agenda.barbeariaId }),
    });

    expect(resposta.statusCode).toBe(400);

    await app.close();
  });

  it("recusa lista de serviços vazia com 400", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    const resposta = await app.inject({
      method: "POST",
      url: "/agendamentos",
      headers: auth(agenda.token),
      payload: corpo(agenda, { servicoIds: [] }),
    });

    expect(resposta.statusCode).toBe(400);

    await app.close();
  });

  it("recusa data fora do formato com 400", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    const resposta = await app.inject({
      method: "POST",
      url: "/agendamentos",
      headers: auth(agenda.token),
      payload: corpo(agenda, { data: "10/09/2026" }),
    });

    expect(resposta.statusCode).toBe(400);

    await app.close();
  });

  it("devolve 404 pra cliente de outra barbearia", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app, "um");
    const outra = await prepararAgenda(app, "outra");

    const resposta = await app.inject({
      method: "POST",
      url: "/agendamentos",
      headers: auth(agenda.token),
      payload: corpo(agenda, { clienteId: outra.cliente.id }),
    });

    // 404 e não 422: é a mesma resposta que GET /clientes/:id dá pro
    // cliente alheio, e não confirma que aquele id existe.
    expect(resposta.statusCode).toBe(404);
    expect(await prisma.agendamento.count()).toBe(0);

    await app.close();
  });

  it("devolve 422 pra horário fora do expediente", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    const resposta = await app.inject({
      method: "POST",
      url: "/agendamentos",
      headers: auth(agenda.token),
      payload: corpo(agenda, { horaInicio: "08:00" }),
    });

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json().erro).toBe("horario_indisponivel");

    await app.close();
  });

  it("devolve 422 pra serviço de outra barbearia", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app, "um");
    const outra = await prepararAgenda(app, "outra");

    const resposta = await app.inject({
      method: "POST",
      url: "/agendamentos",
      headers: auth(agenda.token),
      payload: corpo(agenda, { servicoIds: [outra.servico.id] }),
    });

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json().erro).toBe("servico_invalido");

    await app.close();
  });

  it("recusa requisição sem token com 401", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    const resposta = await app.inject({
      method: "POST",
      url: "/agendamentos",
      payload: corpo(agenda),
    });

    expect(resposta.statusCode).toBe(401);

    await app.close();
  });
});
