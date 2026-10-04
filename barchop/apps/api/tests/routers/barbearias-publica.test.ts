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
    // O id é o que o passo "escolher profissional" manda pra
    // disponibilidade e pro agendamento; sem serviço cadastrado, a lista
    // do que ele faz vem vazia.
    expect(resposta.json().barbeiros).toEqual([
      { id: barbeiroId, nome: "Barbeiro um", servicoIds: [] },
    ]);

    await app.close();
  });

  it("diz que serviços cada um faz, pro passo do profissional filtrar", async () => {
    // Bloco C: o cliente escolhe os serviços antes do profissional, e a
    // tela só oferece quem faz todos eles.
    const app = buildApp();
    const um = await criarBarbeariaComToken(app);
    const criar = async (nome: string) =>
      (
        await app.inject({
          method: "POST",
          url: "/servicos",
          headers: auth(um.token),
          payload: { nome, duracaoMinutos: 30, preco: "40.00" },
        })
      ).json().id as string;
    const corte = await criar("Corte");
    const barba = await criar("Barba");
    await app.inject({
      method: "PUT",
      url: `/equipe/${um.barbeiroId}/servicos`,
      headers: auth(um.token),
      payload: { servicoIds: [corte] },
    });

    const resposta = await app.inject({ method: "GET", url: `/barbearias/${um.slug}` });

    expect(resposta.json().barbeiros[0].servicoIds).toEqual([corte]);
    expect(resposta.json().barbeiros[0].servicoIds).not.toContain(barba);
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

  it("só quem atende e já entrou: sem recepção e sem convite pendente, o dono primeiro", async () => {
    // O fluxo público usa o primeiro da lista até o bloco C. A ordem é
    // a de entrada na equipe, não o nome: um "Abel" contratado depois
    // não pode tomar os agendamentos de quem abriu a barbearia.
    const app = buildApp();
    const { slug, barbeiroId, barbeariaId } = await criarBarbeariaComToken(app);
    const outros = [
      { nome: "Abel recepção", papel: "recepcao" as const, atende: false, senhaHash: "x" },
      { nome: "Abel convidado", papel: "profissional" as const, atende: true, senhaHash: null },
      { nome: "Abel profissional", papel: "profissional" as const, atende: true, senhaHash: "x" },
    ];
    for (const [i, outro] of outros.entries()) {
      await prisma.barbeiro.create({
        data: { barbeariaId, email: `abel${i}@exemplo.com`, ...outro },
      });
    }

    const resposta = await app.inject({ method: "GET", url: `/barbearias/${slug}` });

    expect(resposta.json().barbeiros.map((b: { nome: string }) => b.nome)).toEqual([
      "Barbeiro um",
      "Abel profissional",
    ]);
    expect(resposta.json().barbeiros[0].id).toBe(barbeiroId);
    await app.close();
  });
});
