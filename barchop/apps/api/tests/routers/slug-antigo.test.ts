import { describe, expect, it } from "vitest";
import { buildApp } from "../../src/app";
import { auth, criarBarbeariaComToken, comCodigo } from "../helpers/barbearia";

// Trocar o link não pode quebrar o que já circulou: o link antigo foi
// pro Instagram, pro WhatsApp e pros e-mails de lembrete. A rota pública
// do perfil continua achando a barbearia pelo slug antigo e devolve o
// atual, e o site redireciona a partir dele.
function trocarSlug(app: ReturnType<typeof buildApp>, token: string, slug: string) {
  return app.inject({
    method: "PATCH",
    url: "/barbearias/me/slug",
    headers: auth(token),
    payload: { slug },
  });
}

function perfil(app: ReturnType<typeof buildApp>, slug: string) {
  return app.inject({ method: "GET", url: `/barbearias/${slug}` });
}

describe("slug antigo", () => {
  it("o slug antigo acha a barbearia e devolve o atual", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");
    await trocarSlug(app, um.token, "gr-barber-centro");

    const resposta = await perfil(app, "barbearia-um");

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().id).toBe(um.barbeariaId);
    expect(resposta.json().slug).toBe("gr-barber-centro");

    await app.close();
  });

  it("todos os slugs que a barbearia já teve continuam achando ela", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");
    await trocarSlug(app, um.token, "segundo-nome");
    await trocarSlug(app, um.token, "terceiro-nome");

    expect((await perfil(app, "barbearia-um")).json().slug).toBe("terceiro-nome");
    expect((await perfil(app, "segundo-nome")).json().slug).toBe("terceiro-nome");

    await app.close();
  });

  it("voltar ao slug anterior não deixa ele apontando pra si mesmo", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");
    await trocarSlug(app, um.token, "outro-nome");

    const volta = await trocarSlug(app, um.token, "barbearia-um");

    expect(volta.statusCode).toBe(200);
    expect((await perfil(app, "barbearia-um")).json().slug).toBe("barbearia-um");
    expect((await perfil(app, "outro-nome")).json().slug).toBe("barbearia-um");

    await app.close();
  });

  it("o slug atual de outra barbearia ganha do antigo, pelo cadastro", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");
    await trocarSlug(app, um.token, "gr-barber-centro");

    // A barbearia "dois" nasce com o slug que a "um" largou.
    const dois = await app.inject({
      method: "POST",
      url: "/auth/signup",
      payload: await comCodigo({
        barbearia: { nome: "Barbearia dois", slug: "barbearia-um" },
        barbeiro: { nome: "Barbeiro dois", email: "dois@exemplo.com", senha: "senha-forte-123" },
      }),
    });

    expect(dois.statusCode).toBe(201);
    const resposta = await perfil(app, "barbearia-um");
    expect(resposta.json().id).toBe(dois.json().barbearia.id);

    await app.close();
  });

  it("o slug atual de outra barbearia ganha do antigo, pela troca", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");
    const dois = await criarBarbeariaComToken(app, "dois");
    await trocarSlug(app, um.token, "gr-barber-centro");

    const troca = await trocarSlug(app, dois.token, "barbearia-um");

    expect(troca.statusCode).toBe(200);
    expect((await perfil(app, "barbearia-um")).json().id).toBe(dois.barbeariaId);
    // E o antigo da "dois" passa a apontar pra ela.
    expect((await perfil(app, "barbearia-dois")).json().id).toBe(dois.barbeariaId);

    await app.close();
  });

  it("troca recusada por 409 não grava o slug antigo", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");
    await criarBarbeariaComToken(app, "dois");

    const troca = await trocarSlug(app, um.token, "barbearia-dois");

    expect(troca.statusCode).toBe(409);
    expect((await perfil(app, "barbearia-um")).json().slug).toBe("barbearia-um");
    expect((await perfil(app, "barbearia-dois")).json().nome).toBe("Barbearia dois");

    await app.close();
  });

  it("as outras rotas públicas só aceitam o slug atual", async () => {
    // O site já redirecionou pro slug novo antes de chegar nelas.
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");
    await trocarSlug(app, um.token, "gr-barber-centro");

    const servicos = await app.inject({ method: "GET", url: "/barbearias/barbearia-um/servicos" });

    expect(servicos.statusCode).toBe(404);

    await app.close();
  });
});
