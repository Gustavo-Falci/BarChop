import { describe, expect, it, vi } from "vitest";
import { ErroDaApi, criarApiClient, criarApiClientFalso } from "../src/index";

// O Pix do BarChop (plano pix-do-barchop, PR 1): as rotas do dono
// (cotação, "Já paguei", "Ainda não paguei") e as do Suporte (fila,
// confirmar, recusar), no client de verdade e no dublê.

const PAGAMENTO = {
  id: "8b1f0c3e-0000-4000-8000-000000000009",
  identificador: "K7Q2MX",
  plano: "essencial" as const,
  ciclo: "mensal" as const,
  profissionais: 1,
  valorCentavos: 4490,
  periodoComecaEm: "2026-11-15T14:43:00.000Z",
  periodoTerminaEm: "2026-12-15T14:43:00.000Z",
  situacao: "aguardando" as const,
  resposta: null,
  criadoEm: "2026-11-09T12:00:00.000Z",
  decididoEm: null,
  copiaECola: "000201...",
};

const PEDIDO = { plano: "essencial", ciclo: "mensal", profissionais: 1 } as const;

function cliente(fetchFalso: ReturnType<typeof vi.fn>) {
  return criarApiClient({
    baseUrl: "https://api.exemplo.br",
    obterToken: () => "jwt-qualquer",
    fetch: fetchFalso as unknown as typeof globalThis.fetch,
  });
}

function chamada(fetchFalso: ReturnType<typeof vi.fn>) {
  const [url, init] = fetchFalso.mock.calls[0] as [string, RequestInit];
  return { url, init };
}

function responde(corpo: unknown, status = 200) {
  return vi.fn(async () => new Response(JSON.stringify(corpo), { status }));
}

describe("api do Pix do BarChop", () => {
  it("cota pelo pedido na query", async () => {
    const fetchFalso = responde({});

    await cliente(fetchFalso).barbeiro.cotacaoDoPix(PEDIDO);

    expect(chamada(fetchFalso).url).toBe(
      "https://api.exemplo.br/barbearias/me/assinatura/pix?plano=essencial&ciclo=mensal&profissionais=1"
    );
  });

  it("Já paguei manda só o pedido", async () => {
    const fetchFalso = responde(PAGAMENTO, 201);

    const pago = await cliente(fetchFalso).barbeiro.jaPagueiOPix(PEDIDO);

    const { url, init } = chamada(fetchFalso);
    expect(url).toBe("https://api.exemplo.br/barbearias/me/assinatura/pix");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual(PEDIDO);
    expect(pago).toEqual(PAGAMENTO);
  });

  it("Ainda não paguei", async () => {
    const fetchFalso = responde({ ...PAGAMENTO, situacao: "desfeito" });

    await cliente(fetchFalso).barbeiro.desfazerOPix(PAGAMENTO.id);

    expect(chamada(fetchFalso).url).toBe(`https://api.exemplo.br/barbearias/me/assinatura/pix/${PAGAMENTO.id}/desfazer`);
  });

  it("a lista de pagamentos de Faturas (PR 2)", async () => {
    const fetchFalso = responde([PAGAMENTO]);

    expect(await cliente(fetchFalso).barbeiro.pagamentosDoPix()).toEqual([PAGAMENTO]);
    expect(chamada(fetchFalso).url).toBe("https://api.exemplo.br/barbearias/me/assinatura/pix/pagamentos");
  });

  it("o Suporte lê a fila e decide", async () => {
    const fila = responde({ pagamentos: [] });
    expect(await cliente(fila).suporte.pixNaFila()).toEqual([]);
    expect(chamada(fila).url).toBe("https://api.exemplo.br/suporte/pix");

    const confirmar = responde(PAGAMENTO);
    await cliente(confirmar).suporte.confirmarPix(PAGAMENTO.id);
    expect(chamada(confirmar).url).toBe(`https://api.exemplo.br/suporte/pix/${PAGAMENTO.id}/confirmar`);

    const recusar = responde(PAGAMENTO);
    await cliente(recusar).suporte.recusarPix(PAGAMENTO.id, "Não achei");
    const { url, init } = chamada(recusar);
    expect(url).toBe(`https://api.exemplo.br/suporte/pix/${PAGAMENTO.id}/recusar`);
    expect(JSON.parse(init.body as string)).toEqual({ resposta: "Não achei" });
  });
});

describe("o dublê do Pix do BarChop", () => {
  it("sem o Pix ligado na semente, 409 pix_desligado", async () => {
    const api = criarApiClientFalso();

    await expect(api.barbeiro.cotacaoDoPix(PEDIDO)).rejects.toMatchObject({ status: 409, codigo: "pix_desligado" });
  });

  it("Já paguei: o plano vale na hora; o Suporte vê na fila e recusa; volta ao teste", async () => {
    const api = criarApiClientFalso({ pixLigado: true });

    const cotacao = await api.barbeiro.cotacaoDoPix(PEDIDO);
    expect(cotacao.valorCentavos).toBe(4490);

    const pago = await api.barbeiro.jaPagueiOPix(PEDIDO);
    expect(pago).toMatchObject({ situacao: "aguardando", identificador: cotacao.identificador });
    expect(await api.barbeiro.assinatura()).toMatchObject({
      situacao: "ativa",
      forma: "pix",
      planoEfetivo: "essencial",
      pix: { aguardando: { id: pago.id }, ultimaRecusa: null },
    });
    await expect(api.barbeiro.jaPagueiOPix(PEDIDO)).rejects.toMatchObject({ codigo: "pix_em_conferencia" });

    const fila = await api.suporte.pixNaFila();
    expect(fila.map((p) => p.id)).toEqual([pago.id]);

    await api.suporte.recusarPix(pago.id, "Não achei");
    const depois = await api.barbeiro.assinatura();
    expect(depois).toMatchObject({ situacao: "teste", forma: "cartao", planoEfetivo: "completo" });
    expect(depois.pix).toEqual({ aguardando: null, ultimaRecusa: { resposta: "Não achei", decididoEm: expect.any(String) } });
    expect(await api.suporte.pixNaFila()).toEqual([]);
  });

  it("a lista de pagamentos: do mais novo pro mais velho, sem os desfeitos", async () => {
    const api = criarApiClientFalso({ pixLigado: true });
    expect(await api.barbeiro.pagamentosDoPix()).toEqual([]);

    const desfeito = await api.barbeiro.jaPagueiOPix(PEDIDO);
    await api.barbeiro.desfazerOPix(desfeito.id);
    const recusado = await api.barbeiro.jaPagueiOPix(PEDIDO);
    await api.suporte.recusarPix(recusado.id, "Não achei");
    const aguardando = await api.barbeiro.jaPagueiOPix({ ...PEDIDO, profissionais: 2 });

    const lista = await api.barbeiro.pagamentosDoPix();
    expect(lista.map((p) => [p.id, p.situacao])).toEqual([
      [aguardando.id, "aguardando"],
      [recusado.id, "recusado"],
    ]);
  });

  it("Ainda não paguei volta ao que era; confirmar mantém o plano", async () => {
    const api = criarApiClientFalso({ pixLigado: true });

    const primeiro = await api.barbeiro.jaPagueiOPix(PEDIDO);
    await api.barbeiro.desfazerOPix(primeiro.id);
    expect(await api.barbeiro.assinatura()).toMatchObject({ situacao: "teste", pix: { aguardando: null } });

    const segundo = await api.barbeiro.jaPagueiOPix(PEDIDO);
    const confirmado = await api.suporte.confirmarPix(segundo.id);
    expect(confirmado.situacao).toBe("confirmado");
    expect(await api.barbeiro.assinatura()).toMatchObject({ situacao: "ativa", forma: "pix", pix: { aguardando: null } });
    await expect(api.suporte.confirmarPix(segundo.id)).rejects.toBeInstanceOf(ErroDaApi);
  });
});
