import { describe, expect, it } from "vitest";
import { buildApp } from "../../src/app";
import type { App } from "../../src/tipos";
import { auth, criarBarbeariaComToken, criarMembroComToken } from "../helpers/barbearia";

// Onda 1, B2: o dono diz em que dias e horários cada membro trabalha, e
// que serviços ele faz. A semana vai inteira, como no PUT de horários:
// sete dias, cada um `barbearia`, `proprio` (com as horas) ou `folga`.

const SEMANA_DA_BARBEARIA = [0, 1, 2, 3, 4, 5, 6].map((diaSemana) => ({
  diaSemana,
  modo: "barbearia",
}));

function putJornada(app: App, token: string, id: string, jornada: unknown) {
  return app.inject({
    method: "PUT",
    url: `/equipe/${id}/jornada`,
    headers: auth(token),
    payload: { jornada },
  });
}

function comDia(dia: Record<string, unknown>) {
  return SEMANA_DA_BARBEARIA.map((d) => (d.diaSemana === dia.diaSemana ? dia : d));
}

describe("GET /equipe/:id/jornada", () => {
  it("devolve os sete dias do membro", async () => {
    const app = buildApp();
    const dono = await criarBarbeariaComToken(app);

    const resposta = await app.inject({
      method: "GET",
      url: `/equipe/${dono.barbeiroId}/jornada`,
      headers: auth(dono.token),
    });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().jornada).toEqual(
      SEMANA_DA_BARBEARIA.map((dia) => ({ ...dia, horaInicio: null, horaFim: null }))
    );
    await app.close();
  });

  it("membro de outra barbearia: 404", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");
    const dois = await criarBarbeariaComToken(app, "dois");

    const resposta = await app.inject({
      method: "GET",
      url: `/equipe/${dois.barbeiroId}/jornada`,
      headers: auth(um.token),
    });

    expect(resposta.statusCode).toBe(404);
    await app.close();
  });
});

describe("PUT /equipe/:id/jornada", () => {
  it("grava a semana: horas próprias num dia, folga em outro", async () => {
    const app = buildApp();
    const dono = await criarBarbeariaComToken(app);
    const ana = await criarMembroComToken(app, dono.barbeariaId, "profissional", "p");
    const semana = SEMANA_DA_BARBEARIA.map((dia) =>
      dia.diaSemana === 1
        ? { diaSemana: 1, modo: "proprio", horaInicio: "13:00", horaFim: "20:00" }
        : dia.diaSemana === 0
          ? { diaSemana: 0, modo: "folga" }
          : dia
    );

    const resposta = await putJornada(app, dono.token, ana.barbeiroId, semana);

    expect(resposta.statusCode).toBe(200);
    const jornada = resposta.json().jornada;
    expect(jornada[0]).toEqual({ diaSemana: 0, modo: "folga", horaInicio: null, horaFim: null });
    expect(jornada[1]).toEqual({ diaSemana: 1, modo: "proprio", horaInicio: "13:00", horaFim: "20:00" });
    expect(jornada[2]).toMatchObject({ modo: "barbearia" });
    await app.close();
  });

  it("horas mandadas num dia que não é próprio são descartadas, como no fechado do funcionamento", async () => {
    const app = buildApp();
    const dono = await criarBarbeariaComToken(app);

    const resposta = await putJornada(
      app,
      dono.token,
      dono.barbeiroId,
      comDia({ diaSemana: 3, modo: "folga", horaInicio: "09:00", horaFim: "12:00" })
    );

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().jornada[3]).toEqual({
      diaSemana: 3,
      modo: "folga",
      horaInicio: null,
      horaFim: null,
    });
    await app.close();
  });

  it("dia próprio sem hora, ou com a entrada depois da saída: 422", async () => {
    const app = buildApp();
    const dono = await criarBarbeariaComToken(app);

    const semHora = await putJornada(app, dono.token, dono.barbeiroId, comDia({ diaSemana: 2, modo: "proprio" }));
    const invertido = await putJornada(
      app,
      dono.token,
      dono.barbeiroId,
      comDia({ diaSemana: 2, modo: "proprio", horaInicio: "18:00", horaFim: "09:00" })
    );

    expect(semHora.statusCode).toBe(422);
    expect(semHora.json().erro).toBe("horario_incompleto");
    expect(invertido.statusCode).toBe(422);
    expect(invertido.json().erro).toBe("intervalo_invalido");
    await app.close();
  });

  it("semana incompleta ou com dia repetido: recusada, nada é gravado", async () => {
    // A semana vai inteira: aceitar seis dias obrigaria a escolher o que
    // o sétimo significa.
    const app = buildApp();
    const dono = await criarBarbeariaComToken(app);
    const seisDias = SEMANA_DA_BARBEARIA.slice(1).map((dia) => ({ ...dia, modo: "folga" }));
    const repetido = [...seisDias, { diaSemana: 1, modo: "folga" }];

    const incompleta = await putJornada(app, dono.token, dono.barbeiroId, seisDias);
    const comRepetido = await putJornada(app, dono.token, dono.barbeiroId, repetido);

    expect(incompleta.statusCode).toBe(400);
    expect(comRepetido.statusCode).toBe(422);
    expect(comRepetido.json().erro).toBe("dia_semana_duplicado");
    const lida = await app.inject({
      method: "GET",
      url: `/equipe/${dono.barbeiroId}/jornada`,
      headers: auth(dono.token),
    });
    expect(lida.json().jornada.every((dia: { modo: string }) => dia.modo === "barbearia")).toBe(true);
    await app.close();
  });

  it("membro de outra barbearia: 404", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");
    const dois = await criarBarbeariaComToken(app, "dois");

    const resposta = await putJornada(app, um.token, dois.barbeiroId, SEMANA_DA_BARBEARIA);

    expect(resposta.statusCode).toBe(404);
    await app.close();
  });
});

describe("serviços do membro", () => {
  async function prepararServicos(app: App) {
    const dono = await criarBarbeariaComToken(app);
    const criar = (nome: string) =>
      app
        .inject({
          method: "POST",
          url: "/servicos",
          headers: auth(dono.token),
          payload: { nome, duracaoMinutos: 30, preco: "40.00" },
        })
        .then((r) => r.json().id as string);
    return { dono, corte: await criar("Corte"), barba: await criar("Barba") };
  }

  it("lê e troca a lista inteira de serviços que o membro faz", async () => {
    const app = buildApp();
    const { dono, corte, barba } = await prepararServicos(app);

    const antes = await app.inject({
      method: "GET",
      url: `/equipe/${dono.barbeiroId}/servicos`,
      headers: auth(dono.token),
    });
    const troca = await app.inject({
      method: "PUT",
      url: `/equipe/${dono.barbeiroId}/servicos`,
      headers: auth(dono.token),
      payload: { servicoIds: [corte] },
    });

    expect(antes.json().servicoIds.sort()).toEqual([corte, barba].sort());
    expect(troca.statusCode).toBe(200);
    expect(troca.json().servicoIds).toEqual([corte]);
    await app.close();
  });

  it("lista vazia é aceita: o membro deixa de fazer qualquer serviço", async () => {
    const app = buildApp();
    const { dono } = await prepararServicos(app);

    const resposta = await app.inject({
      method: "PUT",
      url: `/equipe/${dono.barbeiroId}/servicos`,
      headers: auth(dono.token),
      payload: { servicoIds: [] },
    });

    expect(resposta.json().servicoIds).toEqual([]);
    await app.close();
  });

  it("serviço de outra barbearia: 422 servico_invalido, e a lista não muda", async () => {
    const app = buildApp();
    const { dono, corte, barba } = await prepararServicos(app);
    const outra = await criarBarbeariaComToken(app, "outra");
    const alheio = (
      await app.inject({
        method: "POST",
        url: "/servicos",
        headers: auth(outra.token),
        payload: { nome: "Alheio", duracaoMinutos: 30, preco: "10.00" },
      })
    ).json().id;

    const resposta = await app.inject({
      method: "PUT",
      url: `/equipe/${dono.barbeiroId}/servicos`,
      headers: auth(dono.token),
      payload: { servicoIds: [corte, alheio] },
    });

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json().erro).toBe("servico_invalido");
    const lida = await app.inject({
      method: "GET",
      url: `/equipe/${dono.barbeiroId}/servicos`,
      headers: auth(dono.token),
    });
    expect(lida.json().servicoIds.sort()).toEqual([corte, barba].sort());
    await app.close();
  });
});
