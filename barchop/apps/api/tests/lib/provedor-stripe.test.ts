import { readFileSync } from "node:fs";
import { join } from "node:path";
import Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";
import { agoraNaBarbearia, instanteNaBarbearia, somarDias } from "../../src/lib/horas";
import { ErroDoProvedor } from "../../src/lib/provedores";
import { PRAZO_DA_STRIPE_MS, modoDaChaveDaStripe, provedorStripe } from "../../src/lib/provedores/stripe";

// O conector da Stripe (plano pagamentos-online-stripe, PR 2), com um
// `fetch` falso que devolve as respostas gravadas no modo teste da Stripe
// em 31/10/2026, na versão 2026-09-30.endive da API (respostas-da-stripe/;
// ids, conta e links trocados por exemplos). Os eventos também são os
// gravados; a assinatura deles é feita aqui, com o segredo do teste.
// Nada sai do processo.

function resposta(nome: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(__dirname, "respostas-da-stripe", nome), "utf-8"));
}

function json(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });
}

const erro = (status: number, code?: string) =>
  json({ error: { type: "invalid_request_error", message: "mensagem da Stripe", ...(code ? { code } : {}) } }, status);

const CHAVE = "sk_test_chave-de-mentira-do-teste";
const SEGREDO = "whsec_segredo_do_teste";
const PLANO = "2246558f-34f4-4a5d-9e2a-529df7c00214";

function montar(...respostas: (Response | Error)[]) {
  const fetchFalso = vi.fn<typeof fetch>();
  for (const r of respostas) {
    if (r instanceof Error) fetchFalso.mockRejectedValueOnce(r);
    else fetchFalso.mockResolvedValueOnce(r);
  }
  const provedor = provedorStripe({ chave: CHAVE, modo: "teste", segredoDoWebhook: SEGREDO, fetch: fetchFalso });
  const pedido = (i = 0) => {
    const [url, init] = fetchFalso.mock.calls[i];
    const corpo = init?.body ? new URLSearchParams(String(init.body)) : new URLSearchParams();
    return {
      url: String(url),
      metodo: init?.method ?? "GET",
      cabecalhos: new Headers(init?.headers),
      corpo,
    };
  };
  return { provedor, fetchFalso, pedido };
}

const NOVA = {
  clienteId: "cus_exemplo2",
  valorCentavos: 12000,
  ciclo: "mensal" as const,
  primeiroVencimento: agoraNaBarbearia().data,
  descricao: "Corte ilimitado",
  referencia: "ef8365b7-e8e4-4a4a-8e15-82e2bc33a0c0",
  planoId: PLANO,
};

describe("o modo da chave", () => {
  it("a secreta e a restrita, de teste e de produção; o resto não é chave da Stripe", () => {
    expect(modoDaChaveDaStripe("sk_test_abc")).toBe("teste");
    expect(modoDaChaveDaStripe("rk_test_abc")).toBe("teste");
    expect(modoDaChaveDaStripe("sk_live_abc")).toBe("real");
    expect(modoDaChaveDaStripe("rk_live_abc")).toBe("real");
    expect(modoDaChaveDaStripe("pk_live_abc")).toBeNull();
    expect(modoDaChaveDaStripe("$aact_prod_abc")).toBeNull();
    expect(modoDaChaveDaStripe("whsec_abc")).toBeNull();
  });

  it("não pede CPF", () => {
    expect(montar().provedor).toMatchObject({ nome: "stripe", modo: "teste", pedeCpf: false });
  });

  it("o prazo de cada pedido fica abaixo dos 15 s do desconectar", () => {
    expect(PRAZO_DA_STRIPE_MS).toBeLessThan(15_000);
  });
});

describe("a chave", () => {
  // A chave restrita sem uma das leituras passaria no conectar e só
  // falharia no webhook, que a Stripe repete até desligar: aqui ela é
  // recusada antes.
  it("confere lendo tudo o que o webhook relê (a restrita precisa dessas permissões), com a chave no Authorization", async () => {
    const vazia = () => json(resposta("faturas-vazio.json"));
    const { provedor, pedido, fetchFalso } = montar(
      json(resposta("clientes.json")),
      json(resposta("webhooks-vazio.json")),
      vazia(),
      vazia(),
      vazia(),
      vazia()
    );

    await provedor.conferirChave();

    expect(pedido(0).cabecalhos.get("authorization")).toBe(`Bearer ${CHAVE}`);
    expect(fetchFalso.mock.calls.map(([url, init]) => `${init?.method ?? "GET"} ${String(url)}`)).toEqual([
      "GET https://api.stripe.com/v1/customers?limit=1",
      "GET https://api.stripe.com/v1/webhook_endpoints?limit=1",
      "GET https://api.stripe.com/v1/subscriptions?limit=1",
      "GET https://api.stripe.com/v1/invoices?limit=1",
      "GET https://api.stripe.com/v1/invoice_payments?limit=1",
      "GET https://api.stripe.com/v1/payment_intents?limit=1",
    ]);
  });

  it("a restrita sem a leitura dos pagamentos é recusada no conectar", async () => {
    const vazia = () => json(resposta("faturas-vazio.json"));
    const { provedor } = montar(json(resposta("clientes.json")), json(resposta("webhooks-vazio.json")), vazia(), vazia(), vazia(), erro(403));

    await expect(provedor.conferirChave()).rejects.toMatchObject({ codigo: "chave_invalida", status: 403 });
  });
});

describe("os erros da Stripe", () => {
  it("401 é chave inválida, e o erro não carrega a chave", async () => {
    const { provedor } = montar(json(resposta("erro-401.json"), 401));

    const falha = await provedor.conferirChave().catch((e: unknown) => e);

    expect(falha).toBeInstanceOf(ErroDoProvedor);
    expect(falha).toMatchObject({ codigo: "chave_invalida", status: 401 });
    expect(JSON.stringify(falha)).not.toContain(CHAVE);
    expect(String((falha as Error).message)).not.toContain(CHAVE);
  });

  it("403 é a chave restrita sem permissão: chave inválida, dizendo isso", async () => {
    const { provedor } = montar(erro(403));

    await expect(provedor.conferirChave()).rejects.toMatchObject({
      codigo: "chave_invalida",
      status: 403,
      message: expect.stringMatching(/permiss/),
    });
  });

  it("400 e 402 são recusado; 404 é não encontrado; 429 é limite; 5xx e rede são indisponível", async () => {
    const { provedor } = montar(
      erro(400, "parameter_invalid_integer"),
      erro(402, "card_declined"),
      json(resposta("erro-404.json"), 404),
      erro(429, "rate_limit"),
      json({ error: { type: "api_error", message: "x" } }, 500),
      new TypeError("fetch failed")
    );

    await expect(provedor.lerAssinatura("sub_x")).rejects.toMatchObject({ codigo: "recusado", status: 400 });
    await expect(provedor.lerAssinatura("sub_x")).rejects.toMatchObject({ codigo: "recusado", status: 402 });
    await expect(provedor.lerAssinatura("sub_x")).rejects.toMatchObject({ codigo: "nao_encontrado", status: 404 });
    await expect(provedor.lerAssinatura("sub_x")).rejects.toMatchObject({ codigo: "limite", status: 429 });
    await expect(provedor.lerAssinatura("sub_x")).rejects.toMatchObject({ codigo: "indisponivel" });
    await expect(provedor.lerAssinatura("sub_x")).rejects.toMatchObject({ codigo: "indisponivel" });
  });

  it("não tenta de novo sozinho: um pedido por chamada", async () => {
    const { provedor, fetchFalso } = montar(json({ error: { type: "api_error", message: "x" } }, 500));

    await expect(provedor.lerAssinatura("sub_x")).rejects.toMatchObject({ codigo: "indisponivel" });

    expect(fetchFalso).toHaveBeenCalledTimes(1);
  });
});

describe("o webhook da conta", () => {
  it("registra os eventos que o BarChop lê, na versão da biblioteca, e devolve o segredo", async () => {
    const { provedor, pedido } = montar(json(resposta("webhook.json")));

    const criado = await provedor.registrarWebhook({
      url: "https://api.barchop.com.br/webhooks/stripe/conexao",
      token: "t".repeat(43),
      email: "dono@exemplo.com",
    });

    expect(criado).toEqual({ id: "we_exemplo1", segredo: "whsec_exemplo" });
    expect(pedido()).toMatchObject({ url: "https://api.stripe.com/v1/webhook_endpoints", metodo: "POST" });
    const corpo = pedido().corpo;
    expect(corpo.get("url")).toBe("https://api.barchop.com.br/webhooks/stripe/conexao");
    expect(corpo.get("api_version")).toBe(Stripe.API_VERSION);
    expect([0, 1, 2, 3, 4, 5, 6].map((i) => corpo.get(`enabled_events[${i}]`))).toEqual([
      "invoice.paid",
      "invoice.payment_failed",
      "invoice.marked_uncollectible",
      "customer.subscription.updated",
      "customer.subscription.deleted",
      "charge.refunded",
      null,
    ]);
    expect(corpo.toString()).not.toContain("t".repeat(43));
  });

  it("sem o segredo na resposta, apaga o webhook e falha: a conexão recusaria todo evento", async () => {
    const { provedor, pedido } = montar(json({ ...resposta("webhook.json"), secret: null }), json(resposta("webhook-apagado.json")));

    await expect(
      provedor.registrarWebhook({ url: "https://api.barchop.com.br/webhooks/stripe/conexao", token: "t", email: null })
    ).rejects.toMatchObject({ codigo: "indisponivel" });
    expect(pedido(1)).toMatchObject({ url: "https://api.stripe.com/v1/webhook_endpoints/we_exemplo1", metodo: "DELETE" });
  });

  it("é visto pela chave da mesma conta (200), e não pela de outra ou depois de apagado (404)", async () => {
    const { provedor, pedido } = montar(json(resposta("webhook-lido.json")), json(resposta("erro-404.json"), 404));

    expect(await provedor.temWebhook("we_exemplo1")).toBe(true);
    expect(await provedor.temWebhook("we_exemplo1")).toBe(false);
    expect(pedido()).toMatchObject({ url: "https://api.stripe.com/v1/webhook_endpoints/we_exemplo1", metodo: "GET" });
  });

  it("apaga; já apagado não é erro", async () => {
    const { provedor, pedido } = montar(json(resposta("webhook-apagado.json")), json(resposta("erro-404.json"), 404));

    await provedor.apagarWebhook("we_exemplo1");
    await provedor.apagarWebhook("we_exemplo1");

    expect(pedido()).toMatchObject({ url: "https://api.stripe.com/v1/webhook_endpoints/we_exemplo1", metodo: "DELETE" });
  });
});

describe("o cliente e a assinatura", () => {
  it("cria o cliente sem CPF, com a referência do BarChop", async () => {
    const { provedor, pedido } = montar(json(resposta("cliente.json")));

    const id = await provedor.criarCliente({
      nome: "Caio Rocha",
      cpfCnpj: "12345678909",
      email: "caio@exemplo.com",
      telefone: "+5511999990000",
      referencia: "cliente-1",
    });

    expect(id).toBe("cus_exemplo2");
    expect(pedido()).toMatchObject({ url: "https://api.stripe.com/v1/customers", metodo: "POST" });
    expect(Object.fromEntries(pedido().corpo)).toEqual({
      name: "Caio Rocha",
      email: "caio@exemplo.com",
      phone: "+5511999990000",
      "metadata[barchop]": "cliente-1",
    });
  });

  it("assina com o produto do plano (criado se não existe) e devolve a fatura aberta", async () => {
    const { provedor, pedido } = montar(
      json(resposta("erro-404.json"), 404),
      json(resposta("produto.json")),
      json(resposta("assinatura-criada.json"))
    );

    const criada = await provedor.criarAssinatura(NOVA);

    expect(criada).toEqual({ id: "sub_exemplo1", linkDaFatura: "https://invoice.stripe.com/exemplo" });
    expect(pedido(0)).toMatchObject({ url: `https://api.stripe.com/v1/products/barchop_plano_${PLANO}`, metodo: "GET" });
    expect(pedido(1)).toMatchObject({ url: "https://api.stripe.com/v1/products", metodo: "POST" });
    expect(Object.fromEntries(pedido(1).corpo)).toEqual({
      id: `barchop_plano_${PLANO}`,
      name: "Corte ilimitado",
      "metadata[barchop]": PLANO,
    });
    expect(pedido(2)).toMatchObject({ url: "https://api.stripe.com/v1/subscriptions", metodo: "POST" });
    expect(Object.fromEntries(pedido(2).corpo)).toEqual({
      customer: "cus_exemplo2",
      "items[0][price_data][currency]": "brl",
      "items[0][price_data][product]": `barchop_plano_${PLANO}`,
      "items[0][price_data][unit_amount]": "12000",
      "items[0][price_data][recurring][interval]": "month",
      "items[0][price_data][recurring][interval_count]": "1",
      payment_behavior: "default_incomplete",
      "payment_settings[save_default_payment_method]": "on_subscription",
      "payment_settings[payment_method_types][0]": "card",
      description: "Corte ilimitado",
      "metadata[barchop]": NOVA.referencia,
      "expand[0]": "latest_invoice",
    });
  });

  it("o produto que existe com o mesmo nome não muda; com outro nome, é renomeado; arquivado, é reativado", async () => {
    const produto = resposta("produto.json");
    const { provedor, pedido } = montar(
      json(produto),
      json(resposta("assinatura-criada.json")),
      json({ ...produto, name: "Nome antigo" }),
      json(produto),
      json(resposta("assinatura-criada.json")),
      json({ ...produto, active: false }),
      json(produto),
      json(resposta("assinatura-criada.json"))
    );

    await provedor.criarAssinatura(NOVA);
    expect(pedido(1).url).toBe("https://api.stripe.com/v1/subscriptions");

    await provedor.criarAssinatura(NOVA);
    expect(pedido(3)).toMatchObject({ url: `https://api.stripe.com/v1/products/barchop_plano_${PLANO}`, metodo: "POST" });
    expect(Object.fromEntries(pedido(3).corpo)).toEqual({ name: "Corte ilimitado", active: "true" });

    await provedor.criarAssinatura(NOVA);
    expect(pedido(6)).toMatchObject({ url: `https://api.stripe.com/v1/products/barchop_plano_${PLANO}`, metodo: "POST" });
    expect(Object.fromEntries(pedido(6).corpo)).toEqual({ name: "Corte ilimitado", active: "true" });
  });

  it("dois assinar ao mesmo tempo: o produto que acabou de ser criado pelo outro é lido de novo", async () => {
    const { provedor, pedido } = montar(
      json(resposta("erro-404.json"), 404),
      json(resposta("erro-ja-existe.json"), 400),
      json(resposta("produto.json")),
      json(resposta("assinatura-criada.json"))
    );

    expect(await provedor.criarAssinatura(NOVA)).toMatchObject({ id: "sub_exemplo1" });
    expect(pedido(2)).toMatchObject({ url: `https://api.stripe.com/v1/products/barchop_plano_${PLANO}`, metodo: "GET" });
  });

  it("os ciclos: trimestral a cada 3 meses, anual a cada ano", async () => {
    const produto = json(resposta("produto.json"));
    const { provedor, pedido } = montar(
      produto,
      json(resposta("assinatura-criada.json")),
      json(resposta("produto.json")),
      json(resposta("assinatura-criada.json"))
    );

    await provedor.criarAssinatura({ ...NOVA, ciclo: "trimestral" });
    await provedor.criarAssinatura({ ...NOVA, ciclo: "anual" });

    expect(pedido(1).corpo.get("items[0][price_data][recurring][interval]")).toBe("month");
    expect(pedido(1).corpo.get("items[0][price_data][recurring][interval_count]")).toBe("3");
    expect(pedido(3).corpo.get("items[0][price_data][recurring][interval]")).toBe("year");
    expect(pedido(3).corpo.get("items[0][price_data][recurring][interval_count]")).toBe("1");
  });

  it("com dias grátis, o teste acaba no primeiro vencimento e não há fatura a pagar (a de R$ 0 já vem paga)", async () => {
    const vencimento = somarDias(agoraNaBarbearia().data, 7);
    const { provedor, pedido } = montar(json(resposta("produto.json")), json(resposta("assinatura-com-teste.json")));

    const criada = await provedor.criarAssinatura({ ...NOVA, primeiroVencimento: vencimento });

    expect(criada).toEqual({ id: "sub_exemplo2", linkDaFatura: null });
    expect(pedido(1).corpo.get("trial_end")).toBe(String(instanteNaBarbearia(vencimento, "00:00").getTime() / 1000));
  });

  it("a fatura a pagar é a aberta mais antiga; sem aberta, null", async () => {
    const aberta = resposta("faturas-abertas.json") as { data: Record<string, unknown>[] };
    const duas = { ...aberta, data: [{ ...aberta.data[0], id: "in_nova", hosted_invoice_url: "https://invoice.stripe.com/nova" }, aberta.data[0]] };
    const { provedor, pedido } = montar(json(duas), json(resposta("faturas-vazio.json")));

    expect(await provedor.linkDaFatura("sub_exemplo1")).toBe("https://invoice.stripe.com/exemplo");
    expect(await provedor.linkDaFatura("sub_exemplo1")).toBeNull();
    expect(pedido().url).toBe("https://api.stripe.com/v1/invoices?subscription=sub_exemplo1&status=open&limit=100");
  });

  it("lê a assinatura: incompleta, em teste e atrasada seguem ativas; cancelada e expirada pararam", async () => {
    const assinatura = resposta("assinatura.json");
    const { provedor } = montar(
      json(assinatura),
      json(resposta("assinatura-criada.json")),
      json(resposta("assinatura-com-teste.json")),
      json({ ...assinatura, status: "past_due" }),
      json(resposta("assinatura-cancelada.json")),
      json(resposta("assinatura-expirada.json"))
    );

    expect(await provedor.lerAssinatura("sub_exemplo1")).toEqual({
      id: "sub_exemplo1",
      situacao: "ativa",
      removida: false,
      valorCentavos: 12000,
      proximoVencimento: "2026-11-30",
    });
    expect(await provedor.lerAssinatura("sub_exemplo1")).toMatchObject({ situacao: "ativa" });
    expect(await provedor.lerAssinatura("sub_exemplo2")).toMatchObject({ situacao: "ativa" });
    expect(await provedor.lerAssinatura("sub_exemplo1")).toMatchObject({ situacao: "ativa" });
    expect(await provedor.lerAssinatura("sub_exemplo1")).toMatchObject({ situacao: "inativa" });
    expect(await provedor.lerAssinatura("sub_exemplo3")).toMatchObject({ situacao: "expirada" });
  });

  it("cancela; já cancelada (404) não é erro", async () => {
    const { provedor, pedido } = montar(json(resposta("assinatura-cancelada.json")), json(resposta("erro-404.json"), 404));

    await provedor.cancelarAssinatura("sub_exemplo1");
    await provedor.cancelarAssinatura("sub_exemplo1");

    expect(pedido()).toMatchObject({ url: "https://api.stripe.com/v1/subscriptions/sub_exemplo1", metodo: "DELETE" });
  });
});

describe("a cobrança (a fatura da Stripe)", () => {
  it("aberta: pendente, com o link e o início do período como vencimento", async () => {
    const { provedor, pedido } = montar(json(resposta("fatura-aberta.json")));

    expect(await provedor.lerCobranca("in_exemplo1")).toEqual({
      id: "in_exemplo1",
      assinaturaId: "sub_exemplo1",
      situacao: "pendente",
      removida: false,
      valorCentavos: 12000,
      vencimento: "2026-10-31",
      pagaEm: null,
      forma: null,
      linkDaFatura: "https://invoice.stripe.com/exemplo",
    });
    expect(pedido().url).toBe("https://api.stripe.com/v1/invoices/in_exemplo1?expand[0]=payments");
  });

  it("paga: relê o pagamento pra saber se foi estornado e como foi pago", async () => {
    const { provedor, pedido } = montar(json(resposta("fatura-paga.json")), json(resposta("pagamento.json")));

    expect(await provedor.lerCobranca("in_exemplo1")).toEqual({
      id: "in_exemplo1",
      assinaturaId: "sub_exemplo1",
      situacao: "paga",
      removida: false,
      valorCentavos: 12000,
      vencimento: "2026-10-31",
      pagaEm: "2026-10-31",
      forma: "cartao",
      linkDaFatura: "https://invoice.stripe.com/exemplo",
    });
    expect(pedido(1).url).toBe("https://api.stripe.com/v1/payment_intents/pi_exemplo1?expand[0]=latest_charge");
  });

  it("paga e estornada: estornada", async () => {
    const { provedor } = montar(json(resposta("fatura-paga.json")), json(resposta("pagamento-estornado.json")));

    expect(await provedor.lerCobranca("in_exemplo1")).toMatchObject({ situacao: "estornada", valorCentavos: 12000 });
  });

  it("o estorno chega pelo pagamento: acha a fatura dele", async () => {
    const { provedor, pedido } = montar(
      json(resposta("pagamentos-da-fatura.json")),
      json(resposta("fatura-paga.json")),
      json(resposta("pagamento-estornado.json"))
    );

    expect(await provedor.lerCobranca("pi_exemplo1")).toMatchObject({
      id: "in_exemplo1",
      assinaturaId: "sub_exemplo1",
      situacao: "estornada",
    });
    expect(pedido(0).url).toBe(
      "https://api.stripe.com/v1/invoice_payments?payment[type]=payment_intent&payment[payment_intent]=pi_exemplo1"
    );
  });

  it("o pagamento que não é de fatura (fora do BarChop): não encontrado", async () => {
    const { provedor } = montar(json(resposta("faturas-vazio.json")));

    await expect(provedor.lerCobranca("pi_outro")).rejects.toMatchObject({ codigo: "nao_encontrado" });
  });

  it("a de R$ 0 dos dias grátis não é pagamento: pendente", async () => {
    const { provedor, fetchFalso } = montar(json(resposta("fatura-de-teste.json")));

    expect(await provedor.lerCobranca("in_exemplo2")).toMatchObject({ situacao: "pendente", valorCentavos: 0, pagaEm: null });
    expect(fetchFalso).toHaveBeenCalledTimes(1);
  });

  it("aberta com tentativa que falhou, ou dada como perdida: vencida; anulada: removida", async () => {
    const aberta = resposta("fatura-aberta.json");
    const { provedor } = montar(
      json({ ...aberta, attempt_count: 1, attempted: true }),
      json({ ...aberta, status: "uncollectible" }),
      json({ ...aberta, status: "void" })
    );

    expect(await provedor.lerCobranca("in_exemplo1")).toMatchObject({ situacao: "vencida", pagaEm: null, forma: null });
    expect(await provedor.lerCobranca("in_exemplo1")).toMatchObject({ situacao: "vencida" });
    expect(await provedor.lerCobranca("in_exemplo1")).toMatchObject({ removida: true });
  });
});

describe("o evento do webhook", () => {
  const assinado = (evento: unknown, segredo = SEGREDO) => {
    const corpo = JSON.stringify(evento);
    return { corpo: Buffer.from(corpo), assinatura: Stripe.webhooks.generateTestHeaderString({ payload: corpo, secret: segredo }) };
  };

  it("da fatura traz a fatura e a assinatura; da assinatura, a assinatura; o estorno, o pagamento", () => {
    const { provedor } = montar();
    const paga = assinado(resposta("evento-fatura-paga.json"));
    const apagada = assinado(resposta("evento-assinatura-apagada.json"));
    const estorno = assinado(resposta("evento-estorno.json"));
    const expirada = assinado(resposta("evento-assinatura-atualizada.json"));

    expect(provedor.lerEvento(paga.corpo, paga.assinatura)).toEqual({
      id: "evt_exemplo1",
      tipo: "invoice.paid",
      cobrancaId: "in_exemplo1",
      assinaturaId: "sub_exemplo1",
    });
    expect(provedor.lerEvento(apagada.corpo, apagada.assinatura)).toEqual({
      id: "evt_exemplo2",
      tipo: "customer.subscription.deleted",
      cobrancaId: null,
      assinaturaId: "sub_exemplo2",
    });
    // A incompleta que não foi paga em 23 h expira: o webhook relê e para.
    expect(provedor.lerEvento(expirada.corpo, expirada.assinatura)).toEqual({
      id: "evt_exemplo4",
      tipo: "customer.subscription.updated",
      cobrancaId: null,
      assinaturaId: "sub_exemplo3",
    });
    expect(provedor.lerEvento(estorno.corpo, estorno.assinatura)).toEqual({
      id: "evt_exemplo3",
      tipo: "charge.refunded",
      cobrancaId: "pi_exemplo1",
      assinaturaId: null,
    });
  });

  it("outro tipo de evento passa sem cobrança nem assinatura", () => {
    const { provedor } = montar();
    const outro = assinado({ ...resposta("evento-estorno.json"), type: "charge.succeeded" });

    expect(provedor.lerEvento(outro.corpo, outro.assinatura)).toMatchObject({ cobrancaId: null, assinaturaId: null });
  });

  it("recusa assinatura que não confere, sem assinatura, ou sem o segredo da conexão", () => {
    const { provedor } = montar();
    const deOutro = assinado(resposta("evento-fatura-paga.json"), "whsec_de_outro");
    const certo = assinado(resposta("evento-fatura-paga.json"));
    const semSegredo = provedorStripe({ chave: CHAVE, modo: "teste", segredoDoWebhook: null });

    expect(() => provedor.lerEvento(deOutro.corpo, deOutro.assinatura)).toThrow(ErroDoProvedor);
    expect(() => provedor.lerEvento(certo.corpo)).toThrow(ErroDoProvedor);
    expect(() => provedor.lerEvento(JSON.parse(certo.corpo.toString()), certo.assinatura)).toThrow(ErroDoProvedor);
    expect(() => semSegredo.lerEvento(certo.corpo, certo.assinatura)).toThrow(ErroDoProvedor);
  });
});
