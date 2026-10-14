import { describe, expect, it } from "vitest";
import Stripe from "stripe";
import { prisma } from "@barchop/database";
import { buildApp } from "../../src/app";
import {
  SEGREDO_DO_WEBHOOK_DE_TESTE,
  cobrancaDeMemoria,
  type AssinaturaNaCobranca,
  type CobrancaDeMemoria,
} from "../../src/lib/cobranca";
import type { App } from "../../src/tipos";
import { auth, criarBarbeariaComToken, criarMembroComToken } from "../helpers/barbearia";

// A assinatura paga pela Stripe (PR 4 do plano cobranca-do-barchop):
// Checkout e Portal só do dono, o webhook que mantém a cópia da
// situação, e a quantidade na Stripe que acompanha a equipe. A Stripe de
// verdade não entra: a cobrança de memória registra os pedidos e guarda
// as assinaturas que o webhook relê; a assinatura do evento é conferida
// pela própria biblioteca da Stripe.

const DIA = 24 * 60 * 60 * 1000;

function montar(): { app: App; cobranca: CobrancaDeMemoria } {
  const cobranca = cobrancaDeMemoria();
  return { app: buildApp({ cobranca }), cobranca };
}

function checkout(app: App, token: string, corpo: Record<string, unknown>) {
  return app.inject({
    method: "POST",
    url: "/barbearias/me/assinatura/checkout",
    headers: auth(token),
    payload: corpo,
  });
}

function portal(app: App, token: string) {
  return app.inject({ method: "POST", url: "/barbearias/me/assinatura/portal", headers: auth(token) });
}

let sequencia = 0;
function webhook(app: App, tipo: string, objeto: object, { assinatura, id }: { assinatura?: string; id?: string } = {}) {
  sequencia += 1;
  const corpo = JSON.stringify({ id: id ?? `evt_${sequencia}`, object: "event", type: tipo, data: { object: objeto } });
  return app.inject({
    method: "POST",
    url: "/stripe/webhook",
    headers: {
      "content-type": "application/json; charset=utf-8",
      "stripe-signature":
        assinatura ?? Stripe.webhooks.generateTestHeaderString({ payload: corpo, secret: SEGREDO_DO_WEBHOOK_DE_TESTE }),
    },
    payload: corpo,
  });
}

function assinaturaNaStripe(barbeariaId: string, extra: Partial<AssinaturaNaCobranca> = {}): AssinaturaNaCobranca {
  return {
    id: "sub_1",
    customerId: "cus_1",
    barbeariaId,
    status: "active",
    chave: "essencial_mensal",
    quantidade: 2,
    periodoTerminaEm: new Date("2026-12-01T12:00:00Z"),
    ...extra,
  };
}

function eventoDaAssinatura(sub: AssinaturaNaCobranca) {
  return { id: sub.id, object: "subscription", customer: sub.customerId, metadata: { barbeariaId: sub.barbeariaId } };
}

function lerLinha(barbeariaId: string) {
  return prisma.assinatura.findUniqueOrThrow({ where: { barbeariaId } });
}

describe("POST /barbearias/me/assinatura/checkout", () => {
  it("cria o cliente na Stripe uma vez e devolve o endereço do Checkout", async () => {
    const { app, cobranca } = montar();
    const { token, barbeariaId } = await criarBarbeariaComToken(app);

    const primeira = await checkout(app, token, { plano: "essencial", ciclo: "mensal", profissionais: 1 });
    const segunda = await checkout(app, token, { plano: "completo", ciclo: "anual", profissionais: 2 });

    expect(primeira.statusCode).toBe(200);
    expect(primeira.json().url).toMatch(/^https:\/\//);
    expect(segunda.statusCode).toBe(200);
    expect(cobranca.clientes).toHaveLength(1);
    expect(cobranca.clientes[0]).toMatchObject({ email: "um@exemplo.com", barbeariaId });
    expect((await lerLinha(barbeariaId)).stripeCustomerId).toBe(cobranca.clientes[0].id);
    expect(cobranca.checkouts[1]).toMatchObject({
      customerId: cobranca.clientes[0].id,
      barbeariaId,
      plano: "completo",
      ciclo: "anual",
      profissionais: 2,
    });
    await app.close();
  });

  it("no teste, a primeira cobrança fica para o fim dele", async () => {
    const { app, cobranca } = montar();
    const { token, barbeariaId } = await criarBarbeariaComToken(app);
    const { testeTerminaEm } = await lerLinha(barbeariaId);

    await checkout(app, token, { plano: "essencial", ciclo: "mensal", profissionais: 1 });

    expect(cobranca.checkouts[0].testeTerminaEm).toBe(Math.floor(testeTerminaEm!.getTime() / 1000));
    await app.close();
  });

  it("fora do teste, cobra na hora", async () => {
    const { app, cobranca } = montar();
    const { token, barbeariaId } = await criarBarbeariaComToken(app);
    await prisma.assinatura.update({ where: { barbeariaId }, data: { situacao: "gratis", testeTerminaEm: null } });

    await checkout(app, token, { plano: "essencial", ciclo: "mensal", profissionais: 1 });

    expect(cobranca.checkouts[0].testeTerminaEm).toBeNull();
    await app.close();
  });

  it("a quantidade não fica abaixo da equipe", async () => {
    const { app } = montar();
    const { token, barbeariaId } = await criarBarbeariaComToken(app);
    await criarMembroComToken(app, barbeariaId, "profissional", "p");

    const resposta = await checkout(app, token, { plano: "completo", ciclo: "mensal", profissionais: 1 });

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json().erro).toBe("quantidade_menor_que_a_equipe");
    await app.close();
  });

  it("acima do limite do plano é recusado", async () => {
    const { app } = montar();
    const { token } = await criarBarbeariaComToken(app);

    const resposta = await checkout(app, token, { plano: "essencial", ciclo: "mensal", profissionais: 4 });

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json().erro).toBe("limite_do_plano");
    await app.close();
  });

  it("o Grátis não se compra", async () => {
    const { app } = montar();
    const { token } = await criarBarbeariaComToken(app);

    expect((await checkout(app, token, { plano: "gratis", ciclo: "mensal", profissionais: 1 })).statusCode).toBe(400);
    await app.close();
  });

  it("com assinatura ativa, manda pro Portal em vez de assinar de novo", async () => {
    const { app } = montar();
    const { token, barbeariaId } = await criarBarbeariaComToken(app);
    await prisma.assinatura.update({
      where: { barbeariaId },
      data: { situacao: "ativa", plano: "essencial", testeTerminaEm: null, stripeSubscriptionId: "sub_1" },
    });

    const resposta = await checkout(app, token, { plano: "completo", ciclo: "mensal", profissionais: 1 });

    expect(resposta.statusCode).toBe(409);
    await app.close();
  });
});

describe("POST /barbearias/me/assinatura/portal", () => {
  it("sem ter assinado, não há Portal", async () => {
    const { app } = montar();
    const { token } = await criarBarbeariaComToken(app);

    expect((await portal(app, token)).statusCode).toBe(409);
    await app.close();
  });

  it("com o cliente na Stripe, devolve o endereço do Portal", async () => {
    const { app, cobranca } = montar();
    const { token, barbeariaId } = await criarBarbeariaComToken(app);
    await prisma.assinatura.update({ where: { barbeariaId }, data: { stripeCustomerId: "cus_9" } });

    const resposta = await portal(app, token);

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().url).toMatch(/^https:\/\//);
    expect(cobranca.portais[0].customerId).toBe("cus_9");
    await app.close();
  });
});

describe("POST /stripe/webhook", () => {
  it("assinatura que não confere: 400, e nada muda", async () => {
    const { app } = montar();
    const { barbeariaId } = await criarBarbeariaComToken(app);

    const resposta = await webhook(app, "customer.subscription.updated", { id: "sub_1" }, { assinatura: "t=1,v1=errada" });

    expect(resposta.statusCode).toBe(400);
    expect((await lerLinha(barbeariaId)).situacao).toBe("teste");
    await app.close();
  });

  it("não pede login", async () => {
    const { app } = montar();
    const resposta = await webhook(app, "customer.created", { id: "cus_1", object: "customer" });
    expect(resposta.statusCode).toBe(200);
    await app.close();
  });

  it("assinatura ativa: copia plano, ciclo, quantidade e período, e avisa o dono", async () => {
    const { app, cobranca } = montar();
    const { barbeariaId, barbeiroId } = await criarBarbeariaComToken(app);
    const sub = assinaturaNaStripe(barbeariaId);
    cobranca.assinaturas.set(sub.id, sub);

    const resposta = await webhook(app, "customer.subscription.created", eventoDaAssinatura(sub));
    const linha = await lerLinha(barbeariaId);
    const avisos = await prisma.notificacao.findMany({ where: { barbeiroId } });

    expect(resposta.statusCode).toBe(200);
    expect(linha).toMatchObject({
      situacao: "ativa",
      plano: "essencial",
      ciclo: "mensal",
      stripeCustomerId: "cus_1",
      stripeSubscriptionId: "sub_1",
      profissionaisContratados: 2,
      periodoTerminaEm: sub.periodoTerminaEm,
    });
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toMatchObject({ tipo: "pagamento", link: "/painel/assinatura" });
    await app.close();
  });

  it("o estado vem da assinatura relida, não do evento", async () => {
    const { app, cobranca } = montar();
    const { barbeariaId } = await criarBarbeariaComToken(app);
    const sub = assinaturaNaStripe(barbeariaId, { status: "past_due", chave: "completo_anual" });
    cobranca.assinaturas.set(sub.id, sub);

    // O evento é velho (diria "active"); a Stripe hoje diz past_due.
    await webhook(app, "customer.subscription.updated", { ...eventoDaAssinatura(sub), status: "active" });

    expect(await lerLinha(barbeariaId)).toMatchObject({ situacao: "em_atraso", plano: "completo", ciclo: "anual" });
    await app.close();
  });

  it("o mesmo evento entregue duas vezes vale uma", async () => {
    const { app, cobranca } = montar();
    const { barbeariaId, barbeiroId } = await criarBarbeariaComToken(app);
    const sub = assinaturaNaStripe(barbeariaId);
    cobranca.assinaturas.set(sub.id, sub);

    const primeira = await webhook(app, "customer.subscription.created", eventoDaAssinatura(sub), { id: "evt_repetido" });
    const segunda = await webhook(app, "customer.subscription.created", eventoDaAssinatura(sub), { id: "evt_repetido" });

    expect(primeira.statusCode).toBe(200);
    expect(segunda.statusCode).toBe(200);
    expect(await prisma.notificacao.count({ where: { barbeiroId } })).toBe(1);
    expect(await prisma.eventoStripe.count({ where: { id: "evt_repetido" } })).toBe(1);
    await app.close();
  });

  it("cancelada no fim do período: cai no Grátis, sem apagar nada", async () => {
    const { app, cobranca } = montar();
    const { token, barbeariaId } = await criarBarbeariaComToken(app);
    const sub = assinaturaNaStripe(barbeariaId);
    cobranca.assinaturas.set(sub.id, sub);
    await webhook(app, "customer.subscription.created", eventoDaAssinatura(sub));
    cobranca.assinaturas.set(sub.id, { ...sub, status: "canceled" });

    await webhook(app, "customer.subscription.deleted", eventoDaAssinatura(sub));
    const resumo = (
      await app.inject({ method: "GET", url: "/barbearias/me/assinatura", headers: auth(token) })
    ).json();

    expect(resumo).toMatchObject({ situacao: "cancelada", planoEfetivo: "gratis" });
    expect((await lerLinha(barbeariaId)).stripeCustomerId).toBe("cus_1");
    await app.close();
  });

  it("o primeiro pagamento ainda não feito não encerra o teste", async () => {
    const { app, cobranca } = montar();
    const { barbeariaId } = await criarBarbeariaComToken(app);
    const sub = assinaturaNaStripe(barbeariaId, { status: "incomplete" });
    cobranca.assinaturas.set(sub.id, sub);

    await webhook(app, "customer.subscription.created", eventoDaAssinatura(sub));

    expect((await lerLinha(barbeariaId)).situacao).toBe("teste");
    await app.close();
  });

  it("a fatura falhada relê a assinatura pelo parent", async () => {
    const { app, cobranca } = montar();
    const { barbeariaId } = await criarBarbeariaComToken(app);
    const sub = assinaturaNaStripe(barbeariaId, { status: "past_due" });
    cobranca.assinaturas.set(sub.id, sub);

    await webhook(app, "invoice.payment_failed", {
      id: "in_1",
      object: "invoice",
      customer: "cus_1",
      parent: { type: "subscription_details", subscription_details: { subscription: "sub_1" } },
    });

    expect((await lerLinha(barbeariaId)).situacao).toBe("em_atraso");
    await app.close();
  });

  it("preço desconhecido não derruba o webhook nem grava nada", async () => {
    const { app, cobranca } = montar();
    const { barbeariaId } = await criarBarbeariaComToken(app);
    const sub = assinaturaNaStripe(barbeariaId, { chave: "ouro_mensal" });
    cobranca.assinaturas.set(sub.id, sub);

    const resposta = await webhook(app, "customer.subscription.created", eventoDaAssinatura(sub));

    expect(resposta.statusCode).toBe(200);
    expect((await lerLinha(barbeariaId)).situacao).toBe("teste");
    await app.close();
  });

  it("barbearia que não existe: 200, e segue a vida", async () => {
    const { app, cobranca } = montar();
    const sub = assinaturaNaStripe("00000000-0000-4000-8000-000000000000");
    cobranca.assinaturas.set(sub.id, sub);

    expect((await webhook(app, "customer.subscription.created", eventoDaAssinatura(sub))).statusCode).toBe(200);
    await app.close();
  });

  it("evento velho de uma assinatura antiga não derruba a nova", async () => {
    const { app, cobranca } = montar();
    const { barbeariaId } = await criarBarbeariaComToken(app);
    const nova = assinaturaNaStripe(barbeariaId, { id: "sub_nova" });
    const antiga = assinaturaNaStripe(barbeariaId, { id: "sub_antiga", status: "canceled" });
    cobranca.assinaturas.set(nova.id, nova);
    cobranca.assinaturas.set(antiga.id, antiga);
    await webhook(app, "customer.subscription.created", eventoDaAssinatura(nova));

    await webhook(app, "customer.subscription.deleted", eventoDaAssinatura(antiga));

    expect(await lerLinha(barbeariaId)).toMatchObject({ situacao: "ativa", stripeSubscriptionId: "sub_nova" });
    await app.close();
  });

  it("falha ao reler na Stripe: 500 e o evento não fica gravado, pra Stripe tentar de novo", async () => {
    const { app } = montar();
    const { barbeariaId } = await criarBarbeariaComToken(app);

    const resposta = await webhook(
      app,
      "customer.subscription.updated",
      { id: "sub_sumida", object: "subscription", metadata: { barbeariaId } },
      { id: "evt_sumida" }
    );

    expect(resposta.statusCode).toBe(500);
    expect(await prisma.eventoStripe.count({ where: { id: "evt_sumida" } })).toBe(0);
    await app.close();
  });
});

describe("a quantidade na Stripe acompanha a equipe", () => {
  async function assinada(app: App, cobranca: CobrancaDeMemoria) {
    const dono = await criarBarbeariaComToken(app);
    const sub = assinaturaNaStripe(dono.barbeariaId, { quantidade: 1, chave: "completo_mensal" });
    cobranca.assinaturas.set(sub.id, sub);
    await webhook(app, "customer.subscription.created", eventoDaAssinatura(sub));
    return dono;
  }

  it("incluir um profissional aumenta; desativar diminui", async () => {
    const { app, cobranca } = montar();
    const dono = await assinada(app, cobranca);

    const incluido = await app.inject({
      method: "POST",
      url: "/equipe",
      headers: auth(dono.token),
      payload: { nome: "Ana", email: "ana@exemplo.com", papel: "profissional" },
    });
    await app.inject({
      method: "PATCH",
      url: `/equipe/${incluido.json().id}`,
      headers: auth(dono.token),
      payload: { ativo: false },
    });

    expect(cobranca.quantidades).toEqual([
      { assinaturaId: "sub_1", profissionais: 2 },
      { assinaturaId: "sub_1", profissionais: 1 },
    ]);
    await app.close();
  });

  it("a recepção não mexe na quantidade", async () => {
    const { app, cobranca } = montar();
    const dono = await assinada(app, cobranca);

    await app.inject({
      method: "POST",
      url: "/equipe",
      headers: auth(dono.token),
      payload: { nome: "Bia", email: "bia@exemplo.com", papel: "recepcao" },
    });

    expect(cobranca.quantidades).toEqual([]);
    await app.close();
  });

  it("no teste, sem assinatura paga, nada vai pra Stripe", async () => {
    const { app, cobranca } = montar();
    const { token } = await criarBarbeariaComToken(app);

    await app.inject({
      method: "POST",
      url: "/equipe",
      headers: auth(token),
      payload: { nome: "Ana", email: "ana@exemplo.com", papel: "profissional" },
    });

    expect(cobranca.quantidades).toEqual([]);
    await app.close();
  });

  it("a Stripe fora do ar não desfaz a mudança na equipe", async () => {
    const { app, cobranca } = montar();
    const dono = await assinada(app, cobranca);
    cobranca.falharQuantidade = true;

    const resposta = await app.inject({
      method: "POST",
      url: "/equipe",
      headers: auth(dono.token),
      payload: { nome: "Ana", email: "ana@exemplo.com", papel: "profissional" },
    });

    expect(resposta.statusCode).toBe(201);
    expect(await prisma.barbeiro.count({ where: { barbeariaId: dono.barbeariaId } })).toBe(2);
    await app.close();
  });
});

describe("prazo do teste", () => {
  it("a assinatura copiada não mexe no fim do teste já gravado", async () => {
    const { app, cobranca } = montar();
    const { barbeariaId } = await criarBarbeariaComToken(app);
    const antes = (await lerLinha(barbeariaId)).testeTerminaEm;
    const sub = assinaturaNaStripe(barbeariaId, { status: "trialing" });
    cobranca.assinaturas.set(sub.id, sub);

    await webhook(app, "customer.subscription.created", eventoDaAssinatura(sub));

    expect(await lerLinha(barbeariaId)).toMatchObject({ situacao: "ativa", testeTerminaEm: antes });
    expect(antes!.getTime()).toBeGreaterThan(Date.now() + 13 * DIA);
    await app.close();
  });
});
