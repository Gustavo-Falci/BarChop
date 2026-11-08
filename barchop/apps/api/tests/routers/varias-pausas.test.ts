import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { prisma } from "@barchop/database";
import { buildApp } from "../../src/app";
import type { App } from "../../src/tipos";
import { prepararAgenda, type Agenda } from "../helpers/agenda";
import { auth } from "../helpers/barbearia";
import { QUINTA } from "../helpers/datas";

// Várias pausas por dia na jornada (pedido do barbeiro, 08/11/2026; PR 1
// do plano varias-pausas): almoço 12:00–13:00 e café 16:00–16:15, toda
// semana. A barbearia abre de segunda a sábado, 09:00–18:00; Corte de
// 45 min (helpers/agenda.ts). QUINTA é futura.

type Dia = Record<string, unknown> & { diaSemana: number };

const ALMOCO = { inicio: "12:00", fim: "13:00" };
const CAFE = { inicio: "16:00", fim: "16:15" };

function semana(...dias: Dia[]): Dia[] {
  return [0, 1, 2, 3, 4, 5, 6].map(
    (diaSemana) => dias.find((dia) => dia.diaSemana === diaSemana) ?? { diaSemana, modo: "barbearia" }
  );
}

function putJornada(app: App, agenda: Agenda, jornada: unknown) {
  return app.inject({
    method: "PUT",
    url: `/equipe/${agenda.barbeiroId}/jornada`,
    headers: auth(agenda.token),
    payload: { jornada },
  });
}

async function lerJornada(app: App, agenda: Agenda): Promise<Dia[]> {
  const resposta = await app.inject({
    method: "GET",
    url: `/equipe/${agenda.barbeiroId}/jornada`,
    headers: auth(agenda.token),
  });
  return resposta.json().jornada;
}

// A quinta com o almoço e o café; o resto acompanha a barbearia.
async function quintaComDuas(app: App, agenda: Agenda) {
  const resposta = await putJornada(app, agenda, semana({ diaSemana: 4, modo: "barbearia", pausas: [ALMOCO, CAFE] }));
  expect(resposta.statusCode).toBe(200);
}

describe("PUT /equipe/:id/jornada com várias pausas", () => {
  it("grava as pausas do dia em ordem, e a primeira segue nos campos antigos", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    const resposta = await putJornada(
      app,
      agenda,
      semana({ diaSemana: 4, modo: "barbearia", pausas: [CAFE, ALMOCO] })
    );

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().jornada[4]).toEqual({
      diaSemana: 4,
      modo: "barbearia",
      horaInicio: null,
      horaFim: null,
      pausas: [ALMOCO, CAFE],
      pausaInicio: "12:00",
      pausaFim: "13:00",
    });
    expect((await lerJornada(app, agenda))[3]).toMatchObject({ pausas: [], pausaInicio: null, pausaFim: null });
    // Nas colunas antigas também: se a API voltar pra versão anterior,
    // ela ainda vê o almoço.
    const linha = await prisma.jornadaProfissional.findUniqueOrThrow({
      where: { barbeiroId_diaSemana: { barbeiroId: agenda.barbeiroId, diaSemana: 4 } },
    });
    expect(linha.pausaInicio?.toISOString().slice(11, 16)).toBe("12:00");
    expect(linha.pausaFim?.toISOString().slice(11, 16)).toBe("13:00");
    await app.close();
  });

  it("encostar pode: 12:00–13:00 e 13:00–13:30", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    const resposta = await putJornada(
      app,
      agenda,
      semana({ diaSemana: 4, modo: "barbearia", pausas: [ALMOCO, { inicio: "13:00", fim: "13:30" }] })
    );

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().jornada[4].pausas).toHaveLength(2);
    await app.close();
  });

  it("duas pausas que se cruzam: 422 pausas_se_cruzam, e nada é gravado", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    await quintaComDuas(app, agenda);

    const resposta = await putJornada(
      app,
      agenda,
      semana(
        { diaSemana: 2, modo: "barbearia", pausas: [ALMOCO] },
        { diaSemana: 4, modo: "barbearia", pausas: [ALMOCO, { inicio: "12:30", fim: "13:30" }] }
      )
    );

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json().erro).toBe("pausas_se_cruzam");
    const lida = await lerJornada(app, agenda);
    expect(lida[2].pausas).toEqual([]);
    expect(lida[4].pausas).toEqual([ALMOCO, CAFE]);
    await app.close();
  });

  it("a mesma pausa duas vezes também se cruza", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    const resposta = await putJornada(app, agenda, semana({ diaSemana: 4, modo: "barbearia", pausas: [ALMOCO, ALMOCO] }));

    expect(resposta.json().erro).toBe("pausas_se_cruzam");
    await app.close();
  });

  it("pausa com o fim antes do começo: 422 pausa_invalida", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    const resposta = await putJornada(
      app,
      agenda,
      semana({ diaSemana: 4, modo: "barbearia", pausas: [ALMOCO, { inicio: "16:15", fim: "16:00" }] })
    );

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json().erro).toBe("pausa_invalida");
    await app.close();
  });

  it("mais de 24 pausas num dia: 400, o teto técnico", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    const pausas = Array.from({ length: 25 }, (_, i) => {
      const minuto = i * 2;
      const hora = (m: number) => `10:${String(m).padStart(2, "0")}`;
      return { inicio: hora(minuto), fim: hora(minuto + 1) };
    });

    const resposta = await putJornada(app, agenda, semana({ diaSemana: 4, modo: "barbearia", pausas }));

    expect(resposta.statusCode).toBe(400);
    await app.close();
  });

  it("o dia que vira folga perde as pausas", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    await quintaComDuas(app, agenda);

    const resposta = await putJornada(app, agenda, semana({ diaSemana: 4, modo: "folga", pausas: [ALMOCO, CAFE] }));

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().jornada[4]).toMatchObject({ modo: "folga", pausas: [], pausaInicio: null, pausaFim: null });
    expect(await prisma.pausaDaJornada.count()).toBe(0);
    await app.close();
  });
});

// A web de antes do PR 2 monta o corpo espalhando o dia que veio do GET
// e trocando só `pausaInicio`/`pausaFim`: depois deste deploy o GET traz
// `pausas`, e ela as devolve como vieram. O que manda é o campo antigo
// comparado com o que está salvo.
describe("a aba da web antiga", () => {
  it("com uma pausa salva, a edição do campo antigo vale", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    await putJornada(app, agenda, semana({ diaSemana: 4, modo: "barbearia", pausas: [ALMOCO] }));

    const lida = await lerJornada(app, agenda);
    const resposta = await putJornada(
      app,
      agenda,
      lida.map((dia) => (dia.diaSemana === 4 ? { ...dia, pausaInicio: "12:30", pausaFim: "13:30" } : dia))
    );

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().jornada[4].pausas).toEqual([{ inicio: "12:30", fim: "13:30" }]);
    await app.close();
  });

  it("tirar a única pausa pelo campo antigo também vale", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    await putJornada(app, agenda, semana({ diaSemana: 4, modo: "barbearia", pausas: [ALMOCO] }));

    const lida = await lerJornada(app, agenda);
    const resposta = await putJornada(
      app,
      agenda,
      lida.map((dia) => (dia.diaSemana === 4 ? { ...dia, pausaInicio: null, pausaFim: null } : dia))
    );

    expect(resposta.json().jornada[4].pausas).toEqual([]);
    await app.close();
  });

  it("num dia com duas pausas, mexer no campo antigo dá 422 recarregue_a_pagina", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    await quintaComDuas(app, agenda);

    const lida = await lerJornada(app, agenda);
    const resposta = await putJornada(
      app,
      agenda,
      lida.map((dia) => (dia.diaSemana === 4 ? { ...dia, pausaInicio: "12:30", pausaFim: "13:30" } : dia))
    );

    expect(resposta.statusCode).toBe(422);
    // A web antiga mostra a mensagem como veio.
    expect(resposta.json()).toMatchObject({
      erro: "recarregue_a_pagina",
      mensagem: "Na quinta já há mais de uma pausa. Recarregue a página para mudar.",
    });
    expect((await lerJornada(app, agenda))[4].pausas).toEqual([ALMOCO, CAFE]);
    await app.close();
  });

  it("parada desde antes de outra aba pôr o café: salvar outro dia não o apaga", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    await putJornada(app, agenda, semana({ diaSemana: 4, modo: "barbearia", pausas: [ALMOCO] }));
    const velha = await lerJornada(app, agenda);
    // A outra aba, já com a web nova, acrescenta o café.
    await quintaComDuas(app, agenda);

    const resposta = await putJornada(
      app,
      agenda,
      velha.map((dia) => (dia.diaSemana === 2 ? { ...dia, pausaInicio: "11:00", pausaFim: "11:30" } : dia))
    );

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().jornada[4].pausas).toEqual([ALMOCO, CAFE]);
    await app.close();
  });

  it("o dia com duas pausas que ela não mexeu sobrevive ao salvar outro dia", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    await quintaComDuas(app, agenda);

    const lida = await lerJornada(app, agenda);
    const resposta = await putJornada(
      app,
      agenda,
      lida.map((dia) => (dia.diaSemana === 2 ? { ...dia, pausaInicio: "11:00", pausaFim: "11:30" } : dia))
    );

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().jornada[2].pausas).toEqual([{ inicio: "11:00", fim: "11:30" }]);
    expect(resposta.json().jornada[4].pausas).toEqual([ALMOCO, CAFE]);
    await app.close();
  });

  it("aberta antes do deploy (sem `pausas` no corpo): a mesma regra", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    await quintaComDuas(app, agenda);

    const semPausas = (await lerJornada(app, agenda)).map(({ pausas: _pausas, ...dia }) => dia as Dia);
    const outroDia = await putJornada(
      app,
      agenda,
      semPausas.map((dia) => (dia.diaSemana === 2 ? { ...dia, pausaInicio: "11:00", pausaFim: "11:30" } : dia))
    );
    const mesmoDia = await putJornada(
      app,
      agenda,
      semPausas.map((dia) => (dia.diaSemana === 4 ? { ...dia, pausaInicio: null, pausaFim: null } : dia))
    );

    expect(outroDia.statusCode).toBe(200);
    expect(outroDia.json().jornada[4].pausas).toEqual([ALMOCO, CAFE]);
    expect(mesmoDia.statusCode).toBe(422);
    expect(mesmoDia.json().erro).toBe("recarregue_a_pagina");
    await app.close();
  });
});

describe("as várias pausas nos horários", () => {
  it("a disponibilidade do dia tira as duas faixas, e encostar nelas pode", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    await quintaComDuas(app, agenda);
    const params = new URLSearchParams({ barbeiroId: agenda.barbeiroId, data: QUINTA });
    params.append("servicoIds", agenda.servico.id);

    const { horarios } = (
      await app.inject({ method: "GET", url: `/barbearias/${agenda.slug}/disponibilidade?${params}` })
    ).json();

    // Corte de 45: 11:15 termina no almoço; 15:15 termina no café.
    expect(horarios).toContain("11:15");
    expect(horarios).not.toContain("11:30");
    expect(horarios).toContain("13:00");
    expect(horarios).toContain("15:15");
    expect(horarios).not.toContain("15:30");
    expect(horarios).not.toContain("16:00");
    expect(horarios).toContain("16:15");
    await app.close();
  });

  it("o calendário do mês: duas pausas que cobrem o expediente fecham o dia", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    await putJornada(
      app,
      agenda,
      semana({
        diaSemana: 4,
        modo: "barbearia",
        pausas: [
          { inicio: "09:00", fim: "13:30" },
          { inicio: "13:30", fim: "18:00" },
        ],
      })
    );
    const params = new URLSearchParams({ barbeiroId: agenda.barbeiroId, mes: QUINTA.slice(0, 7) });
    params.append("servicoIds", agenda.servico.id);

    const { dias } = (
      await app.inject({ method: "GET", url: `/barbearias/${agenda.slug}/disponibilidade/mes?${params}` })
    ).json();

    expect(dias[QUINTA]).toBe(false);
    expect(Object.entries(dias).some(([data, livre]) => data !== QUINTA && livre)).toBe(true);
    await app.close();
  });

  it("o painel: marcar no café dá 422 horario_na_pausa, e o /cabe diz qual pausa", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    await quintaComDuas(app, agenda);
    const params = new URLSearchParams({ barbeiroId: agenda.barbeiroId, data: QUINTA, horaInicio: "15:40" });
    params.append("servicoIds", agenda.servico.id);

    const cabe = await app.inject({ method: "GET", url: `/agendamentos/cabe?${params}`, headers: auth(agenda.token) });
    const marcado = await app.inject({
      method: "POST",
      url: "/agendamentos",
      headers: auth(agenda.token),
      payload: {
        barbeiroId: agenda.barbeiroId,
        clienteId: agenda.cliente.id,
        servicoIds: [agenda.servico.id],
        data: QUINTA,
        horaInicio: "15:40",
      },
    });

    expect(cabe.json()).toEqual({
      cabe: false,
      codigo: "horario_na_pausa",
      mensagem: "esse horário cai na pausa do profissional (16:00 – 16:15)",
    });
    expect(marcado.statusCode).toBe(422);
    expect(marcado.json().erro).toBe("horario_na_pausa");
    await app.close();
  });

  it("a ocupação devolve as duas e desconta as duas", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    await quintaComDuas(app, agenda);

    const [profissional] = (
      await app.inject({ method: "GET", url: `/barbearias/me/ocupacao?data=${QUINTA}`, headers: auth(agenda.token) })
    ).json().profissionais;

    expect(profissional.pausas).toEqual([ALMOCO, CAFE]);
    expect(profissional.pausa).toEqual(ALMOCO);
    // 09:00–18:00 são 540; menos 60 do almoço e 15 do café.
    expect(profissional.minutosDeTrabalho).toBe(465);
    await app.close();
  });
});

// A cópia da migration 20261108130000, rodada de novo sobre uma linha
// com a pausa só nas colunas antigas: a suíte aplica as migrations num
// banco vazio, então sem isto o INSERT … SELECT nunca seria exercitado.
// O SQL sai do próprio arquivo da migration, não de uma cópia.
const COPIA_DA_MIGRATION = (() => {
  const sql = readFileSync(
    new URL(
      "../../../../packages/database/prisma/migrations/20261108130000_pausas_da_jornada/migration.sql",
      import.meta.url
    ),
    "utf-8"
  );
  const inicio = sql.indexOf('INSERT INTO "pausa_da_jornada"');
  return sql.slice(inicio, sql.indexOf(";", inicio));
})();

describe("a cópia das pausas antigas", () => {
  it("leva a pausa das colunas antigas pra tabela", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    await prisma.jornadaProfissional.update({
      where: { barbeiroId_diaSemana: { barbeiroId: agenda.barbeiroId, diaSemana: 4 } },
      data: { pausaInicio: new Date("1970-01-01T12:00:00Z"), pausaFim: new Date("1970-01-01T13:00:00Z") },
    });

    expect(COPIA_DA_MIGRATION).toContain("SELECT");
    await prisma.$executeRawUnsafe(COPIA_DA_MIGRATION);

    expect((await lerJornada(app, agenda))[4].pausas).toEqual([ALMOCO]);
    expect(await prisma.pausaDaJornada.count()).toBe(1);
    await app.close();
  });

  it("o banco recusa duas pausas que se cruzam no mesmo dia, e aceita as que encostam", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    const quinta = await prisma.jornadaProfissional.findUniqueOrThrow({
      where: { barbeiroId_diaSemana: { barbeiroId: agenda.barbeiroId, diaSemana: 4 } },
    });
    const hora = (h: string) => new Date(`1970-01-01T${h}:00Z`);
    await prisma.pausaDaJornada.create({
      data: { jornadaId: quinta.id, horaInicio: hora("12:00"), horaFim: hora("13:00") },
    });

    await expect(
      prisma.pausaDaJornada.create({
        data: { jornadaId: quinta.id, horaInicio: hora("13:00"), horaFim: hora("13:30") },
      })
    ).resolves.toBeDefined();
    await expect(
      prisma.pausaDaJornada.create({
        data: { jornadaId: quinta.id, horaInicio: hora("12:30"), horaFim: hora("12:45") },
      })
    ).rejects.toThrow(/pausas_sem_cruzar/);
    await expect(
      prisma.pausaDaJornada.create({
        data: { jornadaId: quinta.id, horaInicio: hora("15:00"), horaFim: hora("14:00") },
      })
    ).rejects.toThrow(/pausa_na_ordem/);
    await app.close();
  });
});
