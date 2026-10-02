import { describe, expect, it } from "vitest";
import { prisma } from "@barchop/database";
import { buildApp } from "../../src/app";
import { auth, criarBarbeariaComToken } from "../helpers/barbearia";
import { criarClienteComToken } from "../helpers/cliente";

describe("GET /clientes/me", () => {
  it("devolve o cliente do token", async () => {
    const app = buildApp();
    const { slug } = await criarBarbeariaComToken(app);
    const { token, clienteId } = await criarClienteComToken(app, slug);

    const resposta = await app.inject({
      method: "GET",
      url: "/clientes/me",
      headers: auth(token),
    });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().cliente).toMatchObject({
      id: clienteId,
      nome: "João da Silva",
      temConta: true,
    });
    expect(resposta.body).not.toContain("scrypt");
  });

  it("401 sem token", async () => {
    const app = buildApp();

    const resposta = await app.inject({ method: "GET", url: "/clientes/me" });

    expect(resposta.statusCode).toBe(401);
    expect(resposta.json()).toEqual({ erro: "nao_autenticado" });
  });

  it("401 depois de o cadastro ser apagado", async () => {
    const app = buildApp();
    const { slug } = await criarBarbeariaComToken(app);
    const { token, clienteId } = await criarClienteComToken(app, slug);

    await prisma.cliente.delete({ where: { id: clienteId } });

    // O token continua com assinatura válida por 7 dias: quem invalida
    // na hora é a consulta que o hook faz.
    const resposta = await app.inject({
      method: "GET",
      url: "/clientes/me",
      headers: auth(token),
    });

    expect(resposta.statusCode).toBe(401);
  });
});

describe("PATCH /clientes/me", () => {
  it("edita nome e email", async () => {
    const app = buildApp();
    const { slug } = await criarBarbeariaComToken(app);
    const { token } = await criarClienteComToken(app, slug);

    const resposta = await app.inject({
      method: "PATCH",
      url: "/clientes/me",
      headers: auth(token),
      payload: { nome: "João S.", email: "joao@exemplo.com" },
    });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().cliente).toMatchObject({
      nome: "João S.",
      email: "joao@exemplo.com",
    });
  });

  it("normaliza o email pra minúsculas antes de gravar", async () => {
    const app = buildApp();
    const { slug } = await criarBarbeariaComToken(app);
    const { token } = await criarClienteComToken(app, slug);

    const resposta = await app.inject({
      method: "PATCH",
      url: "/clientes/me",
      headers: auth(token),
      payload: { email: "Joao@Exemplo.COM" },
    });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().cliente.email).toBe("joao@exemplo.com");
  });

  it("400 em corpo vazio", async () => {
    const app = buildApp();
    const { slug } = await criarBarbeariaComToken(app);
    const { token } = await criarClienteComToken(app, slug);

    const resposta = await app.inject({
      method: "PATCH",
      url: "/clientes/me",
      headers: auth(token),
      payload: {},
    });

    expect(resposta.statusCode).toBe(400);
  });

  it("400 ao tentar trocar o telefone, que é a chave do login", async () => {
    const app = buildApp();
    const { slug } = await criarBarbeariaComToken(app);
    const { token } = await criarClienteComToken(app, slug);

    const resposta = await app.inject({
      method: "PATCH",
      url: "/clientes/me",
      headers: auth(token),
      payload: { telefone: "11888887777" },
    });

    expect(resposta.statusCode).toBe(400);
  });

  it("mandar só o nome não mexe no email já salvo", async () => {
    const app = buildApp();
    const { slug } = await criarBarbeariaComToken(app);
    const { token } = await criarClienteComToken(app, slug);

    await app.inject({
      method: "PATCH",
      url: "/clientes/me",
      headers: auth(token),
      payload: { email: "joao@exemplo.com" },
    });

    const resposta = await app.inject({
      method: "PATCH",
      url: "/clientes/me",
      headers: auth(token),
      payload: { nome: "João S." },
    });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().cliente).toMatchObject({
      nome: "João S.",
      email: "joao@exemplo.com",
    });
  });

  it("mandar email null limpa o email salvo", async () => {
    const app = buildApp();
    const { slug } = await criarBarbeariaComToken(app);
    const { token } = await criarClienteComToken(app, slug);

    await app.inject({
      method: "PATCH",
      url: "/clientes/me",
      headers: auth(token),
      payload: { email: "joao@exemplo.com" },
    });

    const resposta = await app.inject({
      method: "PATCH",
      url: "/clientes/me",
      headers: auth(token),
      payload: { email: null },
    });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().cliente.email).toBeNull();
  });
});
