import { describe, expect, it, vi } from "vitest";
import { ErroDaApi, criarApiClient, criarApiClientFalso } from "../src/index";

// Profissional novo no meio do período pago (plano
// profissional-novo-pago, PR 4): a prévia antes de incluir, o Desistir
// de quem aguarda e o Pix da diferença, no client de verdade e no dublê.

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
  return vi.fn(async () => (status === 204 ? new Response(null, { status }) : new Response(JSON.stringify(corpo), { status })));
}

const NOVO = { nome: "Rafael", email: "rafael@exemplo.com", papel: "profissional" as const };
const FIM = "2026-12-05T03:00:00.000Z";

describe("api do profissional novo", () => {
  it("lê a prévia da inclusão", async () => {
    const previa = { cobra: true, forma: "cartao", valorCentavos: 850, cartaoFinal: "4242", ate: FIM };
    const fetchFalso = responde(previa);

    expect(await cliente(fetchFalso).barbeiro.previaDaInclusao()).toEqual(previa);
    expect(chamada(fetchFalso).url).toBe("https://api.exemplo.br/equipe/previa-da-inclusao");
  });

  it("Desistir de quem aguarda pagamento", async () => {
    const fetchFalso = responde(null, 204);

    await cliente(fetchFalso).barbeiro.desistirDoMembro("m9");

    const { url, init } = chamada(fetchFalso);
    expect(url).toBe("https://api.exemplo.br/equipe/m9/aguardando");
    expect(init.method).toBe("DELETE");
  });

  it("cota e paga o Pix da diferença", async () => {
    const cotacao = responde({});
    await cliente(cotacao).barbeiro.cotacaoDaDiferenca();
    expect(chamada(cotacao).url).toBe("https://api.exemplo.br/barbearias/me/assinatura/pix/diferenca");

    const pago = responde({ id: "p1" }, 201);
    await cliente(pago).barbeiro.jaPagueiADiferenca();
    const { url, init } = chamada(pago);
    expect(url).toBe("https://api.exemplo.br/barbearias/me/assinatura/pix/diferenca");
    expect(init.method).toBe("POST");
  });
});

describe("o dublê do profissional novo", () => {
  it("sem vaga cobrada na semente, incluir não cobra", async () => {
    const falso = criarApiClientFalso();

    expect(await falso.barbeiro.previaDaInclusao()).toEqual({
      cobra: false,
      forma: null,
      valorCentavos: 0,
      cartaoFinal: null,
      ate: null,
    });
    expect(await falso.barbeiro.convidarMembro(NOVO)).toMatchObject({ ativo: true, aguardaPagamento: false });
  });

  it("no cartão: a prévia diz o valor e o cartão, e o convite entra na hora", async () => {
    const falso = criarApiClientFalso({ vagaCobrada: { forma: "cartao", valorCentavos: 850, cartaoFinal: "4242", ate: FIM } });

    expect(await falso.barbeiro.previaDaInclusao()).toEqual({
      cobra: true,
      forma: "cartao",
      valorCentavos: 850,
      cartaoFinal: "4242",
      ate: FIM,
    });
    expect(await falso.barbeiro.convidarMembro(NOVO)).toMatchObject({ ativo: true, aguardaPagamento: false });
  });

  it("cartão recusado: 402 e a equipe fica como estava, no convite e no reativar", async () => {
    const falso = criarApiClientFalso({
      vagaCobrada: { forma: "cartao", valorCentavos: 850, cartaoFinal: "4242", ate: FIM, recusa: true },
    });
    const antes = (await falso.barbeiro.equipe()).length;

    const erro = await falso.barbeiro.convidarMembro(NOVO).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ErroDaApi);
    expect(erro).toMatchObject({ status: 402, codigo: "cartao_recusado" });
    expect(await falso.barbeiro.equipe()).toHaveLength(antes);

    falso.estado.equipe!.push({ ...(await falso.barbeiro.equipe())[0]!, id: "m9", email: "x@x.com", papel: "profissional", ativo: false });
    await expect(falso.barbeiro.atualizarMembro("m9", { ativo: true })).rejects.toMatchObject({ codigo: "cartao_recusado" });
    expect((await falso.barbeiro.equipe()).find((m) => m.id === "m9")).toMatchObject({ ativo: false });
  });

  it("a recepção não ocupa vaga: entra sem cobrar", async () => {
    const falso = criarApiClientFalso({
      vagaCobrada: { forma: "cartao", valorCentavos: 850, cartaoFinal: "4242", ate: FIM, recusa: true },
    });

    expect(await falso.barbeiro.convidarMembro({ ...NOVO, papel: "recepcao" })).toMatchObject({ ativo: true });
  });

  it("no Pix: quem entra aguarda; o Pix da diferença cobra todos e libera no Já paguei", async () => {
    const falso = criarApiClientFalso({
      pixLigado: true,
      vagaCobrada: { forma: "pix", valorCentavos: 850, cartaoFinal: null, ate: FIM },
    });

    const rafael = await falso.barbeiro.convidarMembro(NOVO);
    const bruno = await falso.barbeiro.convidarMembro({ ...NOVO, nome: "Bruno", email: "bruno@exemplo.com" });
    expect(rafael).toMatchObject({ ativo: false, aguardaPagamento: true });

    const cotacao = await falso.barbeiro.cotacaoDaDiferenca();
    expect(cotacao).toMatchObject({ valorCentavos: 1700, periodoTerminaEm: FIM });

    const pagamento = await falso.barbeiro.jaPagueiADiferenca();
    expect(pagamento).toMatchObject({ tipo: "diferenca", situacao: "aguardando", valorCentavos: 1700 });
    const equipe = await falso.barbeiro.equipe();
    for (const id of [rafael.id, bruno.id]) {
      expect(equipe.find((m) => m.id === id)).toMatchObject({ ativo: true, aguardaPagamento: false });
    }
    expect((await falso.barbeiro.pagamentosDoPix())[0]).toMatchObject({ tipo: "diferenca", liberados: 2 });
    expect(pagamento.liberados).toBe(2);
    // Na fila do Suporte (PR 4b): quantos libera e as vagas pagas de antes.
    expect((await falso.suporte.pixNaFila())[0]).toMatchObject({
      tipo: "diferenca",
      liberados: 2,
      antes: { profissionais: pagamento.profissionais - 2 },
    });
  });

  it("sem ninguém aguardando, a cotação da diferença é 409 nada_a_pagar", async () => {
    const falso = criarApiClientFalso({ pixLigado: true, vagaCobrada: { forma: "pix", valorCentavos: 850, cartaoFinal: null, ate: FIM } });

    await expect(falso.barbeiro.cotacaoDaDiferenca()).rejects.toMatchObject({ status: 409, codigo: "nada_a_pagar" });
  });

  it("Desistir: o convidado que nunca entrou some; quem já tinha conta volta a inativo", async () => {
    const falso = criarApiClientFalso({ pixLigado: true, vagaCobrada: { forma: "pix", valorCentavos: 850, cartaoFinal: null, ate: FIM } });
    const rafael = await falso.barbeiro.convidarMembro(NOVO);
    falso.estado.equipe!.push({ ...rafael, id: "m9", email: "marcos@exemplo.com", convitePendente: false, aguardaPagamento: false });
    await falso.barbeiro.atualizarMembro("m9", { ativo: true });
    expect((await falso.barbeiro.equipe()).find((m) => m.id === "m9")).toMatchObject({ aguardaPagamento: true });

    await falso.barbeiro.desistirDoMembro(rafael.id);
    await falso.barbeiro.desistirDoMembro("m9");

    const equipe = await falso.barbeiro.equipe();
    expect(equipe.find((m) => m.id === rafael.id)).toBeUndefined();
    expect(equipe.find((m) => m.id === "m9")).toMatchObject({ ativo: false, aguardaPagamento: false });
  });
});
