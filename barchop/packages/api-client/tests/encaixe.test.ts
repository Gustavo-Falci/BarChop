import { describe, expect, it, vi } from "vitest";
import { criarApiClient, criarApiClientFalso } from "../src/index";

// O encaixe (08/11/2026): a duração que o painel escolhe vai na
// disponibilidade, na conferência e no POST.

function respostaJson(corpo: unknown): Response {
  return new Response(JSON.stringify(corpo), { status: 200, headers: { "content-type": "application/json" } });
}

function client(fetchFalso: ReturnType<typeof vi.fn>) {
  return criarApiClient({
    baseUrl: "https://api.exemplo.br",
    obterToken: () => "jwt-do-barbeiro",
    fetch: fetchFalso as unknown as typeof globalThis.fetch,
  });
}

describe("encaixe no client", () => {
  it("manda duracaoMinutos no dia, no mês e na conferência", async () => {
    const fetchFalso = vi.fn(async (_url: string, _init?: RequestInit) =>
      respostaJson({ horarios: [], dias: {}, cabe: true })
    );
    const api = client(fetchFalso);
    const filtro = { barbeiroId: "bb1", servicoIds: ["s1"], duracaoMinutos: 15 };

    await api.publico.disponibilidadeDoDia("gr-barber", { ...filtro, data: "2026-09-10" }, { comToken: true });
    await api.publico.disponibilidadeDoMes("gr-barber", { ...filtro, mes: "2026-09" }, { comToken: true });
    await api.barbeiro.conferirHorario({ ...filtro, data: "2026-09-10", horaInicio: "09:35" });

    const urls = fetchFalso.mock.calls.map((chamada) => chamada[0] as string);
    for (const url of urls) expect(url).toContain("duracaoMinutos=15");
  });

  it("sem encaixe, a query não leva duracaoMinutos", async () => {
    const fetchFalso = vi.fn(async (_url: string, _init?: RequestInit) => respostaJson({ horarios: [] }));

    await client(fetchFalso).publico.disponibilidadeDoDia("gr-barber", {
      barbeiroId: "bb1",
      data: "2026-09-10",
      servicoIds: ["s1"],
    });

    expect(fetchFalso.mock.calls[0][0]).not.toContain("duracaoMinutos");
  });

  it("no dublê, o encaixe termina pela duração escolhida", async () => {
    const falso = criarApiClientFalso();

    const criado = await falso.barbeiro.criarAgendamento({
      barbeiroId: "bb1",
      clienteId: "c1",
      servicoIds: ["s1"],
      data: "2026-09-10",
      horaInicio: "10:00",
      duracaoMinutos: 15,
    });

    expect(criado).toMatchObject({ horaInicio: "10:00", horaFim: "10:15" });
    expect(criado.servicos[0].duracaoNoMomento).toBe(30);
  });
});
