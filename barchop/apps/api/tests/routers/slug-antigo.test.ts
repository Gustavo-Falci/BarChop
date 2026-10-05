import { describe, expect, it } from "vitest";
import { prisma } from "@barchop/database";
import { buildApp } from "../../src/app";
import { ErroHttp } from "../../src/lib/erro-http";
import { travarSlugs, trocarSlug as trocarNaLib } from "../../src/lib/slug";
import { criarBarbeariaComToken, comCodigo } from "../helpers/barbearia";

// Trocar o link não pode quebrar o que já circulou: o link antigo foi
// pro Instagram, pro WhatsApp e pros e-mails de lembrete. A rota pública
// do perfil continua achando a barbearia pelo slug antigo e devolve o
// atual, e o site redireciona a partir dele.
// Só o suporte troca o link (F4c), aprovando um pedido; aqui a troca vai
// direto pela lib, numa transação, que é o que a aprovação faz.
async function trocarSlug(barbeariaId: string, slug: string): Promise<{ statusCode: number }> {
  try {
    await prisma.$transaction((tx) => trocarNaLib(tx, barbeariaId, slug));
    return { statusCode: 200 };
  } catch (erro) {
    if (erro instanceof ErroHttp) return { statusCode: erro.status };
    throw erro;
  }
}

function perfil(app: ReturnType<typeof buildApp>, slug: string) {
  return app.inject({ method: "GET", url: `/barbearias/${slug}` });
}

describe("slug antigo", () => {
  it("o slug antigo acha a barbearia e devolve o atual", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");
    await trocarSlug(um.barbeariaId, "gr-barber-centro");

    const resposta = await perfil(app, "barbearia-um");

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().id).toBe(um.barbeariaId);
    expect(resposta.json().slug).toBe("gr-barber-centro");

    await app.close();
  });

  it("todos os slugs que a barbearia já teve continuam achando ela", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");
    await trocarSlug(um.barbeariaId, "segundo-nome");
    await trocarSlug(um.barbeariaId, "terceiro-nome");

    expect((await perfil(app, "barbearia-um")).json().slug).toBe("terceiro-nome");
    expect((await perfil(app, "segundo-nome")).json().slug).toBe("terceiro-nome");

    await app.close();
  });

  it("voltar ao slug anterior não deixa ele apontando pra si mesmo", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");
    await trocarSlug(um.barbeariaId, "outro-nome");

    const volta = await trocarSlug(um.barbeariaId, "barbearia-um");

    expect(volta.statusCode).toBe(200);
    expect((await perfil(app, "barbearia-um")).json().slug).toBe("barbearia-um");
    expect((await perfil(app, "outro-nome")).json().slug).toBe("barbearia-um");

    await app.close();
  });

  // F4 (decisão do dono, 2026-10-04): o link é único PRA SEMPRE. O nome
  // que uma barbearia já teve continua dela — os links velhos (WhatsApp,
  // Instagram, e-mails de lembrete) nunca passam a abrir outra.
  it("o slug antigo de uma barbearia não serve pro cadastro de outra", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");
    await trocarSlug(um.barbeariaId, "gr-barber-centro");

    const dois = await app.inject({
      method: "POST",
      url: "/auth/signup",
      payload: await comCodigo({
        barbearia: { nome: "Barbearia dois", slug: "barbearia-um" },
        barbeiro: { nome: "Barbeiro dois", email: "dois@exemplo.com", senha: "senha-forte-123" },
      }),
    });

    expect(dois.statusCode).toBe(409);
    expect(dois.json().erro).toBe("conflito");
    expect((await perfil(app, "barbearia-um")).json().id).toBe(um.barbeariaId);

    await app.close();
  });

  it("o slug antigo de uma barbearia não serve pra troca de outra", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");
    const dois = await criarBarbeariaComToken(app, "dois");
    await trocarSlug(um.barbeariaId, "gr-barber-centro");

    const troca = await trocarSlug(dois.barbeariaId, "barbearia-um");

    expect(troca.statusCode).toBe(409);
    expect((await perfil(app, "barbearia-um")).json().id).toBe(um.barbeariaId);
    expect((await perfil(app, "barbearia-dois")).json().id).toBe(dois.barbeariaId);

    await app.close();
  });

  it("o cadastro recusado pelo slug antigo não gasta o código", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");
    await trocarSlug(um.barbeariaId, "gr-barber-centro");
    const corpo = await comCodigo({
      barbearia: { nome: "Barbearia dois", slug: "barbearia-um" },
      barbeiro: { nome: "Barbeiro dois", email: "dois@exemplo.com", senha: "senha-forte-123" },
    });

    await app.inject({ method: "POST", url: "/auth/signup", payload: corpo });
    const outra = await app.inject({
      method: "POST",
      url: "/auth/signup",
      payload: { ...corpo, barbearia: { nome: "Barbearia dois", slug: "barbearia-dois" } },
    });

    expect(outra.statusCode).toBe(201);

    await app.close();
  });

  it("enquanto outra transação grava um slug antigo, o cadastro com ele espera e é recusado", async () => {
    // A corrida que só a trava fecha: o suporte troca o link da "um"
    // (o antigo vai pra slug_antigo) ao mesmo tempo que alguém se
    // cadastra com ele. Sem a trava, o cadastro leria slug_antigo antes
    // do commit, não veria nada e criaria — o nome ficaria das duas.
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");

    let soltar!: () => void;
    const segurando = new Promise<void>((resolver) => (soltar = resolver));
    let travou!: () => void;
    const comATrava = new Promise<void>((resolver) => (travou = resolver));

    const troca = prisma.$transaction(
      async (tx) => {
        await travarSlugs(tx);
        await tx.slugAntigo.create({ data: { slug: "nome-disputado", barbeariaId: um.barbeariaId } });
        travou();
        await segurando;
      },
      { timeout: 10_000 }
    );

    await comATrava;
    const cadastro = app.inject({
      method: "POST",
      url: "/auth/signup",
      payload: await comCodigo({
        barbearia: { nome: "Barbearia dois", slug: "nome-disputado" },
        barbeiro: { nome: "Barbeiro dois", email: "dois@exemplo.com", senha: "senha-forte-123" },
      }),
    });
    await new Promise((resolver) => setTimeout(resolver, 300));
    soltar();
    await troca;

    expect((await cadastro).statusCode).toBe(409);

    await app.close();
  });

  it("troca recusada por 409 não grava o slug antigo", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");
    await criarBarbeariaComToken(app, "dois");

    const troca = await trocarSlug(um.barbeariaId, "barbearia-dois");

    expect(troca.statusCode).toBe(409);
    expect((await perfil(app, "barbearia-um")).json().slug).toBe("barbearia-um");
    expect((await perfil(app, "barbearia-dois")).json().nome).toBe("Barbearia dois");

    await app.close();
  });

  it("as outras rotas públicas só aceitam o slug atual", async () => {
    // O site já redirecionou pro slug novo antes de chegar nelas.
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");
    await trocarSlug(um.barbeariaId, "gr-barber-centro");

    const servicos = await app.inject({ method: "GET", url: "/barbearias/barbearia-um/servicos" });

    expect(servicos.statusCode).toBe(404);

    await app.close();
  });
});
