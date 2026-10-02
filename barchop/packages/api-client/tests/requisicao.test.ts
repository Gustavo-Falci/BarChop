import { describe, expect, it, vi } from "vitest";
import { criarRequisicao, ErroDaApi } from "../src/index";

function respostaJson(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("criarRequisicao", () => {
  it("monta a URL a partir da baseUrl e devolve o JSON", async () => {
    const fetchFalso = vi.fn(async (_url: string, _init?: RequestInit) => respostaJson({ status: "ok" }));
    const requisicao = criarRequisicao({
      baseUrl: "https://api.exemplo.br",
      fetch: fetchFalso as unknown as typeof globalThis.fetch,
    });

    const resposta = await requisicao<{ status: string }>("/health");

    expect(resposta).toEqual({ status: "ok" });
    expect(fetchFalso.mock.calls[0][0]).toBe("https://api.exemplo.br/health");
  });

  it("repete o mesmo parâmetro de query pra cada item de um array", async () => {
    // A API lê servicoIds como array e conta com ?servicoIds=a&servicoIds=b.
    const fetchFalso = vi.fn(async (_url: string, _init?: RequestInit) => respostaJson({ horarios: [] }));
    const requisicao = criarRequisicao({
      baseUrl: "https://api.exemplo.br",
      fetch: fetchFalso as unknown as typeof globalThis.fetch,
    });

    await requisicao("/barbearias/gr/disponibilidade", {
      query: { barbeiroId: "b1", servicoIds: ["s1", "s2"] },
    });

    expect(fetchFalso.mock.calls[0][0]).toBe(
      "https://api.exemplo.br/barbearias/gr/disponibilidade?barbeiroId=b1&servicoIds=s1&servicoIds=s2"
    );
  });

  it("omite parâmetro undefined em vez de mandar a string 'undefined'", async () => {
    const fetchFalso = vi.fn(async (_url: string, _init?: RequestInit) => respostaJson({ agendamentos: [] }));
    const requisicao = criarRequisicao({
      baseUrl: "https://api.exemplo.br",
      fetch: fetchFalso as unknown as typeof globalThis.fetch,
    });

    await requisicao("/clientes/me/agendamentos", {
      query: { de: "2026-09-01", ate: undefined },
    });

    expect(fetchFalso.mock.calls[0][0]).toBe(
      "https://api.exemplo.br/clientes/me/agendamentos?de=2026-09-01"
    );
  });

  it("manda o token no Authorization quando a rota pede", async () => {
    const fetchFalso = vi.fn(async (_url: string, _init?: RequestInit) => respostaJson({}));
    const requisicao = criarRequisicao({
      baseUrl: "https://api.exemplo.br",
      obterToken: () => "jwt-do-barbeiro",
      fetch: fetchFalso as unknown as typeof globalThis.fetch,
    });

    await requisicao("/me", { comToken: true });

    const init = fetchFalso.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer jwt-do-barbeiro"
    );
  });

  it("não manda Authorization nas rotas públicas", async () => {
    const fetchFalso = vi.fn(async (_url: string, _init?: RequestInit) => respostaJson({}));
    const requisicao = criarRequisicao({
      baseUrl: "https://api.exemplo.br",
      obterToken: () => "jwt-que-nao-deve-vazar",
      fetch: fetchFalso as unknown as typeof globalThis.fetch,
    });

    await requisicao("/barbearias/gr");

    const init = fetchFalso.mock.calls[0][1] as RequestInit;
    expect(
      (init.headers as Record<string, string>).Authorization
    ).toBeUndefined();
  });

  it("serializa o corpo como JSON e marca o método", async () => {
    const fetchFalso = vi.fn(async (_url: string, _init?: RequestInit) => respostaJson({}, 201));
    const requisicao = criarRequisicao({
      baseUrl: "https://api.exemplo.br",
      fetch: fetchFalso as unknown as typeof globalThis.fetch,
    });

    await requisicao("/servicos", {
      metodo: "POST",
      corpo: { nome: "Corte" },
      comToken: false,
    });

    const init = fetchFalso.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ nome: "Corte" }));
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/json"
    );
  });

  it("traduz o corpo de erro da API em ErroDaApi", async () => {
    const fetchFalso = vi.fn(async (_url: string, _init?: RequestInit) =>
      respostaJson(
        { erro: "horario_ocupado", mensagem: "esse horário já está ocupado" },
        409
      )
    );
    const requisicao = criarRequisicao({
      baseUrl: "https://api.exemplo.br",
      fetch: fetchFalso as unknown as typeof globalThis.fetch,
    });

    await expect(requisicao("/barbearias/gr/agendamentos")).rejects.toThrow(
      ErroDaApi
    );

    try {
      await requisicao("/barbearias/gr/agendamentos");
      expect.unreachable("deveria ter lançado");
    } catch (erro) {
      const daApi = erro as ErroDaApi;
      expect(daApi.status).toBe(409);
      expect(daApi.codigo).toBe("horario_ocupado");
      expect(daApi.mensagem).toBe("esse horário já está ocupado");
    }
  });

  it("chama aoExpirarSessao no 401, e ainda lança", async () => {
    // O token vale 7 dias e o hook da API consulta o banco a cada
    // requisição, então 401 no meio da sessão é evento normal — a tela
    // precisa ser avisada pra limpar o token, não só ver a exceção.
    const aoExpirarSessao = vi.fn();
    const fetchFalso = vi.fn(async (_url: string, _init?: RequestInit) =>
      respostaJson({ erro: "nao_autenticado" }, 401)
    );
    const requisicao = criarRequisicao({
      baseUrl: "https://api.exemplo.br",
      obterToken: () => "jwt-vencido",
      aoExpirarSessao,
      fetch: fetchFalso as unknown as typeof globalThis.fetch,
    });

    await expect(requisicao("/me", { comToken: true })).rejects.toThrow(
      ErroDaApi
    );
    expect(aoExpirarSessao).toHaveBeenCalledTimes(1);
  });

  it("sobrevive a resposta de erro sem corpo JSON", async () => {
    // 500 de proxy, HTML de gateway: sem isto o JSON.parse estouraria e
    // a tela veria um SyntaxError em vez do status real.
    const fetchFalso = vi.fn(
      async () => new Response("<html>502</html>", { status: 502 })
    );
    const requisicao = criarRequisicao({
      baseUrl: "https://api.exemplo.br",
      fetch: fetchFalso as unknown as typeof globalThis.fetch,
    });

    try {
      await requisicao("/health");
      expect.unreachable("deveria ter lançado");
    } catch (erro) {
      const daApi = erro as ErroDaApi;
      expect(daApi.status).toBe(502);
      expect(daApi.codigo).toBe("erro_interno");
    }
  });

  it("aceita 204 sem corpo", async () => {
    const fetchFalso = vi.fn(async (_url: string, _init?: RequestInit) => new Response(null, { status: 204 }));
    const requisicao = criarRequisicao({
      baseUrl: "https://api.exemplo.br",
      fetch: fetchFalso as unknown as typeof globalThis.fetch,
    });

    await expect(requisicao("/health")).resolves.toBeNull();
  });
});
