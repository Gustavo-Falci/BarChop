import { describe, expect, it, vi } from "vitest";
import {
  criarApiClient,
  criarApiClientFalso,
  EMAIL_DO_SUPORTE_FALSO,
  SENHA_DO_SUPORTE_FALSA,
} from "../src/index";

// Onda 1, F4: o link é único pra sempre; o dono pede a troca e o suporte
// avalia.
const SOLICITACAO = {
  id: "8b1f0c3e-0000-4000-8000-000000000001",
  slugPedido: "gr-barber-centro",
  motivo: "mudamos de endereço",
  status: "pendente" as const,
  resposta: null,
  criadoEm: "2026-10-04T12:00:00.000Z",
  decididoEm: null,
};

const OUTRA_BARBEARIA = { id: "b2", nome: "Navalha de Ouro", slug: "navalha" };

function cliente(fetchFalso: ReturnType<typeof vi.fn>) {
  return criarApiClient({
    baseUrl: "https://api.exemplo.br",
    obterToken: () => "jwt-qualquer",
    fetch: fetchFalso as unknown as typeof globalThis.fetch,
  });
}

function chamada(fetchFalso: ReturnType<typeof vi.fn>) {
  const [url, init] = fetchFalso.mock.calls[0] as [string, RequestInit];
  return { url, init, cabecalhos: init.headers as Record<string, string> };
}

function responde(corpo: unknown, status = 200) {
  return vi.fn(async () => new Response(JSON.stringify(corpo), { status }));
}

describe("api do pedido de troca do link", () => {
  it("lê o pedido mais recente com o token", async () => {
    const fetchFalso = responde({ solicitacao: SOLICITACAO });

    const solicitacao = await cliente(fetchFalso).barbeiro.solicitacaoDeLink();

    const { url, cabecalhos } = chamada(fetchFalso);
    expect(url).toBe("https://api.exemplo.br/barbearias/me/solicitacao-de-link");
    expect(cabecalhos.Authorization).toBe("Bearer jwt-qualquer");
    expect(solicitacao).toEqual(SOLICITACAO);
  });

  it("sem pedido nenhum, devolve null", async () => {
    const solicitacao = await cliente(responde({ solicitacao: null })).barbeiro.solicitacaoDeLink();

    expect(solicitacao).toBeNull();
  });

  it("pede a troca com o link novo e o motivo", async () => {
    const fetchFalso = responde(SOLICITACAO, 201);

    const criada = await cliente(fetchFalso).barbeiro.pedirTrocaDeLink(
      "gr-barber-centro",
      "mudamos de endereço"
    );

    const { url, init, cabecalhos } = chamada(fetchFalso);
    expect(url).toBe("https://api.exemplo.br/barbearias/me/solicitacao-de-link");
    expect(init.method).toBe("POST");
    expect(cabecalhos.Authorization).toBe("Bearer jwt-qualquer");
    expect(JSON.parse(init.body as string)).toEqual({
      slug: "gr-barber-centro",
      motivo: "mudamos de endereço",
    });
    expect(criada.status).toBe("pendente");
  });

  it("sem motivo, o corpo leva só o link", async () => {
    const fetchFalso = responde(SOLICITACAO, 201);

    await cliente(fetchFalso).barbeiro.pedirTrocaDeLink("gr-barber-centro");

    expect(JSON.parse(chamada(fetchFalso).init.body as string)).toEqual({ slug: "gr-barber-centro" });
  });

  it("cancela o pedido pendente, sem corpo", async () => {
    const fetchFalso = responde({ ...SOLICITACAO, status: "cancelada" });

    const cancelada = await cliente(fetchFalso).barbeiro.cancelarPedidoDeLink();

    const { url, init, cabecalhos } = chamada(fetchFalso);
    expect(url).toBe("https://api.exemplo.br/barbearias/me/solicitacao-de-link/cancelar");
    expect(init.method).toBe("POST");
    expect(init.body).toBeUndefined();
    expect(cabecalhos.Authorization).toBe("Bearer jwt-qualquer");
    expect(cancelada.status).toBe("cancelada");
  });
});

describe("api do suporte", () => {
  it("entra sem mandar token nenhum", async () => {
    const sessao = { token: "jwt-suporte", operador: { id: "o1", nome: "Ana", email: "ana@barchop.com.br" } };
    const fetchFalso = responde(sessao);

    const resposta = await cliente(fetchFalso).suporte.login("ana@barchop.com.br", "senha-longa-123");

    const { url, init, cabecalhos } = chamada(fetchFalso);
    expect(url).toBe("https://api.exemplo.br/suporte/login");
    expect(init.method).toBe("POST");
    expect(cabecalhos.Authorization).toBeUndefined();
    expect(JSON.parse(init.body as string)).toEqual({
      email: "ana@barchop.com.br",
      senha: "senha-longa-123",
    });
    expect(resposta).toEqual(sessao);
  });

  it("lê a fila de pendentes com o token", async () => {
    const naFila = { ...SOLICITACAO, barbearia: OUTRA_BARBEARIA };
    const fetchFalso = responde({ solicitacoes: [naFila] });

    const fila = await cliente(fetchFalso).suporte.solicitacoes();

    const { url, cabecalhos } = chamada(fetchFalso);
    expect(url).toBe("https://api.exemplo.br/suporte/solicitacoes");
    expect(cabecalhos.Authorization).toBe("Bearer jwt-qualquer");
    expect(fila).toEqual([naFila]);
  });

  it("aprova sem corpo", async () => {
    const fetchFalso = responde({ ...SOLICITACAO, status: "aprovada" });

    const decidida = await cliente(fetchFalso).suporte.aprovar(SOLICITACAO.id);

    const { url, init, cabecalhos } = chamada(fetchFalso);
    expect(url).toBe(`https://api.exemplo.br/suporte/solicitacoes/${SOLICITACAO.id}/aprovar`);
    expect(init.method).toBe("POST");
    expect(init.body).toBeUndefined();
    expect(cabecalhos.Authorization).toBe("Bearer jwt-qualquer");
    expect(decidida.status).toBe("aprovada");
  });

  it("recusa com a resposta pro dono", async () => {
    const fetchFalso = responde({ ...SOLICITACAO, status: "recusada", resposta: "nome de marca" });

    await cliente(fetchFalso).suporte.recusar(SOLICITACAO.id, "nome de marca");

    const { url, init, cabecalhos } = chamada(fetchFalso);
    expect(url).toBe(`https://api.exemplo.br/suporte/solicitacoes/${SOLICITACAO.id}/recusar`);
    expect(init.method).toBe("POST");
    expect(cabecalhos.Authorization).toBe("Bearer jwt-qualquer");
    expect(JSON.parse(init.body as string)).toEqual({ resposta: "nome de marca" });
  });
});

describe("dublê do pedido de troca do link", () => {
  it("nasce sem pedido; pedir cria um pendente, que a leitura devolve", async () => {
    const falso = criarApiClientFalso();
    expect(await falso.barbeiro.solicitacaoDeLink()).toBeNull();

    const criada = await falso.barbeiro.pedirTrocaDeLink("gr-barber-centro", "  mudamos  ");

    expect(criada).toMatchObject({
      slugPedido: "gr-barber-centro",
      motivo: "mudamos",
      status: "pendente",
      resposta: null,
      decididoEm: null,
    });
    expect(await falso.barbeiro.solicitacaoDeLink()).toEqual(criada);
    // Pedir não troca nada: só o suporte troca.
    expect(falso.estado.perfil.slug).toBe("gr-barber");
  });

  it("motivo em branco vira null, como na API", async () => {
    const falso = criarApiClientFalso();

    expect((await falso.barbeiro.pedirTrocaDeLink("gr-barber-centro", "   ")).motivo).toBeNull();
  });

  it("é do dono, como na API", async () => {
    const falso = criarApiClientFalso({ papel: "profissional" });

    await expect(falso.barbeiro.solicitacaoDeLink()).rejects.toMatchObject({ status: 403, codigo: "sem_permissao" });
    await expect(falso.barbeiro.pedirTrocaDeLink("gr-barber-centro")).rejects.toMatchObject({ status: 403 });
    await expect(falso.barbeiro.cancelarPedidoDeLink()).rejects.toMatchObject({ status: 403 });
  });

  it("recusa link reservado, o atual e o de outra barbearia", async () => {
    const falso = criarApiClientFalso({ slugsEmUso: ["navalha"] });

    await expect(falso.barbeiro.pedirTrocaDeLink("painel")).rejects.toMatchObject({
      status: 422,
      codigo: "slug_reservado",
    });
    await expect(falso.barbeiro.pedirTrocaDeLink("gr-barber")).rejects.toMatchObject({
      status: 422,
      codigo: "slug_igual_ao_atual",
    });
    await expect(falso.barbeiro.pedirTrocaDeLink("navalha")).rejects.toMatchObject({
      status: 409,
      codigo: "conflito",
    });
    expect(await falso.barbeiro.solicitacaoDeLink()).toBeNull();
  });

  it("um pendente por vez", async () => {
    const falso = criarApiClientFalso();
    await falso.barbeiro.pedirTrocaDeLink("gr-barber-centro");

    await expect(falso.barbeiro.pedirTrocaDeLink("gr-barber-sul")).rejects.toMatchObject({
      status: 409,
      codigo: "solicitacao_pendente",
    });
  });

  it("cancela o pendente; a leitura mostra o cancelado e dá pra pedir de novo", async () => {
    const falso = criarApiClientFalso();
    await falso.barbeiro.pedirTrocaDeLink("gr-barber-centro");

    const cancelada = await falso.barbeiro.cancelarPedidoDeLink();

    expect(cancelada.status).toBe("cancelada");
    expect(cancelada.decididoEm).not.toBeNull();
    expect((await falso.barbeiro.solicitacaoDeLink())?.status).toBe("cancelada");
    await expect(falso.barbeiro.pedirTrocaDeLink("gr-barber-sul")).resolves.toMatchObject({
      status: "pendente",
    });
    expect((await falso.barbeiro.solicitacaoDeLink())?.slugPedido).toBe("gr-barber-sul");
  });

  it("cancelar sem pendente é 404", async () => {
    const falso = criarApiClientFalso();

    await expect(falso.barbeiro.cancelarPedidoDeLink()).rejects.toMatchObject({
      status: 404,
      codigo: "nao_encontrado",
    });
  });

  it("a leitura do dono só vê os pedidos da barbearia dele", async () => {
    const falso = criarApiClientFalso({
      solicitacoesDeLink: [{ ...SOLICITACAO, barbearia: OUTRA_BARBEARIA }],
    });

    expect(await falso.barbeiro.solicitacaoDeLink()).toBeNull();
  });
});

describe("dublê do suporte", () => {
  it("entra com as credenciais do dublê; qualquer outra é 401", async () => {
    const falso = criarApiClientFalso();

    const sessao = await falso.suporte.login(EMAIL_DO_SUPORTE_FALSO, SENHA_DO_SUPORTE_FALSA);

    expect(sessao.token).toBeTruthy();
    expect(sessao.operador.email).toBe(EMAIL_DO_SUPORTE_FALSO);
    await expect(falso.suporte.login(EMAIL_DO_SUPORTE_FALSO, "errada")).rejects.toMatchObject({
      status: 401,
      codigo: "credenciais_invalidas",
    });
  });

  it("a fila tem só os pendentes, do mais antigo pro mais novo, com a barbearia", async () => {
    const falso = criarApiClientFalso({
      solicitacoesDeLink: [
        { ...SOLICITACAO, id: "s-novo", criadoEm: "2026-10-04T15:00:00.000Z", barbearia: OUTRA_BARBEARIA },
        {
          ...SOLICITACAO,
          id: "s-recusado",
          status: "recusada",
          resposta: "não",
          decididoEm: "2026-10-04T13:00:00.000Z",
          barbearia: OUTRA_BARBEARIA,
        },
        { ...SOLICITACAO, id: "s-velho", criadoEm: "2026-10-03T09:00:00.000Z", barbearia: OUTRA_BARBEARIA },
      ],
    });
    await falso.barbeiro.pedirTrocaDeLink("gr-barber-centro");

    const fila = await falso.suporte.solicitacoes();

    expect(fila.map((s) => s.id).slice(0, 2)).toEqual(["s-velho", "s-novo"]);
    expect(fila).toHaveLength(3);
    expect(fila[2].barbearia).toEqual({ id: "b1", nome: "GR Barber", slug: "gr-barber" });
  });

  it("aprovar o pedido da barbearia do dublê troca o link dela", async () => {
    const falso = criarApiClientFalso();
    const pedido = await falso.barbeiro.pedirTrocaDeLink("gr-barber-centro");

    const aprovada = await falso.suporte.aprovar(pedido.id);

    expect(aprovada.status).toBe("aprovada");
    expect(aprovada.decididoEm).not.toBeNull();
    expect(falso.estado.perfil.slug).toBe("gr-barber-centro");
    expect((await falso.barbeiro.minhaBarbearia()).slug).toBe("gr-barber-centro");
    expect(await falso.suporte.solicitacoes()).toEqual([]);
  });

  it("aprovar com o link tomado no meio é 409 e o pedido fica pendente", async () => {
    const falso = criarApiClientFalso();
    const pedido = await falso.barbeiro.pedirTrocaDeLink("gr-barber-centro");
    falso.estado.slugsEmUso!.push("gr-barber-centro");

    await expect(falso.suporte.aprovar(pedido.id)).rejects.toMatchObject({
      status: 409,
      codigo: "conflito",
    });
    expect((await falso.suporte.solicitacoes()).map((s) => s.id)).toEqual([pedido.id]);
    expect(falso.estado.perfil.slug).toBe("gr-barber");
  });

  it("recusar guarda a resposta, que o dono lê", async () => {
    const falso = criarApiClientFalso();
    const pedido = await falso.barbeiro.pedirTrocaDeLink("gr-barber-centro");

    const recusada = await falso.suporte.recusar(pedido.id, "  nome de outra marca ");

    expect(recusada).toMatchObject({ status: "recusada", resposta: "nome de outra marca" });
    expect(await falso.barbeiro.solicitacaoDeLink()).toMatchObject({
      status: "recusada",
      resposta: "nome de outra marca",
    });
    expect(falso.estado.perfil.slug).toBe("gr-barber");
  });

  it("pedido inexistente é 404; já decidido é 422", async () => {
    const falso = criarApiClientFalso();
    const pedido = await falso.barbeiro.pedirTrocaDeLink("gr-barber-centro");
    await falso.suporte.recusar(pedido.id, "não");

    await expect(falso.suporte.aprovar("nao-existe")).rejects.toMatchObject({ status: 404 });
    await expect(falso.suporte.recusar("nao-existe", "não")).rejects.toMatchObject({ status: 404 });
    await expect(falso.suporte.aprovar(pedido.id)).rejects.toMatchObject({
      status: 422,
      codigo: "solicitacao_decidida",
    });
    await expect(falso.suporte.recusar(pedido.id, "não")).rejects.toMatchObject({
      status: 422,
      codigo: "solicitacao_decidida",
    });
  });
});
