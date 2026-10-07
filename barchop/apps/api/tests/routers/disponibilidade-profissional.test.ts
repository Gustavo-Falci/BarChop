import { describe, expect, it } from "vitest";
import { buildApp } from "../../src/app";
import type { App } from "../../src/tipos";
import { auth, criarBarbeariaComToken, criarMembroComToken } from "../helpers/barbearia";
import { QUINTA } from "../helpers/datas";

// Onda 1, B3: a disponibilidade e a criação de agendamento passam a
// respeitar a jornada de cada membro, os bloqueios dele e os serviços
// que ele faz.
//
// Barbearia aberta de segunda a sábado, 09:00–18:00; Corte de 30 min.
// QUINTA é futura (helpers/datas.ts).

async function prepararAgenda(app: App) {
  const dono = await criarBarbeariaComToken(app);
  await app.inject({
    method: "PUT",
    url: "/barbearias/me/horarios",
    headers: auth(dono.token),
    payload: {
      horarios: [1, 2, 3, 4, 5, 6].map((diaSemana) => ({
        diaSemana,
        horaAbertura: "09:00",
        horaFechamento: "18:00",
      })),
    },
  });
  const corte = (
    await app.inject({
      method: "POST",
      url: "/servicos",
      headers: auth(dono.token),
      payload: { nome: "Corte", duracaoMinutos: 30, preco: "40.00" },
    })
  ).json();
  const ana = await criarMembroComToken(app, dono.barbeariaId, "profissional", "a");
  return { dono, corte, ana };
}

type Agenda = Awaited<ReturnType<typeof prepararAgenda>>;

async function horariosDe(app: App, agenda: Agenda, barbeiroId: string, data = QUINTA) {
  const params = new URLSearchParams({ barbeiroId, data });
  params.append("servicoIds", agenda.corte.id);
  return app.inject({
    method: "GET",
    url: `/barbearias/${agenda.dono.slug}/disponibilidade?${params}`,
  });
}

function agendarPublico(app: App, agenda: Agenda, barbeiroId: string, horaInicio: string) {
  return app.inject({
    method: "POST",
    url: `/barbearias/${agenda.dono.slug}/agendamentos`,
    payload: {
      barbeiroId,
      servicoIds: [agenda.corte.id],
      data: QUINTA,
      horaInicio,
      cliente: { nome: "João", telefone: "11999990001" },
    },
  });
}

function jornadaCom(dia: Record<string, unknown>) {
  return [0, 1, 2, 3, 4, 5, 6].map((diaSemana) =>
    diaSemana === dia.diaSemana ? dia : { diaSemana, modo: "barbearia" }
  );
}

function putJornada(app: App, agenda: Agenda, barbeiroId: string, jornada: unknown) {
  return app.inject({
    method: "PUT",
    url: `/equipe/${barbeiroId}/jornada`,
    headers: auth(agenda.dono.token),
    payload: { jornada },
  });
}

function bloquear(app: App, agenda: Agenda, corpo: Record<string, unknown>) {
  return app.inject({
    method: "POST",
    url: "/bloqueios",
    headers: auth(agenda.dono.token),
    payload: { dataInicio: QUINTA, dataFim: QUINTA, ...corpo },
  });
}

describe("jornada na disponibilidade", () => {
  it("folga na quinta: nenhum horário, e marcar dá 422", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    await putJornada(app, agenda, agenda.ana.barbeiroId, jornadaCom({ diaSemana: 4, modo: "folga" }));

    const horarios = await horariosDe(app, agenda, agenda.ana.barbeiroId);
    const marcar = await agendarPublico(app, agenda, agenda.ana.barbeiroId, "10:00");

    expect(horarios.json().horarios).toEqual([]);
    expect(marcar.statusCode).toBe(422);
    expect(marcar.json().erro).toBe("horario_indisponivel");
    await app.close();
  });

  it("horário próprio é recortado no funcionamento", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    await putJornada(
      app,
      agenda,
      agenda.ana.barbeiroId,
      jornadaCom({ diaSemana: 4, modo: "proprio", horaInicio: "13:00", horaFim: "20:00" })
    );

    const { horarios } = (await horariosDe(app, agenda, agenda.ana.barbeiroId)).json();

    expect(horarios[0]).toBe("13:00");
    // 17:30 + 30 min fecha às 18:00, o fim do funcionamento.
    expect(horarios.at(-1)).toBe("17:30");
    await app.close();
  });

  it("a jornada de um membro não mexe na do outro", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    await putJornada(app, agenda, agenda.ana.barbeiroId, jornadaCom({ diaSemana: 4, modo: "folga" }));

    const doDono = (await horariosDe(app, agenda, agenda.dono.barbeiroId)).json().horarios;

    expect(doDono[0]).toBe("09:00");
    await app.close();
  });
});

describe("bloqueio na disponibilidade", () => {
  it("almoço tira a faixa dos horários, e marcar nela dá 422 horario_bloqueado", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    await bloquear(app, agenda, { barbeiroId: agenda.ana.barbeiroId, horaInicio: "12:00", horaFim: "13:00" });

    const { horarios } = (await horariosDe(app, agenda, agenda.ana.barbeiroId)).json();
    const noAlmoco = await agendarPublico(app, agenda, agenda.ana.barbeiroId, "12:15");
    // Começa antes e invade o almoço: 11:45 + 30 min = 12:15.
    const invadindo = await agendarPublico(app, agenda, agenda.ana.barbeiroId, "11:45");

    expect(horarios).toContain("11:30");
    expect(horarios).not.toContain("11:45");
    expect(horarios).not.toContain("12:00");
    expect(horarios).not.toContain("12:45");
    expect(horarios).toContain("13:00");
    expect(noAlmoco.json().erro).toBe("horario_bloqueado");
    expect(invadindo.json().erro).toBe("horario_bloqueado");
    await app.close();
  });

  it("bloqueio do dia inteiro fecha o dia", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    await bloquear(app, agenda, { barbeiroId: agenda.ana.barbeiroId, motivo: "Médico" });

    const horarios = await horariosDe(app, agenda, agenda.ana.barbeiroId);
    const marcar = await agendarPublico(app, agenda, agenda.ana.barbeiroId, "10:00");

    expect(horarios.json().horarios).toEqual([]);
    expect(marcar.statusCode).toBe(422);
    expect(marcar.json().erro).toBe("horario_bloqueado");
    await app.close();
  });

  it("o bloqueio da Ana não fecha a agenda do dono", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    await bloquear(app, agenda, { barbeiroId: agenda.ana.barbeiroId });

    const marcar = await agendarPublico(app, agenda, agenda.dono.barbeiroId, "10:00");

    expect(marcar.statusCode).toBe(201);
    await app.close();
  });

  it("o barbeiro também não marca pelo painel em cima de um bloqueio", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    await bloquear(app, agenda, { barbeiroId: agenda.ana.barbeiroId });
    const cliente = (
      await app.inject({
        method: "POST",
        url: "/clientes",
        headers: auth(agenda.dono.token),
        payload: { nome: "Maria", telefone: "11999990002" },
      })
    ).json();

    const resposta = await app.inject({
      method: "POST",
      url: "/agendamentos",
      headers: auth(agenda.dono.token),
      payload: {
        barbeiroId: agenda.ana.barbeiroId,
        clienteId: cliente.id,
        servicoIds: [agenda.corte.id],
        data: QUINTA,
        horaInicio: "10:00",
      },
    });

    expect(resposta.json().erro).toBe("horario_bloqueado");
    await app.close();
  });
});

// Painel v2, marco 3: a pausa do almoço mora na jornada de cada membro
// e vale nos três caminhos — o dia, o mês e o POST —, pro cliente e pro
// painel (é horário, não regra do cliente).
describe("pausa na disponibilidade", () => {
  const PAUSA_NA_QUINTA = jornadaCom({
    diaSemana: 4,
    modo: "barbearia",
    pausaInicio: "12:00",
    pausaFim: "13:00",
  });

  it("a pausa tira a faixa dos horários, e marcar nela dá 422 horario_na_pausa", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    await putJornada(app, agenda, agenda.ana.barbeiroId, PAUSA_NA_QUINTA);

    const { horarios } = (await horariosDe(app, agenda, agenda.ana.barbeiroId)).json();
    const naPausa = await agendarPublico(app, agenda, agenda.ana.barbeiroId, "12:15");
    // Começa antes e invade a pausa: 11:45 + 30 min = 12:15.
    const invadindo = await agendarPublico(app, agenda, agenda.ana.barbeiroId, "11:45");

    expect(horarios).toContain("11:30");
    expect(horarios).not.toContain("11:45");
    expect(horarios).not.toContain("12:00");
    expect(horarios).not.toContain("12:45");
    expect(horarios).toContain("13:00");
    expect(naPausa.statusCode).toBe(422);
    expect(naPausa.json().erro).toBe("horario_na_pausa");
    expect(invadindo.json().erro).toBe("horario_na_pausa");
    await app.close();
  });

  it("a pausa é de quem tem: a agenda do dono segue inteira", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    await putJornada(app, agenda, agenda.ana.barbeiroId, PAUSA_NA_QUINTA);

    const doDono = (await horariosDe(app, agenda, agenda.dono.barbeiroId)).json().horarios;

    expect(doDono).toContain("12:00");
    await app.close();
  });

  it("o painel também não marca em cima da pausa", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    await putJornada(app, agenda, agenda.ana.barbeiroId, PAUSA_NA_QUINTA);
    const cliente = (
      await app.inject({
        method: "POST",
        url: "/clientes",
        headers: auth(agenda.dono.token),
        payload: { nome: "Maria", telefone: "11999990002" },
      })
    ).json();

    const resposta = await app.inject({
      method: "POST",
      url: "/agendamentos",
      headers: auth(agenda.dono.token),
      payload: {
        barbeiroId: agenda.ana.barbeiroId,
        clienteId: cliente.id,
        servicoIds: [agenda.corte.id],
        data: QUINTA,
        horaInicio: "12:00",
      },
    });

    expect(resposta.json().erro).toBe("horario_na_pausa");
    await app.close();
  });

  it("pausa que cobre o expediente inteiro some do calendário do mês", async () => {
    // Setembro de 2037: dia 3 é quinta; dia 2 é quarta.
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    await putJornada(
      app,
      agenda,
      agenda.ana.barbeiroId,
      jornadaCom({ diaSemana: 4, modo: "barbearia", pausaInicio: "09:00", pausaFim: "18:00" })
    );
    const params = new URLSearchParams({ barbeiroId: agenda.ana.barbeiroId, mes: "2037-09" });
    params.append("servicoIds", agenda.corte.id);

    const { dias } = (
      await app.inject({
        method: "GET",
        url: `/barbearias/${agenda.dono.slug}/disponibilidade/mes?${params}`,
      })
    ).json();

    expect(dias["2037-09-03"]).toBe(false);
    expect(dias["2037-09-02"]).toBe(true);
    await app.close();
  });

  it("no qualquer um, quem está na pausa não é escolhido", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    // O dono não atende: sobra a Ana, e na pausa dela ninguém atende.
    await app.inject({
      method: "PATCH",
      url: `/equipe/${agenda.dono.barbeiroId}`,
      headers: auth(agenda.dono.token),
      payload: { atende: false },
    });
    await putJornada(app, agenda, agenda.ana.barbeiroId, PAUSA_NA_QUINTA);
    const params = new URLSearchParams({ data: QUINTA });
    params.append("servicoIds", agenda.corte.id);

    const { horarios } = (
      await app.inject({
        method: "GET",
        url: `/barbearias/${agenda.dono.slug}/disponibilidade?${params}`,
      })
    ).json();

    expect(horarios).toContain("11:30");
    expect(horarios).not.toContain("12:00");
    await app.close();
  });
});

describe("serviços e atendimento do membro", () => {
  it("serviço que o membro não faz: 422 servico_fora_do_profissional, na consulta e ao marcar", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    await app.inject({
      method: "PUT",
      url: `/equipe/${agenda.ana.barbeiroId}/servicos`,
      headers: auth(agenda.dono.token),
      payload: { servicoIds: [] },
    });

    const horarios = await horariosDe(app, agenda, agenda.ana.barbeiroId);
    const marcar = await agendarPublico(app, agenda, agenda.ana.barbeiroId, "10:00");

    expect(horarios.statusCode).toBe(422);
    expect(horarios.json().erro).toBe("servico_fora_do_profissional");
    expect(marcar.json().erro).toBe("servico_fora_do_profissional");
    await app.close();
  });

  it("membro que não atende: 422 profissional_nao_atende — a recepção não recebe agendamento", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    const recepcao = await criarMembroComToken(app, agenda.dono.barbeariaId, "recepcao", "r");

    const horarios = await horariosDe(app, agenda, recepcao.barbeiroId);
    const marcar = await agendarPublico(app, agenda, recepcao.barbeiroId, "10:00");

    expect(horarios.statusCode).toBe(422);
    expect(horarios.json().erro).toBe("profissional_nao_atende");
    expect(marcar.json().erro).toBe("profissional_nao_atende");
    await app.close();
  });
});

describe("o mês por profissional", () => {
  it("folga nas quintas e um bloqueio de dia inteiro somem do calendário", async () => {
    // Setembro de 2037: dia 3 e dia 10 são quintas; dia 15 é terça.
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    await putJornada(app, agenda, agenda.ana.barbeiroId, jornadaCom({ diaSemana: 4, modo: "folga" }));
    await bloquear(app, agenda, {
      barbeiroId: agenda.ana.barbeiroId,
      dataInicio: "2037-09-15",
      dataFim: "2037-09-15",
    });
    const params = new URLSearchParams({ barbeiroId: agenda.ana.barbeiroId, mes: "2037-09" });
    params.append("servicoIds", agenda.corte.id);

    const { dias } = (
      await app.inject({
        method: "GET",
        url: `/barbearias/${agenda.dono.slug}/disponibilidade/mes?${params}`,
      })
    ).json();

    expect(dias["2037-09-03"]).toBe(false);
    expect(dias["2037-09-10"]).toBe(false);
    expect(dias["2037-09-15"]).toBe(false);
    expect(dias["2037-09-14"]).toBe(true);
    expect(dias["2037-09-16"]).toBe(true);
    await app.close();
  });
});
