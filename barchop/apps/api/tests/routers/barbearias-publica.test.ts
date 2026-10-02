import { describe, expect, it } from "vitest";
import { buildApp } from "../../src/app";
import { auth, criarBarbeariaComToken } from "../helpers/barbearia";
import { prisma } from "@barchop/database";

describe("GET /barbearias/:slug", () => {
  it("devolve o perfil e os sete dias de horário, sem token", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");

    await app.inject({
      method: "PATCH",
      url: "/barbearias/me",
      headers: auth(um.token),
      payload: { telefone: "1133334444", endereco: "Rua das Tesouras, 100" },
    });
    await app.inject({
      method: "PUT",
      url: "/barbearias/me/horarios",
      headers: auth(um.token),
      payload: {
        horarios: [
          { diaSemana: 1, horaAbertura: "09:00", horaFechamento: "18:00" },
        ],
      },
    });

    // Sem cabeçalho de autorização: é o cliente chegando pelo link do
    // WhatsApp, sem conta nenhuma.
    const resposta = await app.inject({
      method: "GET",
      url: "/barbearias/barbearia-um",
    });

    expect(resposta.statusCode).toBe(200);

    const corpo = resposta.json();
    expect(corpo.nome).toBe("Barbearia um");
    expect(corpo.slug).toBe("barbearia-um");
    expect(corpo.telefone).toBe("(11) 3333-4444");
    expect(corpo.endereco).toBe("Rua das Tesouras, 100");
    expect(corpo.horarios).toHaveLength(7);
    expect(corpo.horarios[1]).toEqual({
      diaSemana: 1,
      horaAbertura: "09:00",
      horaFechamento: "18:00",
      fechado: false,
    });
    expect(corpo.horarios[0].fechado).toBe(true);

    await app.close();
  });

  it("devolve 404 pra slug que não existe", async () => {
    const app = buildApp();

    const resposta = await app.inject({
      method: "GET",
      url: "/barbearias/nao-existe",
    });

    expect(resposta.statusCode).toBe(404);
    expect(resposta.json().erro).toBe("nao_encontrado");

    await app.close();
  });

  it("recusa slug fora do formato com 400", async () => {
    const app = buildApp();

    const resposta = await app.inject({
      method: "GET",
      url: "/barbearias/SLUG_INVALIDO",
    });

    expect(resposta.statusCode).toBe(400);

    await app.close();
  });

  it("expõe só id e nome do barbeiro, sem email nem senhaHash", async () => {
    const app = buildApp();
    await criarBarbeariaComToken(app, "um");

    const resposta = await app.inject({
      method: "GET",
      url: "/barbearias/barbearia-um",
    });

    // A landing é pública: qualquer um com o link lê. O que sai aqui é
    // só o que o barbeiro quer mostrar pro cliente.
    expect(resposta.body).not.toContain("scrypt$");
    expect(resposta.body).not.toContain("um@exemplo.com");
    // Barbeiros saem, mas apenas id e nome: sem senhaHash.
    const corpo = resposta.json();
    expect(corpo).toHaveProperty("barbeiros");
    expect(corpo.barbeiros[0]).toHaveProperty("id");
    expect(corpo.barbeiros[0]).toHaveProperty("nome");
    expect(corpo.barbeiros[0]).not.toHaveProperty("senhaHash");

    await app.close();
  });

  it("devolve os barbeiros ativos, que é o que o fluxo do cliente precisa", async () => {
    const app = buildApp();
    const { slug, barbeiroId } = await criarBarbeariaComToken(app);

    const resposta = await app.inject({
      method: "GET",
      url: `/barbearias/${slug}`,
    });

    expect(resposta.statusCode).toBe(200);
    // Sem este id o cliente não consegue chamar /disponibilidade nem
    // criar agendamento: as duas rotas exigem barbeiroId.
    expect(resposta.json().barbeiros).toEqual([
      { id: barbeiroId, nome: "Barbeiro um" },
    ]);

    await app.close();
  });

  it("não devolve barbeiro desativado", async () => {
    const app = buildApp();
    const { slug, barbeiroId } = await criarBarbeariaComToken(app);

    await prisma.barbeiro.update({
      where: { id: barbeiroId },
      data: { ativo: false },
    });

    const resposta = await app.inject({
      method: "GET",
      url: `/barbearias/${slug}`,
    });

    expect(resposta.json().barbeiros).toEqual([]);

    await app.close();
  });
});
