import { describe, expect, it } from "vitest";
import { buildApp } from "../../src/app";
import { auth, criarBarbeariaComToken } from "../helpers/barbearia";

describe("GET /barbearias/me", () => {
  it("devolve a barbearia do token", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");
    await criarBarbeariaComToken(app, "dois");

    const resposta = await app.inject({
      method: "GET",
      url: "/barbearias/me",
      headers: auth(um.token),
    });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual({
      id: um.barbeariaId,
      nome: "Barbearia um",
      slug: "barbearia-um",
      telefone: null,
      endereco: null,
      logoUrl: null,
      sobre: null,
    });

    await app.close();
  });

  it("recusa sem token, com 401", async () => {
    const app = buildApp();

    const resposta = await app.inject({ method: "GET", url: "/barbearias/me" });

    expect(resposta.statusCode).toBe(401);

    await app.close();
  });
});

describe("PATCH /barbearias/me/slug", () => {
  function trocarSlug(app: ReturnType<typeof buildApp>, token: string, slug: string) {
    return app.inject({
      method: "PATCH",
      url: "/barbearias/me/slug",
      headers: auth(token),
      payload: { slug },
    });
  }

  it("troca o link: o novo responde na rota pública e o antigo some", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");

    const resposta = await trocarSlug(app, um.token, "gr-barber-centro");

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().slug).toBe("gr-barber-centro");

    const novo = await app.inject({ method: "GET", url: "/barbearias/gr-barber-centro" });
    const antigo = await app.inject({ method: "GET", url: "/barbearias/barbearia-um" });
    expect(novo.statusCode).toBe(200);
    expect(antigo.statusCode).toBe(404);

    await app.close();
  });

  it("aceita o próprio slug atual sem erro", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");

    const resposta = await trocarSlug(app, um.token, "barbearia-um");

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().slug).toBe("barbearia-um");

    await app.close();
  });

  it("recusa slug de outra barbearia, com 409", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");
    await criarBarbeariaComToken(app, "dois");

    const resposta = await trocarSlug(app, um.token, "barbearia-dois");

    expect(resposta.statusCode).toBe(409);

    await app.close();
  });

  it("recusa slug reservado, com 422", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");

    const resposta = await trocarSlug(app, um.token, "admin");

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json().erro).toBe("slug_reservado");

    await app.close();
  });

  it("recusa slug fora do formato, com 400", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");

    const resposta = await trocarSlug(app, um.token, "GR Barber");

    expect(resposta.statusCode).toBe(400);

    await app.close();
  });

  it("recusa sem token, com 401", async () => {
    const app = buildApp();

    const resposta = await app.inject({
      method: "PATCH",
      url: "/barbearias/me/slug",
      payload: { slug: "qualquer-um" },
    });

    expect(resposta.statusCode).toBe(401);

    await app.close();
  });
});
