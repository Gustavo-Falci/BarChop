import { describe, expect, it } from "vitest";
import { prisma } from "@barchop/database";
import { buildApp } from "../../src/app";
import type { App } from "../../src/tipos";
import { auth, criarBarbeariaComToken, criarMembroComToken } from "../helpers/barbearia";

// Salvar a ordem que o dono arrastou (arrastar e reordenar, PR 2). A
// lista vai inteira numa chamada, não "mova X pra posição N": repetir o
// mesmo pedido dá o mesmo resultado, e dois cliques não brigam. Por isso
// ela tem que ser exatamente o conjunto da barbearia — faltando um, ele
// ficaria com uma ordem velha no meio da nova.

function criarServico(app: App, token: string, nome: string, extra: Record<string, unknown> = {}) {
  return app
    .inject({
      method: "POST",
      url: "/servicos",
      headers: auth(token),
      payload: { nome, duracaoMinutos: 30, preco: "40.00", ...extra },
    })
    .then((resposta) => resposta.json() as { id: string });
}

function salvarServicos(app: App, token: string, ids: string[]) {
  return app.inject({ method: "PUT", url: "/servicos/ordem", headers: auth(token), payload: { ids } });
}

function salvarEquipe(app: App, token: string, ids: string[]) {
  return app.inject({ method: "PUT", url: "/equipe/ordem", headers: auth(token), payload: { ids } });
}

function salvarCategorias(app: App, token: string, categorias: string[]) {
  return app.inject({
    method: "PUT",
    url: "/barbearias/me/categorias/ordem",
    headers: auth(token),
    payload: { categorias },
  });
}

async function tresServicos(app: App, token: string) {
  const corte = await criarServico(app, token, "Corte");
  const barba = await criarServico(app, token, "Barba");
  const sobrancelha = await criarServico(app, token, "Sobrancelha");
  return { corte, barba, sobrancelha };
}

describe("PUT /servicos/ordem", () => {
  it("o dono salva a ordem e as listas do painel e da página saem nela", async () => {
    const app = buildApp();
    const dono = await criarBarbeariaComToken(app);
    const { corte, barba, sobrancelha } = await tresServicos(app, dono.token);
    const nova = [sobrancelha.id, corte.id, barba.id];

    const resposta = await salvarServicos(app, dono.token, nova);

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().servicos.map((s: { id: string }) => s.id)).toEqual(nova);
    const doPainel = (await app.inject({ method: "GET", url: "/servicos", headers: auth(dono.token) })).json();
    expect(doPainel.servicos.map((s: { id: string }) => s.id)).toEqual(nova);
    const daPagina = (await app.inject({ method: "GET", url: `/barbearias/${dono.slug}/servicos` })).json();
    expect(daPagina.servicos.map((s: { id: string }) => s.id)).toEqual(nova);
    await app.close();
  });

  it("no painel, os inativos continuam depois dos ativos", async () => {
    // A tela de Serviços é onde o dono reativa o que desativou: o que
    // está fora do ar não se mistura com o que o cliente vê.
    const app = buildApp();
    const dono = await criarBarbeariaComToken(app);
    const { corte, barba, sobrancelha } = await tresServicos(app, dono.token);
    await app.inject({ method: "DELETE", url: `/servicos/${corte.id}`, headers: auth(dono.token) });

    await salvarServicos(app, dono.token, [corte.id, sobrancelha.id, barba.id]);

    const doPainel = (await app.inject({ method: "GET", url: "/servicos", headers: auth(dono.token) })).json();
    expect(doPainel.servicos.map((s: { id: string }) => s.id)).toEqual([sobrancelha.id, barba.id, corte.id]);
    await app.close();
  });

  it("recusa lista incompleta, com repetido ou com serviço de outra barbearia", async () => {
    const app = buildApp();
    const dono = await criarBarbeariaComToken(app, "uma");
    const outra = await criarBarbeariaComToken(app, "outra");
    const { corte, barba, sobrancelha } = await tresServicos(app, dono.token);
    const deFora = await criarServico(app, outra.token, "Corte");

    const incompleta = await salvarServicos(app, dono.token, [corte.id, barba.id]);
    const repetida = await salvarServicos(app, dono.token, [corte.id, barba.id, barba.id]);
    const comDeFora = await salvarServicos(app, dono.token, [corte.id, barba.id, deFora.id]);
    const aMais = await salvarServicos(app, dono.token, [corte.id, barba.id, sobrancelha.id, deFora.id]);

    for (const resposta of [incompleta, repetida, comDeFora, aMais]) {
      expect(resposta.statusCode).toBe(400);
      expect(resposta.json().erro).toBe("requisicao_invalida");
    }
    // Nada mudou, nem na outra barbearia.
    const doPainel = (await app.inject({ method: "GET", url: "/servicos", headers: auth(dono.token) })).json();
    expect(doPainel.servicos.map((s: { id: string }) => s.id)).toEqual([corte.id, barba.id, sobrancelha.id]);
    expect((await prisma.servico.findUniqueOrThrow({ where: { id: deFora.id } })).ordem).toBe(10);
    await app.close();
  });

  it("recusa id que não é uuid antes de tocar no banco", async () => {
    const app = buildApp();
    const dono = await criarBarbeariaComToken(app);

    const resposta = await salvarServicos(app, dono.token, ["nao-e-uuid"]);

    expect(resposta.statusCode).toBe(400);
    await app.close();
  });

  it("só o dono reordena", async () => {
    const app = buildApp();
    const dono = await criarBarbeariaComToken(app);
    const { corte, barba, sobrancelha } = await tresServicos(app, dono.token);
    const profissional = await criarMembroComToken(app, dono.barbeariaId, "profissional", "p1");
    const recepcao = await criarMembroComToken(app, dono.barbeariaId, "recepcao", "r1");

    for (const membro of [profissional, recepcao]) {
      const resposta = await salvarServicos(app, membro.token, [sobrancelha.id, barba.id, corte.id]);
      expect(resposta.statusCode).toBe(403);
    }
    await app.close();
  });
});

describe("PUT /equipe/ordem", () => {
  it("o dono salva a ordem e a equipe e a página saem nela", async () => {
    const app = buildApp();
    const dono = await criarBarbeariaComToken(app);
    const ana = await criarMembroComToken(app, dono.barbeariaId, "profissional", "ana");
    const bia = await criarMembroComToken(app, dono.barbeariaId, "profissional", "bia");
    const nova = [bia.barbeiroId, dono.barbeiroId, ana.barbeiroId];

    const resposta = await salvarEquipe(app, dono.token, nova);

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().membros.map((m: { id: string }) => m.id)).toEqual(nova);
    const daEquipe = (await app.inject({ method: "GET", url: "/equipe", headers: auth(dono.token) })).json();
    expect(daEquipe.membros.map((m: { id: string }) => m.id)).toEqual(nova);
    const daPagina = (await app.inject({ method: "GET", url: `/barbearias/${dono.slug}` })).json();
    expect(daPagina.barbeiros.map((b: { id: string }) => b.id)).toEqual(nova);
    await app.close();
  });

  it("no Grátis acima do limite, quem fica fora do link continua sendo o que entrou por último", async () => {
    // Reordenar é só exibição: pôr o último a entrar no topo não pode
    // tirar do link quem estava visível (lib/assinatura.ts, por criadoEm).
    const app = buildApp();
    const dono = await criarBarbeariaComToken(app);
    const fora = await criarMembroComToken(app, dono.barbeariaId, "profissional", "p1");
    await prisma.assinatura.update({
      where: { barbeariaId: dono.barbeariaId },
      data: { situacao: "gratis", testeTerminaEm: null },
    });

    await salvarEquipe(app, dono.token, [fora.barbeiroId, dono.barbeiroId]);

    const daPagina = (await app.inject({ method: "GET", url: `/barbearias/${dono.slug}` })).json();
    expect(daPagina.barbeiros.map((b: { id: string }) => b.id)).toEqual([dono.barbeiroId]);
    await app.close();
  });

  it("recusa lista incompleta, com repetido ou com membro de outra barbearia", async () => {
    const app = buildApp();
    const dono = await criarBarbeariaComToken(app, "uma");
    const outra = await criarBarbeariaComToken(app, "outra");
    const ana = await criarMembroComToken(app, dono.barbeariaId, "profissional", "ana");

    const incompleta = await salvarEquipe(app, dono.token, [ana.barbeiroId]);
    const repetida = await salvarEquipe(app, dono.token, [ana.barbeiroId, ana.barbeiroId]);
    const comDeFora = await salvarEquipe(app, dono.token, [ana.barbeiroId, outra.barbeiroId]);

    for (const resposta of [incompleta, repetida, comDeFora]) {
      expect(resposta.statusCode).toBe(400);
    }
    await app.close();
  });

  it("só o dono reordena", async () => {
    const app = buildApp();
    const dono = await criarBarbeariaComToken(app);
    const profissional = await criarMembroComToken(app, dono.barbeariaId, "profissional", "p1");

    const resposta = await salvarEquipe(app, profissional.token, [profissional.barbeiroId, dono.barbeiroId]);

    expect(resposta.statusCode).toBe(403);
    await app.close();
  });
});

describe("PUT /barbearias/me/categorias/ordem", () => {
  it("o dono salva e a barbearia devolve a lista inteira, as que faltaram no fim", async () => {
    const app = buildApp();
    const dono = await criarBarbeariaComToken(app);
    const inteira = ["infantil", "barba", "cabelo", "combo", "sobrancelha", "quimica"];

    const resposta = await salvarCategorias(app, dono.token, ["infantil", "barba"]);

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().ordemCategorias).toEqual(inteira);
    const daPagina = (await app.inject({ method: "GET", url: `/barbearias/${dono.slug}` })).json();
    expect(daPagina.ordemCategorias).toEqual(inteira);
    await app.close();
  });

  it("sem nada salvo, a página tem a ordem padrão", async () => {
    const app = buildApp();
    const dono = await criarBarbeariaComToken(app);

    const daPagina = (await app.inject({ method: "GET", url: `/barbearias/${dono.slug}` })).json();

    expect(daPagina.ordemCategorias).toEqual(["cabelo", "barba", "combo", "sobrancelha", "quimica", "infantil"]);
    await app.close();
  });

  it("recusa categoria fora da lista e repetida", async () => {
    const app = buildApp();
    const dono = await criarBarbeariaComToken(app);

    expect((await salvarCategorias(app, dono.token, ["massagem"])).statusCode).toBe(400);
    expect((await salvarCategorias(app, dono.token, ["barba", "barba"])).statusCode).toBe(400);
    await app.close();
  });

  it("só o dono reordena", async () => {
    const app = buildApp();
    const dono = await criarBarbeariaComToken(app);
    const profissional = await criarMembroComToken(app, dono.barbeariaId, "profissional", "p1");

    expect((await salvarCategorias(app, profissional.token, ["barba"])).statusCode).toBe(403);
    await app.close();
  });
});
