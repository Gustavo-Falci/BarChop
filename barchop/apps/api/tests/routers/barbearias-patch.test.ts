import { describe, expect, it } from "vitest";
import { prisma } from "@barchop/database";
import { buildApp } from "../../src/app";
import { auth, criarBarbeariaComToken } from "../helpers/barbearia";

describe("PATCH /barbearias/me", () => {
  it("atualiza os dados da barbearia do token", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");

    const resposta = await app.inject({
      method: "PATCH",
      url: "/barbearias/me",
      headers: auth(um.token),
      payload: {
        nome: "Barbearia do Gu",
        telefone: "1133334444",
        endereco: "Rua das Tesouras, 100",
        logoUrl: "https://exemplo.com/logo.png",
        sobre: "Corte na tesoura e barba na navalha.",
      },
    });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual({
      id: um.barbeariaId,
      nome: "Barbearia do Gu",
      slug: "barbearia-um",
      telefone: "(11) 3333-4444",
      endereco: "Rua das Tesouras, 100",
      logoUrl: "https://exemplo.com/logo.png",
      sobre: "Corte na tesoura e barba na navalha.",
      whatsapp: null,
      instagram: null,
      comodidades: [],
      formasDePagamento: [],
      lembreteAntecedenciaHoras: 24,
    });

    await app.close();
  });

  it("recusa trocar o slug com 400", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");

    // O slug forma o link público que o barbeiro já mandou no WhatsApp.
    // Trocar está fora do escopo desta fase — e tem que ser 400
    // explícito, não silêncio.
    const resposta = await app.inject({
      method: "PATCH",
      url: "/barbearias/me",
      headers: auth(um.token),
      payload: { slug: "outro-slug" },
    });

    expect(resposta.statusCode).toBe(400);

    await app.close();
  });

  it("recusa barbeariaId no corpo com 400", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");
    const outra = await criarBarbeariaComToken(app, "outra");

    // A regra invariante da spec: rota protegida nunca aceita
    // barbeariaId. Se aceitasse, este corpo editaria a barbearia alheia.
    const resposta = await app.inject({
      method: "PATCH",
      url: "/barbearias/me",
      headers: auth(um.token),
      payload: { nome: "Invadida", barbeariaId: outra.barbeariaId },
    });

    expect(resposta.statusCode).toBe(400);

    const intacta = await prisma.barbearia.findUniqueOrThrow({
      where: { id: outra.barbeariaId },
    });
    expect(intacta.nome).toBe("Barbearia outra");

    await app.close();
  });

  it("recusa corpo vazio com 400", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");

    const resposta = await app.inject({
      method: "PATCH",
      url: "/barbearias/me",
      headers: auth(um.token),
      payload: {},
    });

    expect(resposta.statusCode).toBe(400);

    await app.close();
  });

  it("recusa logoUrl que não é http(s) com 400", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");

    const resposta = await app.inject({
      method: "PATCH",
      url: "/barbearias/me",
      headers: auth(um.token),
      payload: { logoUrl: "javascript:alert(1)" },
    });

    expect(resposta.statusCode).toBe(400);

    await app.close();
  });

  it("recusa requisição sem token com 401", async () => {
    const app = buildApp();

    const resposta = await app.inject({
      method: "PATCH",
      url: "/barbearias/me",
      payload: { nome: "Sem Token" },
    });

    expect(resposta.statusCode).toBe(401);

    await app.close();
  });

  it("não toca na barbearia de outro token", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");
    const outra = await criarBarbeariaComToken(app, "outra");

    await app.inject({
      method: "PATCH",
      url: "/barbearias/me",
      headers: auth(um.token),
      payload: { nome: "Só a minha" },
    });

    const intacta = await prisma.barbearia.findUniqueOrThrow({
      where: { id: outra.barbeariaId },
    });
    expect(intacta.nome).toBe("Barbearia outra");

    await app.close();
  });
});
