import { describe, expect, it } from "vitest";
import { prisma } from "@barchop/database";
import { buildApp } from "../../src/app";
import { auth, criarBarbeariaComToken } from "../helpers/barbearia";

const SEMANA_UTIL = {
  horarios: [
    { diaSemana: 1, horaAbertura: "09:00", horaFechamento: "18:00" },
    { diaSemana: 2, horaAbertura: "09:00", horaFechamento: "18:00" },
    { diaSemana: 3, horaAbertura: "09:00", horaFechamento: "18:00" },
    { diaSemana: 4, horaAbertura: "09:00", horaFechamento: "18:00" },
    { diaSemana: 5, horaAbertura: "09:00", horaFechamento: "20:00" },
    { diaSemana: 6, horaAbertura: "08:00", horaFechamento: "14:00" },
  ],
};

describe("PUT /barbearias/me/horarios", () => {
  it("grava os sete dias e devolve todos", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");

    const resposta = await app.inject({
      method: "PUT",
      url: "/barbearias/me/horarios",
      headers: auth(um.token),
      payload: SEMANA_UTIL,
    });

    expect(resposta.statusCode).toBe(200);

    const { horarios } = resposta.json();
    expect(horarios).toHaveLength(7);
    // Ordem fixa 0..6: a tela de Configurações desenha a semana em
    // sequência e não deveria ter que ordenar.
    expect(horarios.map((h: { diaSemana: number }) => h.diaSemana)).toEqual([
      0, 1, 2, 3, 4, 5, 6,
    ]);
    expect(horarios[1]).toEqual({
      diaSemana: 1,
      horaAbertura: "09:00",
      horaFechamento: "18:00",
      fechado: false,
    });

    await app.close();
  });

  it("trata dia ausente do corpo como fechado", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");

    const resposta = await app.inject({
      method: "PUT",
      url: "/barbearias/me/horarios",
      headers: auth(um.token),
      payload: SEMANA_UTIL,
    });

    // Domingo (0) não veio no corpo. Sem essa regra, "não tem linha pra
    // domingo" e "domingo está fechado" seriam estados diferentes, e o
    // cálculo de disponibilidade teria que adivinhar qual é qual.
    expect(resposta.json().horarios[0]).toEqual({
      diaSemana: 0,
      horaAbertura: null,
      horaFechamento: null,
      fechado: true,
    });

    await app.close();
  });

  it("fechado: true ganha das horas mandadas junto", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");

    const resposta = await app.inject({
      method: "PUT",
      url: "/barbearias/me/horarios",
      headers: auth(um.token),
      payload: {
        horarios: [
          {
            diaSemana: 1,
            horaAbertura: "09:00",
            horaFechamento: "18:00",
            fechado: true,
          },
        ],
      },
    });

    // Corpo contraditório: a tela manda o dia marcado como fechado mas
    // deixa no formulário as horas que estavam lá antes. `fechado` é a
    // intenção explícita, então ele decide — e as horas viram null, em
    // vez de ficarem gravadas num dia que ninguém vai atender.
    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().horarios[1]).toEqual({
      diaSemana: 1,
      horaAbertura: null,
      horaFechamento: null,
      fechado: true,
    });

    await app.close();
  });

  it("guarda a hora no fuso certo na coluna @db.Time", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");

    await app.inject({
      method: "PUT",
      url: "/barbearias/me/horarios",
      headers: auth(um.token),
      payload: SEMANA_UTIL,
    });

    // O Prisma grava a porção UTC da Date. Numa máquina em
    // America/Sao_Paulo, um `new Date("1970-01-01T09:00:00")` viraria
    // 12:00 na coluna, sem erro nenhum — e corromperia junto a coluna
    // `periodo` do agendamento, de onde sai a trava de conflito. Ler a
    // coluna crua é a única forma de provar que isso não acontece.
    const linhas = await prisma.$queryRaw<{ abertura: string }[]>`
      SELECT to_char(hora_abertura, 'HH24:MI') AS abertura
      FROM horario_funcionamento
      WHERE barbearia_id = ${um.barbeariaId}::uuid AND dia_semana = 1
    `;

    expect(linhas[0].abertura).toBe("09:00");

    await app.close();
  });

  it("é idempotente: o mesmo PUT duas vezes não duplica linha", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");

    await app.inject({
      method: "PUT",
      url: "/barbearias/me/horarios",
      headers: auth(um.token),
      payload: SEMANA_UTIL,
    });
    const segunda = await app.inject({
      method: "PUT",
      url: "/barbearias/me/horarios",
      headers: auth(um.token),
      payload: SEMANA_UTIL,
    });

    expect(segunda.statusCode).toBe(200);
    expect(
      await prisma.horarioFuncionamento.count({
        where: { barbeariaId: um.barbeariaId },
      })
    ).toBe(7);

    await app.close();
  });

  it("recusa dia aberto sem horas com 422", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");

    const resposta = await app.inject({
      method: "PUT",
      url: "/barbearias/me/horarios",
      headers: auth(um.token),
      payload: { horarios: [{ diaSemana: 1, fechado: false }] },
    });

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json().erro).toBe("horario_incompleto");

    await app.close();
  });

  it("recusa abertura depois do fechamento com 422", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");

    const resposta = await app.inject({
      method: "PUT",
      url: "/barbearias/me/horarios",
      headers: auth(um.token),
      payload: {
        horarios: [
          { diaSemana: 1, horaAbertura: "18:00", horaFechamento: "09:00" },
        ],
      },
    });

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json().erro).toBe("intervalo_invalido");

    await app.close();
  });

  it("recusa o mesmo dia duas vezes com 422", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");

    const resposta = await app.inject({
      method: "PUT",
      url: "/barbearias/me/horarios",
      headers: auth(um.token),
      payload: {
        horarios: [
          { diaSemana: 1, horaAbertura: "09:00", horaFechamento: "18:00" },
          { diaSemana: 1, horaAbertura: "10:00", horaFechamento: "19:00" },
        ],
      },
    });

    // Sem esta checagem o upsert rodaria duas vezes no mesmo dia e a
    // última linha ganharia em silêncio — o barbeiro veria um horário
    // que não escolheu.
    expect(resposta.statusCode).toBe(422);
    expect(resposta.json().erro).toBe("dia_semana_duplicado");

    await app.close();
  });

  it("recusa hora fora do formato HH:mm com 400", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");

    const resposta = await app.inject({
      method: "PUT",
      url: "/barbearias/me/horarios",
      headers: auth(um.token),
      payload: {
        horarios: [
          { diaSemana: 1, horaAbertura: "9h", horaFechamento: "18:00" },
        ],
      },
    });

    expect(resposta.statusCode).toBe(400);

    await app.close();
  });

  it("não grava nada quando um dos dias é inválido", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");

    await app.inject({
      method: "PUT",
      url: "/barbearias/me/horarios",
      headers: auth(um.token),
      payload: {
        horarios: [
          { diaSemana: 1, horaAbertura: "09:00", horaFechamento: "18:00" },
          { diaSemana: 2, horaAbertura: "18:00", horaFechamento: "09:00" },
        ],
      },
    });

    // Meia semana gravada é pior que requisição recusada: o cálculo de
    // disponibilidade leria um estado que o barbeiro nunca pediu.
    expect(
      await prisma.horarioFuncionamento.count({
        where: { barbeariaId: um.barbeariaId },
      })
    ).toBe(0);

    await app.close();
  });

  it("recusa requisição sem token com 401", async () => {
    const app = buildApp();

    const resposta = await app.inject({
      method: "PUT",
      url: "/barbearias/me/horarios",
      payload: SEMANA_UTIL,
    });

    expect(resposta.statusCode).toBe(401);

    await app.close();
  });

  it("não mexe nos horários de outra barbearia", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");
    const outra = await criarBarbeariaComToken(app, "outra");

    await app.inject({
      method: "PUT",
      url: "/barbearias/me/horarios",
      headers: auth(um.token),
      payload: SEMANA_UTIL,
    });

    expect(
      await prisma.horarioFuncionamento.count({
        where: { barbeariaId: outra.barbeariaId },
      })
    ).toBe(0);

    await app.close();
  });
});

describe("GET /barbearias/me/horarios", () => {
  it("devolve os sete dias mesmo sem nada gravado", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");

    const resposta = await app.inject({
      method: "GET",
      url: "/barbearias/me/horarios",
      headers: auth(um.token),
    });

    expect(resposta.statusCode).toBe(200);

    const { horarios } = resposta.json();
    expect(horarios).toHaveLength(7);
    expect(horarios.every((h: { fechado: boolean }) => h.fechado)).toBe(true);

    await app.close();
  });

  it("devolve o que o PUT gravou", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");

    await app.inject({
      method: "PUT",
      url: "/barbearias/me/horarios",
      headers: auth(um.token),
      payload: SEMANA_UTIL,
    });

    const resposta = await app.inject({
      method: "GET",
      url: "/barbearias/me/horarios",
      headers: auth(um.token),
    });

    expect(resposta.json().horarios[5]).toEqual({
      diaSemana: 5,
      horaAbertura: "09:00",
      horaFechamento: "20:00",
      fechado: false,
    });

    await app.close();
  });

  it("não enxerga os horários de outra barbearia", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");
    const outra = await criarBarbeariaComToken(app, "outra");

    await app.inject({
      method: "PUT",
      url: "/barbearias/me/horarios",
      headers: auth(um.token),
      payload: SEMANA_UTIL,
    });

    const resposta = await app.inject({
      method: "GET",
      url: "/barbearias/me/horarios",
      headers: auth(outra.token),
    });

    expect(
      resposta.json().horarios.every((h: { fechado: boolean }) => h.fechado)
    ).toBe(true);

    await app.close();
  });

  it("recusa requisição sem token com 401", async () => {
    const app = buildApp();

    const resposta = await app.inject({
      method: "GET",
      url: "/barbearias/me/horarios",
    });

    expect(resposta.statusCode).toBe(401);

    await app.close();
  });
});
