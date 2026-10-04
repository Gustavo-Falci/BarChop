import { describe, expect, it } from "vitest";
import { prisma } from "@barchop/database";
import { buildApp } from "../../src/app";
import { auth, criarBarbeariaComToken, comCodigo } from "../helpers/barbearia";

// Onda 1, bloco A: a barbearia deixa de ser "um barbeiro só" e vira
// equipe. Cada membro tem papel (dono, profissional, recepção) e diz se
// atende cliente — a recepção não aparece na agenda nem no fluxo
// público. A tabela continua `barbeiro`: o nome é histórico, o conceito
// agora é "membro da equipe".

describe("papel do membro da equipe", () => {
  it("quem cria a barbearia é o dono, e atende", async () => {
    const app = buildApp();

    const { barbeiroId } = await criarBarbeariaComToken(app);

    const membro = await prisma.barbeiro.findUniqueOrThrow({ where: { id: barbeiroId } });
    expect(membro.papel).toBe("dono");
    expect(membro.atende).toBe(true);
    await app.close();
  });

  it("o signup e o login devolvem o papel, pro painel saber o que mostrar", async () => {
    const app = buildApp();
    const signup = await app.inject({
      method: "POST",
      url: "/auth/signup",
      payload: await comCodigo({
        barbearia: { nome: "Barbearia do Gu", slug: "barbearia-do-gu" },
        barbeiro: { nome: "Gustavo", email: "gu@exemplo.com", senha: "senha-forte-123" },
      }),
    });
    expect(signup.json().barbeiro.papel).toBe("dono");

    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "gu@exemplo.com", senha: "senha-forte-123" },
    });
    expect(login.statusCode).toBe(200);
    expect(login.json().barbeiro.papel).toBe("dono");
    await app.close();
  });

  it("GET /me devolve o papel e se atende", async () => {
    const app = buildApp();
    const { token } = await criarBarbeariaComToken(app);

    const resposta = await app.inject({ method: "GET", url: "/me", headers: auth(token) });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toMatchObject({ papel: "dono", atende: true });
    await app.close();
  });

  it("membro convidado, ainda sem senha, não entra pelo login", async () => {
    // O convite cria o membro sem senha; até ele aceitar, a conta existe
    // mas não tem por onde entrar. Mesma resposta de credencial errada,
    // pra o login não dizer quem foi convidado.
    const app = buildApp();
    const { barbeariaId } = await criarBarbeariaComToken(app);
    await prisma.barbeiro.create({
      data: {
        barbeariaId,
        nome: "Convidado",
        email: "convidado@exemplo.com",
        senhaHash: null,
        papel: "profissional",
      },
    });

    const resposta = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "convidado@exemplo.com", senha: "qualquer-coisa" },
    });

    expect(resposta.statusCode).toBe(401);
    expect(resposta.json().erro).toBe("credenciais_invalidas");
    await app.close();
  });
});
