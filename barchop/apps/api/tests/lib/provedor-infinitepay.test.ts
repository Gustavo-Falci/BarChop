import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { ErroDoProvedor } from "../../src/lib/provedores";
import {
  BASE_DA_INFINITEPAY,
  modoDaChaveDaInfinitePay,
  provedorInfinitePay,
} from "../../src/lib/provedores/infinitepay";

// O conector da InfinitePay (plano pagamentos-online-infinitepay, PR 2),
// com um `fetch` falso. As respostas NÃO foram gravadas: a InfinitePay não
// tem sandbox, e saem dos exemplos da documentação (respostas-da-infinitepay/
// README.md). Nada sai do processo.

function resposta(nome: string): unknown {
  return JSON.parse(readFileSync(join(__dirname, "respostas-da-infinitepay", nome), "utf-8"));
}

function json(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });
}

const CHAVE = "inchk_chave-de-mentira-do-teste";
const TAG = "barbearia-exemplo";

function montar(...respostas: (Response | Error)[]) {
  const fetchFalso = vi.fn<typeof fetch>();
  for (const r of respostas) {
    if (r instanceof Error) fetchFalso.mockRejectedValueOnce(r);
    else fetchFalso.mockResolvedValueOnce(r);
  }
  const provedor = provedorInfinitePay({ chave: CHAVE, tag: TAG, fetch: fetchFalso });
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

const NOVO_LINK = {
  orderNsu: "assinatura-1:2026-11-10",
  valorCentavos: 12000,
  descricao: "Corte ilimitado",
  cliente: { nome: "Ana Souza", email: "ana@exemplo.com", telefone: "+5511999887766" },
  redirectUrl: "https://barbearia-exemplo.barchop.com.br/minha-conta/pagamento",
  webhookUrl: "https://api.barchop.test/webhooks/infinitepay/c1",
  validoAte: "2026-11-20",
};

describe("a chave e o tipo do conector", () => {
  it("só a `inchk_` é chave da InfinitePay, e é sempre de produção: não há sandbox", () => {
    expect(modoDaChaveDaInfinitePay("inchk_abc")).toBe("real");
    expect(modoDaChaveDaInfinitePay("inchk")).toBeNull();
    expect(modoDaChaveDaInfinitePay("$aact_prod_abc")).toBeNull();
    expect(modoDaChaveDaInfinitePay("rk_live_abc")).toBeNull();
  });

  it("cobra por link, não pede CPF, e todo pedido leva a chave e a InfiniteTag", async () => {
    const { provedor, pedido } = montar(json(resposta("pagamento-nao-confere.json")));
    expect(provedor).toMatchObject({ nome: "infinitepay", modo: "real", cobra: "link", pedeCpf: false });

    await provedor.conferirChave();

    expect(BASE_DA_INFINITEPAY).toBe("https://api.checkout.infinitepay.io");
    expect(pedido()).toMatchObject({ url: "https://api.checkout.infinitepay.io/payment_check", metodo: "POST" });
    expect(pedido().cabecalhos.get("x-api-key")).toBe(CHAVE);
    expect(pedido().corpo).toMatchObject({ handle: TAG });
  });
});

describe("conferir a chave", () => {
  it("um payment_check que não bate (200) quer dizer que a chave e a tag valem juntas", async () => {
    const { provedor } = montar(json(resposta("pagamento-nao-confere.json")));
    await expect(provedor.conferirChave()).resolves.toBeUndefined();
  });

  it("400, 404 ou 422 também passam: a documentação não diz o que o pedido inventado devolve", async () => {
    for (const status of [400, 404, 422]) {
      const { provedor } = montar(json({ message: "não achei" }, status));
      await expect(provedor.conferirChave()).resolves.toBeUndefined();
    }
  });

  it("401 e 403 (chave revogada, ou a tag de outra conta) são chave inválida, e o erro não carrega a chave", async () => {
    for (const status of [401, 403]) {
      const { provedor } = montar(json({}, status));
      const erro = await provedor.conferirChave().catch((e: unknown) => e);
      expect(erro).toBeInstanceOf(ErroDoProvedor);
      expect(erro).toMatchObject({ codigo: "chave_invalida", status });
      expect(JSON.stringify(erro)).not.toContain(CHAVE);
      expect(String((erro as Error).message)).not.toContain(CHAVE);
    }
  });

  it("o checkout integrado desligado na conta é recusado, com o que fazer", async () => {
    const { provedor } = montar(json({ code: "external_checkout_not_enabled" }, 400));
    await expect(provedor.conferirChave()).rejects.toMatchObject({
      codigo: "recusado",
      message: expect.stringMatching(/checkout integrado/),
    });
  });

  it("fora do ar (5xx ou rede) não confere nada: indisponível", async () => {
    const { provedor } = montar(json({}, 503), new TypeError("fetch failed"));
    await expect(provedor.conferirChave()).rejects.toMatchObject({ codigo: "indisponivel" });
    await expect(provedor.conferirChave()).rejects.toMatchObject({ codigo: "indisponivel" });
  });
});

describe("criar o link do ciclo", () => {
  it("manda um item com o preço, a referência do BarChop, as voltas e as opções; devolve a URL", async () => {
    const { provedor, pedido } = montar(json(resposta("link-criado.json")));

    const criado = await provedor.criarLink(NOVO_LINK);

    expect(criado).toEqual({ url: "https://checkout.infinitepay.io/exemplo/link-de-exemplo" });
    expect(pedido().url).toBe("https://api.checkout.infinitepay.io/links");
    expect(pedido().corpo).toEqual({
      handle: TAG,
      items: [{ quantity: 1, price: 12000, description: "Corte ilimitado" }],
      order_nsu: "assinatura-1:2026-11-10",
      redirect_url: NOVO_LINK.redirectUrl,
      webhook_url: NOVO_LINK.webhookUrl,
      customer: { name: "Ana Souza", email: "ana@exemplo.com", phone_number: "+5511999887766" },
      options: {
        single_payment: true,
        // O fim do último dia, no fuso da barbearia.
        valid_until: "2026-11-20T23:59:59-03:00",
        payment_methods_enabled: ["credit_card", "pix"],
      },
    });
  });

  it("o cliente sem e-mail ou sem celular vai sem o campo; o celular sem o país ganha o +55", async () => {
    const { provedor, pedido } = montar(json(resposta("link-criado.json")), json(resposta("link-criado.json")));

    await provedor.criarLink({ ...NOVO_LINK, cliente: { nome: "Ana", email: null, telefone: null } });
    await provedor.criarLink({ ...NOVO_LINK, cliente: { nome: "Ana", email: null, telefone: "(11) 99988-7766" } });

    expect(pedido(0).corpo.customer).toEqual({ name: "Ana" });
    expect(pedido(1).corpo.customer).toEqual({ name: "Ana", phone_number: "+5511999887766" });
  });

  it("a URL vem em `url`, `link` ou `checkout_url`; sem nenhuma, indisponível com os nomes dos campos e sem valores", async () => {
    const { provedor } = montar(
      json({ link: "https://checkout.infinitepay.io/exemplo/b" }),
      json({ checkout_url: "https://checkout.infinitepay.io/exemplo/c" }),
      json({ slug: "segredo-do-link", id: 7 })
    );

    expect(await provedor.criarLink(NOVO_LINK)).toEqual({ url: "https://checkout.infinitepay.io/exemplo/b" });
    expect(await provedor.criarLink(NOVO_LINK)).toEqual({ url: "https://checkout.infinitepay.io/exemplo/c" });
    const erro = await provedor.criarLink(NOVO_LINK).catch((e: unknown) => e);
    expect(erro).toMatchObject({ codigo: "indisponivel", message: expect.stringMatching(/slug, id/) });
    expect(String((erro as Error).message)).not.toContain("segredo-do-link");
  });

  it("400 é recusado, com a mensagem da InfinitePay quando ela explica; 401 é chave inválida; 429 é limite", async () => {
    const { provedor } = montar(
      json({ message: "O valor mínimo é R$ 1,00" }, 400),
      json({}, 400),
      json({}, 401),
      json({}, 429)
    );

    await expect(provedor.criarLink(NOVO_LINK)).rejects.toMatchObject({ codigo: "recusado", message: "O valor mínimo é R$ 1,00" });
    await expect(provedor.criarLink(NOVO_LINK)).rejects.toMatchObject({
      codigo: "recusado",
      message: "a InfinitePay recusou o pedido",
    });
    await expect(provedor.criarLink(NOVO_LINK)).rejects.toMatchObject({ codigo: "chave_invalida" });
    await expect(provedor.criarLink(NOVO_LINK)).rejects.toMatchObject({ codigo: "limite" });
  });
});

describe("conferir o pagamento", () => {
  const AVISO = { orderNsu: "assinatura-1:2026-11-10", transactionNsu: "transacao-de-exemplo", slug: "abc123" };

  it("pago: o valor do link (`amount`), nunca o que o comprador pagou com juros (`paid_amount`)", async () => {
    const { provedor, pedido } = montar(json(resposta("pagamento-conferido.json")));

    const pagamento = await provedor.conferirPagamento(AVISO);

    expect(pagamento).toEqual({ pago: true, valorCentavos: 1500, forma: "pix" });
    expect(pedido().url).toBe("https://api.checkout.infinitepay.io/payment_check");
    expect(pedido().corpo).toEqual({
      handle: TAG,
      order_nsu: "assinatura-1:2026-11-10",
      transaction_nsu: "transacao-de-exemplo",
      slug: "abc123",
    });
  });

  it("no cartão, a forma é cartão", async () => {
    const { provedor } = montar(json({ ...(resposta("pagamento-conferido.json") as object), capture_method: "credit_card" }));
    expect(await provedor.conferirPagamento(AVISO)).toMatchObject({ pago: true, forma: "cartao" });
  });

  it("o que não bate (success ou paid falso, ou 400 e 404) não está pago", async () => {
    const { provedor } = montar(
      json(resposta("pagamento-nao-confere.json")),
      json({ success: true, paid: false, amount: 1500 }),
      json({ success: false, paid: true, amount: 1500 }),
      json({}, 400),
      json({}, 404)
    );

    for (let i = 0; i < 5; i++) {
      expect(await provedor.conferirPagamento(AVISO)).toMatchObject({ pago: false });
    }
  });

  it("pago sem `amount` inteiro não se entende: indisponível, pra tentar de novo", async () => {
    const { provedor } = montar(json({ success: true, paid: true, amount: "15,00" }));
    await expect(provedor.conferirPagamento(AVISO)).rejects.toMatchObject({ codigo: "indisponivel" });
  });

  it("chave revogada é chave inválida; fora do ar é indisponível", async () => {
    const { provedor } = montar(json({}, 403), json({}, 500));
    await expect(provedor.conferirPagamento(AVISO)).rejects.toMatchObject({ codigo: "chave_invalida" });
    await expect(provedor.conferirPagamento(AVISO)).rejects.toMatchObject({ codigo: "indisponivel" });
  });
});

describe("ler o aviso de pagamento", () => {
  it("tira do corpo só o que serve pra conferir: pedido, transação e fatura", () => {
    const { provedor } = montar();
    expect(provedor.lerAviso(resposta("aviso-de-pagamento.json"))).toEqual({
      orderNsu: "pedido-de-exemplo",
      transactionNsu: "transacao-de-exemplo",
      slug: "abc123",
    });
  });

  it("sem pedido, transação ou fatura não é aviso: recusado", () => {
    const { provedor } = montar();
    const aviso = resposta("aviso-de-pagamento.json") as Record<string, unknown>;
    for (const campo of ["order_nsu", "transaction_nsu", "invoice_slug"]) {
      expect(() => provedor.lerAviso({ ...aviso, [campo]: "" })).toThrow(ErroDoProvedor);
    }
    expect(() => provedor.lerAviso(null)).toThrow(ErroDoProvedor);
    expect(() => provedor.lerAviso("texto")).toThrow(ErroDoProvedor);
  });
});
