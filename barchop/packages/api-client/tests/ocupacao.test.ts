import { describe, expect, it, vi } from "vitest";
import { criarApiClient, criarApiClientFalso } from "../src/index";

// Painel v2, marco 4: a ocupação do Hoje. A rota é a de
// apps/api/src/routers/ocupacao.ts.

function respostaJson(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const QUINTA = "2037-04-23";
const DOMINGO = "2037-04-26";

const OCUPACAO = {
  data: QUINTA,
  casa: { minutosDeTrabalho: 540, minutosAgendados: 45 },
  profissionais: [{ id: "bb1", nome: "Rafael", minutosDeTrabalho: 540, minutosAgendados: 45 }],
};

function agendamento(id: string, horaInicio: string, horaFim: string, status: string, barbeiroId = "bb1") {
  return {
    id,
    data: QUINTA,
    horaInicio,
    horaFim,
    status,
    origem: "barbeiro",
    observacoes: null,
    servicos: [],
    barbeiro: { id: barbeiroId, nome: barbeiroId === "bb1" ? "Rafael" : "Gustavo" },
  };
}

describe("api da ocupação do dia", () => {
  it("pede a data na query, com o token", async () => {
    const fetchFalso = vi.fn().mockResolvedValueOnce(respostaJson(OCUPACAO));
    const api = criarApiClient({
      baseUrl: "https://api.exemplo.br",
      obterToken: () => "jwt",
      fetch: fetchFalso as unknown as typeof globalThis.fetch,
    });

    const ocupacao = await api.barbeiro.ocupacaoDoDia(QUINTA);

    expect(ocupacao).toEqual(OCUPACAO);
    const [url, init] = fetchFalso.mock.calls[0];
    expect(url).toBe(`https://api.exemplo.br/barbearias/me/ocupacao?data=${QUINTA}`);
    expect(new Headers((init as RequestInit).headers).get("authorization")).toBe("Bearer jwt");
  });
});

// O dublê não sabe de jornada, pausa nem bloqueio (a conta é da API):
// o trabalho é o horário da casa no dia, pra cada um que atende.
describe("dublê — ocupação do dia", () => {
  it("horário da casa por quem atende; agendado sem cancelado e falta", async () => {
    const falso = criarApiClientFalso({
      papel: "recepcao",
      agendamentos: [
        agendamento("a1", "10:00", "10:45", "confirmado", "bb0"),
        agendamento("a2", "11:00", "11:30", "cancelado", "bb0"),
        agendamento("a3", "14:00", "14:30", "no_show", "bb0"),
      ],
    });

    const ocupacao = await falso.barbeiro.ocupacaoDoDia(QUINTA);

    // A recepção (bb1 aqui) não atende: só o dono aparece.
    expect(ocupacao).toEqual({
      data: QUINTA,
      casa: { minutosDeTrabalho: 540, minutosAgendados: 45 },
      profissionais: [{ id: "bb0", nome: "Gustavo", minutosDeTrabalho: 540, minutosAgendados: 45 }],
    });
  });

  it("o profissional vê só a dele; dia fechado não tem trabalho", async () => {
    const falso = criarApiClientFalso({
      papel: "profissional",
      agendamentos: [agendamento("a1", "10:00", "10:45", "pendente", "bb0")],
    });

    const quinta = await falso.barbeiro.ocupacaoDoDia(QUINTA);
    const domingo = await falso.barbeiro.ocupacaoDoDia(DOMINGO);

    expect(quinta.profissionais).toEqual([
      { id: "bb1", nome: "Rafael", minutosDeTrabalho: 540, minutosAgendados: 0 },
    ]);
    expect(domingo.casa).toEqual({ minutosDeTrabalho: 0, minutosAgendados: 0 });
  });
});
