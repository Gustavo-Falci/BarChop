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

async function agendar(
  app: App,
  agenda: Awaited<ReturnType<typeof prepararAgenda>>,
  horaInicio = "10:00"
) {
  const resposta = await app.inject({
    method: "POST",
    url: "/agendamentos",
    headers: auth(agenda.token),
    payload: {
      barbeiroId: agenda.barbeiroId,
      clienteId: agenda.cliente.id,
      servicoIds: [agenda.servico.id],
      data: "2026-09-10",
      horaInicio,
    },
  });
  return resposta.json();
}

describe("GET /agendamentos/:id", () => {
  it("devolve o agendamento com cliente e serviços", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    const criado = await agendar(app, agenda);

    const resposta = await app.inject({
      method: "GET",
      url: `/agendamentos/${criado.id}`,
      headers: auth(agenda.token),
    });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toMatchObject({
      id: criado.id,
      data: "2026-09-10",
      horaInicio: "10:00",
      horaFim: "10:45",
      cliente: { nome: "João da Silva" },
    });
    expect(resposta.json().servicos[0].nome).toBe("Corte");

    await app.close();
  });

  it("devolve 404 pra agendamento de outra barbearia", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app, "um");
    const outra = await prepararAgenda(app, "outra");
    const alheio = await agendar(app, outra);

    const resposta = await app.inject({
      method: "GET",
      url: `/agendamentos/${alheio.id}`,
      headers: auth(agenda.token),
    });

    expect(resposta.statusCode).toBe(404);

    await app.close();
  });

  it("recusa id fora do formato UUID com 400", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    const resposta = await app.inject({
      method: "GET",
      url: "/agendamentos/nao-e-uuid",
      headers: auth(agenda.token),
    });

    expect(resposta.statusCode).toBe(400);

    await app.close();
  });

  it("recusa requisição sem token com 401", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    const criado = await agendar(app, agenda);

    const resposta = await app.inject({
      method: "GET",
      url: `/agendamentos/${criado.id}`,
    });

    expect(resposta.statusCode).toBe(401);

    await app.close();
  });
});

describe("PATCH /agendamentos/:id", () => {
  it("muda o status", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    const criado = await agendar(app, agenda);

    const resposta = await app.inject({
      method: "PATCH",
      url: `/agendamentos/${criado.id}`,
      headers: auth(agenda.token),
      payload: { status: "concluido" },
    });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().status).toBe("concluido");

    await app.close();
  });

  it("aceita qualquer transição, inclusive voltar de cancelado", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    const criado = await agendar(app, agenda);

    await app.inject({
      method: "PATCH",
      url: `/agendamentos/${criado.id}`,
      headers: auth(agenda.token),
      payload: { status: "cancelado" },
    });

    // Sem máquina de estados: o barbeiro é a autoridade sobre o próprio
    // dia, e proibir "cancelado de volta pra confirmado" atrapalharia
    // mais do que ajudaria.
    const voltou = await app.inject({
      method: "PATCH",
      url: `/agendamentos/${criado.id}`,
      headers: auth(agenda.token),
      payload: { status: "confirmado" },
    });

    expect(voltou.statusCode).toBe(200);
    expect(voltou.json().status).toBe("confirmado");

    await app.close();
  });

  it("recusa reativar cancelado cujo horário já foi tomado, com 409", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    const primeiro = await agendar(app, agenda);

    await app.inject({
      method: "PATCH",
      url: `/agendamentos/${primeiro.id}`,
      headers: auth(agenda.token),
      payload: { status: "cancelado" },
    });

    // Cancelar liberou o horário, e outro agendamento tomou.
    await agendar(app, agenda);

    const reativar = await app.inject({
      method: "PATCH",
      url: `/agendamentos/${primeiro.id}`,
      headers: auth(agenda.token),
      payload: { status: "confirmado" },
    });

    // A exceção implícita da spec: quem recusa aqui é a
    // sem_conflito_horario, não uma regra da aplicação. A constraint é
    // parcial, então o UPDATE faz a linha entrar no escopo dela sem
    // mexer no `periodo` — e o Postgres re-checa nesse caso.
    expect(reativar.statusCode).toBe(409);
    expect(reativar.json().erro).toBe("horario_ocupado");

    await app.close();
  });

  it("edita observações e aceita null pra limpar", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    const criado = await agendar(app, agenda);

    const escreveu = await app.inject({
      method: "PATCH",
      url: `/agendamentos/${criado.id}`,
      headers: auth(agenda.token),
      payload: { observacoes: "cliente atrasou 10 minutos" },
    });
    expect(escreveu.json().observacoes).toBe("cliente atrasou 10 minutos");

    const limpou = await app.inject({
      method: "PATCH",
      url: `/agendamentos/${criado.id}`,
      headers: auth(agenda.token),
      payload: { observacoes: null },
    });
    expect(limpou.json().observacoes).toBeNull();

    await app.close();
  });

  it("recusa status fora do enum com 400", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    const criado = await agendar(app, agenda);

    const resposta = await app.inject({
      method: "PATCH",
      url: `/agendamentos/${criado.id}`,
      headers: auth(agenda.token),
      payload: { status: "inventado" },
    });

    expect(resposta.statusCode).toBe(400);

    await app.close();
  });

  it("recusa mexer em data, hora ou serviços com 400", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    const criado = await agendar(app, agenda);

    // Remarcar está fora de escopo (a spec manda cancelar e criar
    // outro): aceitar data/hora aqui pularia a checagem de
    // disponibilidade inteira.
    for (const extra of [
      { data: "2026-09-11" },
      { horaInicio: "11:00" },
      { servicoIds: [agenda.servico.id] },
    ]) {
      const resposta = await app.inject({
        method: "PATCH",
        url: `/agendamentos/${criado.id}`,
        headers: auth(agenda.token),
        payload: extra,
      });

      expect(resposta.statusCode).toBe(400);
    }

    await app.close();
  });

  it("recusa corpo vazio com 400", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    const criado = await agendar(app, agenda);

    const resposta = await app.inject({
      method: "PATCH",
      url: `/agendamentos/${criado.id}`,
      headers: auth(agenda.token),
      payload: {},
    });

    expect(resposta.statusCode).toBe(400);

    await app.close();
  });

  it("devolve 404 pra agendamento de outra barbearia, sem editar", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app, "um");
    const outra = await prepararAgenda(app, "outra");
    const alheio = await agendar(app, outra);

    const resposta = await app.inject({
      method: "PATCH",
      url: `/agendamentos/${alheio.id}`,
      headers: auth(agenda.token),
      payload: { status: "cancelado" },
    });

    expect(resposta.statusCode).toBe(404);

    const intacto = await prisma.agendamento.findUniqueOrThrow({
      where: { id: alheio.id },
    });
    expect(intacto.status).toBe("confirmado");

    await app.close();
  });

  it("recusa requisição sem token com 401", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    const criado = await agendar(app, agenda);

    const resposta = await app.inject({
      method: "PATCH",
      url: `/agendamentos/${criado.id}`,
      payload: { status: "cancelado" },
    });

    expect(resposta.statusCode).toBe(401);

    await app.close();
  });
});
