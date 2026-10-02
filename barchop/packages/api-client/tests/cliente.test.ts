import { describe, expect, it, vi } from "vitest";
import { criarApiClient } from "../src/index";

function respostaJson(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const AGENDAMENTO = {
  id: "a1",
  data: "2026-09-10",
  horaInicio: "09:00",
  horaFim: "09:30",
  status: "confirmado",
  origem: "cliente",
  observacoes: null,
  servicos: [],
};

function clientDoCliente(fetchFalso: ReturnType<typeof vi.fn>) {
  return criarApiClient({
    baseUrl: "https://api.exemplo.br",
    obterToken: () => "jwt-do-cliente",
    fetch: fetchFalso as unknown as typeof globalThis.fetch,
  });
}

describe("api do cliente logado", () => {
  it("lê o próprio cadastro pelo token", async () => {
    const fetchFalso = vi.fn(async (_url: string, _init?: RequestInit) =>
      respostaJson({
        cliente: {
          id: "c1",
          nome: "João",
          telefone: "(11) 99999-8888",
          email: null,
          temConta: true,
        },
      })
    );

    const cliente = await clientDoCliente(fetchFalso).cliente.meuCadastro();

    const init = fetchFalso.mock.calls[0][1] as RequestInit;
    expect(fetchFalso.mock.calls[0][0]).toBe(
      "https://api.exemplo.br/clientes/me"
    );
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer jwt-do-cliente"
    );
    expect(cliente.nome).toBe("João");
  });

  it("filtra o histórico por intervalo quando a tela pede", async () => {
    const fetchFalso = vi.fn(async (_url: string, _init?: RequestInit) =>
      respostaJson({ agendamentos: [AGENDAMENTO] })
    );

    const agendamentos = await clientDoCliente(
      fetchFalso
    ).cliente.meusAgendamentos({ de: "2026-09-01" });

    expect(fetchFalso.mock.calls[0][0]).toBe(
      "https://api.exemplo.br/clientes/me/agendamentos?de=2026-09-01"
    );
    expect(agendamentos).toHaveLength(1);
  });

  it("cancela um agendamento futuro", async () => {
    const fetchFalso = vi.fn(async (_url: string, _init?: RequestInit) =>
      respostaJson({ agendamento: { ...AGENDAMENTO, status: "cancelado" } })
    );

    const agendamento = await clientDoCliente(fetchFalso).cliente.cancelar(
      "a1"
    );

    const init = fetchFalso.mock.calls[0][1] as RequestInit;
    expect(fetchFalso.mock.calls[0][0]).toBe(
      "https://api.exemplo.br/clientes/me/agendamentos/a1/cancelar"
    );
    expect(init.method).toBe("POST");
    expect(agendamento.status).toBe("cancelado");
  });

  it("remarca herdando os serviços quando nenhum é mandado", async () => {
    const fetchFalso = vi.fn(async (_url: string, _init?: RequestInit) =>
      respostaJson({ agendamento: AGENDAMENTO }, 201)
    );

    await clientDoCliente(fetchFalso).cliente.remarcar("a1", {
      data: "2026-09-12",
      horaInicio: "10:00",
    });

    const init = fetchFalso.mock.calls[0][1] as RequestInit;
    expect(fetchFalso.mock.calls[0][0]).toBe(
      "https://api.exemplo.br/clientes/me/agendamentos/a1/remarcar"
    );
    // servicoIds ausente é o que faz a API herdar os do agendamento
    // antigo; mandar undefined explícito viraria 400 no schema.
    expect(init.body).toBe(
      JSON.stringify({ data: "2026-09-12", horaInicio: "10:00" })
    );
  });
});
