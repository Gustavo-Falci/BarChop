import { describe, expect, it } from "vitest";
import { prisma } from "@barchop/database";
import { buildApp } from "../../src/app";
import type { App } from "../../src/tipos";
import { comCodigo } from "../helpers/barbearia";

const CADASTRO = {
  barbearia: { nome: "Barbearia do Gu", slug: "barbearia-do-gu" },
  barbeiro: { nome: "Gustavo", email: "gu@exemplo.com", senha: "senha-forte-123" },
};

async function cadastrar(app: App) {
  const resposta = await app.inject({
    method: "POST",
    url: "/auth/signup",
    payload: await comCodigo(CADASTRO),
  });
  return resposta.json();
}

async function cadastrarEObterToken(app: App): Promise<string> {
  return (await cadastrar(app)).token;
}

describe("GET /me", () => {
  it("devolve o barbeiro do token", async () => {
    const app = buildApp();
    const token = await cadastrarEObterToken(app);

    const resposta = await app.inject({
      method: "GET",
      url: "/me",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(resposta.statusCode).toBe(200);

    const corpo = resposta.json();
    expect(corpo.nome).toBe("Gustavo");
    expect(corpo.email).toBe("gu@exemplo.com");
    expect(typeof corpo.barbeariaId).toBe("string");

    await app.close();
  });

  it("nunca devolve senhaHash", async () => {
    const app = buildApp();
    const token = await cadastrarEObterToken(app);

    const resposta = await app.inject({
      method: "GET",
      url: "/me",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(resposta.body).not.toContain("scrypt$");
    expect(resposta.json()).not.toHaveProperty("senhaHash");

    await app.close();
  });

  it("recusa requisição sem token com 401", async () => {
    const app = buildApp();
    const resposta = await app.inject({ method: "GET", url: "/me" });

    expect(resposta.statusCode).toBe(401);
    // Código de domínio, não o nome interno do @fastify/jwt.
    expect(resposta.json()).toEqual({ erro: "nao_autenticado" });

    await app.close();
  });

  it("recusa token malformado com 401", async () => {
    const app = buildApp();
    const resposta = await app.inject({
      method: "GET",
      url: "/me",
      headers: { authorization: "Bearer isso-nao-e-um-token" },
    });

    expect(resposta.statusCode).toBe(401);

    await app.close();
  });

  it("recusa token com assinatura adulterada", async () => {
    const app = buildApp();
    const token = await cadastrarEObterToken(app);

    // Um JWT é `header.payload.assinatura`. Trocar um caractere da
    // assinatura mantém a forma válida mas quebra a verificação — é o
    // que separa "token bem formado" de "token que confiamos".
    const [cabecalho, conteudo, assinatura] = token.split(".");
    const adulterado = [
      cabecalho,
      conteudo,
      assinatura.startsWith("A") ? `B${assinatura.slice(1)}` : `A${assinatura.slice(1)}`,
    ].join(".");

    const resposta = await app.inject({
      method: "GET",
      url: "/me",
      headers: { authorization: `Bearer ${adulterado}` },
    });

    expect(resposta.statusCode).toBe(401);

    await app.close();
  });

  it("recusa token válido de barbeiro desativado com 401", async () => {
    const app = buildApp();
    const token = await cadastrarEObterToken(app);

    // Desativar depois de o token ter sido emitido. Se o hook só
    // conferisse a assinatura, este token continuaria valendo — e
    // desativar um barbeiro não tiraria o acesso dele.
    await prisma.barbeiro.updateMany({ data: { ativo: false } });

    const resposta = await app.inject({
      method: "GET",
      url: "/me",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(resposta.statusCode).toBe(401);
    expect(resposta.json()).toEqual({ erro: "nao_autenticado" });

    await app.close();
  });

  it("recusa token expirado com 401", async () => {
    const app = buildApp();
    const cadastro = await cadastrar(app);

    // Mesmo segredo, mesmo payload, só o `exp` no passado: é o que
    // separa "assinatura confere" de "token ainda vale".
    //
    // O `exp` vai no payload, e não como `expiresIn: "-1s"`: o fast-jwt
    // recusa expiresIn negativo já na construção do assinante, mas
    // respeita o `exp` que vier pronto no payload em vez de recalcular
    // a partir do expiresIn do plugin.
    const payloadExpirado = {
      tipo: "barbeiro" as const,
      barbeiroId: cadastro.barbeiro.id,
      barbeariaId: cadastro.barbearia.id,
      exp: Math.floor(Date.now() / 1000) - 60,
    };
    const expirado = app.jwt.sign(payloadExpirado);

    const resposta = await app.inject({
      method: "GET",
      url: "/me",
      headers: { authorization: `Bearer ${expirado}` },
    });

    expect(resposta.statusCode).toBe(401);
    expect(resposta.json()).toEqual({ erro: "nao_autenticado" });

    await app.close();
  });
});
