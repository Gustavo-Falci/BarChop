import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { ErroDoProvedor } from "../../src/lib/provedores";
import { BASE_DO_ASAAS, modoDaChaveDoAsaas, provedorAsaas } from "../../src/lib/provedores/asaas";

// O conector do Asaas (Onda 2, marco 3, PR 8 do plano
// planos-de-assinatura), com um `fetch` falso que devolve as respostas
// gravadas em respostas-do-asaas/. Nada sai do processo.

function resposta(nome: string): unknown {
  return JSON.parse(readFileSync(join(__dirname, "respostas-do-asaas", nome), "utf-8"));
}

function json(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });
}

const CHAVE = "$aact_hmlg_chave-de-mentira-do-teste";

function montar(...respostas: (Response | Error)[]) {
  const fetchFalso = vi.fn<typeof fetch>();
  for (const r of respostas) {
    if (r instanceof Error) fetchFalso.mockRejectedValueOnce(r);
    else fetchFalso.mockResolvedValueOnce(r);
  }
  const provedor = provedorAsaas({ chave: CHAVE, modo: "teste", fetch: fetchFalso });
  const pedido = (i = 0) => {
    const [url, init] = fetchFalso.mock.calls[i];
    return {
      url: String(url),
      metodo: init?.method ?? "GET",
      cabecalhos: new Headers(init?.headers),
      corpo: init?.body ? JSON.parse(String(init.body)) : undefined,
    };
  };
  return { provedor, fetchFalso, pedido };
}

describe("o modo e o endereço da chave", () => {
  it("o prefixo diz o modo; o resto não é chave do Asaas", () => {
    expect(modoDaChaveDoAsaas("$aact_prod_abc")).toBe("real");
    expect(modoDaChaveDoAsaas("$aact_hmlg_abc")).toBe("teste");
    expect(modoDaChaveDoAsaas("aact_prod_abc")).toBeNull();
    expect(modoDaChaveDoAsaas("sk_live_abc")).toBeNull();
  });

  it("cada modo tem o seu endereço, e todo pedido leva a chave e o User-Agent", async () => {
    expect(BASE_DO_ASAAS).toEqual({ teste: "https://api-sandbox.asaas.com/v3", real: "https://api.asaas.com/v3" });
    const { provedor, pedido } = montar(json(resposta("clientes-vazio.json")));

    await provedor.conferirChave();

    expect(pedido().url).toBe("https://api-sandbox.asaas.com/v3/customers?limit=1");
    expect(pedido().cabecalhos.get("access_token")).toBe(CHAVE);
    expect(pedido().cabecalhos.get("user-agent")).toMatch(/BarChop/);
  });
});

describe("os erros do Asaas", () => {
  it("401 é chave inválida, e o erro não carrega a chave", async () => {
    const { provedor } = montar(json(resposta("erro-401.json"), 401));

    const erro = await provedor.conferirChave().catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(ErroDoProvedor);
    expect(erro).toMatchObject({ codigo: "chave_invalida", status: 401 });
    expect(JSON.stringify(erro)).not.toContain(CHAVE);
    expect(String((erro as Error).message)).not.toContain(CHAVE);
  });

  it("400 é recusado, com a descrição do Asaas", async () => {
    const { provedor } = montar(json(resposta("erro-400.json"), 400));

    await expect(
      provedor.criarCliente({ nome: "Ana", cpfCnpj: "000", email: null, telefone: null, referencia: "c1" })
    ).rejects.toMatchObject({ codigo: "recusado", message: "O CPF/CNPJ informado é inválido." });
  });

  it("429 é limite, 404 é não encontrado, 5xx e rede são indisponível", async () => {
    const { provedor } = montar(
      json({ errors: [] }, 429),
      json({ errors: [] }, 404),
      json({}, 503),
      new TypeError("fetch failed")
    );

    await expect(provedor.lerAssinatura("sub_x")).rejects.toMatchObject({ codigo: "limite" });
    await expect(provedor.lerAssinatura("sub_x")).rejects.toMatchObject({ codigo: "nao_encontrado" });
    await expect(provedor.lerAssinatura("sub_x")).rejects.toMatchObject({ codigo: "indisponivel" });
    await expect(provedor.lerAssinatura("sub_x")).rejects.toMatchObject({ codigo: "indisponivel" });
  });
});

describe("o webhook da conta", () => {
  it("registra com o token do BarChop e os eventos que o BarChop lê", async () => {
    const { provedor, pedido } = montar(json(resposta("webhook.json")));

    const id = await provedor.registrarWebhook({
      url: "https://api.barchop.com.br/webhooks/asaas/conexao",
      token: "t".repeat(43),
      email: "dono@exemplo.com",
    });

    expect(id).toBe("wh_teste0000001");
    expect(pedido()).toMatchObject({ url: `${BASE_DO_ASAAS.teste}/webhooks`, metodo: "POST" });
    expect(pedido().corpo).toEqual({
      name: "BarChop",
      url: "https://api.barchop.com.br/webhooks/asaas/conexao",
      email: "dono@exemplo.com",
      enabled: true,
      interrupted: false,
      apiVersion: 3,
      authToken: "t".repeat(43),
      sendType: "SEQUENTIALLY",
      events: [
        "PAYMENT_CONFIRMED",
        "PAYMENT_RECEIVED",
        "PAYMENT_OVERDUE",
        "PAYMENT_DELETED",
        "PAYMENT_REFUNDED",
        "SUBSCRIPTION_INACTIVATED",
        "SUBSCRIPTION_DELETED",
      ],
    });
  });

  it("apaga pelo id; já apagado não é erro", async () => {
    const { provedor, pedido } = montar(json(resposta("webhook-removido.json")), json({ errors: [] }, 404));

    await provedor.apagarWebhook("wh_teste0000001");
    await provedor.apagarWebhook("wh_teste0000001");

    expect(pedido()).toMatchObject({ url: `${BASE_DO_ASAAS.teste}/webhooks/wh_teste0000001`, metodo: "DELETE" });
  });
});

describe("cliente e assinatura", () => {
  it("cria o cliente com o CPF e a referência do BarChop", async () => {
    const { provedor, pedido } = montar(json(resposta("cliente.json")));

    const id = await provedor.criarCliente({
      nome: "Cliente de Teste",
      cpfCnpj: "529.982.247-25",
      email: "cliente@exemplo.com",
      telefone: "(11) 99999-0000",
      referencia: "c1",
    });

    expect(id).toBe("cus_teste0000001");
    expect(pedido().corpo).toEqual({
      name: "Cliente de Teste",
      cpfCnpj: "52998224725",
      email: "cliente@exemplo.com",
      mobilePhone: "11999990000",
      externalReference: "c1",
    });
  });

  it("cria a assinatura com a forma escolhida na fatura e devolve o link da primeira cobrança", async () => {
    const { provedor, pedido } = montar(json(resposta("assinatura.json")), json(resposta("cobrancas-da-assinatura.json")));

    const criada = await provedor.criarAssinatura({
      clienteId: "cus_teste0000001",
      valorCentavos: 12000,
      ciclo: "mensal",
      primeiroVencimento: "2026-10-24",
      descricao: "Corte ilimitado",
      referencia: "as1",
      urlDeVolta: "https://gr.barchop.com.br/minha-conta",
    });

    expect(criada).toEqual({ id: "sub_teste0000001", linkDaFatura: "https://sandbox.asaas.com/i/teste0000001" });
    expect(pedido(0).corpo).toEqual({
      customer: "cus_teste0000001",
      billingType: "UNDEFINED",
      value: 120,
      nextDueDate: "2026-10-24",
      cycle: "MONTHLY",
      description: "Corte ilimitado",
      externalReference: "as1",
      callback: { successUrl: "https://gr.barchop.com.br/minha-conta", autoRedirect: true },
    });
    expect(pedido(1)).toMatchObject({ url: `${BASE_DO_ASAAS.teste}/subscriptions/sub_teste0000001/payments`, metodo: "GET" });
  });

  it("o ciclo do plano vira o do Asaas, e centavos viram reais", async () => {
    const { provedor, pedido } = montar(
      json(resposta("assinatura.json")),
      json(resposta("cobrancas-da-assinatura.json")),
      json(resposta("assinatura.json")),
      json(resposta("cobrancas-da-assinatura.json"))
    );
    const base = { clienteId: "c", primeiroVencimento: "2026-10-24", descricao: "x", referencia: "r", urlDeVolta: null };

    await provedor.criarAssinatura({ ...base, valorCentavos: 33990, ciclo: "trimestral" });
    await provedor.criarAssinatura({ ...base, valorCentavos: 99, ciclo: "anual" });

    expect(pedido(0).corpo).toMatchObject({ value: 339.9, cycle: "QUARTERLY" });
    expect(pedido(0).corpo.callback).toBeUndefined();
    expect(pedido(2).corpo).toMatchObject({ value: 0.99, cycle: "YEARLY" });
  });

  it("lê a assinatura em termos do BarChop", async () => {
    const { provedor } = montar(json(resposta("assinatura.json")), json({ ...(resposta("assinatura.json") as object), status: "INACTIVE", deleted: true }));

    expect(await provedor.lerAssinatura("sub_teste0000001")).toEqual({
      id: "sub_teste0000001",
      situacao: "ativa",
      removida: false,
      valorCentavos: 12000,
      proximoVencimento: "2026-10-24",
    });
    expect(await provedor.lerAssinatura("sub_teste0000001")).toMatchObject({ situacao: "inativa", removida: true });
  });

  it("lê a cobrança: paga, com o dia em que o cliente pagou", async () => {
    const { provedor } = montar(json(resposta("cobranca-paga.json")), json(resposta("cobranca.json")));

    expect(await provedor.lerCobranca("pay_teste0000001")).toEqual({
      id: "pay_teste0000001",
      assinaturaId: "sub_teste0000001",
      situacao: "paga",
      removida: false,
      valorCentavos: 12000,
      vencimento: "2026-10-24",
      pagaEm: "2026-10-24",
      forma: "pix",
      linkDaFatura: "https://sandbox.asaas.com/i/teste0000001",
    });
    expect(await provedor.lerCobranca("pay_teste0000001")).toMatchObject({ situacao: "pendente", pagaEm: null, forma: null });
  });

  it("cancela removendo a assinatura; já removida não é erro", async () => {
    const { provedor, pedido } = montar(json(resposta("assinatura-removida.json")), json({ errors: [] }, 404));

    await provedor.cancelarAssinatura("sub_teste0000001");
    await provedor.cancelarAssinatura("sub_teste0000001");

    expect(pedido()).toMatchObject({ url: `${BASE_DO_ASAAS.teste}/subscriptions/sub_teste0000001`, metodo: "DELETE" });
  });
});

describe("o evento do webhook", () => {
  it("de cobrança traz a cobrança e a assinatura; de assinatura, a assinatura", () => {
    const { provedor } = montar();

    expect(provedor.lerEvento(resposta("evento-de-cobranca.json"))).toEqual({
      id: "evt_teste0000001&1",
      tipo: "PAYMENT_RECEIVED",
      cobrancaId: "pay_teste0000001",
      assinaturaId: "sub_teste0000001",
    });
    expect(provedor.lerEvento(resposta("evento-de-assinatura.json"))).toEqual({
      id: "evt_teste0000002&1",
      tipo: "SUBSCRIPTION_DELETED",
      cobrancaId: null,
      assinaturaId: "sub_teste0000001",
    });
  });

  it("aceita campos novos e recusa o que não é evento", () => {
    const { provedor } = montar();

    expect(provedor.lerEvento({ id: "evt_1", event: "ACCOUNT_STATUS_UPDATED", campoNovo: 1 })).toEqual({
      id: "evt_1",
      tipo: "ACCOUNT_STATUS_UPDATED",
      cobrancaId: null,
      assinaturaId: null,
    });
    expect(() => provedor.lerEvento({ event: "PAYMENT_RECEIVED" })).toThrow(ErroDoProvedor);
    expect(() => provedor.lerEvento("texto")).toThrow(ErroDoProvedor);
  });
});
