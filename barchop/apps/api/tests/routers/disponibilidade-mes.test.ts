import { describe, expect, it, vi } from "vitest";
import { prisma } from "@barchop/database";
import { buildApp } from "../../src/app";
import { auth, criarBarbeariaComToken } from "../helpers/barbearia";
import type { App } from "../../src/tipos";

// Aberta de segunda a sábado, 09:00–18:00, um serviço de 45 minutos.
// Setembro de 2026 tem 30 dias; 2026-09-06 é um domingo.
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
    mes: "2026-09",
    ...extra,
  });
  params.append("servicoIds", agenda.servico.id);
  return `/barbearias/${agenda.slug}/disponibilidade/mes?${params}`;
}

// Enche um dia inteiro (09:00–18:00) com agendamentos de 45 minutos
// gravados direto no banco — o que interessa aqui é o estado, não o
// caminho de criação, que tem testes próprios na fase 4.
async function lotarDia(
  agenda: Awaited<ReturnType<typeof prepararAgenda>>,
  data: string
) {
  const [ano, mes, dia] = data.split("-").map(Number);

  const cliente = await prisma.cliente.create({
    data: {
      barbeariaId: agenda.barbeariaId,
      nome: "João",
      telefone: `11988${String(mes).padStart(2, "0")}${String(dia).padStart(2, "0")}00`,
    },
  });

  await prisma.agendamento.createMany({
    data: Array.from({ length: 12 }, (_, i) => ({
      barbeariaId: agenda.barbeariaId,
      barbeiroId: agenda.barbeiroId,
      clienteId: cliente.id,
      data: new Date(Date.UTC(ano, mes - 1, dia)),
      horaInicio: new Date(
        Date.UTC(1970, 0, 1, 9 + Math.floor((i * 45) / 60), (i * 45) % 60)
      ),
      horaFim: new Date(
        Date.UTC(
          1970,
          0,
          1,
          9 + Math.floor((i * 45 + 45) / 60),
          (i * 45 + 45) % 60
        )
      ),
    })),
  });
}

describe("GET /barbearias/:slug/disponibilidade/mes", () => {
  it("devolve uma chave por dia do mês, sem token", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    const resposta = await app.inject({ method: "GET", url: url(agenda) });

    expect(resposta.statusCode).toBe(200);

    const { dias } = resposta.json();
    expect(Object.keys(dias)).toHaveLength(30);
    expect(dias["2026-09-01"]).toBe(true);
    expect(dias["2026-09-30"]).toBe(true);

    await app.close();
  });

  it("marca domingo como indisponível", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    const { dias } = (
      await app.inject({ method: "GET", url: url(agenda) })
    ).json();

    // 2026-09-06 é domingo, e a barbearia só abre de segunda a sábado.
    expect(dias["2026-09-06"]).toBe(false);
    expect(dias["2026-09-07"]).toBe(true);

    await app.close();
  });

  it("marca como indisponível o dia sem vaga, sem afetar os outros", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    await lotarDia(agenda, "2026-09-10");

    const { dias } = (
      await app.inject({ method: "GET", url: url(agenda) })
    ).json();

    // Prova o agrupamento em memória: os agendamentos de um dia não
    // podem vazar pros outros.
    expect(dias["2026-09-10"]).toBe(false);
    expect(dias["2026-09-09"]).toBe(true);
    expect(dias["2026-09-11"]).toBe(true);

    await app.close();
  });

  it("agrupa por dia quando há agendamento em dias diferentes", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    await lotarDia(agenda, "2026-09-10");
    await lotarDia(agenda, "2026-09-15");

    const { dias } = (
      await app.inject({ method: "GET", url: url(agenda) })
    ).json();

    expect(dias["2026-09-10"]).toBe(false);
    expect(dias["2026-09-15"]).toBe(false);
    expect(dias["2026-09-14"]).toBe(true);

    await app.close();
  });

  it("faz uma consulta só de agendamentos pro mês inteiro", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    // O requisito da spec, e o que se perde primeiro numa refatoração
    // distraída: um findMany por dia dá 30 idas ao banco pra desenhar um
    // calendário.
    const espiao = vi.spyOn(prisma.agendamento, "findMany");

    await app.inject({ method: "GET", url: url(agenda) });

    expect(espiao).toHaveBeenCalledTimes(1);

    espiao.mockRestore();
    await app.close();
  });

  it("respeita a quantidade de dias do mês", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    const fevereiro = (
      await app.inject({ method: "GET", url: url(agenda, { mes: "2026-02" }) })
    ).json();

    expect(Object.keys(fevereiro.dias)).toHaveLength(28);
    expect(fevereiro.dias["2026-02-28"]).toBe(true);
    expect(fevereiro.dias["2026-02-29"]).toBeUndefined();

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

  it("recusa mês fora do formato com 400", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    for (const mes of ["2026-13", "2026", "09-2026"]) {
      const resposta = await app.inject({
        method: "GET",
        url: url(agenda, { mes }),
      });

      expect(resposta.statusCode).toBe(400);
    }

    await app.close();
  });
});
