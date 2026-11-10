import { describe, expect, it } from "vitest";
import Stripe from "stripe";
import { prisma } from "@barchop/database";
import { fimDoPeriodoDoPix, inicioDoDiaEmSaoPaulo, precoDoPlano } from "@barchop/formato";
import { buildApp } from "../../src/app";
import {
  SEGREDO_DO_WEBHOOK_DE_TESTE,
  cobrancaDeMemoria,
  type AssinaturaNaCobranca,
  type CobrancaDeMemoria,
} from "../../src/lib/cobranca";
import type { ConfigDoPix } from "../../src/lib/pix";
import { criarOperadorDeSuporte } from "../../src/lib/suporte";
import type { App } from "../../src/tipos";
import { auth, criarBarbeariaComToken, criarMembroComToken } from "../helpers/barbearia";

// O Pix do BarChop (plano pix-do-barchop, PR 1): o dono paga o plano
// por Pix na chave do BarChop, toca "Já paguei" e o plano vale na hora,
// aguardando a conferência do Suporte. O Suporte confirma ou recusa; a
// recusa (e o "Ainda não paguei") volta a assinatura ao que era antes.
// Sem tela ainda: o PR 2 põe Faturas, o PR 3 o Suporte.

const DIA = 24 * 60 * 60 * 1000;

// Dados de mentira: nunca a chave de verdade em teste.
const PIX: ConfigDoPix = {
  chave: "pix@exemplo.com",
  nomeDoRecebedor: "BarChop Exemplo",
  cidadeDoRecebedor: "Sao Paulo",
  segredo: "segredo-do-identificador-de-teste",
};

function montar(pix: ConfigDoPix | null = PIX): { app: App; cobranca: CobrancaDeMemoria } {
  const cobranca = cobrancaDeMemoria();
  return { app: buildApp({ cobranca, pix }), cobranca };
}

const ESSENCIAL = { plano: "essencial", ciclo: "mensal", profissionais: 1 } as const;

function cotar(app: App, token: string, pedido: Record<string, unknown> = ESSENCIAL) {
  const query = new URLSearchParams(Object.entries(pedido).map(([k, v]): [string, string] => [k, String(v)])).toString();
  return app.inject({ method: "GET", url: `/barbearias/me/assinatura/pix?${query}`, headers: auth(token) });
}

function jaPaguei(app: App, token: string, pedido: Record<string, unknown> = ESSENCIAL) {
  return app.inject({
    method: "POST",
    url: "/barbearias/me/assinatura/pix",
    headers: auth(token),
    payload: pedido,
  });
}

function desfazer(app: App, token: string, id: string) {
  return app.inject({ method: "POST", url: `/barbearias/me/assinatura/pix/${id}/desfazer`, headers: auth(token) });
}

function resumo(app: App, token: string) {
  return app.inject({ method: "GET", url: "/barbearias/me/assinatura", headers: auth(token) });
}

function lerLinha(barbeariaId: string) {
  return prisma.assinatura.findUniqueOrThrow({ where: { barbeariaId } });
}

function definir(barbeariaId: string, data: Parameters<typeof prisma.assinatura.update>[0]["data"]) {
  return prisma.assinatura.update({ where: { barbeariaId }, data });
}

let emails = 0;
async function tokenDoSuporte(app: App): Promise<string> {
  emails += 1;
  const email = `suporte-${emails}@barchop.com.br`;
  await criarOperadorDeSuporte({ nome: "Suporte", email, senha: "senha-do-suporte-123" });
  const resposta = await app.inject({
    method: "POST",
    url: "/suporte/login",
    payload: { email, senha: "senha-do-suporte-123" },
  });
  return resposta.json().token;
}

function decidir(app: App, token: string, id: string, decisao: "confirmar" | "recusar", resposta?: string) {
  return app.inject({
    method: "POST",
    url: `/suporte/pix/${id}/${decisao}`,
    headers: auth(token),
    ...(decisao === "recusar" ? { payload: { resposta: resposta ?? "Não achei o Pix no extrato." } } : {}),
  });
}

describe("GET /barbearias/me/assinatura/pix (cotação)", () => {
  it("sem as variáveis do Pix, 409 pix_desligado", async () => {
    const { app } = montar(null);
    const { token } = await criarBarbeariaComToken(app);

    const resposta = await cotar(app, token);

    expect(resposta.statusCode).toBe(409);
    expect(resposta.json().erro).toBe("pix_desligado");
    await app.close();
  });

  it("no teste: o período começa no fim do teste, com o valor do plano e o QR", async () => {
    const { app } = montar();
    const { token, barbeariaId } = await criarBarbeariaComToken(app);
    const { testeTerminaEm } = await lerLinha(barbeariaId);

    const resposta = await cotar(app, token);

    expect(resposta.statusCode).toBe(200);
    const corpo = resposta.json();
    expect(corpo).toEqual({
      valorCentavos: precoDoPlano("essencial", "mensal", 1),
      periodoComecaEm: testeTerminaEm!.toISOString(),
      periodoTerminaEm: fimDoPeriodoDoPix(testeTerminaEm!, "mensal").toISOString(),
      identificador: expect.stringMatching(/^[A-HJ-NP-Z2-9]{6}$/),
      copiaECola: expect.stringMatching(/^000201.*6304[0-9A-F]{4}$/),
      recebedor: { nome: "BarChop Exemplo", chaveMascarada: "p•••@exemplo.com" },
    });
    expect(corpo.copiaECola).toContain("540544.90");
    expect(corpo.copiaECola).toContain(`0506${corpo.identificador}`);
    await app.close();
  });

  it("duas cotações seguidas dão o mesmo identificador; outro plano, outro", async () => {
    const { app } = montar();
    const { token, barbeariaId } = await criarBarbeariaComToken(app);
    await definir(barbeariaId, { situacao: "gratis", testeTerminaEm: null });

    const primeira = (await cotar(app, token)).json();
    const segunda = (await cotar(app, token)).json();
    const completo = (await cotar(app, token, { ...ESSENCIAL, plano: "completo" })).json();

    expect(segunda.identificador).toBe(primeira.identificador);
    expect(completo.identificador).not.toBe(primeira.identificador);
    await app.close();
  });

  it("no Grátis começa hoje (meia-noite de São Paulo); anual vale 12 meses com o preço anual", async () => {
    const { app } = montar();
    const { token, barbeariaId } = await criarBarbeariaComToken(app);
    await definir(barbeariaId, { situacao: "gratis", testeTerminaEm: null });
    const hoje = inicioDoDiaEmSaoPaulo(new Date());

    const corpo = (await cotar(app, token, { plano: "completo", ciclo: "anual", profissionais: 2 })).json();

    expect(corpo.valorCentavos).toBe(precoDoPlano("completo", "anual", 2));
    expect(corpo.periodoComecaEm).toBe(hoje.toISOString());
    expect(corpo.periodoTerminaEm).toBe(fimDoPeriodoDoPix(hoje, "anual").toISOString());
    await app.close();
  });

  it("teste vencido também começa hoje", async () => {
    const { app } = montar();
    const { token, barbeariaId } = await criarBarbeariaComToken(app);
    await definir(barbeariaId, { testeTerminaEm: new Date(Date.now() - DIA) });

    const corpo = (await cotar(app, token)).json();

    expect(corpo.periodoComecaEm).toBe(inicioDoDiaEmSaoPaulo(new Date()).toISOString());
    await app.close();
  });

  it("Pix vigente: o próximo começa no fim do período pago", async () => {
    const { app } = montar();
    const { token, barbeariaId } = await criarBarbeariaComToken(app);
    const fim = new Date(Date.now() + 3 * DIA);
    await definir(barbeariaId, {
      situacao: "ativa",
      forma: "pix",
      plano: "essencial",
      testeTerminaEm: null,
      periodoTerminaEm: fim,
      profissionaisContratados: 1,
    });

    const corpo = (await cotar(app, token)).json();

    expect(corpo.periodoComecaEm).toBe(fim.toISOString());
    await app.close();
  });

  it("as regras do checkout: nunca menos que a equipe, nem mais que o plano", async () => {
    const { app } = montar();
    const { token, barbeariaId } = await criarBarbeariaComToken(app);
    await criarMembroComToken(app, barbeariaId, "profissional", "dois");

    const menos = await cotar(app, token, { ...ESSENCIAL, profissionais: 1 });
    const mais = await cotar(app, token, { ...ESSENCIAL, profissionais: 4 });

    expect(menos.statusCode).toBe(422);
    expect(menos.json().erro).toBe("quantidade_menor_que_a_equipe");
    expect(mais.statusCode).toBe(422);
    expect(mais.json().erro).toBe("limite_do_plano");
    await app.close();
  });

  it("só o dono", async () => {
    const { app } = montar();
    const { barbeariaId } = await criarBarbeariaComToken(app);
    const recepcao = await criarMembroComToken(app, barbeariaId, "recepcao", "r");

    expect((await cotar(app, recepcao.token)).statusCode).toBe(403);
    expect((await jaPaguei(app, recepcao.token)).statusCode).toBe(403);
    await app.close();
  });
});

describe("cartão e Pix não se misturam (409 nos dois sentidos)", () => {
  it("cartão vivo, mesmo cancelando no fim do período: cotação e Já paguei dão 409", async () => {
    const { app } = montar();
    const { token, barbeariaId } = await criarBarbeariaComToken(app);
    await definir(barbeariaId, {
      situacao: "ativa",
      plano: "essencial",
      stripeCustomerId: "cus_x",
      stripeSubscriptionId: "sub_x",
      cancelaEm: new Date(Date.now() + 10 * DIA),
    });

    const cotacao = await cotar(app, token);
    const pago = await jaPaguei(app, token);

    expect(cotacao.statusCode).toBe(409);
    expect(cotacao.json().erro).toBe("assinatura_no_cartao");
    expect(pago.statusCode).toBe(409);
    expect(pago.json().erro).toBe("assinatura_no_cartao");
    await app.close();
  });

  it("cartão em atraso também", async () => {
    const { app } = montar();
    const { token, barbeariaId } = await criarBarbeariaComToken(app);
    await definir(barbeariaId, { situacao: "em_atraso", plano: "essencial", stripeSubscriptionId: "sub_x" });

    expect((await jaPaguei(app, token)).json().erro).toBe("assinatura_no_cartao");
    await app.close();
  });

  it("cartão cancelado de vez libera o Pix", async () => {
    const { app } = montar();
    const { token, barbeariaId } = await criarBarbeariaComToken(app);
    await definir(barbeariaId, {
      situacao: "cancelada",
      testeTerminaEm: null,
      stripeCustomerId: "cus_x",
      stripeSubscriptionId: "sub_x",
    });

    const pago = await jaPaguei(app, token);

    expect(pago.statusCode).toBe(201);
    const linha = await lerLinha(barbeariaId);
    expect(linha.stripeSubscriptionId).toBeNull();
    expect(linha.stripeCustomerId).toBe("cus_x");
    await app.close();
  });

  it("Pix vigente (ou aguardando conferência): o checkout do cartão dá 409 pix_vigente", async () => {
    const { app } = montar();
    const { token } = await criarBarbeariaComToken(app);
    await jaPaguei(app, token);

    const checkout = await app.inject({
      method: "POST",
      url: "/barbearias/me/assinatura/checkout",
      headers: auth(token),
      payload: ESSENCIAL,
    });

    expect(checkout.statusCode).toBe(409);
    expect(checkout.json().erro).toBe("pix_vigente");
    await app.close();
  });

  it("Pix vencido libera o cartão", async () => {
    const { app } = montar();
    const { token, barbeariaId } = await criarBarbeariaComToken(app);
    await definir(barbeariaId, {
      situacao: "ativa",
      forma: "pix",
      plano: "essencial",
      testeTerminaEm: null,
      periodoTerminaEm: new Date(Date.now() - DIA),
    });

    const checkout = await app.inject({
      method: "POST",
      url: "/barbearias/me/assinatura/checkout",
      headers: auth(token),
      payload: ESSENCIAL,
    });

    expect(checkout.statusCode).toBe(200);
    await app.close();
  });
});

describe("POST /barbearias/me/assinatura/pix (Já paguei)", () => {
  it("no teste: o plano vale na hora, aguardando conferência, sem mexer no fim do teste", async () => {
    const { app } = montar();
    const { token, barbeariaId } = await criarBarbeariaComToken(app);
    const antes = await lerLinha(barbeariaId);
    const cotacao = (await cotar(app, token)).json();

    const resposta = await jaPaguei(app, token);

    expect(resposta.statusCode).toBe(201);
    expect(resposta.json()).toEqual({
      id: expect.any(String),
      identificador: cotacao.identificador,
      plano: "essencial",
      ciclo: "mensal",
      profissionais: 1,
      valorCentavos: cotacao.valorCentavos,
      periodoComecaEm: cotacao.periodoComecaEm,
      periodoTerminaEm: cotacao.periodoTerminaEm,
      situacao: "aguardando",
      resposta: null,
      criadoEm: expect.any(String),
      decididoEm: null,
      copiaECola: cotacao.copiaECola,
    });

    const linha = await lerLinha(barbeariaId);
    expect(linha).toMatchObject({
      situacao: "ativa",
      forma: "pix",
      plano: "essencial",
      ciclo: "mensal",
      profissionaisContratados: 1,
      stripeSubscriptionId: null,
      cancelaEm: null,
    });
    expect(linha.periodoTerminaEm!.toISOString()).toBe(cotacao.periodoTerminaEm);
    expect(linha.testeTerminaEm).toEqual(antes.testeTerminaEm);

    const painel = (await resumo(app, token)).json();
    expect(painel).toMatchObject({ situacao: "ativa", forma: "pix", planoEfetivo: "essencial" });
    expect(painel.pix.aguardando).toMatchObject({ identificador: cotacao.identificador, situacao: "aguardando" });
    expect(painel.pix.ultimaRecusa).toBeNull();
    await app.close();
  });

  it("o valor nunca vem do corpo", async () => {
    const { app } = montar();
    const { token } = await criarBarbeariaComToken(app);

    const resposta = await jaPaguei(app, token, { ...ESSENCIAL, valorCentavos: 1 });

    expect(resposta.statusCode).toBe(400);
    await app.close();
  });

  it("um Pix em conferência por vez: o segundo dá 409 pix_em_conferencia", async () => {
    const { app } = montar();
    const { token } = await criarBarbeariaComToken(app);

    await jaPaguei(app, token);
    const segundo = await jaPaguei(app, token);

    expect(segundo.statusCode).toBe(409);
    expect(segundo.json().erro).toBe("pix_em_conferencia");
    await app.close();
  });

  it("sem as variáveis do Pix, 409 pix_desligado", async () => {
    const { app } = montar(null);
    const { token } = await criarBarbeariaComToken(app);

    expect((await jaPaguei(app, token)).json().erro).toBe("pix_desligado");
    await app.close();
  });

  it("equipe maior que o pedido: 422", async () => {
    const { app } = montar();
    const { token, barbeariaId } = await criarBarbeariaComToken(app);
    await criarMembroComToken(app, barbeariaId, "profissional", "dois");

    const resposta = await jaPaguei(app, token);

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json().erro).toBe("quantidade_menor_que_a_equipe");
    await app.close();
  });
});

describe("POST /barbearias/me/assinatura/pix/:id/desfazer (Ainda não paguei)", () => {
  it("volta ao teste com o mesmo fim, e dá pra pagar de novo com os mesmos dados", async () => {
    const { app } = montar();
    const { token, barbeariaId } = await criarBarbeariaComToken(app);
    const antes = await lerLinha(barbeariaId);
    const pago = (await jaPaguei(app, token)).json();

    const resposta = await desfazer(app, token, pago.id);

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().situacao).toBe("desfeito");
    const linha = await lerLinha(barbeariaId);
    expect(linha).toMatchObject({
      situacao: "teste",
      plano: antes.plano,
      ciclo: antes.ciclo,
      forma: "cartao",
      periodoTerminaEm: null,
      profissionaisContratados: null,
    });
    expect(linha.testeTerminaEm).toEqual(antes.testeTerminaEm);
    expect((await resumo(app, token)).json().pix.aguardando).toBeNull();

    const outraVez = await jaPaguei(app, token);
    expect(outraVez.statusCode).toBe(201);
    expect(outraVez.json().identificador).toBe(pago.identificador);
    await app.close();
  });

  it("só o aguardando, e só da própria barbearia", async () => {
    const { app } = montar();
    const um = await criarBarbeariaComToken(app, "um");
    const outra = await criarBarbeariaComToken(app, "outra");
    const pago = (await jaPaguei(app, um.token)).json();

    expect((await desfazer(app, outra.token, pago.id)).statusCode).toBe(404);

    const suporte = await tokenDoSuporte(app);
    await decidir(app, suporte, pago.id, "confirmar");
    const depois = await desfazer(app, um.token, pago.id);
    expect(depois.statusCode).toBe(422);
    expect(depois.json().erro).toBe("pix_decidido");
    await app.close();
  });
});

// PR 2: a lista "Pagamentos" de Faturas. Fica numa rota própria (o
// `GET …/faturas` segue só com as faturas da Stripe, outro formato).
describe("GET /barbearias/me/assinatura/pix/pagamentos", () => {
  function pagamentos(app: App, token: string) {
    return app.inject({ method: "GET", url: "/barbearias/me/assinatura/pix/pagamentos", headers: auth(token) });
  }

  it("do mais novo pro mais velho, sem os desfeitos, só da própria barbearia", async () => {
    const { app } = montar();
    const { token, barbeariaId } = await criarBarbeariaComToken(app);
    const outra = await criarBarbeariaComToken(app, "outra");
    await definir(barbeariaId, { situacao: "gratis", testeTerminaEm: null });
    const suporte = await tokenDoSuporte(app);

    const desfeito = (await jaPaguei(app, token)).json();
    await desfazer(app, token, desfeito.id);
    const recusado = (await jaPaguei(app, token)).json();
    await decidir(app, suporte, recusado.id, "recusar", "Não achei o Pix no extrato.");
    const confirmado = (await jaPaguei(app, token)).json();
    await decidir(app, suporte, confirmado.id, "confirmar");
    const aguardando = (await jaPaguei(app, token, { ...ESSENCIAL, profissionais: 2 })).json();
    await jaPaguei(app, outra.token);

    const resposta = await pagamentos(app, token);

    expect(resposta.statusCode).toBe(200);
    const lista = resposta.json();
    expect(lista.map((p: { id: string }) => p.id)).toEqual([aguardando.id, confirmado.id, recusado.id]);
    expect(lista.map((p: { situacao: string }) => p.situacao)).toEqual(["aguardando", "confirmado", "recusado"]);
    expect(lista[0]).toEqual(aguardando);
    expect(lista[2]).toMatchObject({ resposta: "Não achei o Pix no extrato.", decididoEm: expect.any(String) });
    await app.close();
  });

  it("sem Pix nenhum, lista vazia; com o Pix desligado também responde (sem copia e cola)", async () => {
    const ligado = montar();
    const { token } = await criarBarbeariaComToken(ligado.app);
    expect((await pagamentos(ligado.app, token)).json()).toEqual([]);
    await jaPaguei(ligado.app, token);
    await ligado.app.close();

    const desligado = montar(null);
    const resposta = await pagamentos(desligado.app, token);
    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toHaveLength(1);
    expect(resposta.json()[0].copiaECola).toBeNull();
    await desligado.app.close();
  });

  it("só o dono", async () => {
    const { app } = montar();
    const { barbeariaId } = await criarBarbeariaComToken(app);
    const recepcao = await criarMembroComToken(app, barbeariaId, "recepcao", "r");
    expect((await pagamentos(app, recepcao.token)).statusCode).toBe(403);
    await app.close();
  });
});

describe("o Suporte confere o Pix", () => {
  it("GET /suporte/pix: os aguardando, do mais velho pro mais novo, com barbearia e dono", async () => {
    const { app } = montar();
    const um = await criarBarbeariaComToken(app, "um");
    const dois = await criarBarbeariaComToken(app, "dois");
    await jaPaguei(app, um.token);
    await jaPaguei(app, dois.token, { plano: "completo", ciclo: "mensal", profissionais: 1 });
    const suporte = await tokenDoSuporte(app);

    const resposta = await app.inject({ method: "GET", url: "/suporte/pix", headers: auth(suporte) });

    expect(resposta.statusCode).toBe(200);
    const { pagamentos } = resposta.json();
    expect(pagamentos).toHaveLength(2);
    expect(pagamentos[0]).toMatchObject({
      plano: "essencial",
      situacao: "aguardando",
      barbearia: { id: um.barbeariaId, nome: "Barbearia um", slug: "barbearia-um" },
      dono: { nome: "Barbeiro um", email: "um@exemplo.com" },
    });
    expect(pagamentos[0]).not.toHaveProperty("copiaECola");
    expect(pagamentos[1].barbearia.id).toBe(dois.barbeariaId);
    await app.close();
  });

  it("sem token do suporte, 401; o token do dono não abre", async () => {
    const { app } = montar();
    const { token } = await criarBarbeariaComToken(app);

    expect((await app.inject({ method: "GET", url: "/suporte/pix" })).statusCode).toBe(401);
    expect((await app.inject({ method: "GET", url: "/suporte/pix", headers: auth(token) })).statusCode).toBe(401);
    await app.close();
  });

  it("confirmar: o pagamento fica confirmado e a assinatura segue igual", async () => {
    const { app } = montar();
    const { token, barbeariaId } = await criarBarbeariaComToken(app);
    const pago = (await jaPaguei(app, token)).json();
    const antes = await lerLinha(barbeariaId);
    const suporte = await tokenDoSuporte(app);

    const resposta = await decidir(app, suporte, pago.id, "confirmar");

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toMatchObject({ situacao: "confirmado", decididoEm: expect.any(String) });
    const depois = await lerLinha(barbeariaId);
    expect(depois).toMatchObject({ situacao: "ativa", forma: "pix", plano: "essencial" });
    expect(depois.periodoTerminaEm).toEqual(antes.periodoTerminaEm);
    expect((await resumo(app, token)).json().pix.aguardando).toBeNull();

    const outra = await decidir(app, suporte, pago.id, "confirmar");
    expect(outra.statusCode).toBe(422);
    expect(outra.json().erro).toBe("pix_decidido");
    await app.close();
  });

  it("recusar: volta ao Grátis, a resposta aparece no painel, e dá pra pagar de novo", async () => {
    const { app } = montar();
    const { token, barbeariaId } = await criarBarbeariaComToken(app);
    await definir(barbeariaId, { situacao: "gratis", testeTerminaEm: null });
    const pago = (await jaPaguei(app, token)).json();
    const suporte = await tokenDoSuporte(app);

    const resposta = await decidir(app, suporte, pago.id, "recusar", "  Não achei o Pix no extrato.  ");

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toMatchObject({ situacao: "recusado", resposta: "Não achei o Pix no extrato." });
    expect(await lerLinha(barbeariaId)).toMatchObject({
      situacao: "gratis",
      forma: "cartao",
      periodoTerminaEm: null,
      profissionaisContratados: null,
    });
    const painel = (await resumo(app, token)).json();
    expect(painel.planoEfetivo).toBe("gratis");
    expect(painel.pix).toEqual({
      aguardando: null,
      ultimaRecusa: { resposta: "Não achei o Pix no extrato.", decididoEm: expect.any(String) },
    });

    expect((await jaPaguei(app, token)).statusCode).toBe(201);
    await app.close();
  });

  it("recusar a renovação volta ao Pix anterior, com o fim de antes", async () => {
    const { app } = montar();
    const { token, barbeariaId } = await criarBarbeariaComToken(app);
    const fim = new Date(Date.now() + 3 * DIA);
    await definir(barbeariaId, {
      situacao: "ativa",
      forma: "pix",
      plano: "completo",
      testeTerminaEm: null,
      periodoTerminaEm: fim,
      profissionaisContratados: 2,
    });
    await criarMembroComToken(app, barbeariaId, "profissional", "dois");
    const pago = (await jaPaguei(app, token, { plano: "completo", ciclo: "mensal", profissionais: 2 })).json();
    expect(pago.periodoComecaEm).toBe(fim.toISOString());
    const suporte = await tokenDoSuporte(app);

    await decidir(app, suporte, pago.id, "recusar");

    const linha = await lerLinha(barbeariaId);
    expect(linha).toMatchObject({ situacao: "ativa", forma: "pix", plano: "completo", profissionaisContratados: 2 });
    expect(linha.periodoTerminaEm).toEqual(fim);
    await app.close();
  });

  it("recusar depois que o cartão assumiu: só marca o pagamento, a assinatura do cartão fica", async () => {
    const { app } = montar();
    const { token, barbeariaId } = await criarBarbeariaComToken(app);
    const pago = (await jaPaguei(app, token)).json();
    // Um Checkout aberto antes do Pix terminou depois: o webhook gravou o cartão.
    await definir(barbeariaId, {
      situacao: "ativa",
      forma: "cartao",
      plano: "completo",
      stripeSubscriptionId: "sub_novo",
      periodoTerminaEm: new Date(Date.now() + 30 * DIA),
    });
    const suporte = await tokenDoSuporte(app);

    const resposta = await decidir(app, suporte, pago.id, "recusar");

    expect(resposta.statusCode).toBe(200);
    expect(await lerLinha(barbeariaId)).toMatchObject({
      situacao: "ativa",
      forma: "cartao",
      plano: "completo",
      stripeSubscriptionId: "sub_novo",
    });
    await app.close();
  });

  it("recusar sem resposta: 400", async () => {
    const { app } = montar();
    const { token } = await criarBarbeariaComToken(app);
    const pago = (await jaPaguei(app, token)).json();
    const suporte = await tokenDoSuporte(app);

    const resposta = await app.inject({
      method: "POST",
      url: `/suporte/pix/${pago.id}/recusar`,
      headers: auth(suporte),
      payload: {},
    });

    expect(resposta.statusCode).toBe(400);
    await app.close();
  });
});

describe("o fim do período Pix vale na hora, sem esperar o cron", () => {
  it("Pix vencido cai no Grátis no resumo e tira do link quem passa do limite", async () => {
    const { app } = montar();
    const { token, barbeariaId } = await criarBarbeariaComToken(app);
    const outro = await criarMembroComToken(app, barbeariaId, "profissional", "dois");
    await definir(barbeariaId, {
      situacao: "ativa",
      forma: "pix",
      plano: "essencial",
      testeTerminaEm: null,
      periodoTerminaEm: new Date(Date.now() - 60 * 1000),
      profissionaisContratados: 2,
    });

    const painel = (await resumo(app, token)).json();

    expect(painel.situacao).toBe("ativa");
    expect(painel.planoEfetivo).toBe("gratis");
    expect(painel.limiteDeProfissionais).toBe(1);
    expect(painel.foraDoLink.map((m: { id: string }) => m.id)).toEqual([outro.barbeiroId]);
    await app.close();
  });
});

// O webhook da Stripe com a assinatura em Pix.
let sequencia = 0;
function webhook(app: App, sub: AssinaturaNaCobranca) {
  sequencia += 1;
  const objeto = { id: sub.id, object: "subscription", customer: sub.customerId, metadata: { barbeariaId: sub.barbeariaId } };
  const corpo = JSON.stringify({
    id: `evt_pix_${sequencia}`,
    object: "event",
    type: "customer.subscription.updated",
    data: { object: objeto },
  });
  return app.inject({
    method: "POST",
    url: "/stripe/webhook",
    headers: {
      "content-type": "application/json; charset=utf-8",
      "stripe-signature": Stripe.webhooks.generateTestHeaderString({ payload: corpo, secret: SEGREDO_DO_WEBHOOK_DE_TESTE }),
    },
    payload: corpo,
  });
}

function naStripe(barbeariaId: string, extra: Partial<AssinaturaNaCobranca>): AssinaturaNaCobranca {
  return {
    id: "sub_velha",
    customerId: "cus_1",
    barbeariaId,
    status: "canceled",
    chave: "essencial_mensal",
    quantidade: 1,
    periodoTerminaEm: new Date("2026-10-01T12:00:00Z"),
    cancelaEm: null,
    ...extra,
  };
}

describe("o webhook da Stripe com a assinatura em Pix", () => {
  it("evento atrasado de uma assinatura velha não derruba o Pix", async () => {
    const { app, cobranca } = montar();
    const { token, barbeariaId } = await criarBarbeariaComToken(app);
    await jaPaguei(app, token);
    const antes = await lerLinha(barbeariaId);
    const velha = naStripe(barbeariaId, { status: "canceled" });
    cobranca.assinaturas.set(velha.id, velha);

    const resposta = await webhook(app, velha);

    expect(resposta.statusCode).toBe(200);
    const depois = await lerLinha(barbeariaId);
    expect(depois).toMatchObject({ situacao: "ativa", forma: "pix", plano: "essencial", stripeSubscriptionId: null });
    expect(depois.periodoTerminaEm).toEqual(antes.periodoTerminaEm);
    await app.close();
  });

  it("cartão novo ativo depois do Pix grava forma = cartao", async () => {
    const { app, cobranca } = montar();
    const { barbeariaId } = await criarBarbeariaComToken(app);
    await definir(barbeariaId, {
      situacao: "ativa",
      forma: "pix",
      plano: "essencial",
      testeTerminaEm: null,
      periodoTerminaEm: new Date(Date.now() - DIA),
    });
    const nova = naStripe(barbeariaId, {
      id: "sub_nova",
      status: "active",
      chave: "completo_mensal",
      periodoTerminaEm: new Date(Date.now() + 30 * DIA),
    });
    cobranca.assinaturas.set(nova.id, nova);

    await webhook(app, nova);

    expect(await lerLinha(barbeariaId)).toMatchObject({
      situacao: "ativa",
      forma: "cartao",
      plano: "completo",
      stripeSubscriptionId: "sub_nova",
    });
    await app.close();
  });

  it("a equipe muda com Pix: a Stripe não é chamada", async () => {
    const { app, cobranca } = montar();
    const { token } = await criarBarbeariaComToken(app);
    await jaPaguei(app, token, { plano: "completo", ciclo: "mensal", profissionais: 1 });

    const incluido = await app.inject({
      method: "POST",
      url: "/equipe",
      headers: auth(token),
      payload: { nome: "Novo", email: "novo@exemplo.com", papel: "profissional" },
    });

    expect(incluido.statusCode).toBe(201);
    expect(cobranca.quantidades).toEqual([]);
    await app.close();
  });
});
