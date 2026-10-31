import Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { prisma } from "@barchop/database";
import { fimDoCiclo } from "@barchop/formato";
import { buildApp } from "../../src/app";
import { agoraNaBarbearia, dataParaDate, dateParaData, somarDias } from "../../src/lib/horas";
import { provedoresDeMemoria, type CobrancaNoProvedor } from "../../src/lib/provedores";
import { auth, criarBarbeariaComToken, criarMembroComToken } from "../helpers/barbearia";

// O webhook da Stripe nos planos (plano pagamentos-online-stripe, PR 4).
// Sem login: quem prova a origem é a assinatura do evento
// (`stripe-signature`), conferida com o segredo que a Stripe deu ao
// criar o webhook da conexão. O que acontece com a assinatura e o caixa
// é o mesmo do Asaas (lib/webhook-dos-planos.ts, coberto em
// webhook-asaas.test.ts): aqui, a origem, os eventos da Stripe e a
// releitura.

async function cenario() {
  const provedores = provedoresDeMemoria();
  const app = buildApp({ provedores });
  const dono = await criarBarbeariaComToken(app);
  const lucas = await criarMembroComToken(app, dono.barbeariaId, "profissional", "lucas");
  await prisma.barbeiro.update({ where: { id: lucas.barbeiroId }, data: { podeVenderPlanos: true, parteDaCasa: 20 } });

  const conectar = async (token: string, provedor: "stripe" | "asaas", chave: string, daCasa: boolean) => {
    const resposta = await app.inject({
      method: "PUT",
      url: `/barbearias/me/pagamentos-online${daCasa ? "?daCasa=true" : ""}`,
      headers: auth(token),
      payload: { provedor, chave },
    });
    expect(resposta.statusCode).toBe(200);
    const conexao = await prisma.conexaoDePagamento.findFirstOrThrow({
      where: daCasa ? { barbeariaId: dono.barbeariaId, daCasa: true } : { barbeiroId: lucas.barbeiroId, daCasa: false },
    });
    const webhook = provedores.webhooks.at(-1)!;
    return { id: conexao.id, segredo: webhook.segredo ?? null, token: webhook.token };
  };
  const casa = await conectar(dono.token, "stripe", "sk_test_chave-da-casa-1234", true);
  const doLucas = await conectar(lucas.token, "asaas", "$aact_hmlg_chave-do-lucas-5678", false);

  const cliente = await prisma.cliente.create({
    data: { barbeariaId: dono.barbeariaId, nome: "Caio Rocha", telefone: "+5511999990001" },
  });
  const plano = await prisma.planoDeAssinatura.create({
    data: {
      barbeariaId: dono.barbeariaId,
      nome: "Corte ilimitado",
      ciclo: "mensal",
      precoCentavos: 12000,
      fixoPorAtendimentoCentavos: 2500,
    },
  });
  return { app, provedores, dono, casa, doLucas, cliente, plano };
}

type Cenario = Awaited<ReturnType<typeof cenario>>;

const hoje = () => agoraNaBarbearia().data;
let numero = 0;

async function assinaturaOnline(c: Cenario, opcoes: { situacao?: string; comeca?: string; termina?: string } = {}) {
  const idExterno = `sub_${++numero}`;
  c.provedores.assinaturas.set(idExterno, {
    id: idExterno,
    situacao: "ativa",
    removida: false,
    valorCentavos: c.plano.precoCentavos,
    proximoVencimento: fimDoCiclo(hoje(), "mensal"),
  });
  return prisma.assinaturaDoCliente.create({
    data: {
      barbeariaId: c.dono.barbeariaId,
      planoId: c.plano.id,
      clienteId: c.cliente.id,
      situacao: opcoes.situacao ?? "pendente",
      forma: "online",
      conexaoId: c.casa.id,
      idExterno,
      precoCentavos: c.plano.precoCentavos,
      ciclo: "mensal",
      cicloComecaEm: opcoes.comeca ? dataParaDate(opcoes.comeca) : null,
      cicloTerminaEm: opcoes.termina ? dataParaDate(opcoes.termina) : null,
    },
  });
}

// A fatura como o provedor a relê.
function fatura(c: Cenario, assinatura: { idExterno: string | null }, extra: Partial<CobrancaNoProvedor> = {}) {
  const paga = extra.situacao === undefined || extra.situacao === "paga";
  const dados: CobrancaNoProvedor = {
    id: `in_${++numero}`,
    assinaturaId: assinatura.idExterno,
    situacao: "paga",
    removida: false,
    valorCentavos: 12000,
    vencimento: hoje(),
    pagaEm: paga ? hoje() : null,
    forma: paga ? "cartao" : null,
    linkDaFatura: null,
    ...extra,
  };
  c.provedores.cobrancas.set(dados.id, dados);
  return dados;
}

// Os envelopes da Stripe, só com o que o conector lê.
const deFatura = (tipo: string, fatura: CobrancaNoProvedor, id = `evt_${++numero}`) => ({
  id,
  object: "event",
  type: tipo,
  data: { object: { id: fatura.id, object: "invoice", parent: { subscription_details: { subscription: fatura.assinaturaId } } } },
});
const deAssinatura = (tipo: string, assinaturaId: string) => ({
  id: `evt_${++numero}`,
  object: "event",
  type: tipo,
  data: { object: { id: assinaturaId, object: "subscription" } },
});
const deEstorno = (pagamentoId: string) => ({
  id: `evt_${++numero}`,
  object: "event",
  type: "charge.refunded",
  data: { object: { id: `ch_${++numero}`, object: "charge", payment_intent: pagamentoId } },
});

function enviar(c: Cenario, conexaoId: string, evento: unknown, segredo: string | null = c.casa.segredo) {
  const corpo = JSON.stringify(evento);
  return c.app.inject({
    method: "POST",
    url: `/webhooks/stripe/${conexaoId}`,
    headers: {
      "content-type": "application/json",
      ...(segredo === null ? {} : { "stripe-signature": Stripe.webhooks.generateTestHeaderString({ payload: corpo, secret: segredo }) }),
    },
    payload: corpo,
  });
}

async function notificacoesDe(barbeiroId: string) {
  return prisma.notificacao.findMany({ where: { barbeiroId, tipo: "pagamento" }, orderBy: { criadaEm: "asc" } });
}

describe("quem pode mandar eventos", () => {
  it("assinatura com outro segredo, ou sem assinatura, é 400, e nada é gravado", async () => {
    const c = await cenario();
    const assinatura = await assinaturaOnline(c);
    const evento = deFatura("invoice.paid", fatura(c, assinatura));

    expect((await enviar(c, c.casa.id, evento, "whsec_de_outro")).statusCode).toBe(400);
    expect((await enviar(c, c.casa.id, evento, null)).statusCode).toBe(400);

    expect(await prisma.eventoDoProvedor.count()).toBe(0);
    expect(await prisma.recebimentoDoPlano.count()).toBe(0);
    await c.app.close();
  });

  it("conexão desconhecida, desligada, de outro modo ou do Asaas responde 200 sem mexer em nada", async () => {
    const c = await cenario();
    const assinatura = await assinaturaOnline(c);
    const evento = deFatura("invoice.paid", fatura(c, assinatura));

    expect((await enviar(c, "00000000-0000-4000-8000-000000000000", evento)).statusCode).toBe(200);
    expect((await enviar(c, c.doLucas.id, evento)).statusCode).toBe(200);
    await prisma.conexaoDePagamento.update({ where: { id: c.casa.id }, data: { modo: "real" } });
    expect((await enviar(c, c.casa.id, evento)).statusCode).toBe(200);
    await prisma.conexaoDePagamento.update({
      where: { id: c.casa.id },
      data: { modo: "teste", desconectadaEm: new Date(), chaveCifrada: Buffer.alloc(0), segredoDoWebhookCifrado: null },
    });
    expect((await enviar(c, c.casa.id, evento)).statusCode).toBe(200);

    expect(await prisma.eventoDoProvedor.count()).toBe(0);
    expect(await prisma.recebimentoDoPlano.count()).toBe(0);
    await c.app.close();
  });

  it("a conexão da Stripe não recebe pelo endereço do Asaas", async () => {
    const c = await cenario();
    const assinatura = await assinaturaOnline(c);
    const paga = fatura(c, assinatura);

    const resposta = await c.app.inject({
      method: "POST",
      url: `/webhooks/asaas/${c.casa.id}`,
      headers: { "asaas-access-token": c.casa.token },
      payload: { id: "evt_1", event: "PAYMENT_CONFIRMED", cobrancaId: paga.id, assinaturaId: paga.assinaturaId },
    });

    expect(resposta.statusCode).toBe(200);
    expect(await prisma.eventoDoProvedor.count()).toBe(0);
    expect(await prisma.recebimentoDoPlano.count()).toBe(0);
    await c.app.close();
  });
});

describe("a fatura", () => {
  it("paga: a assinatura fica ativa, a mensalidade entra uma vez no caixa como online e avisa \"Nova assinatura\"", async () => {
    const c = await cenario();
    const assinatura = await assinaturaOnline(c);
    const paga = fatura(c, assinatura);
    const evento = deFatura("invoice.paid", paga, "evt_repetido");

    expect((await enviar(c, c.casa.id, evento)).statusCode).toBe(200);
    expect((await enviar(c, c.casa.id, evento)).statusCode).toBe(200);
    // Outro evento da mesma fatura (a Stripe pode mandar mais de um).
    expect((await enviar(c, c.casa.id, deFatura("invoice.paid", paga))).statusCode).toBe(200);

    const depois = await prisma.assinaturaDoCliente.findUniqueOrThrow({ where: { id: assinatura.id } });
    expect(depois.situacao).toBe("ativa");
    expect(dateParaData(depois.cicloTerminaEm!)).toBe(fimDoCiclo(hoje(), "mensal"));
    expect(await prisma.recebimentoDoPlano.findMany()).toEqual([
      expect.objectContaining({ idExterno: paga.id, valorCentavos: 12000, forma: "online", meio: "cartao", recebidoPorId: null }),
    ]);
    expect(await prisma.eventoDoProvedor.findMany({ select: { provedor: true } })).toEqual([
      { provedor: "stripe" },
      { provedor: "stripe" },
    ]);
    expect(await notificacoesDe(c.dono.barbeiroId)).toEqual([
      expect.objectContaining({ titulo: "Nova assinatura", texto: "Caio Rocha assinou o plano Corte ilimitado e pagou a primeira mensalidade." }),
    ]);
    await c.app.close();
  });

  it("a Stripe fora do ar na releitura é 500 sem gravar o evento; a nova entrega vale", async () => {
    const c = await cenario();
    const assinatura = await assinaturaOnline(c);
    const evento = deFatura("invoice.paid", fatura(c, assinatura));

    c.provedores.indisponivel = true;
    expect((await enviar(c, c.casa.id, evento)).statusCode).toBe(500);
    expect(await prisma.eventoDoProvedor.count()).toBe(0);

    c.provedores.indisponivel = false;
    expect((await enviar(c, c.casa.id, evento)).statusCode).toBe(200);
    expect(await prisma.recebimentoDoPlano.count()).toBe(1);
    await c.app.close();
  });

  it("a renovação que falhou deixa em atraso e avisa", async () => {
    const c = await cenario();
    const termina = somarDias(hoje(), -1);
    const assinatura = await assinaturaOnline(c, { situacao: "ativa", comeca: somarDias(termina, -30), termina });
    const vencida = fatura(c, assinatura, { situacao: "vencida", vencimento: termina });

    expect((await enviar(c, c.casa.id, deFatura("invoice.payment_failed", vencida))).statusCode).toBe(200);

    expect((await prisma.assinaturaDoCliente.findUniqueOrThrow({ where: { id: assinatura.id } })).situacao).toBe("em_atraso");
    expect(await notificacoesDe(c.dono.barbeiroId)).toEqual([expect.objectContaining({ titulo: "Pagamento em atraso" })]);
    await c.app.close();
  });

  it("o estorno chega pelo pagamento: avisa quem vende e não mexe no caixa", async () => {
    const c = await cenario();
    const assinatura = await assinaturaOnline(c);
    const paga = fatura(c, assinatura);
    await enviar(c, c.casa.id, deFatura("invoice.paid", paga));
    // O conector acha a fatura do pagamento (lerCobranca("pi_…")).
    c.provedores.cobrancas.set("pi_1", { ...paga, situacao: "estornada" });

    expect((await enviar(c, c.casa.id, deEstorno("pi_1"))).statusCode).toBe(200);

    expect(await prisma.recebimentoDoPlano.count()).toBe(1);
    expect((await notificacoesDe(c.dono.barbeiroId)).at(-1)).toMatchObject({
      titulo: "Pagamento estornado",
      texto: "A Stripe estornou a mensalidade de Caio Rocha no plano Corte ilimitado. O caixa não mudou: acerte à mão se precisar.",
    });
    await c.app.close();
  });

  it("de assinatura que o BarChop não conhece: 200, evento gravado, nada mais", async () => {
    const c = await cenario();
    const deFora = fatura(c, { idExterno: "sub_de_fora" });

    expect((await enviar(c, c.casa.id, deFatura("invoice.paid", deFora))).statusCode).toBe(200);

    expect(await prisma.eventoDoProvedor.count()).toBe(1);
    expect(await prisma.recebimentoDoPlano.count()).toBe(0);
    await c.app.close();
  });
});

describe("a assinatura na Stripe", () => {
  it("apagada, ou a incompleta que expirou, fica cancelada aqui", async () => {
    const c = await cenario();
    const apagada = await assinaturaOnline(c, { situacao: "ativa", comeca: hoje(), termina: fimDoCiclo(hoje(), "mensal") });
    c.provedores.assinaturas.set(apagada.idExterno!, { ...c.provedores.assinaturas.get(apagada.idExterno!)!, situacao: "inativa" });

    expect((await enviar(c, c.casa.id, deAssinatura("customer.subscription.deleted", apagada.idExterno!))).statusCode).toBe(200);
    expect((await prisma.assinaturaDoCliente.findUniqueOrThrow({ where: { id: apagada.id } })).situacao).toBe("cancelada");

    await prisma.assinaturaDoCliente.delete({ where: { id: apagada.id } });
    const expirada = await assinaturaOnline(c);
    c.provedores.assinaturas.set(expirada.idExterno!, { ...c.provedores.assinaturas.get(expirada.idExterno!)!, situacao: "expirada" });

    expect((await enviar(c, c.casa.id, deAssinatura("customer.subscription.updated", expirada.idExterno!))).statusCode).toBe(200);
    expect((await prisma.assinaturaDoCliente.findUniqueOrThrow({ where: { id: expirada.id } })).situacao).toBe("cancelada");
    await c.app.close();
  });

  it("atualizada e ainda ativa (atrasada, em teste) não muda", async () => {
    const c = await cenario();
    const assinatura = await assinaturaOnline(c, { situacao: "ativa", comeca: hoje(), termina: fimDoCiclo(hoje(), "mensal") });

    expect((await enviar(c, c.casa.id, deAssinatura("customer.subscription.updated", assinatura.idExterno!))).statusCode).toBe(200);

    expect((await prisma.assinaturaDoCliente.findUniqueOrThrow({ where: { id: assinatura.id } })).situacao).toBe("ativa");
    await c.app.close();
  });
});
