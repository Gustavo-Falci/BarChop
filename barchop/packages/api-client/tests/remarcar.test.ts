import { describe, expect, it, vi } from "vitest";
import { criarApiClient, criarApiClientFalso } from "../src/index";

// Arrastar e reordenar, PR 6: o remarcar do painel no client. A rota é a
// do PR 5 (POST /agendamentos/:id/remarcar).

function respostaJson(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });
}

const SERVICO = { servicoId: "s1", nome: "Corte", precoNoMomento: "40.00", duracaoNoMomento: 30 };

function comAgendamento(papel: "dono" | "profissional" = "dono") {
  return criarApiClientFalso({
    papel,
    agendamentos: [
      {
        id: "a1",
        clienteId: "c1",
        data: "2026-12-08",
        horaInicio: "09:00",
        horaFim: "09:30",
        status: "confirmado",
        origem: "cliente",
        observacoes: null,
        servicos: [SERVICO],
      },
    ],
  });
}

describe("remarcar pelo painel", () => {
  it("no client: POST com o corpo e devolve o agendamento novo", async () => {
    const fetchFalso = vi.fn(async () => respostaJson({ id: "a2" }, 201));
    const client = criarApiClient({
      baseUrl: "https://api.exemplo.br",
      obterToken: () => "jwt",
      fetch: fetchFalso as unknown as typeof globalThis.fetch,
    });

    const novo = await client.barbeiro.remarcarAgendamento("a1", {
      data: "2026-12-09",
      horaInicio: "10:00",
      avisarCliente: false,
    });

    const [url, init] = fetchFalso.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.exemplo.br/agendamentos/a1/remarcar");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ data: "2026-12-09", horaInicio: "10:00", avisarCliente: false });
    expect(novo).toEqual({ id: "a2" });
  });

  it("no dublê: o antigo cancela e o novo herda serviços e cliente", async () => {
    const falso = comAgendamento();

    const novo = await falso.barbeiro.remarcarAgendamento("a1", { data: "2026-12-09", horaInicio: "10:00" });

    expect(novo).toMatchObject({ data: "2026-12-09", horaInicio: "10:00", servicos: [SERVICO] });
    expect(novo.id).not.toBe("a1");
    expect((await falso.barbeiro.agendamento("a1")).status).toBe("cancelado");
  });

  it("no dublê: o profissional não passa o agendamento pra outro (403)", async () => {
    const falso = comAgendamento("profissional");

    await expect(
      falso.barbeiro.remarcarAgendamento("a1", { data: "2026-12-09", horaInicio: "10:00", barbeiroId: "bb0" })
    ).rejects.toMatchObject({ status: 403 });
  });
});
