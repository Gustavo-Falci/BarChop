import { describe, expect, it } from "vitest";
import { prisma } from "@barchop/database";
import { buildApp } from "../../src/app";
import { auth, criarBarbeariaComToken } from "../helpers/barbearia";

describe("PATCH /me", () => {
  it("atualiza nome e telefone do barbeiro do token", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");

    const resposta = await app.inject({
      method: "PATCH",
      url: "/me",
      headers: auth(um.token),
      payload: { nome: "Gustavo Falci", telefone: "11999998888" },
    });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().nome).toBe("Gustavo Falci");
    expect(resposta.json().telefone).toBe("(11) 99999-8888");

    const noBanco = await prisma.barbeiro.findUniqueOrThrow({
      where: { id: um.barbeiroId },
    });
    expect(noBanco.nome).toBe("Gustavo Falci");

    await app.close();
  });

  it("aceita atualizar um campo só", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");

    const resposta = await app.inject({
      method: "PATCH",
      url: "/me",
      headers: auth(um.token),
      payload: { telefone: "11777776666" },
    });

    expect(resposta.statusCode).toBe(200);
    // O nome veio do signup e não pode ter sido zerado pelo PATCH
    // parcial.
    expect(resposta.json().nome).toBe("Barbeiro um");

    await app.close();
  });

  it("aceita null pra limpar o telefone", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");

    await app.inject({
      method: "PATCH",
      url: "/me",
      headers: auth(um.token),
      payload: { telefone: "11999998888" },
    });

    const resposta = await app.inject({
      method: "PATCH",
      url: "/me",
      headers: auth(um.token),
      payload: { telefone: null },
    });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().telefone).toBeNull();

    await app.close();
  });

  it("recusa corpo vazio com 400", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");

    const resposta = await app.inject({
      method: "PATCH",
      url: "/me",
      headers: auth(um.token),
      payload: {},
    });

    expect(resposta.statusCode).toBe(400);
    expect(resposta.json().erro).toBe("requisicao_invalida");

    await app.close();
  });

  it("recusa campo fora da lista de editáveis com 400", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");

    // Trocar email, senha ou barbeariaId está fora do escopo da tela de
    // Configurações — e barbeariaId por aqui seria trocar de barbearia.
    const resposta = await app.inject({
      method: "PATCH",
      url: "/me",
      headers: auth(um.token),
      payload: { nome: "Gustavo", email: "outro@exemplo.com" },
    });

    expect(resposta.statusCode).toBe(400);

    await app.close();
  });

  it("recusa nome curto demais com 400", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");

    const resposta = await app.inject({
      method: "PATCH",
      url: "/me",
      headers: auth(um.token),
      payload: { nome: "G" },
    });

    expect(resposta.statusCode).toBe(400);

    await app.close();
  });

  it("recusa requisição sem token com 401", async () => {
    const app = buildApp();

    const resposta = await app.inject({
      method: "PATCH",
      url: "/me",
      payload: { nome: "Sem Token" },
    });

    expect(resposta.statusCode).toBe(401);
    expect(resposta.json()).toEqual({ erro: "nao_autenticado" });

    await app.close();
  });

  it("nunca devolve senhaHash", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");

    const resposta = await app.inject({
      method: "PATCH",
      url: "/me",
      headers: auth(um.token),
      payload: { nome: "Gustavo" },
    });

    expect(resposta.body).not.toContain("scrypt$");
    expect(resposta.json()).not.toHaveProperty("senhaHash");

    await app.close();
  });

  it("só mexe no barbeiro do token", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");
    const outra = await criarBarbeariaComToken(app, "outra");

    await app.inject({
      method: "PATCH",
      url: "/me",
      headers: auth(um.token),
      payload: { nome: "Mudou" },
    });

    const intacto = await prisma.barbeiro.findUniqueOrThrow({
      where: { id: outra.barbeiroId },
    });
    expect(intacto.nome).toBe("Barbeiro outra");

    await app.close();
  });
});
