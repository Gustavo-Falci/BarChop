import { describe, expect, it } from "vitest";
import { buildApp } from "../../src/app";
import { TRABALHO_AGENDA_CHEIA } from "../../src/lib/agenda-cheia-avisos";
import type { FilaDeMemoria } from "../../src/lib/fila";
import { assinarTokenDoLembrete, instanteNaBarbearia } from "../../src/lib/lembrete";
import type { App } from "../../src/tipos";
import { auth } from "../helpers/barbearia";
import { criarClienteComToken } from "../helpers/cliente";
import { QUINTA, proximoDiaDaSemana } from "../helpers/datas";
import { marcarPeloPainel, prepararAgenda, type Agenda } from "../helpers/agenda";

// Toda mudança de agendamento que pode encher ou esvaziar a agenda pede
// a conferência da agenda cheia (plano agenda-cheia-dono). O que a
// conferência faz é de tests/lib/agenda-cheia-avisos.test.ts; aqui, só
// que cada rota pede, com a barbearia certa.

function conferencias(app: App): unknown[] {
  return (app.fila as FilaDeMemoria).pendentes
    .filter((p) => p.trabalho === TRABALHO_AGENDA_CHEIA)
    .map((p) => p.dados);
}

// O que a preparação deixou na fila não conta: só o que a ação pediu.
function esvaziarFila(app: App) {
  ((app.fila as FilaDeMemoria).pendentes as unknown[]).splice(0);
}

async function cenario() {
  const app = buildApp();
  const agenda = await prepararAgenda(app);
  return { app, agenda };
}

// Um agendamento marcado pelo cliente logado, pras rotas de /clientes/me.
async function doCliente(app: App, agenda: Agenda) {
  const cliente = await criarClienteComToken(app, agenda.slug, "11955554444");
  const resposta = await app.inject({
    method: "POST",
    url: `/barbearias/${agenda.slug}/agendamentos`,
    headers: auth(cliente.token),
    payload: {
      servicoIds: [agenda.servico.id],
      data: QUINTA,
      horaInicio: "10:00",
      cliente: { nome: "João", telefone: "11955554444" },
    },
  });
  expect(resposta.statusCode).toBe(201);
  return { cliente, agendamento: resposta.json() as { id: string } };
}

async function tokenDoLembrete(app: App, agendamentoId: string) {
  await app.ready();
  return assinarTokenDoLembrete(app, { agendamentoId, expiraEm: instanteNaBarbearia(QUINTA, "10:00") });
}

describe("a conferência da agenda cheia entra na fila", () => {
  it("ao marcar pelo painel", async () => {
    const { app, agenda } = await cenario();

    await marcarPeloPainel(app, agenda, { data: QUINTA, horaInicio: "10:00" });

    expect(conferencias(app)).toEqual([{ barbeariaId: agenda.barbeariaId }]);
  });

  it("ao marcar pela página pública", async () => {
    const { app, agenda } = await cenario();

    const resposta = await app.inject({
      method: "POST",
      url: `/barbearias/${agenda.slug}/agendamentos`,
      payload: {
        servicoIds: [agenda.servico.id],
        data: QUINTA,
        horaInicio: "11:00",
        cliente: { nome: "Maria", telefone: "11977776666" },
      },
    });

    expect(resposta.statusCode).toBe(201);
    expect(conferencias(app)).toEqual([{ barbeariaId: agenda.barbeariaId }]);
  });

  it("ao cancelar pelo painel", async () => {
    const { app, agenda } = await cenario();
    const agendamento = await marcarPeloPainel(app, agenda, { data: QUINTA, horaInicio: "10:00" });
    esvaziarFila(app);

    const resposta = await app.inject({
      method: "PATCH",
      url: `/agendamentos/${agendamento.id}`,
      headers: auth(agenda.token),
      payload: { status: "cancelado" },
    });

    expect(resposta.statusCode).toBe(200);
    expect(conferencias(app)).toEqual([{ barbeariaId: agenda.barbeariaId }]);
  });

  it("ao remarcar pelo painel", async () => {
    const { app, agenda } = await cenario();
    const agendamento = await marcarPeloPainel(app, agenda, { data: QUINTA, horaInicio: "10:00" });
    esvaziarFila(app);

    const resposta = await app.inject({
      method: "POST",
      url: `/agendamentos/${agendamento.id}/remarcar`,
      headers: auth(agenda.token),
      payload: { data: QUINTA, horaInicio: "14:00" },
    });

    expect(resposta.statusCode).toBe(201);
    expect(conferencias(app)).toEqual([{ barbeariaId: agenda.barbeariaId }]);
  });

  it("ao mudar os serviços (a duração muda)", async () => {
    const { app, agenda } = await cenario();
    const barba = (
      await app.inject({
        method: "POST",
        url: "/servicos",
        headers: auth(agenda.token),
        payload: { nome: "Barba", duracaoMinutos: 30, preco: "30.00" },
      })
    ).json();
    const agendamento = await marcarPeloPainel(app, agenda, { data: QUINTA, horaInicio: "10:00" });
    esvaziarFila(app);

    const resposta = await app.inject({
      method: "PUT",
      url: `/agendamentos/${agendamento.id}/servicos`,
      headers: auth(agenda.token),
      payload: { servicoIds: [agenda.servico.id, barba.id] },
    });

    expect(resposta.statusCode).toBe(200);
    expect(conferencias(app)).toEqual([{ barbeariaId: agenda.barbeariaId }]);
  });

  it("quando o cliente cancela pela conta", async () => {
    const { app, agenda } = await cenario();
    const { cliente, agendamento } = await doCliente(app, agenda);
    esvaziarFila(app);

    const resposta = await app.inject({
      method: "POST",
      url: `/clientes/me/agendamentos/${agendamento.id}/cancelar`,
      headers: auth(cliente.token),
    });

    expect(resposta.statusCode).toBe(200);
    expect(conferencias(app)).toEqual([{ barbeariaId: agenda.barbeariaId }]);
  });

  it("quando o cliente remarca pela conta", async () => {
    const { app, agenda } = await cenario();
    const { cliente, agendamento } = await doCliente(app, agenda);
    esvaziarFila(app);

    const resposta = await app.inject({
      method: "POST",
      url: `/clientes/me/agendamentos/${agendamento.id}/remarcar`,
      headers: auth(cliente.token),
      payload: { data: proximoDiaDaSemana(5), horaInicio: "15:00" },
    });

    expect(resposta.statusCode).toBe(201);
    expect(conferencias(app)).toEqual([{ barbeariaId: agenda.barbeariaId }]);
  });

  it("quando o cliente cancela pelo link do lembrete", async () => {
    const { app, agenda } = await cenario();
    const agendamento = await marcarPeloPainel(app, agenda, { data: QUINTA, horaInicio: "10:00" });
    const token = await tokenDoLembrete(app, agendamento.id);
    esvaziarFila(app);

    const resposta = await app.inject({ method: "POST", url: `/lembretes/${token}/cancelar` });

    expect(resposta.statusCode).toBe(200);
    expect(conferencias(app)).toEqual([{ barbeariaId: agenda.barbeariaId }]);
  });

  it("confirmar presença pelo link não muda a agenda: não pede", async () => {
    const { app, agenda } = await cenario();
    const agendamento = await marcarPeloPainel(app, agenda, { data: QUINTA, horaInicio: "10:00" });
    const token = await tokenDoLembrete(app, agendamento.id);
    esvaziarFila(app);

    await app.inject({ method: "POST", url: `/lembretes/${token}/confirmar` });

    expect(conferencias(app)).toEqual([]);
  });
});
