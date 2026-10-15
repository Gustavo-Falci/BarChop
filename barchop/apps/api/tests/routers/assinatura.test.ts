import { describe, expect, it } from "vitest";
import { prisma } from "@barchop/database";
import { CICLOS, DIAS_DE_TESTE, IDS_DOS_PLANOS, SITUACOES_DA_ASSINATURA } from "@barchop/formato";
import { buildApp } from "../../src/app";
import type { App } from "../../src/tipos";
import { auth, criarBarbeariaComToken, criarMembroComToken } from "../helpers/barbearia";

// A assinatura do BarChop (Onda 2, marco 1, PR 2): toda barbearia tem
// uma, que nasce no cadastro em teste de 14 dias com tudo liberado. A
// Stripe entra no PR 4; aqui é o banco e a leitura do painel.

const UM_DIA = 24 * 60 * 60 * 1000;

async function lerAssinatura(app: App, token: string) {
  return app.inject({ method: "GET", url: "/barbearias/me/assinatura", headers: auth(token) });
}

function definir(barbeariaId: string, data: Parameters<typeof prisma.assinatura.update>[0]["data"]) {
  return prisma.assinatura.update({ where: { barbeariaId }, data });
}

describe("no cadastro", () => {
  it("a barbearia nova nasce em teste de 14 dias", async () => {
    const app = buildApp();
    const antes = Date.now();
    const { barbeariaId } = await criarBarbeariaComToken(app);
    const depois = Date.now();

    const assinatura = await prisma.assinatura.findUniqueOrThrow({ where: { barbeariaId } });

    expect(assinatura.situacao).toBe("teste");
    const termina = assinatura.testeTerminaEm!.getTime();
    expect(termina).toBeGreaterThanOrEqual(antes + DIAS_DE_TESTE * UM_DIA);
    expect(termina).toBeLessThanOrEqual(depois + DIAS_DE_TESTE * UM_DIA);
    expect(assinatura.stripeCustomerId).toBeNull();
    expect(assinatura.stripeSubscriptionId).toBeNull();
    await app.close();
  });
});

describe("GET /barbearias/me/assinatura", () => {
  it("em teste: tudo liberado, com os dias que faltam", async () => {
    const app = buildApp();
    const { token } = await criarBarbeariaComToken(app);

    const resposta = await lerAssinatura(app, token);

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual({
      situacao: "teste",
      plano: "gratis",
      ciclo: "mensal",
      planoEfetivo: "completo",
      testeTerminaEm: expect.any(String),
      diasDeTesteRestantes: DIAS_DE_TESTE,
      periodoTerminaEm: null,
      profissionais: 1,
      limiteDeProfissionais: null,
      excedente: false,
    });
    await app.close();
  });

  it("falta menos de um dia: conta como 1", async () => {
    const app = buildApp();
    const { token, barbeariaId } = await criarBarbeariaComToken(app);
    await definir(barbeariaId, { testeTerminaEm: new Date(Date.now() + 60 * 60 * 1000) });

    const corpo = (await lerAssinatura(app, token)).json();

    expect(corpo.diasDeTesteRestantes).toBe(1);
    expect(corpo.planoEfetivo).toBe("completo");
    await app.close();
  });

  it("teste vencido: cai no Grátis, com zero dias", async () => {
    const app = buildApp();
    const { token, barbeariaId } = await criarBarbeariaComToken(app);
    await definir(barbeariaId, { testeTerminaEm: new Date(Date.now() - UM_DIA) });

    const corpo = (await lerAssinatura(app, token)).json();

    expect(corpo.situacao).toBe("teste");
    expect(corpo.planoEfetivo).toBe("gratis");
    expect(corpo.diasDeTesteRestantes).toBe(0);
    expect(corpo.limiteDeProfissionais).toBe(1);
    await app.close();
  });

  it("conta dono e profissional ativos; a recepção e quem saiu não contam", async () => {
    const app = buildApp();
    const { token, barbeariaId } = await criarBarbeariaComToken(app);
    await criarMembroComToken(app, barbeariaId, "profissional", "p1");
    const saiu = await criarMembroComToken(app, barbeariaId, "profissional", "p2");
    await criarMembroComToken(app, barbeariaId, "recepcao", "r");
    await prisma.barbeiro.update({ where: { id: saiu.barbeiroId }, data: { ativo: false } });

    const corpo = (await lerAssinatura(app, token)).json();

    expect(corpo.profissionais).toBe(2);
    await app.close();
  });

  it("no Grátis com mais profissionais que o limite: excedente", async () => {
    const app = buildApp();
    const { token, barbeariaId } = await criarBarbeariaComToken(app);
    await criarMembroComToken(app, barbeariaId, "profissional", "p1");
    await definir(barbeariaId, { situacao: "gratis", testeTerminaEm: null });

    const corpo = (await lerAssinatura(app, token)).json();

    expect(corpo).toMatchObject({
      planoEfetivo: "gratis",
      diasDeTesteRestantes: null,
      profissionais: 2,
      limiteDeProfissionais: 1,
      excedente: true,
    });
    await app.close();
  });

  it("ativa: vale o plano contratado, com o fim do período", async () => {
    const app = buildApp();
    const { token, barbeariaId } = await criarBarbeariaComToken(app);
    const fim = new Date("2026-12-01T12:00:00Z");
    await definir(barbeariaId, {
      situacao: "ativa",
      plano: "essencial",
      ciclo: "anual",
      testeTerminaEm: null,
      periodoTerminaEm: fim,
    });

    const corpo = (await lerAssinatura(app, token)).json();

    expect(corpo).toMatchObject({
      situacao: "ativa",
      plano: "essencial",
      ciclo: "anual",
      planoEfetivo: "essencial",
      diasDeTesteRestantes: null,
      periodoTerminaEm: fim.toISOString(),
      limiteDeProfissionais: 3,
      excedente: false,
    });
    await app.close();
  });

  it("no Grátis acima do limite: diz quem ficou fora do link, sem convite pendente nem quem não atende", async () => {
    const app = buildApp();
    const { token, barbeariaId } = await criarBarbeariaComToken(app);
    const fora = await criarMembroComToken(app, barbeariaId, "profissional", "p1");
    // O convite que ninguém aceitou e quem não atende também saem do
    // link, mas não perderam nada: não entram no aviso da faixa.
    await prisma.barbeiro.create({
      data: { barbeariaId, nome: "Convidado", email: "convidado@exemplo.com", papel: "profissional", atende: true },
    });
    await criarMembroComToken(app, barbeariaId, "profissional", "nao-atende").then(({ barbeiroId }) =>
      prisma.barbeiro.update({ where: { id: barbeiroId }, data: { atende: false } })
    );
    await definir(barbeariaId, { situacao: "gratis", testeTerminaEm: null });

    const corpo = (await lerAssinatura(app, token)).json();

    expect(corpo.foraDoLink).toEqual([{ id: fora.barbeiroId, nome: "Membro p1" }]);
    await app.close();
  });

  it("dentro do limite: ninguém fora do link", async () => {
    const app = buildApp();
    const { token, barbeariaId } = await criarBarbeariaComToken(app);
    await criarMembroComToken(app, barbeariaId, "profissional", "p1");

    const corpo = (await lerAssinatura(app, token)).json();

    expect(corpo.foraDoLink).toEqual([]);
    await app.close();
  });

  it("assinou durante o teste: a 1ª cobrança ainda vem no fim do período", async () => {
    const app = buildApp();
    const { token, barbeariaId } = await criarBarbeariaComToken(app);
    const fimDoTeste = new Date("2026-12-01T12:00:00.659Z");
    // Na Stripe o fim do teste é em segundos: o período termina antes
    // dos milissegundos gravados.
    await definir(barbeariaId, {
      situacao: "ativa",
      plano: "essencial",
      testeTerminaEm: fimDoTeste,
      periodoTerminaEm: new Date("2026-12-01T12:00:00Z"),
    });

    const corpo = (await lerAssinatura(app, token)).json();

    expect(corpo.primeiraCobrancaPendente).toBe(true);
    await app.close();
  });

  it("já cobrada: o período passou do fim do teste", async () => {
    const app = buildApp();
    const { token, barbeariaId } = await criarBarbeariaComToken(app);
    await definir(barbeariaId, {
      situacao: "ativa",
      plano: "essencial",
      testeTerminaEm: new Date("2026-12-01T12:00:00Z"),
      periodoTerminaEm: new Date("2027-01-01T12:00:00Z"),
    });

    const corpo = (await lerAssinatura(app, token)).json();

    expect(corpo.primeiraCobrancaPendente).toBe(false);
    await app.close();
  });

  it("em teste, sem assinar: nenhuma cobrança pendente", async () => {
    const app = buildApp();
    const { token } = await criarBarbeariaComToken(app);

    const corpo = (await lerAssinatura(app, token)).json();

    expect(corpo.primeiraCobrancaPendente).toBe(false);
    await app.close();
  });

  it("cancelada no fim do período: diz até quando vale", async () => {
    const app = buildApp();
    const { token, barbeariaId } = await criarBarbeariaComToken(app);
    const fim = new Date("2026-12-01T12:00:00Z");
    await definir(barbeariaId, {
      situacao: "ativa",
      plano: "essencial",
      testeTerminaEm: null,
      periodoTerminaEm: fim,
      cancelaEm: fim,
    });

    const corpo = (await lerAssinatura(app, token)).json();

    expect(corpo).toMatchObject({ situacao: "ativa", cancelaEm: fim.toISOString() });
    await app.close();
  });

  it("diz se o Portal existe: só depois do primeiro Checkout", async () => {
    const app = buildApp();
    const { token, barbeariaId } = await criarBarbeariaComToken(app);

    const antes = (await lerAssinatura(app, token)).json();
    await definir(barbeariaId, { stripeCustomerId: "cus_123" });
    const depois = (await lerAssinatura(app, token)).json();

    expect(antes).toMatchObject({ temPortal: false, cancelaEm: null });
    expect(depois.temPortal).toBe(true);
    await app.close();
  });

  it("não devolve os ids da Stripe", async () => {
    const app = buildApp();
    const { token, barbeariaId } = await criarBarbeariaComToken(app);
    await definir(barbeariaId, { stripeCustomerId: "cus_123", stripeSubscriptionId: "sub_123" });

    const texto = (await lerAssinatura(app, token)).body;

    expect(texto).not.toContain("cus_123");
    expect(texto).not.toContain("sub_123");
    await app.close();
  });

  it("só o dono: recepção e profissional recebem 403", async () => {
    const app = buildApp();
    const { barbeariaId } = await criarBarbeariaComToken(app);
    const recepcao = await criarMembroComToken(app, barbeariaId, "recepcao", "r");
    const profissional = await criarMembroComToken(app, barbeariaId, "profissional", "p");

    expect((await lerAssinatura(app, recepcao.token)).statusCode).toBe(403);
    expect((await lerAssinatura(app, profissional.token)).statusCode).toBe(403);
    await app.close();
  });

  it("sem token: 401", async () => {
    const app = buildApp();
    const resposta = await app.inject({ method: "GET", url: "/barbearias/me/assinatura" });
    expect(resposta.statusCode).toBe(401);
    await app.close();
  });
});

describe("o banco", () => {
  it("aceita toda opção do código, e nada fora dela", async () => {
    // As listas moram em @barchop/formato/planos e o CHECK na migration:
    // este teste é o que impede os dois de divergirem.
    const app = buildApp();
    const { barbeariaId } = await criarBarbeariaComToken(app);
    const amanha = new Date(Date.now() + UM_DIA);

    for (const plano of IDS_DOS_PLANOS) await definir(barbeariaId, { plano });
    for (const ciclo of CICLOS) await definir(barbeariaId, { ciclo });
    for (const situacao of SITUACOES_DA_ASSINATURA) await definir(barbeariaId, { situacao, testeTerminaEm: amanha });

    await expect(definir(barbeariaId, { plano: "ouro" })).rejects.toThrow();
    await expect(definir(barbeariaId, { ciclo: "semanal" })).rejects.toThrow();
    await expect(definir(barbeariaId, { situacao: "pausada" })).rejects.toThrow();
    await app.close();
  });

  it("teste sem data de fim é recusado", async () => {
    const app = buildApp();
    const { barbeariaId } = await criarBarbeariaComToken(app);

    await expect(definir(barbeariaId, { situacao: "teste", testeTerminaEm: null })).rejects.toThrow();
    await app.close();
  });

  it("profissionais contratados é pelo menos 1", async () => {
    const app = buildApp();
    const { barbeariaId } = await criarBarbeariaComToken(app);

    await definir(barbeariaId, { profissionaisContratados: 1 });
    await expect(definir(barbeariaId, { profissionaisContratados: 0 })).rejects.toThrow();
    await app.close();
  });

  it("uma assinatura por barbearia, e ela sai junto com a barbearia", async () => {
    const app = buildApp();
    const { barbeariaId } = await criarBarbeariaComToken(app);
    const amanha = new Date(Date.now() + UM_DIA);

    await expect(
      prisma.assinatura.create({ data: { barbeariaId, testeTerminaEm: amanha } })
    ).rejects.toThrow();

    await prisma.barbearia.delete({ where: { id: barbeariaId } });
    expect(await prisma.assinatura.count({ where: { barbeariaId } })).toBe(0);
    await app.close();
  });

  it("o evento da Stripe é gravado uma vez só", async () => {
    await prisma.eventoStripe.create({ data: { id: "evt_1", tipo: "invoice.paid" } });
    await expect(prisma.eventoStripe.create({ data: { id: "evt_1", tipo: "invoice.paid" } })).rejects.toThrow();
  });
});
