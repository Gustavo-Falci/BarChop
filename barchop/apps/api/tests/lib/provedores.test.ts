import { randomBytes } from "node:crypto";
import Stripe from "stripe";
import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { cifrar } from "../../src/lib/cifra";
import {
  COBRA,
  ErroDoProvedor,
  modoDosPagamentosOnline,
  provedoresDeMemoria,
  provedoresDoAmbiente,
  recorrente,
  nomeDoProvedor,
  type ProvedorDeLink,
  type ProvedorRecorrente,
} from "../../src/lib/provedores";

// A fábrica dos conectores (Onda 2, marco 3, PR 8 do plano
// planos-de-assinatura): cada vendedor tem a própria chave, então a
// instância guarda a fábrica, e não um conector.

describe("modoDosPagamentosOnline", () => {
  it("sem a variável: real em produção, teste fora", () => {
    expect(modoDosPagamentosOnline({ NODE_ENV: "production" })).toBe("real");
    expect(modoDosPagamentosOnline({ NODE_ENV: "development" })).toBe("teste");
    expect(modoDosPagamentosOnline({})).toBe("teste");
  });

  it("a variável escolhe, mesmo em produção (o teste ponta a ponta na VM)", () => {
    expect(modoDosPagamentosOnline({ NODE_ENV: "production", PAGAMENTOS_ONLINE_MODO: "teste" })).toBe("teste");
    expect(modoDosPagamentosOnline({ PAGAMENTOS_ONLINE_MODO: "real" })).toBe("real");
    expect(() => modoDosPagamentosOnline({ PAGAMENTOS_ONLINE_MODO: "sandbox" })).toThrow(/PAGAMENTOS_ONLINE_MODO/);
  });
});

describe("provedoresDoAmbiente", () => {
  const corpoVazio = () =>
    new Response(JSON.stringify({ object: "list", data: [] }), { headers: { "content-type": "application/json" } });

  it("da chave colada: o modo vem do prefixo; chave de outro formato é inválida", async () => {
    const fetchFalso = vi.fn<typeof fetch>().mockResolvedValue(corpoVazio());
    const fabrica = provedoresDoAmbiente({ NODE_ENV: "development" }, { fetch: fetchFalso });

    expect(fabrica.modoDaChave("asaas", "$aact_prod_x")).toBe("real");
    expect(fabrica.modoDaChave("asaas", "qualquer")).toBeNull();
    const provedor = fabrica.daChave({ provedor: "asaas", chave: "$aact_hmlg_x" });
    expect(provedor.modo).toBe("teste");
    await provedor.conferirChave();
    expect(String(fetchFalso.mock.calls[0][0])).toMatch(/^https:\/\/api-sandbox\.asaas\.com\//);

    expect(() => fabrica.daChave({ provedor: "asaas", chave: "sk_live_x" })).toThrow(ErroDoProvedor);
  });

  it("da conexão gravada: decifra a chave com a CHAVE_DE_CIFRA na hora", async () => {
    const chaveDeCifra = randomBytes(32);
    const fetchFalso = vi.fn<typeof fetch>().mockResolvedValue(corpoVazio());
    const fabrica = provedoresDoAmbiente(
      { NODE_ENV: "development", CHAVE_DE_CIFRA: chaveDeCifra.toString("base64") },
      { fetch: fetchFalso }
    );

    const provedor = fabrica.daConexao({
      provedor: "asaas",
      modo: "real",
      chaveCifrada: cifrar("$aact_prod_gravada", chaveDeCifra),
      segredoDoWebhookCifrado: null,
    });
    await provedor.conferirChave();

    expect(provedor.modo).toBe("real");
    expect(new Headers(fetchFalso.mock.calls[0][1]?.headers).get("access_token")).toBe("$aact_prod_gravada");
  });

  it("em produção, não sobe sem a CHAVE_DE_CIFRA, nem com ela torta (decisão 10)", () => {
    expect(() => provedoresDoAmbiente({ NODE_ENV: "production" })).toThrow(/CHAVE_DE_CIFRA/);
    expect(() =>
      provedoresDoAmbiente({ NODE_ENV: "production", CHAVE_DE_CIFRA: randomBytes(16).toString("base64") })
    ).toThrow(/32 bytes/);
    expect(() =>
      provedoresDoAmbiente({ NODE_ENV: "production", CHAVE_DE_CIFRA: randomBytes(32).toString("base64") })
    ).not.toThrow();
  });

  it("fora de produção, sem a CHAVE_DE_CIFRA, só cifrar e decifrar falham, e na hora de usar", () => {
    const fabrica = provedoresDoAmbiente({ NODE_ENV: "development" });

    expect(() =>
      fabrica.daConexao({ provedor: "asaas", modo: "real", chaveCifrada: Buffer.alloc(40), segredoDoWebhookCifrado: null })
    ).toThrow(/CHAVE_DE_CIFRA/);
    expect(() => fabrica.cifrar("$aact_prod_x")).toThrow(/CHAVE_DE_CIFRA/);
    expect(fabrica.daChave({ provedor: "asaas", chave: "$aact_prod_x" }).modo).toBe("real");
  });

  it("o modo aceito sai do ambiente ao montar; o torto não deixa subir", () => {
    const chave = randomBytes(32).toString("base64");
    expect(provedoresDoAmbiente({ NODE_ENV: "production", CHAVE_DE_CIFRA: chave }).modoAceito).toBe("real");
    expect(
      provedoresDoAmbiente({ NODE_ENV: "production", CHAVE_DE_CIFRA: chave, PAGAMENTOS_ONLINE_MODO: "teste" }).modoAceito
    ).toBe("teste");
    expect(provedoresDoAmbiente({ NODE_ENV: "development" }).modoAceito).toBe("teste");
    expect(() => provedoresDoAmbiente({ NODE_ENV: "development", PAGAMENTOS_ONLINE_MODO: "sandbox" })).toThrow(
      /PAGAMENTOS_ONLINE_MODO/
    );
  });

  it("o que cifra, a conexão gravada decifra", async () => {
    const fetchFalso = vi.fn<typeof fetch>().mockResolvedValue(corpoVazio());
    const fabrica = provedoresDoAmbiente(
      { NODE_ENV: "development", CHAVE_DE_CIFRA: randomBytes(32).toString("base64") },
      { fetch: fetchFalso }
    );

    const chaveCifrada = fabrica.cifrar("$aact_hmlg_colada");
    expect(Buffer.from(chaveCifrada).includes(Buffer.from("$aact_hmlg_colada"))).toBe(false);
    await fabrica.daConexao({ provedor: "asaas", modo: "teste", chaveCifrada, segredoDoWebhookCifrado: null }).conferirChave();
    expect(new Headers(fetchFalso.mock.calls[0][1]?.headers).get("access_token")).toBe("$aact_hmlg_colada");
  });

  it("o endereço do webhook sai da URL_DA_API; sem ela, não há endereço", () => {
    expect(
      provedoresDoAmbiente({ NODE_ENV: "development", URL_DA_API: "https://api.barchop.com.br/" }).urlDoWebhook("asaas", "c1")
    ).toBe("https://api.barchop.com.br/webhooks/asaas/c1");
    expect(provedoresDoAmbiente({ NODE_ENV: "development" }).urlDoWebhook("asaas", "c1")).toBeNull();
  });

  it("a Stripe: o modo sai do prefixo e a chave colada conecta", () => {
    const fabrica = provedoresDoAmbiente({ NODE_ENV: "development", CHAVE_DE_CIFRA: randomBytes(32).toString("base64") });

    expect(fabrica.modoDaChave("stripe", "rk_live_x")).toBe("real");
    expect(fabrica.modoDaChave("stripe", "$aact_prod_x")).toBeNull();
    expect(fabrica.modoDaChave("asaas", "sk_live_x")).toBeNull();
    expect(fabrica.daChave({ provedor: "stripe", chave: "sk_test_x" })).toMatchObject({ nome: "stripe", modo: "teste" });
    expect(() => fabrica.daChave({ provedor: "stripe", chave: "$aact_hmlg_x" })).toThrow(/chave de API da Stripe/);
  });

  it("a conexão gravada da Stripe decifra o segredo do webhook e confere os eventos com ele; sem segredo, recusa", () => {
    const fabrica = provedoresDoAmbiente({ NODE_ENV: "development", CHAVE_DE_CIFRA: randomBytes(32).toString("base64") });
    const segredo = "whsec_gravado_na_conexao";
    const corpo = JSON.stringify({ id: "evt_1", object: "event", type: "invoice.paid", data: { object: { id: "in_1", object: "invoice" } } });
    const assinatura = Stripe.webhooks.generateTestHeaderString({ payload: corpo, secret: segredo });
    const gravada = { provedor: "stripe", modo: "teste", chaveCifrada: fabrica.cifrar("sk_test_x") };

    const comSegredo = recorrente(fabrica.daConexao({ ...gravada, segredoDoWebhookCifrado: fabrica.cifrar(segredo) }));
    const semSegredo = recorrente(fabrica.daConexao({ ...gravada, segredoDoWebhookCifrado: null }));

    expect(comSegredo).toMatchObject({ nome: "stripe", modo: "teste" });
    expect(comSegredo.lerEvento(Buffer.from(corpo), assinatura)).toMatchObject({ id: "evt_1", cobrancaId: "in_1" });
    expect(() => semSegredo.lerEvento(Buffer.from(corpo), assinatura)).toThrow(ErroDoProvedor);
    expect(() =>
      fabrica.daConexao({ ...gravada, provedor: "paypal", segredoDoWebhookCifrado: null })
    ).toThrow(/desconhecido/);
  });

  it("nos testes, o padrão é o de memória", () => {
    expect(provedoresDoAmbiente({ NODE_ENV: "test" }).nome).toBe("memoria");
  });
});

describe("provedoresDeMemoria", () => {
  it("guarda o que foi pedido e responde como o Asaas responderia", async () => {
    const fabrica = provedoresDeMemoria();
    const provedor = fabrica.daChave({ provedor: "asaas", chave: "$aact_hmlg_memoria" });

    await provedor.conferirChave();
    const { id: webhook } = await provedor.registrarWebhook({ url: "https://x/webhooks/asaas/c1", token: "t", email: null });
    const cliente = await provedor.criarCliente({
      nome: "Ana",
      cpfCnpj: "52998224725",
      email: null,
      telefone: null,
      referencia: "c1",
    });
    const assinatura = await provedor.criarAssinatura({
      clienteId: cliente,
      valorCentavos: 12000,
      ciclo: "mensal",
      primeiroVencimento: "2026-10-24",
      descricao: "Corte ilimitado",
      referencia: "as1",
      planoId: "p1",
    });

    expect(fabrica.webhooks).toEqual([{ id: webhook, url: "https://x/webhooks/asaas/c1", token: "t", email: null }]);
    expect(fabrica.clientes[0]).toMatchObject({ id: cliente, cpfCnpj: "52998224725" });
    expect(assinatura.linkDaFatura).toMatch(/^https:\/\//);
    expect(await provedor.lerAssinatura(assinatura.id)).toMatchObject({ situacao: "ativa", removida: false });

    await provedor.cancelarAssinatura(assinatura.id);
    await provedor.apagarWebhook(webhook);
    expect(await provedor.lerAssinatura(assinatura.id)).toMatchObject({ removida: true });
    expect(fabrica.cancelamentos).toEqual([assinatura.id]);
    expect(fabrica.webhooks).toEqual([]);
  });

  it("o webhook só é visto pela chave da mesma conta", async () => {
    const fabrica = provedoresDeMemoria();
    const velha = fabrica.daChave({ provedor: "asaas", chave: "$aact_prod_velha" });
    const { id } = await velha.registrarWebhook({ url: "https://x/webhooks/asaas/c1", token: "t", email: null });

    expect(await velha.temWebhook(id)).toBe(true);
    expect(await fabrica.daChave({ provedor: "asaas", chave: "$aact_prod_outra" }).temWebhook(id)).toBe(false);
    fabrica.contas.set("$aact_prod_nova", "$aact_prod_velha");
    expect(await fabrica.daChave({ provedor: "asaas", chave: "$aact_prod_nova" }).temWebhook(id)).toBe(true);
  });

  it("o modo aceito, o endereço do webhook e a cifra são de mentira e à vista", () => {
    const fabrica = provedoresDeMemoria({ modoAceito: "real" });

    expect(fabrica.modoAceito).toBe("real");
    expect(provedoresDeMemoria().modoAceito).toBe("teste");
    expect(fabrica.urlDoWebhook("asaas", "c1")).toBe("https://api.barchop.test/webhooks/asaas/c1");
    expect(Buffer.from(fabrica.cifrar("$aact_prod_x")).toString("utf8")).toBe("$aact_prod_x");
  });

  it("fora do ar, tudo falha como indisponível", async () => {
    const fabrica = provedoresDeMemoria();
    fabrica.indisponivel = true;

    await expect(fabrica.daChave({ provedor: "asaas", chave: "$aact_prod_ok" }).apagarWebhook("wh")).rejects.toMatchObject({
      codigo: "indisponivel",
    });
  });

  it("a chave marcada como inválida falha no conferir; cobrança desconhecida é não encontrada", async () => {
    const fabrica = provedoresDeMemoria();
    fabrica.chavesInvalidas.add("$aact_prod_revogada");

    await expect(fabrica.daChave({ provedor: "asaas", chave: "$aact_prod_revogada" }).conferirChave()).rejects.toMatchObject({
      codigo: "chave_invalida",
    });
    await expect(fabrica.daChave({ provedor: "asaas", chave: "$aact_prod_ok" }).lerCobranca("pay_x")).rejects.toMatchObject({
      codigo: "nao_encontrado",
    });
  });
});

// Como cada provedor cobra (plano pagamentos-online-infinitepay, PRs 1 e
// 3): o Asaas e a Stripe renovam sozinhos; a InfinitePay só gera link, e
// o BarChop toca o ciclo. O tipo do conector segue o provedor.
describe("tipo de cobrança", () => {
  it("o Asaas e a Stripe são recorrentes; a InfinitePay cobra por link, no conector de verdade e no de memória", () => {
    expect(COBRA).toEqual({ asaas: "recorrente", stripe: "recorrente", infinitepay: "link" });
    const ambiente = provedoresDoAmbiente({ NODE_ENV: "development", CHAVE_DE_CIFRA: randomBytes(32).toString("base64") });
    const memoria = provedoresDeMemoria();
    for (const fabrica of [ambiente, memoria]) {
      expect(fabrica.daChave({ provedor: "asaas", chave: "$aact_hmlg_x" }).cobra).toBe("recorrente");
      expect(fabrica.daChave({ provedor: "stripe", chave: "sk_test_x" }).cobra).toBe("recorrente");
      expect(fabrica.daChave({ provedor: "infinitepay", chave: "inchk_x", tag: "barbearia-exemplo" })).toMatchObject({
        nome: "infinitepay",
        modo: "real",
        cobra: "link",
        pedeCpf: false,
      });
    }
  });

  it("o tipo do conector segue o provedor; a conexão gravada pode ser dos dois", () => {
    const fabrica = provedoresDeMemoria();
    expectTypeOf(fabrica.daConexao).returns.toEqualTypeOf<ProvedorRecorrente | ProvedorDeLink>();
    expectTypeOf(fabrica.daChave<"stripe">).returns.toEqualTypeOf<ProvedorRecorrente>();
    expectTypeOf(fabrica.daChave<"infinitepay">).returns.toEqualTypeOf<ProvedorDeLink>();
  });
});

describe("a InfinitePay na fábrica", () => {
  const cifra = randomBytes(32);
  const ambiente = (fetchFalso?: typeof fetch) =>
    provedoresDoAmbiente(
      { NODE_ENV: "development", CHAVE_DE_CIFRA: cifra.toString("base64"), URL_DA_API: "https://api.barchop.com.br" },
      { fetch: fetchFalso }
    );

  it("só a `inchk_` é chave dela, e é de produção; os nomes nas mensagens", () => {
    expect(ambiente().modoDaChave("infinitepay", "inchk_x")).toBe("real");
    expect(ambiente().modoDaChave("infinitepay", "$aact_prod_x")).toBeNull();
    expect(ambiente().modoDaChave("stripe", "inchk_x")).toBeNull();
    expect(() => ambiente().daChave({ provedor: "infinitepay", chave: "sk_live_x", tag: "t" })).toThrow(
      /chave de API da InfinitePay/
    );
    expect(nomeDoProvedor("infinitepay")).toEqual({
      o: "a InfinitePay",
      do: "da InfinitePay",
      inicioDaChave: "inchk_",
      teste: "de teste",
      real: "de produção",
    });
    expect(ambiente().urlDoWebhook("infinitepay", "c1")).toBe("https://api.barchop.com.br/webhooks/infinitepay/c1");
  });

  it("sem a InfiniteTag não há conector: o payment_check pede a tag", () => {
    expect(() => ambiente().daChave({ provedor: "infinitepay", chave: "inchk_x" })).toThrow(/InfiniteTag/);
    expect(() =>
      ambiente().daConexao({ provedor: "infinitepay", modo: "real", chaveCifrada: cifrar("inchk_x", cifra), segredoDoWebhookCifrado: null })
    ).toThrow(/InfiniteTag/);
  });

  it("a conexão gravada decifra a chave e manda a tag gravada", async () => {
    const fetchFalso = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify({ success: false, paid: false }), { headers: { "content-type": "application/json" } }));
    const provedor = ambiente(fetchFalso).daConexao({
      provedor: "infinitepay",
      modo: "real",
      chaveCifrada: cifrar("inchk_gravada", cifra),
      segredoDoWebhookCifrado: null,
      infiniteTag: "barbearia-exemplo",
    });

    await provedor.conferirChave();

    expect(provedor.cobra).toBe("link");
    expect(new Headers(fetchFalso.mock.calls[0][1]?.headers).get("x-api-key")).toBe("inchk_gravada");
    expect(JSON.parse(String(fetchFalso.mock.calls[0][1]?.body))).toMatchObject({ handle: "barbearia-exemplo" });
  });
});
