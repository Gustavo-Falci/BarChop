import { describe, expect, it } from "vitest";
import Stripe from "stripe";
import { precosDoCiclo } from "@barchop/formato";
import {
  SEGREDO_DO_WEBHOOK_DE_TESTE,
  chaveDoPreco,
  cobrancaDeMemoria,
  cobrancaDoAmbiente,
  configuracaoSemDescida,
  fimDoTesteNaCobranca,
  modoDaChave,
  planoDaChave,
  precosParaStripe,
  situacaoComReembolso,
  situacaoDaFatura,
  situacaoDaStripe,
} from "../../src/lib/cobranca";

// A cobrança da assinatura do BarChop pela Stripe (ADR-0010; PR 4 do
// plano cobranca-do-barchop). Aqui, só o que não vai à rede: as chaves
// dos preços, os degraus, a tradução da situação, a escolha do adaptador
// e a leitura do evento assinado (a verificação é a da própria Stripe).

describe("chaves dos preços", () => {
  it("plano e ciclo viram a lookup_key, e voltam", () => {
    expect(chaveDoPreco("essencial", "mensal")).toBe("essencial_mensal");
    expect(chaveDoPreco("completo", "anual")).toBe("completo_anual");
    expect(planoDaChave("completo_anual")).toEqual({ plano: "completo", ciclo: "anual" });
  });

  it("chave desconhecida, do Grátis ou ausente não é plano nenhum", () => {
    expect(planoDaChave("ouro_mensal")).toBeNull();
    expect(planoDaChave("gratis_mensal")).toBeNull();
    expect(planoDaChave("essencial_semanal")).toBeNull();
    expect(planoDaChave(null)).toBeNull();
  });
});

describe("precosParaStripe", () => {
  it("um preço graduado por plano pago e ciclo, com os degraus de planos.ts", () => {
    const precos = precosParaStripe();

    expect(precos.map((p) => p.chave)).toEqual([
      "essencial_mensal",
      "essencial_anual",
      "completo_mensal",
      "completo_anual",
    ]);
    for (const preco of precos) {
      const { plano, ciclo } = planoDaChave(preco.chave)!;
      const { base, extra } = precosDoCiclo(plano, ciclo);
      expect(preco.tiers).toEqual([
        { up_to: 1, unit_amount: base },
        { up_to: "inf", unit_amount: extra },
      ]);
      expect(preco.intervalo).toBe(ciclo === "anual" ? "year" : "month");
      expect(preco.produto.id).toBe(`barchop_${plano}`);
    }
  });
});

describe("situacaoDaStripe", () => {
  it("traduz a situação da Stripe", () => {
    expect(situacaoDaStripe("active")).toBe("ativa");
    expect(situacaoDaStripe("trialing")).toBe("ativa");
    expect(situacaoDaStripe("past_due")).toBe("em_atraso");
    expect(situacaoDaStripe("unpaid")).toBe("em_atraso");
    expect(situacaoDaStripe("canceled")).toBe("cancelada");
    expect(situacaoDaStripe("incomplete_expired")).toBe("cancelada");
    expect(situacaoDaStripe("paused")).toBe("cancelada");
  });

  it("o primeiro pagamento ainda não feito não muda nada", () => {
    expect(situacaoDaStripe("incomplete")).toBeNull();
    expect(situacaoDaStripe("algo_novo")).toBeNull();
  });
});

describe("fimDoTesteNaCobranca", () => {
  // Decisão do dono (14/10/2026): assinar no teste só cobra quando ele
  // acaba. A Stripe exige o fim do teste pelo menos 48h à frente.
  const AGORA = new Date("2026-10-20T12:00:00Z");
  const HORA = 60 * 60 * 1000;

  it("com folga, o teste continua até o fim (em segundos)", () => {
    const fim = new Date(AGORA.getTime() + 100 * HORA);
    expect(fimDoTesteNaCobranca(fim, AGORA)).toBe(Math.floor(fim.getTime() / 1000));
  });

  it("perto demais do fim, ou sem teste, cobra na hora", () => {
    expect(fimDoTesteNaCobranca(new Date(AGORA.getTime() + 47 * HORA), AGORA)).toBeNull();
    expect(fimDoTesteNaCobranca(new Date(AGORA.getTime() - HORA), AGORA)).toBeNull();
    expect(fimDoTesteNaCobranca(null, AGORA)).toBeNull();
  });
});

describe("configuracaoSemDescida", () => {
  // A configuração padrão do Portal como a Stripe devolve (o que o dono
  // deixou no painel dela em 15/10/2026).
  const padrao = {
    id: "bpc_padrao",
    object: "billing_portal.configuration",
    active: true,
    application: null,
    business_profile: {
      headline: null,
      privacy_policy_url: "https://barchop.com.br/privacidade",
      terms_of_service_url: "https://barchop.com.br/termos",
    },
    created: 1,
    default_return_url: null,
    features: {
      customer_update: { allowed_updates: ["email", "address"], enabled: true },
      invoice_history: { enabled: true },
      payment_method_update: { enabled: true, payment_method_configuration: null },
      subscription_cancel: {
        cancellation_reason: { enabled: true, options: ["too_expensive", "other"] },
        enabled: true,
        mode: "at_period_end",
        proration_behavior: "none",
      },
      subscription_update: {
        billing_cycle_anchor: null,
        default_allowed_updates: ["price"],
        enabled: true,
        products: [
          {
            adjustable_quantity: { enabled: false, maximum: null, minimum: 1 },
            prices: ["price_ess_m", "price_ess_a"],
            product: "barchop_essencial",
          },
          {
            adjustable_quantity: { enabled: false, maximum: null, minimum: 1 },
            prices: ["price_com_m", "price_com_a"],
            product: "barchop_completo",
          },
        ],
        proration_behavior: "always_invoice",
        schedule_at_period_end: { conditions: [{ type: "decreasing_item_amount" }, { type: "shortening_interval" }] },
        trial_update_behavior: "continue_trial",
      },
    },
    is_default: true,
    livemode: false,
    login_page: { enabled: false, url: null },
    metadata: {},
    name: null,
    updated: 1,
  } as unknown as Stripe.BillingPortal.Configuration;

  it("a troca de plano só oferece os preços do Completo", () => {
    const produtos = configuracaoSemDescida(padrao).features.subscription_update?.products;
    expect(produtos).toEqual([
      { product: "barchop_completo", prices: ["price_com_m", "price_com_a"], adjustable_quantity: { enabled: false } },
    ]);
  });

  it("o resto é cópia da padrão: links, cancelamento, cobrança da diferença, teste", () => {
    const params = configuracaoSemDescida(padrao);
    expect(params.business_profile).toEqual({
      privacy_policy_url: "https://barchop.com.br/privacidade",
      terms_of_service_url: "https://barchop.com.br/termos",
    });
    expect(params.default_return_url).toBeUndefined();
    expect(params.features.customer_update).toEqual({ allowed_updates: ["email", "address"], enabled: true });
    expect(params.features.invoice_history).toEqual({ enabled: true });
    expect(params.features.payment_method_update).toEqual({ enabled: true });
    expect(params.features.subscription_cancel).toEqual({
      cancellation_reason: { enabled: true, options: ["too_expensive", "other"] },
      enabled: true,
      mode: "at_period_end",
      proration_behavior: "none",
    });
    expect(params.features.subscription_update).toMatchObject({
      default_allowed_updates: ["price"],
      enabled: true,
      proration_behavior: "always_invoice",
      schedule_at_period_end: { conditions: [{ type: "decreasing_item_amount" }, { type: "shortening_interval" }] },
      trial_update_behavior: "continue_trial",
    });
  });

  it("quantidade ligada no produto mas não na troca: a Stripe recusa, então vai desligada", () => {
    // Assim estava o sandbox de teste em 16/10/2026; o painel aceita, a API não.
    const trocar = padrao.features.subscription_update;
    const misturada = {
      ...padrao,
      features: {
        ...padrao.features,
        subscription_update: {
          ...trocar,
          products: trocar.products!.map((p) => ({ ...p, adjustable_quantity: { enabled: true, maximum: 99, minimum: 1 } })),
        },
      },
    } as Stripe.BillingPortal.Configuration;

    expect(configuracaoSemDescida(misturada).features.subscription_update?.products).toEqual([
      { product: "barchop_completo", prices: ["price_com_m", "price_com_a"], adjustable_quantity: { enabled: false } },
    ]);
  });

  it("é achada pelo metadata e tem nome no painel da Stripe", () => {
    const params = configuracaoSemDescida(padrao);
    expect(params.metadata).toEqual({ barchop: "sem_descida" });
    expect(params.name).toMatch(/sem descida/i);
  });
});

describe("modoDaChave", () => {
  it("secreta ou restrita do modo real é REAL", () => {
    expect(modoDaChave("sk_live_x")).toBe("real");
    expect(modoDaChave("rk_live_x")).toBe("real");
  });

  it("as de teste, ou qualquer outra, são teste", () => {
    expect(modoDaChave("sk_test_x")).toBe("teste");
    expect(modoDaChave("rk_test_x")).toBe("teste");
    expect(modoDaChave("banana")).toBe("teste");
  });
});

describe("cobrancaDoAmbiente", () => {
  it("nos testes, a de memória", () => {
    expect(cobrancaDoAmbiente({ NODE_ENV: "test" }).nome).toBe("memoria");
  });

  it("em produção, recusa subir sem as duas chaves", () => {
    expect(() => cobrancaDoAmbiente({ NODE_ENV: "production" })).toThrow(/STRIPE_SECRET_KEY/);
    expect(() =>
      cobrancaDoAmbiente({ NODE_ENV: "production", STRIPE_SECRET_KEY: "sk_live_x" })
    ).toThrow(/STRIPE_WEBHOOK_SECRET/);
    expect(
      cobrancaDoAmbiente({ NODE_ENV: "production", STRIPE_SECRET_KEY: "sk_live_x", STRIPE_WEBHOOK_SECRET: "whsec_x" })
        .nome
    ).toBe("stripe");
  });

  it("em desenvolvimento: sem chave, desligada; só com a chave, sem o webhook", () => {
    expect(cobrancaDoAmbiente({}).nome).toBe("desligada");
    const soChave = cobrancaDoAmbiente({ STRIPE_SECRET_KEY: "sk_test_x" });
    expect(soChave.nome).toBe("stripe");
    expect(soChave.webhookConfigurado).toBe(false);
  });
});

describe("lerEvento", () => {
  function assinado(evento: object) {
    const corpo = JSON.stringify(evento);
    const assinatura = Stripe.webhooks.generateTestHeaderString({ payload: corpo, secret: SEGREDO_DO_WEBHOOK_DE_TESTE });
    return { corpo: Buffer.from(corpo), assinatura };
  }

  it("lê a assinatura e a barbearia do evento de assinatura", () => {
    const { corpo, assinatura } = assinado({
      id: "evt_1",
      object: "event",
      type: "customer.subscription.updated",
      data: { object: { id: "sub_1", object: "subscription", customer: "cus_1", metadata: { barbeariaId: "b1" } } },
    });

    expect(cobrancaDeMemoria().lerEvento(corpo, assinatura)).toEqual({
      id: "evt_1",
      tipo: "customer.subscription.updated",
      assinaturaId: "sub_1",
      customerId: "cus_1",
      barbeariaId: "b1",
    });
  });

  it("no checkout concluído, a barbearia vem do client_reference_id", () => {
    const { corpo, assinatura } = assinado({
      id: "evt_2",
      object: "event",
      type: "checkout.session.completed",
      data: { object: { id: "cs_1", object: "checkout.session", client_reference_id: "b1", customer: "cus_1", subscription: "sub_1" } },
    });

    expect(cobrancaDeMemoria().lerEvento(corpo, assinatura)).toMatchObject({ assinaturaId: "sub_1", barbeariaId: "b1" });
  });

  it("na fatura, a assinatura vem do parent", () => {
    const { corpo, assinatura } = assinado({
      id: "evt_3",
      object: "event",
      type: "invoice.payment_failed",
      data: {
        object: {
          id: "in_1",
          object: "invoice",
          customer: "cus_1",
          parent: { type: "subscription_details", subscription_details: { subscription: "sub_1" } },
        },
      },
    });

    expect(cobrancaDeMemoria().lerEvento(corpo, assinatura)).toMatchObject({ assinaturaId: "sub_1", customerId: "cus_1" });
  });

  it("evento de outro tipo não aponta assinatura nenhuma", () => {
    const { corpo, assinatura } = assinado({
      id: "evt_4",
      object: "event",
      type: "customer.created",
      data: { object: { id: "cus_1", object: "customer" } },
    });

    expect(cobrancaDeMemoria().lerEvento(corpo, assinatura)).toMatchObject({ assinaturaId: null, barbeariaId: null });
  });

  it("assinatura que não confere lança", () => {
    const { corpo } = assinado({ id: "evt_5", object: "event", type: "invoice.paid", data: { object: {} } });
    expect(() => cobrancaDeMemoria().lerEvento(corpo, "t=1,v1=errada")).toThrow();
  });
});

describe("situacaoComReembolso", () => {
  // A Stripe deixa a fatura `paid` depois do reembolso: quem diz quanto
  // voltou é a cobrança do cartão.
  it("paga e devolvida inteira é reembolsada; em parte, reembolsada em parte", () => {
    expect(situacaoComReembolso("paga", 4490, 4490)).toBe("reembolsada");
    expect(situacaoComReembolso("paga", 4490, 1000)).toBe("reembolsada_em_parte");
  });

  it("sem nada devolvido, fica como estava (inclusive a de R$ 0 do teste)", () => {
    expect(situacaoComReembolso("paga", 4490, 0)).toBe("paga");
    expect(situacaoComReembolso("paga", 0, 0)).toBe("paga");
  });

  it("só fatura paga vira reembolsada", () => {
    expect(situacaoComReembolso("aberta", 4490, 4490)).toBe("aberta");
    expect(situacaoComReembolso("anulada", 4490, 4490)).toBe("anulada");
  });
});

describe("situacaoDaFatura", () => {
  it("traduz a fatura da Stripe", () => {
    expect(situacaoDaFatura("paid", 1)).toBe("paga");
    expect(situacaoDaFatura("open", 0)).toBe("aberta");
    expect(situacaoDaFatura("void", 0)).toBe("anulada");
    expect(situacaoDaFatura("uncollectible", 4)).toBe("falhou");
  });

  it("aberta que a Stripe já tentou cobrar e não conseguiu: falhou", () => {
    expect(situacaoDaFatura("open", 2)).toBe("falhou");
  });

  it("rascunho ainda não é fatura pro dono", () => {
    expect(situacaoDaFatura("draft", 0)).toBeNull();
  });
});
