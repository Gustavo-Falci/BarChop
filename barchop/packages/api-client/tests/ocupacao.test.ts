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
  profissionais: [
    { id: "bb1", nome: "Rafael", minutosDeTrabalho: 540, minutosAgendados: 45, janela: { abre: "09:00", fecha: "18:00" }, pausa: null },
  ],
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
      profissionais: [
        { id: "bb0", nome: "Gustavo", minutosDeTrabalho: 540, minutosAgendados: 45, janela: { abre: "09:00", fecha: "18:00" }, pausa: null },
      ],
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
      { id: "bb1", nome: "Rafael", minutosDeTrabalho: 540, minutosAgendados: 0, janela: { abre: "09:00", fecha: "18:00" }, pausa: null },
    ]);
    expect(domingo.casa).toEqual({ minutosDeTrabalho: 0, minutosAgendados: 0 });
    expect(domingo.profissionais[0]).toMatchObject({ janela: null, pausa: null });
  });

  // O expediente segue a regra da API (janelaEfetiva): data especial >
  // horário da casa, recortado pela jornada; a pausa vem da jornada.
  it("o expediente segue data especial, jornada e pausa", async () => {
    const falso = criarApiClientFalso({
      excecoesDeHorario: [{ data: QUINTA, fechado: false, horaAbertura: "10:00", horaFechamento: "16:00" }],
      jornadas: {
        bb1: [0, 1, 2, 3, 4, 5, 6].map((diaSemana) =>
          diaSemana === 4
            ? { diaSemana, modo: "proprio" as const, horaInicio: "08:00", horaFim: "14:00", pausaInicio: "12:00", pausaFim: "13:00" }
            : { diaSemana, modo: "barbearia" as const, horaInicio: null, horaFim: null, pausaInicio: null, pausaFim: null }
        ),
      },
    });

    const [rafael] = (await falso.barbeiro.ocupacaoDoDia(QUINTA)).profissionais;

    expect(rafael.janela).toEqual({ abre: "10:00", fecha: "14:00" });
    expect(rafael.pausa).toEqual({ inicio: "12:00", fim: "13:00" });
  });
});
