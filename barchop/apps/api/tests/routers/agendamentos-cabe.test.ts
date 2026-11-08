import { describe, expect, it } from "vitest";
import { buildApp } from "../../src/app";
import type { App } from "../../src/tipos";
import { marcarPeloPainel, prepararAgenda, type Agenda } from "../helpers/agenda";
import { auth, criarMembroComToken } from "../helpers/barbearia";
import { DOMINGO, QUINTA } from "../helpers/datas";

// O "Outro horário" do painel (pedido do barbeiro, 08/11/2026): qualquer
// minuto que caiba, e não só os da grade. A conferência (GET
// /agendamentos/cabe) e o POST passam pela mesma checagem, então o campo
// que diz "Cabe" nunca leva a um 422.

function cabe(
  app: App,
  token: string,
  query: { barbeiroId: string; data: string; horaInicio: string; servicoIds: string[] }
) {
  const params = new URLSearchParams({
    barbeiroId: query.barbeiroId,
    data: query.data,
    horaInicio: query.horaInicio,
  });
  for (const id of query.servicoIds) params.append("servicoIds", id);
  return app.inject({ method: "GET", url: `/agendamentos/cabe?${params}`, headers: auth(token) });
}

function doDono(app: App, agenda: Agenda, horaInicio: string, data = QUINTA) {
  return cabe(app, agenda.token, {
    barbeiroId: agenda.barbeiroId,
    data,
    horaInicio,
    servicoIds: [agenda.servico.id],
  });
}

function marcar(app: App, agenda: Agenda, horaInicio: string) {
  return app.inject({
    method: "POST",
    url: "/agendamentos",
    headers: auth(agenda.token),
    payload: {
      barbeiroId: agenda.barbeiroId,
      clienteId: agenda.cliente.id,
      servicoIds: [agenda.servico.id],
      data: QUINTA,
      horaInicio,
    },
  });
}

describe("outro horário no painel", () => {
  it("o POST do painel aceita qualquer minuto que cabe", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    // Corte de 45: 09:00 – 09:45.
    await marcarPeloPainel(app, agenda, { data: QUINTA, horaInicio: "09:00" });

    const resposta = await marcar(app, agenda, "09:50");

    expect(resposta.statusCode).toBe(201);
    expect(resposta.json().horaInicio).toBe("09:50");
    await app.close();
  });

  it("cabe: responde que cabe", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    const resposta = await doDono(app, agenda, "10:35");

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual({ cabe: true });
    await app.close();
  });

  it("bate com outro: diz com quem e de quando a quando, e o POST recusa igual", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    await marcarPeloPainel(app, agenda, { data: QUINTA, horaInicio: "09:00" });

    const conferido = await doDono(app, agenda, "09:30");
    const marcado = await marcar(app, agenda, "09:30");

    expect(conferido.json()).toEqual({
      cabe: false,
      codigo: "horario_indisponivel",
      mensagem: "bate com João da Silva, marcado das 09:00 às 09:45",
    });
    expect(marcado.statusCode).toBe(422);
    expect(marcado.json()).toMatchObject({
      erro: "horario_indisponivel",
      mensagem: "bate com João da Silva, marcado das 09:00 às 09:45",
    });
    await app.close();
  });

  it("fora do expediente e dia sem atendimento", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    // 17:30 + 45 = 18:15, depois de fechar.
    const tarde = await doDono(app, agenda, "17:30");
    const domingo = await doDono(app, agenda, "10:00", DOMINGO);

    expect(tarde.json()).toEqual({
      cabe: false,
      codigo: "horario_indisponivel",
      mensagem: "fica fora do expediente (09:00 – 18:00)",
    });
    expect(domingo.json()).toEqual({
      cabe: false,
      codigo: "horario_indisponivel",
      mensagem: "o profissional não atende nesse dia",
    });
    await app.close();
  });

  it("bloqueio e pausa dão o código de cada um", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    await app.inject({
      method: "POST",
      url: "/bloqueios",
      headers: auth(agenda.token),
      payload: {
        barbeiroId: agenda.barbeiroId,
        dataInicio: QUINTA,
        dataFim: QUINTA,
        horaInicio: "15:00",
        horaFim: "16:00",
        motivo: "Médico",
      },
    });
    await app.inject({
      method: "PUT",
      url: `/equipe/${agenda.barbeiroId}/jornada`,
      headers: auth(agenda.token),
      payload: {
        jornada: [0, 1, 2, 3, 4, 5, 6].map((diaSemana) =>
          diaSemana === 4
            ? { diaSemana, modo: "barbearia", pausaInicio: "12:00", pausaFim: "13:00" }
            : { diaSemana, modo: "barbearia" }
        ),
      },
    });

    const bloqueado = await doDono(app, agenda, "14:30");
    const naPausa = await doDono(app, agenda, "11:30");

    expect(bloqueado.json()).toMatchObject({ cabe: false, codigo: "horario_bloqueado" });
    expect(naPausa.json()).toEqual({
      cabe: false,
      codigo: "horario_na_pausa",
      mensagem: "esse horário cai na pausa do profissional (12:00 – 13:00)",
    });
    await app.close();
  });

  it("o passado vale: o painel registra depois do fato", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    // 10/09/2026 é uma quinta que já passou.
    const resposta = await doDono(app, agenda, "10:05", "2026-09-10");

    expect(resposta.json()).toEqual({ cabe: true });
    await app.close();
  });

  it("o profissional confere só a própria agenda", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    const ana = await criarMembroComToken(app, agenda.barbeariaId, "profissional", "ana");

    const alheia = await cabe(app, ana.token, {
      barbeiroId: agenda.barbeiroId,
      data: QUINTA,
      horaInicio: "10:00",
      servicoIds: [agenda.servico.id],
    });

    expect(alheia.statusCode).toBe(403);
    expect(alheia.json().erro).toBe("sem_permissao");
    await app.close();
  });

  it("sem login: 401", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    const resposta = await app.inject({
      method: "GET",
      url: `/agendamentos/cabe?barbeiroId=${agenda.barbeiroId}&data=${QUINTA}&horaInicio=10:00&servicoIds=${agenda.servico.id}`,
    });

    expect(resposta.statusCode).toBe(401);
    await app.close();
  });
});
