import { describe, expect, it } from "vitest";
import { REGRAS_PADRAO } from "@barchop/formato";
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
      logoFormato: null,
      sobre: null,
      whatsapp: null,
      instagram: null,
      comodidades: [],
      formasDePagamento: [],
      capaUrl: null,
      lembreteAntecedenciaHoras: 24,
      lembreteAtivo: true,
      areasDecididas: [],
      // As regras de agendamento, nos padrões (painel v2, marco 3).
      ...REGRAS_PADRAO,
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

// F4c (decisão do dono, 2026-10-04): o link é único pra sempre e só o
// suporte troca, aprovando um pedido do dono (solicitacao-de-link.test.ts
// e suporte.test.ts). A troca direta saiu.
describe("PATCH /barbearias/me/slug", () => {
  it("não existe mais", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");

    const resposta = await app.inject({
      method: "PATCH",
      url: "/barbearias/me/slug",
      headers: auth(um.token),
      payload: { slug: "gr-barber-centro" },
    });

    expect(resposta.statusCode).toBe(404);
    const perfil = await app.inject({ method: "GET", url: "/barbearias/barbearia-um" });
    expect(perfil.json().slug).toBe("barbearia-um");

    await app.close();
  });
});
