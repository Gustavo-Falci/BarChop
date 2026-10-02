import { describe, expect, it } from "vitest";
import { prisma } from "@barchop/database";
import { buildApp } from "../../src/app";
import { decodificarPayload } from "../helpers/decodificar-token";

const CORPO_VALIDO = {
  barbearia: { nome: "Barbearia do Gu", slug: "barbearia-do-gu" },
  barbeiro: { nome: "Gustavo", email: "gu@exemplo.com", senha: "senha-forte-123" },
};

describe("POST /auth/signup", () => {
  it("cria barbearia e barbeiro e devolve token", async () => {
    const app = buildApp();
    const resposta = await app.inject({
      method: "POST",
      url: "/auth/signup",
      payload: CORPO_VALIDO,
    });

    expect(resposta.statusCode).toBe(201);

    const corpo = resposta.json();
    expect(typeof corpo.token).toBe("string");
    expect(corpo.barbearia.slug).toBe("barbearia-do-gu");
    expect(corpo.barbeiro.email).toBe("gu@exemplo.com");

    expect(await prisma.barbearia.count()).toBe(1);
    expect(await prisma.barbeiro.count()).toBe(1);

    await app.close();
  });

  it("emite token com expiração de 7 dias", async () => {
    const app = buildApp();

    const resposta = await app.inject({
      method: "POST",
      url: "/auth/signup",
      payload: CORPO_VALIDO,
    });

    // O signup assina o token por conta própria, não reaproveita o do
    // login — então o expiresIn precisa valer aqui também, e é preciso
    // um teste separado pra provar isso.
    const payload = decodificarPayload(resposta.json().token);

    expect(typeof payload.exp).toBe("number");
    expect((payload.exp as number) - (payload.iat as number)).toBe(7 * 24 * 60 * 60);

    await app.close();
  });

  it("nunca devolve senhaHash", async () => {
    const app = buildApp();
    const resposta = await app.inject({
      method: "POST",
      url: "/auth/signup",
      payload: CORPO_VALIDO,
    });

    expect(resposta.body).not.toContain("senhaHash");
    expect(resposta.body).not.toContain("scrypt$");

    await app.close();
  });

  it("guarda a senha com hash, nunca em texto puro", async () => {
    const app = buildApp();
    await app.inject({ method: "POST", url: "/auth/signup", payload: CORPO_VALIDO });

    const barbeiro = await prisma.barbeiro.findFirstOrThrow();
    expect(barbeiro.senhaHash).not.toBe("senha-forte-123");
    expect(barbeiro.senhaHash.startsWith("scrypt$")).toBe(true);

    await app.close();
  });

  it("recusa slug fora do formato", async () => {
    const app = buildApp();
    const resposta = await app.inject({
      method: "POST",
      url: "/auth/signup",
      payload: {
        ...CORPO_VALIDO,
        barbearia: { nome: "Teste", slug: "Slug Com Espaço" },
      },
    });

    expect(resposta.statusCode).toBe(400);

    await app.close();
  });

  it("recusa senha curta demais", async () => {
    const app = buildApp();
    const resposta = await app.inject({
      method: "POST",
      url: "/auth/signup",
      payload: {
        ...CORPO_VALIDO,
        barbeiro: { ...CORPO_VALIDO.barbeiro, senha: "curta" },
      },
    });

    expect(resposta.statusCode).toBe(400);

    await app.close();
  });

  it("recusa slug já usado, com 409", async () => {
    const app = buildApp();
    await app.inject({ method: "POST", url: "/auth/signup", payload: CORPO_VALIDO });

    const segunda = await app.inject({
      method: "POST",
      url: "/auth/signup",
      payload: {
        barbearia: { nome: "Outra", slug: "barbearia-do-gu" },
        barbeiro: { nome: "Outro", email: "outro@exemplo.com", senha: "senha-forte-123" },
      },
    });

    expect(segunda.statusCode).toBe(409);

    await app.close();
  });

  it("não deixa barbearia órfã quando o barbeiro falha", async () => {
    const app = buildApp();
    await app.inject({ method: "POST", url: "/auth/signup", payload: CORPO_VALIDO });

    // Mesmo email, slug diferente: a barbearia passa, o barbeiro
    // esbarra no unique de email. A transação tem que desfazer as duas.
    const segunda = await app.inject({
      method: "POST",
      url: "/auth/signup",
      payload: {
        barbearia: { nome: "Outra", slug: "outra-barbearia" },
        barbeiro: { ...CORPO_VALIDO.barbeiro, nome: "Outro" },
      },
    });

    expect(segunda.statusCode).toBe(409);
    expect(await prisma.barbearia.count()).toBe(1);

    await app.close();
  });
});
