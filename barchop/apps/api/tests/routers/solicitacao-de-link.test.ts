import { describe, expect, it } from "vitest";
import { buildApp } from "../../src/app";
import type { App } from "../../src/tipos";
import { auth, criarBarbeariaComToken, criarMembroComToken } from "../helpers/barbearia";

// F4 (decisão do dono, 2026-10-04): o dono não troca o link sozinho —
// pede, e o suporte avalia. Uma solicitação pendente por vez; o pedido
// já confere formato, reservado e se o link está livre, e a aprovação
// confere de novo.

function pedir(app: App, token: string, payload: object) {
  return app.inject({
    method: "POST",
    url: "/barbearias/me/solicitacao-de-link",
    headers: auth(token),
    payload,
  });
}

function ler(app: App, token: string) {
  return app.inject({ method: "GET", url: "/barbearias/me/solicitacao-de-link", headers: auth(token) });
}

describe("solicitação de troca do link", () => {
  it("o dono pede um link novo, com o motivo, e lê o pedido pendente", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");

    const resposta = await pedir(app, um.token, { slug: "gr-barber-centro", motivo: "Mudamos de endereço" });

    expect(resposta.statusCode).toBe(201);
    expect(resposta.json()).toMatchObject({
      slugPedido: "gr-barber-centro",
      motivo: "Mudamos de endereço",
      status: "pendente",
      resposta: null,
    });
    expect((await ler(app, um.token)).json().solicitacao).toMatchObject({
      slugPedido: "gr-barber-centro",
      status: "pendente",
    });

    await app.close();
  });

  it("sem pedido, a leitura devolve null", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");

    expect((await ler(app, um.token)).json()).toEqual({ solicitacao: null });

    await app.close();
  });

  it("pedir não troca o link: só o suporte troca", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");

    await pedir(app, um.token, { slug: "gr-barber-centro" });

    const perfil = await app.inject({ method: "GET", url: "/barbearias/barbearia-um" });
    expect(perfil.json().slug).toBe("barbearia-um");

    await app.close();
  });

  it("uma pendente por vez", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");
    await pedir(app, um.token, { slug: "gr-barber-centro" });

    const segunda = await pedir(app, um.token, { slug: "gr-barber-sul" });

    expect(segunda.statusCode).toBe(409);
    expect(segunda.json().erro).toBe("solicitacao_pendente");

    await app.close();
  });

  it("recusa link em uso por outra barbearia, atual ou antigo", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");
    await criarBarbeariaComToken(app, "dois");

    const atual = await pedir(app, um.token, { slug: "barbearia-dois" });

    expect(atual.statusCode).toBe(409);
    expect(atual.json().erro).toBe("conflito");

    await app.close();
  });

  it("recusa link reservado e o próprio link atual", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");

    const reservado = await pedir(app, um.token, { slug: "painel" });
    const igual = await pedir(app, um.token, { slug: "barbearia-um" });

    expect(reservado.statusCode).toBe(422);
    expect(reservado.json().erro).toBe("slug_reservado");
    expect(igual.statusCode).toBe(422);
    expect(igual.json().erro).toBe("slug_igual_ao_atual");

    await app.close();
  });

  it("recusa link fora do formato e motivo longo demais, com 400", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");

    expect((await pedir(app, um.token, { slug: "GR Barber" })).statusCode).toBe(400);
    expect((await pedir(app, um.token, { slug: "gr-barber-centro", motivo: "x".repeat(501) })).statusCode).toBe(400);

    await app.close();
  });

  it("o dono cancela o pedido pendente e pode pedir outro", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");
    await pedir(app, um.token, { slug: "gr-barber-centro" });

    const cancelado = await app.inject({
      method: "POST",
      url: "/barbearias/me/solicitacao-de-link/cancelar",
      headers: auth(um.token),
    });

    expect(cancelado.statusCode).toBe(200);
    expect(cancelado.json().status).toBe("cancelada");
    expect((await pedir(app, um.token, { slug: "gr-barber-sul" })).statusCode).toBe(201);

    await app.close();
  });

  it("cancelar sem pedido pendente responde 404", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");

    const cancelado = await app.inject({
      method: "POST",
      url: "/barbearias/me/solicitacao-de-link/cancelar",
      headers: auth(um.token),
    });

    expect(cancelado.statusCode).toBe(404);

    await app.close();
  });

  it("é do dono: profissional e recepção recebem 403", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");
    const ana = await criarMembroComToken(app, um.barbeariaId, "profissional", "ana");
    const bia = await criarMembroComToken(app, um.barbeariaId, "recepcao", "bia");

    expect((await pedir(app, ana.token, { slug: "gr-barber-centro" })).statusCode).toBe(403);
    expect((await ler(app, bia.token)).statusCode).toBe(403);

    await app.close();
  });

  it("não vê o pedido de outra barbearia", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");
    const dois = await criarBarbeariaComToken(app, "dois");
    await pedir(app, dois.token, { slug: "barbearia-dois-centro" });

    expect((await ler(app, um.token)).json().solicitacao).toBeNull();

    await app.close();
  });
});
