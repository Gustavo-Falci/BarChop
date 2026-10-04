import { describe, expect, it } from "vitest";
import { buildApp } from "../../src/app";
import type { App } from "../../src/tipos";
import { auth, criarBarbeariaComToken, criarMembroComToken } from "../helpers/barbearia";

// Onda 1, B2: folga, almoço e horário fechado de cada membro. Um
// período de datas; sem horas é o dia inteiro, com horas é a mesma faixa
// em cada dia do período.
//
// Quem pode: o dono e a recepção, de qualquer um (a recepção cuida da
// agenda); o profissional, só os dele — o do colega é 404 pra ler ou
// apagar e 403 pra criar, como na agenda.

function criar(app: App, token: string, corpo: Record<string, unknown>) {
  return app.inject({ method: "POST", url: "/bloqueios", headers: auth(token), payload: corpo });
}

async function prepararEquipe(app: App) {
  const dono = await criarBarbeariaComToken(app);
  const recepcao = await criarMembroComToken(app, dono.barbeariaId, "recepcao", "r");
  const ana = await criarMembroComToken(app, dono.barbeariaId, "profissional", "a");
  const beto = await criarMembroComToken(app, dono.barbeariaId, "profissional", "b");
  return { dono, recepcao, ana, beto };
}

describe("POST /bloqueios", () => {
  it("cria férias (dia inteiro) e almoço (faixa de horas)", async () => {
    const app = buildApp();
    const { dono, ana } = await prepararEquipe(app);

    const ferias = await criar(app, dono.token, {
      barbeiroId: ana.barbeiroId,
      dataInicio: "2037-01-05",
      dataFim: "2037-01-09",
      motivo: "Férias",
    });
    const almoco = await criar(app, dono.token, {
      barbeiroId: ana.barbeiroId,
      dataInicio: "2037-01-12",
      dataFim: "2037-01-16",
      horaInicio: "12:00",
      horaFim: "13:00",
      motivo: "Almoço",
    });

    expect(ferias.statusCode).toBe(201);
    expect(ferias.json()).toMatchObject({
      barbeiroId: ana.barbeiroId,
      dataInicio: "2037-01-05",
      dataFim: "2037-01-09",
      horaInicio: null,
      horaFim: null,
      motivo: "Férias",
    });
    expect(almoco.json()).toMatchObject({ horaInicio: "12:00", horaFim: "13:00" });
    await app.close();
  });

  it("período invertido, hora pela metade ou invertida: 422", async () => {
    const app = buildApp();
    const { dono } = await prepararEquipe(app);
    const base = { barbeiroId: dono.barbeiroId, dataInicio: "2037-01-05", dataFim: "2037-01-05" };

    const invertido = await criar(app, dono.token, { ...base, dataFim: "2037-01-01" });
    const metade = await criar(app, dono.token, { ...base, horaInicio: "12:00" });
    const horaInvertida = await criar(app, dono.token, { ...base, horaInicio: "13:00", horaFim: "12:00" });

    expect(invertido.json().erro).toBe("periodo_invalido");
    expect(metade.json().erro).toBe("horario_incompleto");
    expect(horaInvertida.json().erro).toBe("intervalo_invalido");
    for (const resposta of [invertido, metade, horaInvertida]) expect(resposta.statusCode).toBe(422);
    await app.close();
  });

  it("período de mais de um ano ou data que não existe: 422", async () => {
    const app = buildApp();
    const { dono } = await prepararEquipe(app);

    const longo = await criar(app, dono.token, {
      barbeiroId: dono.barbeiroId,
      dataInicio: "2037-01-01",
      dataFim: "2038-06-01",
    });
    const inexistente = await criar(app, dono.token, {
      barbeiroId: dono.barbeiroId,
      dataInicio: "2037-02-31",
      dataFim: "2037-03-01",
    });

    expect(longo.json().erro).toBe("periodo_invalido");
    expect(inexistente.json().erro).toBe("data_invalida");
    await app.close();
  });

  it("membro de outra barbearia: 422 barbeiro_invalido", async () => {
    const app = buildApp();
    const { dono } = await prepararEquipe(app);
    const outra = await criarBarbeariaComToken(app, "outra");

    const resposta = await criar(app, dono.token, {
      barbeiroId: outra.barbeiroId,
      dataInicio: "2037-01-05",
      dataFim: "2037-01-05",
    });

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json().erro).toBe("barbeiro_invalido");
    await app.close();
  });

  it("a recepção bloqueia a agenda de qualquer um; o profissional, só a dele", async () => {
    const app = buildApp();
    const { recepcao, ana, beto } = await prepararEquipe(app);
    const periodo = { dataInicio: "2037-01-05", dataFim: "2037-01-05" };

    const daRecepcao = await criar(app, recepcao.token, { ...periodo, barbeiroId: beto.barbeiroId });
    const proprio = await criar(app, ana.token, { ...periodo, barbeiroId: ana.barbeiroId });
    const alheio = await criar(app, ana.token, { ...periodo, barbeiroId: beto.barbeiroId });

    expect(daRecepcao.statusCode).toBe(201);
    expect(proprio.statusCode).toBe(201);
    expect(alheio.statusCode).toBe(403);
    expect(alheio.json().erro).toBe("sem_permissao");
    await app.close();
  });
});

describe("GET /bloqueios", () => {
  it("lista os do período, de quem o papel enxerga", async () => {
    const app = buildApp();
    const { dono, ana, beto } = await prepararEquipe(app);
    await criar(app, dono.token, { barbeiroId: ana.barbeiroId, dataInicio: "2037-01-05", dataFim: "2037-01-09" });
    await criar(app, dono.token, { barbeiroId: beto.barbeiroId, dataInicio: "2037-01-08", dataFim: "2037-01-08" });
    await criar(app, dono.token, { barbeiroId: beto.barbeiroId, dataInicio: "2037-03-01", dataFim: "2037-03-01" });

    const doDono = await app.inject({
      method: "GET",
      url: "/bloqueios?de=2037-01-01&ate=2037-01-31",
      headers: auth(dono.token),
    });
    const daAna = await app.inject({
      method: "GET",
      url: "/bloqueios?de=2037-01-01&ate=2037-01-31",
      headers: auth(ana.token),
    });

    expect(doDono.json().bloqueios).toHaveLength(2);
    expect(daAna.json().bloqueios.map((b: { barbeiroId: string }) => b.barbeiroId)).toEqual([
      ana.barbeiroId,
    ]);
    await app.close();
  });

  it("pega o bloqueio que começa antes do período e termina dentro dele", async () => {
    const app = buildApp();
    const { dono } = await prepararEquipe(app);
    await criar(app, dono.token, { barbeiroId: dono.barbeiroId, dataInicio: "2036-12-28", dataFim: "2037-01-03" });

    const resposta = await app.inject({
      method: "GET",
      url: "/bloqueios?de=2037-01-01&ate=2037-01-31",
      headers: auth(dono.token),
    });

    expect(resposta.json().bloqueios).toHaveLength(1);
    await app.close();
  });

  it("não mostra bloqueio de outra barbearia", async () => {
    const app = buildApp();
    const { dono } = await prepararEquipe(app);
    const outra = await criarBarbeariaComToken(app, "outra");
    await criar(app, outra.token, { barbeiroId: outra.barbeiroId, dataInicio: "2037-01-05", dataFim: "2037-01-05" });

    const resposta = await app.inject({
      method: "GET",
      url: "/bloqueios?de=2037-01-01&ate=2037-01-31",
      headers: auth(dono.token),
    });

    expect(resposta.json().bloqueios).toEqual([]);
    await app.close();
  });
});

describe("DELETE /bloqueios/:id", () => {
  it("apaga; o profissional não alcança o do colega (404)", async () => {
    const app = buildApp();
    const { dono, ana, beto } = await prepararEquipe(app);
    const doBeto = (
      await criar(app, dono.token, { barbeiroId: beto.barbeiroId, dataInicio: "2037-01-05", dataFim: "2037-01-05" })
    ).json();

    const pelaAna = await app.inject({ method: "DELETE", url: `/bloqueios/${doBeto.id}`, headers: auth(ana.token) });
    const peloDono = await app.inject({ method: "DELETE", url: `/bloqueios/${doBeto.id}`, headers: auth(dono.token) });
    const deNovo = await app.inject({ method: "DELETE", url: `/bloqueios/${doBeto.id}`, headers: auth(dono.token) });

    expect(pelaAna.statusCode).toBe(404);
    expect(peloDono.statusCode).toBe(204);
    expect(deNovo.statusCode).toBe(404);
    await app.close();
  });
});
