import { randomBytes, scryptSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { prisma } from "@barchop/database";
import { buildApp } from "../../src/app";
import { conferirSenha, obterHashDescartavel } from "../../src/lib/senha";
import { decodificarPayload } from "../helpers/decodificar-token";
import type { App } from "../../src/tipos";
import { comCodigo } from "../helpers/barbearia";

const CADASTRO = {
  barbearia: { nome: "Barbearia do Gu", slug: "barbearia-do-gu" },
  barbeiro: { nome: "Gustavo", email: "gu@exemplo.com", senha: "senha-forte-123" },
};

async function cadastrar(app: App) {
  await app.inject({ method: "POST", url: "/auth/signup", payload: await comCodigo(CADASTRO) });
}

describe("POST /auth/login", () => {
  it("devolve token com email e senha corretos", async () => {
    const app = buildApp();
    await cadastrar(app);

    const resposta = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "gu@exemplo.com", senha: "senha-forte-123" },
    });

    expect(resposta.statusCode).toBe(200);
    expect(typeof resposta.json().token).toBe("string");

    await app.close();
  });

  it("recusa senha errada com 401", async () => {
    const app = buildApp();
    await cadastrar(app);

    const resposta = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "gu@exemplo.com", senha: "senha-errada-123" },
    });

    expect(resposta.statusCode).toBe(401);
    // Fixar o corpo, não só o status: sem isto o teste passaria mesmo
    // se a rota devolvesse {} ou outro código.
    expect(resposta.json()).toEqual({ erro: "credenciais_invalidas" });

    await app.close();
  });

  it("dá a mesma resposta pra email inexistente e senha errada", async () => {
    const app = buildApp();
    await cadastrar(app);

    const senhaErrada = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "gu@exemplo.com", senha: "senha-errada-123" },
    });

    const emailInexistente = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "ninguem@exemplo.com", senha: "senha-forte-123" },
    });

    // Respostas idênticas: confirmar qual dos dois errou entregaria
    // quais emails existem na plataforma.
    expect(emailInexistente.statusCode).toBe(senhaErrada.statusCode);
    expect(emailInexistente.json()).toEqual(senhaErrada.json());

    await app.close();
  });

  it("nunca devolve senhaHash", async () => {
    const app = buildApp();
    await cadastrar(app);

    const resposta = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "gu@exemplo.com", senha: "senha-forte-123" },
    });

    expect(resposta.body).not.toContain("scrypt$");

    await app.close();
  });

  it("recusa barbeiro desativado com a mesma resposta", async () => {
    const app = buildApp();
    await cadastrar(app);
    await prisma.barbeiro.updateMany({ data: { ativo: false } });

    const resposta = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "gu@exemplo.com", senha: "senha-forte-123" },
    });

    // Senha certa, conta desligada: mesma resposta de credencial
    // inválida, pra não confirmar que a conta existe.
    expect(resposta.statusCode).toBe(401);
    expect(resposta.json()).toEqual({ erro: "credenciais_invalidas" });

    await app.close();
  });

  it("entra com o email em outra caixa da que cadastrou", async () => {
    const app = buildApp();
    await app.inject({
      method: "POST",
      url: "/auth/signup",
      payload: await comCodigo({
        ...CADASTRO,
        barbeiro: { ...CADASTRO.barbeiro, email: "Gu@Exemplo.com" },
      }),
    });

    // A coluna é VARCHAR com unique simples: sem normalizar nos dois
    // lados, este login não acharia a conta que o signup acabou de
    // criar — e o barbeiro ficaria trancado do lado de fora.
    const resposta = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "gu@exemplo.com", senha: "senha-forte-123" },
    });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().barbeiro.email).toBe("gu@exemplo.com");

    await app.close();
  });

  it("emite token com expiração de 7 dias", async () => {
    const app = buildApp();
    await cadastrar(app);

    const resposta = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "gu@exemplo.com", senha: "senha-forte-123" },
    });

    // O teste de token expirado prova que o verificador recusa um exp no
    // passado. Este prova o outro lado: que os tokens que a gente emite
    // de fato têm exp. Sem ele, tirar o expiresIn do registro do plugin
    // devolveria tokens eternos sem nenhum teste falhar.
    const payload = decodificarPayload(resposta.json().token);

    expect(typeof payload.exp).toBe("number");
    expect((payload.exp as number) - (payload.iat as number)).toBe(7 * 24 * 60 * 60);

    await app.close();
  });

  it("o hash descartável é bem formado, senão o atalho volta", async () => {
    // O hash descartável só fecha o vazamento de tempo se o
    // conferirSenha realmente derivar contra ele. Malformado, ele sairia
    // pelo atalho de validação de formato sem derivar nada — e o login
    // de email inexistente voltaria a responder mais rápido que o de
    // senha errada. Medir tempo daria teste instável; o que dá pra
    // afirmar sem instabilidade é o formato, que é o que sustenta a
    // propriedade.
    const descartavel = await obterHashDescartavel();
    const partes = descartavel.split("$");

    // scrypt$<parâmetros>$<salt>$<hash>, o formato desde 15/11.
    expect(partes).toHaveLength(4);
    expect(partes[0]).toBe("scrypt");
    expect(Buffer.from(partes[3], "base64")).toHaveLength(64);
    expect(await conferirSenha("qualquer-senha", descartavel)).toBe(false);
  });

  it("o login que dá certo regrava o hash do formato antigo, sem derrubar a sessão", async () => {
    // SEC-015: o custo do scrypt subiu, e é no login certo — único
    // instante com a senha em texto na mão — que o hash antigo migra.
    // Ninguém redefine senha, e o token emitido antes continua valendo:
    // a senha não mudou.
    const app = buildApp();
    await cadastrar(app);
    const entrar = () =>
      app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email: CADASTRO.barbeiro.email, senha: CADASTRO.barbeiro.senha },
      });
    const anterior = (await entrar()).json().token as string;
    const salt = randomBytes(16);
    const antigo = `scrypt$${salt.toString("base64")}$${scryptSync(CADASTRO.barbeiro.senha, salt, 64).toString("base64")}`;
    await prisma.barbeiro.update({
      where: { email: CADASTRO.barbeiro.email },
      data: { senhaHash: antigo },
    });

    const resposta = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: CADASTRO.barbeiro.email, senha: CADASTRO.barbeiro.senha },
    });

    expect(resposta.statusCode).toBe(200);
    const { senhaHash, senhaAlteradaEm } = await prisma.barbeiro.findUniqueOrThrow({
      where: { email: CADASTRO.barbeiro.email },
    });
    expect(senhaHash).not.toBe(antigo);
    expect(senhaHash!.split("$")).toHaveLength(4);
    expect(await conferirSenha(CADASTRO.barbeiro.senha, senhaHash!)).toBe(true);
    expect(senhaAlteradaEm).toBeNull();
    const comOAnterior = await app.inject({
      method: "GET",
      url: "/me",
      headers: { authorization: `Bearer ${anterior}` },
    });
    expect(comOAnterior.statusCode).toBe(200);
    await app.close();
  });

  it("senha errada não regrava nada", async () => {
    const app = buildApp();
    await cadastrar(app);
    const salt = randomBytes(16);
    const antigo = `scrypt$${salt.toString("base64")}$${scryptSync(CADASTRO.barbeiro.senha, salt, 64).toString("base64")}`;
    await prisma.barbeiro.update({ where: { email: CADASTRO.barbeiro.email }, data: { senhaHash: antigo } });

    const resposta = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: CADASTRO.barbeiro.email, senha: "senha-errada-123" },
    });

    expect(resposta.statusCode).toBe(401);
    expect((await prisma.barbeiro.findUniqueOrThrow({ where: { email: CADASTRO.barbeiro.email } })).senhaHash).toBe(antigo);
    await app.close();
  });
});
