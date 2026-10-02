import { describe, expect, it, vi } from "vitest";
import { criarApiClient } from "../src/index";

function respostaJson(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function clientAutenticado(fetchFalso: ReturnType<typeof vi.fn>) {
  return criarApiClient({
    baseUrl: "https://api.exemplo.br",
    obterToken: () => "jwt-do-barbeiro",
    fetch: fetchFalso as unknown as typeof globalThis.fetch,
  });
}

function urlEInit(fetchFalso: ReturnType<typeof vi.fn>) {
  return {
    url: fetchFalso.mock.calls[0][0] as string,
    init: fetchFalso.mock.calls[0][1] as RequestInit,
  };
}

describe("api do barbeiro", () => {
  it("faz login sem token e devolve a sessão", async () => {
    const fetchFalso = vi.fn(async (_url: string, _init?: RequestInit) =>
      respostaJson({
        token: "jwt-do-barbeiro",
        barbeiro: { id: "bb1", nome: "Rafael", email: "rafael@gr.com" },
        barbearia: { id: "b1", nome: "GR Barber", slug: "gr-barber" },
      })
    );

    const sessao = await clientAutenticado(fetchFalso).barbeiro.login({
      email: "rafael@gr.com",
      senha: "segredo123",
    });

    const { url, init } = urlEInit(fetchFalso);
    expect(url).toBe("https://api.exemplo.br/auth/login");
    // Login não manda Authorization: não há sessão ainda, e mandar um
    // token velho aqui não faria diferença nenhuma pra API.
    expect(
      (init.headers as Record<string, string>).Authorization
    ).toBeUndefined();
    expect(sessao.barbearia.slug).toBe("gr-barber");
  });

  it("cria a barbearia e o primeiro barbeiro no signup", async () => {
    const fetchFalso = vi.fn(async (_url: string, _init?: RequestInit) =>
      respostaJson(
        {
          token: "jwt-novo",
          barbeiro: { id: "bb1", nome: "Rafael", email: "rafael@gr.com" },
          barbearia: { id: "b1", nome: "GR Barber", slug: "gr-barber" },
        },
        201
      )
    );

    await clientAutenticado(fetchFalso).barbeiro.signup({
      barbearia: { nome: "GR Barber", slug: "gr-barber" },
      barbeiro: { nome: "Rafael", email: "rafael@gr.com", senha: "segredo123" },
    });

    expect(urlEInit(fetchFalso).url).toBe("https://api.exemplo.br/auth/signup");
  });

  it("lê o próprio perfil com o token", async () => {
    const fetchFalso = vi.fn(async (_url: string, _init?: RequestInit) =>
      respostaJson({
        id: "bb1",
        nome: "Rafael",
        email: "rafael@gr.com",
        telefone: null,
        barbeariaId: "b1",
      })
    );

    await clientAutenticado(fetchFalso).barbeiro.meuPerfil();

    const { url, init } = urlEInit(fetchFalso);
    expect(url).toBe("https://api.exemplo.br/me");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer jwt-do-barbeiro"
    );
  });

  it("grava os sete dias de horário de uma vez", async () => {
    // PUT, não PATCH: dia ausente do corpo vira fechado, e a API grava
    // a semana inteira ou nenhuma.
    const fetchFalso = vi.fn(async (_url: string, _init?: RequestInit) => respostaJson({ horarios: [] }));

    await clientAutenticado(fetchFalso).barbeiro.salvarHorarios([
      {
        diaSemana: 1,
        horaAbertura: "09:00",
        horaFechamento: "18:00",
        fechado: false,
      },
    ]);

    const { url, init } = urlEInit(fetchFalso);
    expect(url).toBe("https://api.exemplo.br/barbearias/me/horarios");
    expect(init.method).toBe("PUT");
    expect(init.body).toBe(
      JSON.stringify({
        horarios: [
          {
            diaSemana: 1,
            horaAbertura: "09:00",
            horaFechamento: "18:00",
            fechado: false,
          },
        ],
      })
    );
  });

  it("desativa serviço com DELETE, que é reversível na API", async () => {
    const fetchFalso = vi.fn(async (_url: string, _init?: RequestInit) =>
      respostaJson({
        id: "s1",
        nome: "Corte",
        duracaoMinutos: 30,
        preco: "40.00",
        ativo: false,
      })
    );

    const servico = await clientAutenticado(
      fetchFalso
    ).barbeiro.desativarServico("s1");

    const { url, init } = urlEInit(fetchFalso);
    expect(url).toBe("https://api.exemplo.br/servicos/s1");
    expect(init.method).toBe("DELETE");
    expect(servico.ativo).toBe(false);
  });

  it("busca cliente por texto na query", async () => {
    const fetchFalso = vi.fn(async (_url: string, _init?: RequestInit) => respostaJson({ clientes: [] }));

    await clientAutenticado(fetchFalso).barbeiro.clientes("99999");

    expect(urlEInit(fetchFalso).url).toBe(
      "https://api.exemplo.br/clientes?busca=99999"
    );
  });

  it("omite a busca vazia em vez de mandar ?busca=", async () => {
    // O schema da API tem minLength: 1 no `busca` — o contrato é "se
    // mandar o parâmetro, mande com conteúdo". A lista de clientes abre
    // com o campo vazio, e o `montarQuery` só pula `undefined`, nunca
    // `""`. Sem normalizar aqui, abrir /painel/clientes é um 400:
    // "querystring/busca must NOT have fewer than 1 characters".
    //
    // O teste vive no api-client, e não na tela, de propósito: o dublê
    // do `falso.ts` aceita `""` e devolve todo mundo, então um teste de
    // ListaDeClientes passa exista o fix ou não.
    const fetchFalso = vi.fn(async (_url: string, _init?: RequestInit) => respostaJson({ clientes: [] }));

    await clientAutenticado(fetchFalso).barbeiro.clientes("");

    expect(urlEInit(fetchFalso).url).toBe("https://api.exemplo.br/clientes");
  });

  it("trata busca só de espaços como busca vazia", async () => {
    // `"   "` passaria o minLength e a API o descartaria no `.trim()`
    // — mesma resposta, uma ida ao servidor a mais.
    const fetchFalso = vi.fn(async (_url: string, _init?: RequestInit) => respostaJson({ clientes: [] }));

    await clientAutenticado(fetchFalso).barbeiro.clientes("   ");

    expect(urlEInit(fetchFalso).url).toBe("https://api.exemplo.br/clientes");
  });

  it("preserva os espaços em volta de uma busca com conteúdo", async () => {
    // O trim decide se manda; não muda o que a pessoa digitou.
    const fetchFalso = vi.fn(async (_url: string, _init?: RequestInit) => respostaJson({ clientes: [] }));

    await clientAutenticado(fetchFalso).barbeiro.clientes("  joão  ");

    expect(urlEInit(fetchFalso).url).toBe(
      "https://api.exemplo.br/clientes?busca=++jo%C3%A3o++"
    );
  });

  it("lista a agenda de um dia", async () => {
    const fetchFalso = vi.fn(async (_url: string, _init?: RequestInit) => respostaJson({ agendamentos: [] }));

    await clientAutenticado(fetchFalso).barbeiro.agendamentosDoDia(
      "2026-09-10"
    );

    expect(urlEInit(fetchFalso).url).toBe(
      "https://api.exemplo.br/agendamentos?data=2026-09-10"
    );
  });

  it("lista a agenda de um intervalo", async () => {
    // A API recusa `data` junto com `de`/`ate` com 400, então as duas
    // formas são funções separadas em vez de um objeto com tudo opcional.
    const fetchFalso = vi.fn(async (_url: string, _init?: RequestInit) => respostaJson({ agendamentos: [] }));

    await clientAutenticado(fetchFalso).barbeiro.agendamentosDoIntervalo(
      "2026-09-01",
      "2026-09-30"
    );

    expect(urlEInit(fetchFalso).url).toBe(
      "https://api.exemplo.br/agendamentos?de=2026-09-01&ate=2026-09-30"
    );
  });

  it("muda o status de um agendamento", async () => {
    const fetchFalso = vi.fn(async (_url: string, _init?: RequestInit) =>
      respostaJson({
        id: "a1",
        data: "2026-09-10",
        horaInicio: "09:00",
        horaFim: "09:30",
        status: "concluido",
        origem: "barbeiro",
        observacoes: null,
        servicos: [],
        cliente: {
          id: "c1",
          nome: "João",
          telefone: "(11) 99999-8888",
          email: null,
          temConta: false,
        },
      })
    );

    const agendamento = await clientAutenticado(
      fetchFalso
    ).barbeiro.atualizarAgendamento("a1", { status: "concluido" });

    const { url, init } = urlEInit(fetchFalso);
    expect(url).toBe("https://api.exemplo.br/agendamentos/a1");
    expect(init.method).toBe("PATCH");
    expect(agendamento.cliente.nome).toBe("João");
  });
});
