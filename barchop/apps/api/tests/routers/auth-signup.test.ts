import { describe, expect, it } from "vitest";
import { prisma } from "@barchop/database";
import { buildApp } from "../../src/app";
import { decodificarPayload } from "../helpers/decodificar-token";
import { comCodigo } from "../helpers/barbearia";

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
      payload: await comCodigo(CORPO_VALIDO),
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
      payload: await comCodigo(CORPO_VALIDO),
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
      payload: await comCodigo(CORPO_VALIDO),
    });

    expect(resposta.body).not.toContain("senhaHash");
    expect(resposta.body).not.toContain("scrypt$");

    await app.close();
  });

  it("guarda a senha com hash, nunca em texto puro", async () => {
    const app = buildApp();
    await app.inject({ method: "POST", url: "/auth/signup", payload: await comCodigo(CORPO_VALIDO) });

    const barbeiro = await prisma.barbeiro.findFirstOrThrow();
    expect(barbeiro.senhaHash).not.toBe("senha-forte-123");
    expect(barbeiro.senhaHash?.startsWith("scrypt$")).toBe(true);

    await app.close();
  });

  it("recusa slug fora do formato", async () => {
    const app = buildApp();
    const resposta = await app.inject({
      method: "POST",
      url: "/auth/signup",
      payload: await comCodigo({
        ...CORPO_VALIDO,
        barbearia: { nome: "Teste", slug: "Slug Com Espaço" },
      }),
    });

    expect(resposta.statusCode).toBe(400);

    await app.close();
  });

  it("recusa slug reservado pelo sistema, com 422 e sem criar nada", async () => {
    // `painel` passa no pattern, mas é rota do sistema: aceito, a
    // barbearia ficaria com um link público inalcançável.
    const app = buildApp();
    const resposta = await app.inject({
      method: "POST",
      url: "/auth/signup",
      payload: await comCodigo({
        ...CORPO_VALIDO,
        barbearia: { nome: "Teste", slug: "painel" },
      }),
    });

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json().erro).toBe("slug_reservado");
    expect(await prisma.barbearia.count({ where: { slug: "painel" } })).toBe(0);

    await app.close();
  });

  it("recusa senha curta demais", async () => {
    const app = buildApp();
    const resposta = await app.inject({
      method: "POST",
      url: "/auth/signup",
      payload: await comCodigo({
        ...CORPO_VALIDO,
        barbeiro: { ...CORPO_VALIDO.barbeiro, senha: "curta" },
      }),
    });

    expect(resposta.statusCode).toBe(400);

    await app.close();
  });

  it("recusa slug já usado, com 409", async () => {
    const app = buildApp();
    await app.inject({ method: "POST", url: "/auth/signup", payload: await comCodigo(CORPO_VALIDO) });

    const segunda = await app.inject({
      method: "POST",
      url: "/auth/signup",
      payload: await comCodigo({
        barbearia: { nome: "Outra", slug: "barbearia-do-gu" },
        barbeiro: { nome: "Outro", email: "outro@exemplo.com", senha: "senha-forte-123" },
      }),
    });

    expect(segunda.statusCode).toBe(409);

    await app.close();
  });

  it("não deixa barbearia órfã quando o barbeiro falha", async () => {
    const app = buildApp();
    await app.inject({ method: "POST", url: "/auth/signup", payload: await comCodigo(CORPO_VALIDO) });

    // Mesmo email, slug diferente: a barbearia passa, o barbeiro
    // esbarra no unique de email. A transação tem que desfazer as duas.
    const segunda = await app.inject({
      method: "POST",
      url: "/auth/signup",
      payload: await comCodigo({
        barbearia: { nome: "Outra", slug: "outra-barbearia" },
        barbeiro: { ...CORPO_VALIDO.barbeiro, nome: "Outro" },
      }),
    });

    expect(segunda.statusCode).toBe(409);
    expect(await prisma.barbearia.count()).toBe(1);

    await app.close();
  });
});

// Home nova, marco 1: todo cadastro conta; o que veio da home (o link
// "Criar barbearia" da home leva ?origem=home) conta também à parte.
describe("POST /auth/signup — contagem", () => {
  async function contagens() {
    const linhas = await prisma.contagemDoSite.findMany();
    return Object.fromEntries(linhas.map((linha) => [linha.evento, linha.total]));
  }

  it("sem origem, conta só o cadastro", async () => {
    const app = buildApp();
    const resposta = await app.inject({ method: "POST", url: "/auth/signup", payload: await comCodigo(CORPO_VALIDO) });

    expect(resposta.statusCode).toBe(201);
    expect(await contagens()).toEqual({ cadastro: 1 });

    await app.close();
  });

  it("vindo da home, conta o cadastro e o cadastro da home", async () => {
    const app = buildApp();
    const resposta = await app.inject({
      method: "POST",
      url: "/auth/signup",
      payload: { ...(await comCodigo(CORPO_VALIDO)), origem: "home" },
    });

    expect(resposta.statusCode).toBe(201);
    expect(await contagens()).toEqual({ cadastro: 1, cadastro_da_home: 1 });

    await app.close();
  });

  it("origem desconhecida → 400, sem criar nem contar", async () => {
    const app = buildApp();
    const resposta = await app.inject({
      method: "POST",
      url: "/auth/signup",
      payload: { ...(await comCodigo(CORPO_VALIDO)), origem: "instagram" },
    });

    expect(resposta.statusCode).toBe(400);
    expect(await prisma.barbearia.count()).toBe(0);
    expect(await contagens()).toEqual({});

    await app.close();
  });

  it("cadastro que falha não conta", async () => {
    const app = buildApp();
    await app.inject({ method: "POST", url: "/auth/signup", payload: await comCodigo(CORPO_VALIDO) });
    const segunda = await app.inject({
      method: "POST",
      url: "/auth/signup",
      payload: {
        ...(await comCodigo({
          barbearia: { nome: "Outra", slug: "barbearia-do-gu" },
          barbeiro: { nome: "Outro", email: "outro@exemplo.com", senha: "senha-forte-123" },
        })),
        origem: "home",
      },
    });

    expect(segunda.statusCode).toBe(409);
    expect(await contagens()).toEqual({ cadastro: 1 });

    await app.close();
  });
});
