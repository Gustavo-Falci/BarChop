import { describe, expect, it, vi } from "vitest";
import { criarApiClient } from "../src/index";

function respostaJson(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function clientComFetch(fetchFalso: ReturnType<typeof vi.fn>) {
  return criarApiClient({
    baseUrl: "https://api.exemplo.br",
    fetch: fetchFalso as unknown as typeof globalThis.fetch,
  });
}

describe("api pública", () => {
  it("busca o perfil da barbearia pelo slug", async () => {
    const fetchFalso = vi.fn(async (_url: string, _init?: RequestInit) =>
      respostaJson({
        id: "b1",
        nome: "GR Barber",
        slug: "gr-barber",
        telefone: null,
        endereco: null,
        logoUrl: null,
        horarios: [],
        barbeiros: [{ id: "bb1", nome: "Rafael" }],
      })
    );

    const perfil = await clientComFetch(fetchFalso).publico.perfilDaBarbearia(
      "gr-barber"
    );

    expect(fetchFalso.mock.calls[0][0]).toBe(
      "https://api.exemplo.br/barbearias/gr-barber"
    );
    // O fluxo público inteiro precisa deste id: /disponibilidade e o
    // POST público exigem barbeiroId, e esta é a única rota pública que
    // o entrega.
    expect(perfil.barbeiros[0].nome).toBe("Rafael");
  });

  it("lista os serviços ativos da barbearia", async () => {
    const fetchFalso = vi.fn(async (_url: string, _init?: RequestInit) =>
      respostaJson({
        servicos: [
          {
            id: "s1",
            nome: "Corte",
            duracaoMinutos: 30,
            preco: "40.00",
            ativo: true,
          },
        ],
      })
    );

    const servicos = await clientComFetch(fetchFalso).publico.servicos(
      "gr-barber"
    );

    expect(fetchFalso.mock.calls[0][0]).toBe(
      "https://api.exemplo.br/barbearias/gr-barber/servicos"
    );
    expect(servicos[0].preco).toBe("40.00");
  });

  it("pede os horários livres de um dia com os serviços escolhidos", async () => {
    const fetchFalso = vi.fn(async (_url: string, _init?: RequestInit) =>
      respostaJson({ horarios: ["09:00", "09:15"] })
    );

    const horarios = await clientComFetch(
      fetchFalso
    ).publico.disponibilidadeDoDia("gr-barber", {
      barbeiroId: "bb1",
      data: "2026-09-10",
      servicoIds: ["s1", "s2"],
    });

    expect(fetchFalso.mock.calls[0][0]).toBe(
      "https://api.exemplo.br/barbearias/gr-barber/disponibilidade?barbeiroId=bb1&data=2026-09-10&servicoIds=s1&servicoIds=s2"
    );
    expect(horarios).toEqual(["09:00", "09:15"]);
  });

  it("com comToken, a disponibilidade vai com o token do painel (o painel encaixa livre)", async () => {
    const fetchFalso = vi.fn(async (_url: string, _init?: RequestInit) => respostaJson({ horarios: [] }));
    const api = criarApiClient({
      baseUrl: "https://api.exemplo.br",
      fetch: fetchFalso as unknown as typeof globalThis.fetch,
      obterToken: () => "token-do-painel",
    });
    const filtro = { barbeiroId: "bb1", data: "2026-09-10", servicoIds: ["s1"] };

    await api.publico.disponibilidadeDoDia("gr-barber", filtro);
    await api.publico.disponibilidadeDoDia("gr-barber", filtro, { comToken: true });
    await api.publico.disponibilidadeDoMes("gr-barber", { ...filtro, mes: "2026-09" }, { comToken: true });

    const cabecalhos = fetchFalso.mock.calls.map((chamada) => (chamada[1]?.headers ?? {}) as Record<string, string>);
    expect(cabecalhos[0].Authorization).toBeUndefined();
    expect(cabecalhos[1].Authorization).toBe("Bearer token-do-painel");
    expect(cabecalhos[2].Authorization).toBe("Bearer token-do-painel");
  });

  it("pede o mapa do mês pro calendário", async () => {
    const fetchFalso = vi.fn(async (_url: string, _init?: RequestInit) =>
      respostaJson({ dias: { "2026-09-10": true, "2026-09-11": false } })
    );

    const dias = await clientComFetch(fetchFalso).publico.disponibilidadeDoMes(
      "gr-barber",
      { barbeiroId: "bb1", mes: "2026-09", servicoIds: ["s1"] }
    );

    expect(fetchFalso.mock.calls[0][0]).toBe(
      "https://api.exemplo.br/barbearias/gr-barber/disponibilidade/mes?barbeiroId=bb1&mes=2026-09&servicoIds=s1"
    );
    expect(dias["2026-09-11"]).toBe(false);
  });

  it("agenda pelo link público mandando nome e telefone", async () => {
    const fetchFalso = vi.fn(async (_url: string, _init?: RequestInit) =>
      respostaJson(
        {
          id: "a1",
          data: "2026-09-10",
          horaInicio: "09:00",
          horaFim: "09:30",
          status: "pendente",
          origem: "cliente",
          observacoes: null,
          servicos: [],
        },
        201
      )
    );

    const agendamento = await clientComFetch(fetchFalso).publico.agendar(
      "gr-barber",
      {
        barbeiroId: "bb1",
        servicoIds: ["s1"],
        data: "2026-09-10",
        horaInicio: "09:00",
        cliente: { nome: "João", telefone: "(11) 99999-8888" },
      }
    );

    const init = fetchFalso.mock.calls[0][1] as RequestInit;
    expect(fetchFalso.mock.calls[0][0]).toBe(
      "https://api.exemplo.br/barbearias/gr-barber/agendamentos"
    );
    expect(init.method).toBe("POST");
    expect(agendamento.status).toBe("pendente");
  });

  it("entra na conta do cliente daquela barbearia", async () => {
    const fetchFalso = vi.fn(async (_url: string, _init?: RequestInit) =>
      respostaJson({
        token: "jwt-cliente",
        cliente: {
          id: "c1",
          nome: "João",
          telefone: "(11) 99999-8888",
          email: null,
          temConta: true,
        },
      })
    );

    const sessao = await clientComFetch(fetchFalso).publico.loginCliente(
      "gr-barber",
      { telefone: "(11) 99999-8888", senha: "segredo123" }
    );

    expect(fetchFalso.mock.calls[0][0]).toBe(
      "https://api.exemplo.br/barbearias/gr-barber/auth/cliente/login"
    );
    expect(sessao.token).toBe("jwt-cliente");
  });

  it("pede o código de verificação pro telefone", async () => {
    const fetchFalso = vi.fn(async (_url: string, _init?: RequestInit) =>
      respostaJson({ enviado: true }, 202)
    );

    await clientComFetch(fetchFalso).publico.pedirCodigoDoCliente("gr-barber", {
      telefone: "(11) 98888-7777",
    });

    expect(fetchFalso.mock.calls[0][0]).toBe(
      "https://api.exemplo.br/barbearias/gr-barber/auth/cliente/codigo"
    );
    expect(JSON.parse(String(fetchFalso.mock.calls[0][1]?.body))).toEqual({
      telefone: "(11) 98888-7777",
    });
  });

  it("pede o código pro e-mail, no piloto sem WhatsApp", async () => {
    const fetchFalso = vi.fn(async (_url: string, _init?: RequestInit) =>
      respostaJson({ enviado: true }, 202)
    );

    await clientComFetch(fetchFalso).publico.pedirCodigoDoCliente("gr-barber", {
      email: "maria@exemplo.com",
    });

    expect(JSON.parse(String(fetchFalso.mock.calls[0][1]?.body))).toEqual({
      email: "maria@exemplo.com",
    });
  });

  it("entra com e-mail e senha", async () => {
    const fetchFalso = vi.fn(async (_url: string, _init?: RequestInit) =>
      respostaJson({
        token: "jwt-cliente",
        cliente: { id: "c1", nome: "Maria", telefone: "(11) 99999-8888", email: "maria@exemplo.com", temConta: true },
      })
    );

    await clientComFetch(fetchFalso).publico.loginCliente("gr-barber", {
      email: "maria@exemplo.com",
      senha: "segredo123",
    });

    expect(JSON.parse(String(fetchFalso.mock.calls[0][1]?.body))).toEqual({
      email: "maria@exemplo.com",
      senha: "segredo123",
    });
  });

  it("define a senha com o código e devolve a sessão", async () => {
    const fetchFalso = vi.fn(async (_url: string, _init?: RequestInit) =>
      respostaJson(
        {
          token: "jwt-novo",
          cliente: {
            id: "c2",
            nome: "Maria",
            telefone: "(11) 98888-7777",
            email: null,
            temConta: true,
          },
        },
        201
      )
    );

    const sessao = await clientComFetch(fetchFalso).publico.definirSenhaDoCliente(
      "gr-barber",
      { telefone: "(11) 98888-7777", codigo: "123456", senha: "segredo123", nome: "Maria" }
    );

    expect(fetchFalso.mock.calls[0][0]).toBe(
      "https://api.exemplo.br/barbearias/gr-barber/auth/cliente/senha"
    );
    expect(sessao.cliente.temConta).toBe(true);
  });

});
