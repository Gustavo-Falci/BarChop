import { describe, expect, it } from "vitest";
import { prisma } from "@barchop/database";
import { buildApp } from "../../src/app";
import { assinarTokenDoLembrete } from "../../src/lib/lembrete";
import { criarOperadorDeSuporte } from "../../src/lib/suporte";
import type { App } from "../../src/tipos";
import { auth, criarBarbeariaComToken } from "../helpers/barbearia";

// F4: o suporte da plataforma avalia os pedidos de troca de link. Não é
// membro de barbearia nenhuma: conta própria (criada só por comando,
// nunca por rota), token com `tipo: "suporte"` e escopo próprio. Os
// tokens de uma identidade não abrem as rotas da outra.

const SENHA = "senha-do-suporte-123";

async function entrarNoSuporte(app: App, email = "suporte@barchop.com.br") {
  await criarOperadorDeSuporte({ nome: "Suporte", email, senha: SENHA });
  const resposta = await app.inject({
    method: "POST",
    url: "/suporte/login",
    payload: { email, senha: SENHA },
  });
  return resposta.json().token as string;
}

async function pedir(app: App, token: string, slug: string, motivo?: string) {
  return (
    await app.inject({
      method: "POST",
      url: "/barbearias/me/solicitacao-de-link",
      headers: auth(token),
      payload: motivo ? { slug, motivo } : { slug },
    })
  ).json();
}

describe("conta de suporte", () => {
  it("entra com e-mail e senha e recebe o token", async () => {
    const app = buildApp();
    await criarOperadorDeSuporte({ nome: "Suporte", email: "Suporte@BarChop.com.br", senha: SENHA });

    const resposta = await app.inject({
      method: "POST",
      url: "/suporte/login",
      payload: { email: "suporte@barchop.com.br", senha: SENHA },
    });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().operador).toEqual({
      id: expect.any(String),
      nome: "Suporte",
      email: "suporte@barchop.com.br",
    });
    expect(typeof resposta.json().token).toBe("string");

    await app.close();
  });

  it("senha errada e e-mail desconhecido respondem igual", async () => {
    const app = buildApp();
    await criarOperadorDeSuporte({ nome: "Suporte", email: "suporte@barchop.com.br", senha: SENHA });

    const errada = await app.inject({
      method: "POST",
      url: "/suporte/login",
      payload: { email: "suporte@barchop.com.br", senha: "outra-senha-qualquer" },
    });
    const desconhecido = await app.inject({
      method: "POST",
      url: "/suporte/login",
      payload: { email: "ninguem@barchop.com.br", senha: SENHA },
    });

    expect(errada.statusCode).toBe(401);
    expect(errada.json()).toEqual(desconhecido.json());
    expect(errada.json().erro).toBe("credenciais_invalidas");

    await app.close();
  });

  it("operador desativado não entra, e o token que ele tinha para de valer", async () => {
    const app = buildApp();
    const token = await entrarNoSuporte(app);
    await prisma.operadorSuporte.updateMany({ data: { ativo: false } });

    const lista = await app.inject({ method: "GET", url: "/suporte/solicitacoes", headers: auth(token) });
    const login = await app.inject({
      method: "POST",
      url: "/suporte/login",
      payload: { email: "suporte@barchop.com.br", senha: SENHA },
    });

    expect(lista.statusCode).toBe(401);
    expect(login.statusCode).toBe(401);

    await app.close();
  });

  it("a conta nasce só pela lib: e-mail repetido é recusado, senha curta também", async () => {
    await criarOperadorDeSuporte({ nome: "Suporte", email: "suporte@barchop.com.br", senha: SENHA });

    await expect(
      criarOperadorDeSuporte({ nome: "Outro", email: "SUPORTE@barchop.com.br", senha: SENHA })
    ).rejects.toThrow();
    await expect(
      criarOperadorDeSuporte({ nome: "Outro", email: "outro@barchop.com.br", senha: "curta" })
    ).rejects.toThrow(/12/);
  });
});

describe("os tokens não cruzam os escopos", () => {
  it("token de suporte não abre o painel de barbearia nenhuma", async () => {
    const app = buildApp();
    await criarBarbeariaComToken(app, "um");
    const token = await entrarNoSuporte(app);

    for (const url of ["/clientes", "/barbearias/me", "/agendamentos?data=2026-10-10", "/me"]) {
      const resposta = await app.inject({ method: "GET", url, headers: auth(token) });
      expect(resposta.statusCode, url).toBe(401);
    }

    await app.close();
  });

  it("token de barbeiro e de lembrete não abrem o suporte", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");
    await app.ready();
    const lembrete = assinarTokenDoLembrete(app, {
      agendamentoId: "00000000-0000-0000-0000-000000000000",
      expiraEm: new Date(Date.now() + 60 * 60 * 1000),
    });

    for (const token of [um.token, lembrete]) {
      const resposta = await app.inject({ method: "GET", url: "/suporte/solicitacoes", headers: auth(token) });
      expect(resposta.statusCode).toBe(401);
    }
    expect((await app.inject({ method: "GET", url: "/suporte/solicitacoes" })).statusCode).toBe(401);

    await app.close();
  });
});

describe("avaliar os pedidos", () => {
  it("lista os pendentes, mais antigos primeiro, com a barbearia", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");
    const dois = await criarBarbeariaComToken(app, "dois");
    await pedir(app, um.token, "gr-barber-centro", "Mudamos de endereço");
    await pedir(app, dois.token, "barbearia-dois-sul");
    const token = await entrarNoSuporte(app);

    const resposta = await app.inject({ method: "GET", url: "/suporte/solicitacoes", headers: auth(token) });

    expect(resposta.statusCode).toBe(200);
    const { solicitacoes } = resposta.json();
    expect(solicitacoes).toHaveLength(2);
    expect(solicitacoes[0]).toMatchObject({
      slugPedido: "gr-barber-centro",
      motivo: "Mudamos de endereço",
      status: "pendente",
      barbearia: { id: um.barbeariaId, nome: "Barbearia um", slug: "barbearia-um" },
    });

    await app.close();
  });

  it("aprovar troca o link, guarda o antigo e tira o pedido da fila", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");
    const pedido = await pedir(app, um.token, "gr-barber-centro");
    const token = await entrarNoSuporte(app);

    const aprovado = await app.inject({
      method: "POST",
      url: `/suporte/solicitacoes/${pedido.id}/aprovar`,
      headers: auth(token),
    });

    expect(aprovado.statusCode).toBe(200);
    expect(aprovado.json()).toMatchObject({ status: "aprovada", decididoEm: expect.any(String) });
    expect((await app.inject({ method: "GET", url: "/barbearias/barbearia-um" })).json().slug).toBe(
      "gr-barber-centro"
    );
    const fila = await app.inject({ method: "GET", url: "/suporte/solicitacoes", headers: auth(token) });
    expect(fila.json().solicitacoes).toEqual([]);
    const doDono = await app.inject({
      method: "GET",
      url: "/barbearias/me/solicitacao-de-link",
      headers: auth(um.token),
    });
    expect(doDono.json().solicitacao.status).toBe("aprovada");

    await app.close();
  });

  it("aprovar confere de novo: link tomado no meio do caminho dá 409 e o pedido fica pendente", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");
    const pedido = await pedir(app, um.token, "nome-disputado");
    await prisma.barbearia.update({
      where: { slug: (await criarBarbeariaComToken(app, "dois")).slug },
      data: { slug: "nome-disputado" },
    });
    const token = await entrarNoSuporte(app);

    const aprovado = await app.inject({
      method: "POST",
      url: `/suporte/solicitacoes/${pedido.id}/aprovar`,
      headers: auth(token),
    });

    expect(aprovado.statusCode).toBe(409);
    expect((await prisma.solicitacaoTrocaLink.findUniqueOrThrow({ where: { id: pedido.id } })).status).toBe(
      "pendente"
    );

    await app.close();
  });

  it("recusar guarda a resposta pro dono ler, e o link não muda", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");
    const pedido = await pedir(app, um.token, "gr-barber-centro");
    const token = await entrarNoSuporte(app);

    const recusado = await app.inject({
      method: "POST",
      url: `/suporte/solicitacoes/${pedido.id}/recusar`,
      headers: auth(token),
      payload: { resposta: "O nome lembra outra marca registrada." },
    });

    expect(recusado.statusCode).toBe(200);
    expect(recusado.json()).toMatchObject({
      status: "recusada",
      resposta: "O nome lembra outra marca registrada.",
    });
    expect((await app.inject({ method: "GET", url: "/barbearias/barbearia-um" })).json().slug).toBe("barbearia-um");

    await app.close();
  });

  it("recusar exige a resposta", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");
    const pedido = await pedir(app, um.token, "gr-barber-centro");
    const token = await entrarNoSuporte(app);

    const recusado = await app.inject({
      method: "POST",
      url: `/suporte/solicitacoes/${pedido.id}/recusar`,
      headers: auth(token),
      payload: {},
    });

    expect(recusado.statusCode).toBe(400);

    await app.close();
  });

  it("pedido já decidido ou cancelado não se decide de novo", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");
    const pedido = await pedir(app, um.token, "gr-barber-centro");
    await app.inject({
      method: "POST",
      url: "/barbearias/me/solicitacao-de-link/cancelar",
      headers: auth(um.token),
    });
    const token = await entrarNoSuporte(app);

    const aprovado = await app.inject({
      method: "POST",
      url: `/suporte/solicitacoes/${pedido.id}/aprovar`,
      headers: auth(token),
    });

    expect(aprovado.statusCode).toBe(422);
    expect(aprovado.json().erro).toBe("solicitacao_decidida");

    await app.close();
  });

  it("pedido inexistente responde 404", async () => {
    const app = buildApp();
    const token = await entrarNoSuporte(app);

    const resposta = await app.inject({
      method: "POST",
      url: "/suporte/solicitacoes/00000000-0000-0000-0000-000000000000/aprovar",
      headers: auth(token),
    });

    expect(resposta.statusCode).toBe(404);

    await app.close();
  });
});
