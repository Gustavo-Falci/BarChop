import { describe, expect, it } from "vitest";
import { buildApp } from "../../src/app";
import { auth, criarBarbeariaComToken } from "../helpers/barbearia";
import type { App } from "../../src/tipos";

// Aberta de segunda a sábado, 09:00–18:00, um serviço de 45 minutos.
// 2026-09-10 é uma quinta; 2026-09-13, um domingo.
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

  return { ...barbearia, servico };
}

function url(
  agenda: Awaited<ReturnType<typeof prepararAgenda>>,
  extra: Record<string, string> = {}
) {
  const params = new URLSearchParams({
    barbeiroId: agenda.barbeiroId,
    data: "2026-09-10",
    ...extra,
  });
  // servicoIds vai repetido, como a spec pede.
  params.append("servicoIds", agenda.servico.id);
  return `/barbearias/${agenda.slug}/disponibilidade?${params}`;
}

describe("GET /barbearias/:slug/disponibilidade", () => {
  it("devolve a grade do dia, sem token", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    const resposta = await app.inject({ method: "GET", url: url(agenda) });

    expect(resposta.statusCode).toBe(200);

    const { horarios } = resposta.json();
    expect(horarios[0]).toBe("09:00");
    // 17:15 + 45min bate exatamente nas 18:00; 17:30 já passaria.
    expect(horarios[horarios.length - 1]).toBe("17:15");

    await app.close();
  });

  it("tira do resultado o horário já agendado", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    await app.inject({
      method: "POST",
      url: `/barbearias/${agenda.slug}/agendamentos`,
      payload: {
        barbeiroId: agenda.barbeiroId,
        servicoIds: [agenda.servico.id],
        data: "2026-09-10",
        horaInicio: "10:00",
        cliente: { nome: "João", telefone: "11999998888" },
      },
    });

    const { horarios } = (
      await app.inject({ method: "GET", url: url(agenda) })
    ).json();

    expect(horarios).not.toContain("10:00");
    // 09:30 + 45min invadiria as 10:00.
    expect(horarios).not.toContain("09:30");
    // Borda meio-aberta: 10:45 encosta no fim do anterior e vale.
    expect(horarios).toContain("10:45");

    await app.close();
  });

  it("devolve lista vazia em dia fechado", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    const resposta = await app.inject({
      method: "GET",
      url: url(agenda, { data: "2026-09-13" }),
    });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().horarios).toEqual([]);

    await app.close();
  });

  it("soma a duração de vários serviços", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    const barba = (
      await app.inject({
        method: "POST",
        url: "/servicos",
        headers: auth(agenda.token),
        payload: { nome: "Barba", duracaoMinutos: 30, preco: "30.00" },
      })
    ).json();

    const params = new URLSearchParams({
      barbeiroId: agenda.barbeiroId,
      data: "2026-09-10",
    });
    params.append("servicoIds", agenda.servico.id);
    params.append("servicoIds", barba.id);

    const { horarios } = (
      await app.inject({
        method: "GET",
        url: `/barbearias/${agenda.slug}/disponibilidade?${params}`,
      })
    ).json();

    // 75 minutos: o último começo possível é 16:45.
    expect(horarios[horarios.length - 1]).toBe("16:45");

    await app.close();
  });

  it("devolve 404 pra slug que não existe", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    const resposta = await app.inject({
      method: "GET",
      url: url(agenda).replace(agenda.slug, "nao-existe"),
    });

    expect(resposta.statusCode).toBe(404);

    await app.close();
  });

  it("devolve 422 pra barbeiro de outra barbearia", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app, "um");
    const outra = await prepararAgenda(app, "outra");

    const resposta = await app.inject({
      method: "GET",
      url: url(agenda, { barbeiroId: outra.barbeiroId }),
    });

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json().erro).toBe("barbeiro_invalido");

    await app.close();
  });

  it("devolve 422 pra serviço de outra barbearia", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app, "um");
    const outra = await prepararAgenda(app, "outra");

    const params = new URLSearchParams({
      barbeiroId: agenda.barbeiroId,
      data: "2026-09-10",
    });
    params.append("servicoIds", outra.servico.id);

    const resposta = await app.inject({
      method: "GET",
      url: `/barbearias/${agenda.slug}/disponibilidade?${params}`,
    });

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json().erro).toBe("servico_invalido");

    await app.close();
  });

  it("devolve 422 pra data que não existe no calendário", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    const resposta = await app.inject({
      method: "GET",
      url: url(agenda, { data: "2026-02-31" }),
    });

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json().erro).toBe("data_invalida");

    await app.close();
  });

  it("recusa query sem servicoIds com 400", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    const resposta = await app.inject({
      method: "GET",
      url: `/barbearias/${agenda.slug}/disponibilidade?barbeiroId=${agenda.barbeiroId}&data=2026-09-10`,
    });

    expect(resposta.statusCode).toBe(400);

    await app.close();
  });

  it("recusa barbeiroId fora do formato UUID com 400", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    const resposta = await app.inject({
      method: "GET",
      url: url(agenda, { barbeiroId: "nao-e-uuid" }),
    });

    expect(resposta.statusCode).toBe(400);

    await app.close();
  });
});
