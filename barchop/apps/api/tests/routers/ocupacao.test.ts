import { describe, expect, it } from "vitest";
import { buildApp } from "../../src/app";
import type { App } from "../../src/tipos";
import { marcarPeloPainel, prepararAgenda, type Agenda } from "../helpers/agenda";
import { auth, criarMembroComToken } from "../helpers/barbearia";
import { DOMINGO, QUINTA } from "../helpers/datas";

// Painel v2, marco 4: a ocupação do Hoje sai da API, com a mesma janela
// da agenda pública — data especial, jornada, pausa e bloqueios. A conta
// antiga do painel usava só o horário da casa no dia da semana.
//
// Barbearia aberta de segunda a sábado, 09:00–18:00 (540 min); Corte de
// 45 min.

function lerOcupacao(app: App, token: string, data: string) {
  return app.inject({
    method: "GET",
    url: `/barbearias/me/ocupacao?data=${data}`,
    headers: auth(token),
  });
}

// A jornada vai sempre com os 7 dias; só a quinta muda.
function jornadaComQuinta(app: App, agenda: Agenda, barbeiroId: string, quinta: Record<string, unknown>) {
  return app.inject({
    method: "PUT",
    url: `/equipe/${barbeiroId}/jornada`,
    headers: auth(agenda.token),
    payload: {
      jornada: [0, 1, 2, 3, 4, 5, 6].map((diaSemana) =>
        diaSemana === 4 ? { diaSemana, ...quinta } : { diaSemana, modo: "barbearia" }
      ),
    },
  });
}

function bloquear(app: App, agenda: Agenda, corpo: Record<string, unknown>) {
  return app.inject({
    method: "POST",
    url: "/bloqueios",
    headers: auth(agenda.token),
    payload: { barbeiroId: agenda.barbeiroId, dataInicio: QUINTA, dataFim: QUINTA, ...corpo },
  });
}

describe("GET /barbearias/me/ocupacao", () => {
  it("dá o trabalho e o agendado de cada profissional e a soma da casa", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    await marcarPeloPainel(app, agenda, { data: QUINTA, horaInicio: "10:00" });

    const resposta = await lerOcupacao(app, agenda.token, QUINTA);

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual({
      data: QUINTA,
      casa: { minutosDeTrabalho: 540, minutosAgendados: 45 },
      profissionais: [
        { id: agenda.barbeiroId, nome: "Barbeiro um", minutosDeTrabalho: 540, minutosAgendados: 45, janela: { abre: "09:00", fecha: "18:00" }, pausa: null },
      ],
    });
    await app.close();
  });

  it("desconta a pausa do almoço e o bloqueio de horas", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    expect((await jornadaComQuinta(app, agenda, agenda.barbeiroId, { modo: "barbearia", pausaInicio: "12:00", pausaFim: "13:00" })).statusCode).toBe(200);
    expect((await bloquear(app, agenda, { horaInicio: "15:00", horaFim: "16:00" })).statusCode).toBe(201);

    const resposta = await lerOcupacao(app, agenda.token, QUINTA);

    expect(resposta.json().casa.minutosDeTrabalho).toBe(420);
    await app.close();
  });

  it("a data especial troca o horário da casa naquele dia", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    await app.inject({
      method: "PUT",
      url: `/barbearias/me/horarios/excecoes/${QUINTA}`,
      headers: auth(agenda.token),
      payload: { fechado: false, horaAbertura: "10:00", horaFechamento: "14:00" },
    });

    const resposta = await lerOcupacao(app, agenda.token, QUINTA);

    expect(resposta.json().casa.minutosDeTrabalho).toBe(240);
    await app.close();
  });

  it("bloqueio do dia inteiro e dia fechado não têm trabalho", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    await bloquear(app, agenda, {});

    const quinta = await lerOcupacao(app, agenda.token, QUINTA);
    const domingo = await lerOcupacao(app, agenda.token, DOMINGO);

    expect(quinta.json().casa.minutosDeTrabalho).toBe(0);
    expect(domingo.json().casa).toEqual({ minutosDeTrabalho: 0, minutosAgendados: 0 });
    await app.close();
  });

  it("cancelado não ocupa", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    const marcado = await marcarPeloPainel(app, agenda, { data: QUINTA, horaInicio: "10:00" });
    await app.inject({
      method: "PATCH",
      url: `/agendamentos/${marcado.id}`,
      headers: auth(agenda.token),
      payload: { status: "cancelado" },
    });

    const resposta = await lerOcupacao(app, agenda.token, QUINTA);

    expect(resposta.json().casa.minutosAgendados).toBe(0);
    await app.close();
  });

  it("com equipe, uma linha por quem atende; a recepção fica de fora", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    const profissional = await criarMembroComToken(app, agenda.barbeariaId, "profissional", "p1");
    await criarMembroComToken(app, agenda.barbeariaId, "recepcao", "r1");
    const jornada = await jornadaComQuinta(app, agenda, profissional.barbeiroId, {
      modo: "proprio",
      horaInicio: "13:00",
      horaFim: "18:00",
    });
    expect(jornada.statusCode).toBe(200);

    const resposta = await lerOcupacao(app, agenda.token, QUINTA);

    expect(resposta.json().profissionais).toEqual([
      { id: agenda.barbeiroId, nome: "Barbeiro um", minutosDeTrabalho: 540, minutosAgendados: 0, janela: { abre: "09:00", fecha: "18:00" }, pausa: null },
      {
        id: profissional.barbeiroId,
        nome: "Membro p1",
        minutosDeTrabalho: 300,
        minutosAgendados: 0,
        // A janela é a da jornada dele, não a da casa.
        janela: { abre: "13:00", fecha: "18:00" },
        pausa: null,
      },
    ]);
    expect(resposta.json().casa).toEqual({ minutosDeTrabalho: 840, minutosAgendados: 0 });
    await app.close();
  });

  it("o profissional vê só a própria ocupação", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    await marcarPeloPainel(app, agenda, { data: QUINTA, horaInicio: "10:00" });
    const profissional = await criarMembroComToken(app, agenda.barbeariaId, "profissional", "p1");

    const resposta = await lerOcupacao(app, profissional.token, QUINTA);

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().profissionais).toEqual([
      { id: profissional.barbeiroId, nome: "Membro p1", minutosDeTrabalho: 540, minutosAgendados: 0, janela: { abre: "09:00", fecha: "18:00" }, pausa: null },
    ]);
    expect(resposta.json().casa).toEqual({ minutosDeTrabalho: 540, minutosAgendados: 0 });
    await app.close();
  });

  it("sem data ou fora do formato é 400; data que não existe é 422", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    const semData = await app.inject({
      method: "GET",
      url: "/barbearias/me/ocupacao",
      headers: auth(agenda.token),
    });
    const formato = await lerOcupacao(app, agenda.token, "amanha");
    const inexistente = await lerOcupacao(app, agenda.token, "2026-02-31");

    expect(semData.statusCode).toBe(400);
    expect(formato.statusCode).toBe(400);
    expect(inexistente.statusCode).toBe(422);
    expect(inexistente.json().erro).toBe("data_invalida");
    await app.close();
  });

  it("sem login é 401", async () => {
    const app = buildApp();

    const resposta = await app.inject({ method: "GET", url: `/barbearias/me/ocupacao?data=${QUINTA}` });

    expect(resposta.statusCode).toBe(401);
    await app.close();
  });

  // Painel v2, marco 6: a agenda sombreia o que está fechado de cada
  // profissional. A janela é o expediente (data especial > horário da
  // casa, ∩ jornada); bloqueio fica de fora — a agenda já o desenha
  // como faixa própria, com o motivo.
  describe("expediente de cada profissional", () => {
    it("devolve a pausa do almoço da jornada", async () => {
      const app = buildApp();
      const agenda = await prepararAgenda(app);
      await jornadaComQuinta(app, agenda, agenda.barbeiroId, {
        modo: "barbearia",
        pausaInicio: "12:00",
        pausaFim: "13:00",
      });

      const [profissional] = (await lerOcupacao(app, agenda.token, QUINTA)).json().profissionais;

      expect(profissional.janela).toEqual({ abre: "09:00", fecha: "18:00" });
      expect(profissional.pausa).toEqual({ inicio: "12:00", fim: "13:00" });
      await app.close();
    });

    it("a data especial troca a janela", async () => {
      const app = buildApp();
      const agenda = await prepararAgenda(app);
      await app.inject({
        method: "PUT",
        url: `/barbearias/me/horarios/excecoes/${QUINTA}`,
        headers: auth(agenda.token),
        payload: { fechado: false, horaAbertura: "10:00", horaFechamento: "14:00" },
      });

      const [profissional] = (await lerOcupacao(app, agenda.token, QUINTA)).json().profissionais;

      expect(profissional.janela).toEqual({ abre: "10:00", fecha: "14:00" });
      await app.close();
    });

    it("dia fechado e folga não têm janela nem pausa", async () => {
      const app = buildApp();
      const agenda = await prepararAgenda(app);
      await jornadaComQuinta(app, agenda, agenda.barbeiroId, { modo: "folga" });

      const [quinta] = (await lerOcupacao(app, agenda.token, QUINTA)).json().profissionais;
      const [domingo] = (await lerOcupacao(app, agenda.token, DOMINGO)).json().profissionais;

      expect(quinta).toMatchObject({ janela: null, pausa: null });
      expect(domingo).toMatchObject({ janela: null, pausa: null });
      await app.close();
    });

    it("bloqueio do dia inteiro não apaga a janela", async () => {
      // O trabalho cai a zero (a ocupação desconta), mas o expediente é o
      // mesmo: a agenda desenha o bloqueio por cima, com o motivo.
      const app = buildApp();
      const agenda = await prepararAgenda(app);
      await bloquear(app, agenda, {});

      const [profissional] = (await lerOcupacao(app, agenda.token, QUINTA)).json().profissionais;

      expect(profissional.minutosDeTrabalho).toBe(0);
      expect(profissional.janela).toEqual({ abre: "09:00", fecha: "18:00" });
      await app.close();
    });
  });
});
