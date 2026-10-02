import { describe, expect, it } from "vitest";
import { prisma } from "@barchop/database";
import { buildApp } from "../../src/app";
import { auth, criarBarbeariaComToken } from "../helpers/barbearia";
import type { App } from "../../src/tipos";

const CORTE = { nome: "Corte", duracaoMinutos: 45, preco: "45.00" };

async function criarServico(app: App, token: string, dados = CORTE) {
  const resposta = await app.inject({
    method: "POST",
    url: "/servicos",
    headers: auth(token),
    payload: dados,
  });
  return resposta.json();
}

describe("PATCH /servicos/:id", () => {
  it("edita nome, duração e preço", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");
    const servico = await criarServico(app, um.token);

    const resposta = await app.inject({
      method: "PATCH",
      url: `/servicos/${servico.id}`,
      headers: auth(um.token),
      payload: { nome: "Corte + barba", duracaoMinutos: 60, preco: "70.00" },
    });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toMatchObject({
      id: servico.id,
      nome: "Corte + barba",
      duracaoMinutos: 60,
      preco: "70.00",
      ativo: true,
    });

    await app.close();
  });

  it("reativa um serviço desativado", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");
    const servico = await criarServico(app, um.token);

    await app.inject({
      method: "DELETE",
      url: `/servicos/${servico.id}`,
      headers: auth(um.token),
    });

    const resposta = await app.inject({
      method: "PATCH",
      url: `/servicos/${servico.id}`,
      headers: auth(um.token),
      payload: { ativo: true },
    });

    expect(resposta.json().ativo).toBe(true);

    await app.close();
  });

  it("devolve 404 pra serviço de outra barbearia, sem tocar nele", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");
    const outra = await criarBarbeariaComToken(app, "outra");
    const alheio = await criarServico(app, outra.token);

    const resposta = await app.inject({
      method: "PATCH",
      url: `/servicos/${alheio.id}`,
      headers: auth(um.token),
      payload: { preco: "1.00" },
    });

    // 404 e não 403: um 403 confirmaria que o id existe em algum lugar
    // da plataforma.
    expect(resposta.statusCode).toBe(404);
    expect(resposta.json().erro).toBe("nao_encontrado");

    const intacto = await prisma.servico.findUniqueOrThrow({
      where: { id: alheio.id },
    });
    expect(intacto.preco.toFixed(2)).toBe("45.00");

    await app.close();
  });

  it("devolve 404 pra id que não existe", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");

    const resposta = await app.inject({
      method: "PATCH",
      url: "/servicos/11111111-1111-4111-8111-111111111111",
      headers: auth(um.token),
      payload: { nome: "Fantasma" },
    });

    expect(resposta.statusCode).toBe(404);

    await app.close();
  });

  it("recusa id fora do formato UUID com 400", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");

    const resposta = await app.inject({
      method: "PATCH",
      url: "/servicos/nao-e-uuid",
      headers: auth(um.token),
      payload: { nome: "Qualquer" },
    });

    // Sem o pattern no schema isto viraria P2023 do Postgres — mesma
    // resposta, mas depois de uma ida ao banco.
    expect(resposta.statusCode).toBe(400);

    await app.close();
  });

  it("recusa corpo vazio com 400", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");
    const servico = await criarServico(app, um.token);

    const resposta = await app.inject({
      method: "PATCH",
      url: `/servicos/${servico.id}`,
      headers: auth(um.token),
      payload: {},
    });

    expect(resposta.statusCode).toBe(400);

    await app.close();
  });

  it("recusa requisição sem token com 401", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");
    const servico = await criarServico(app, um.token);

    const resposta = await app.inject({
      method: "PATCH",
      url: `/servicos/${servico.id}`,
      payload: { nome: "Sem token" },
    });

    expect(resposta.statusCode).toBe(401);

    await app.close();
  });
});

describe("DELETE /servicos/:id", () => {
  it("desativa sem apagar o registro", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");
    const servico = await criarServico(app, um.token);

    const resposta = await app.inject({
      method: "DELETE",
      url: `/servicos/${servico.id}`,
      headers: auth(um.token),
    });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().ativo).toBe(false);

    // Soft delete porque AgendamentoServico tem FK ON DELETE RESTRICT
    // pro serviço: apagar de verdade quebraria o histórico.
    const noBanco = await prisma.servico.findUnique({
      where: { id: servico.id },
    });
    expect(noBanco?.ativo).toBe(false);

    await app.close();
  });

  it("some da listagem pública mas continua na do barbeiro", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");
    const servico = await criarServico(app, um.token);

    await app.inject({
      method: "DELETE",
      url: `/servicos/${servico.id}`,
      headers: auth(um.token),
    });

    const publica = await app.inject({
      method: "GET",
      url: "/barbearias/barbearia-um/servicos",
    });
    expect(publica.json().servicos).toHaveLength(0);

    const doBarbeiro = await app.inject({
      method: "GET",
      url: "/servicos",
      headers: auth(um.token),
    });
    expect(doBarbeiro.json().servicos).toHaveLength(1);
    expect(doBarbeiro.json().servicos[0].ativo).toBe(false);

    await app.close();
  });

  it("é idempotente", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");
    const servico = await criarServico(app, um.token);

    await app.inject({
      method: "DELETE",
      url: `/servicos/${servico.id}`,
      headers: auth(um.token),
    });
    const segunda = await app.inject({
      method: "DELETE",
      url: `/servicos/${servico.id}`,
      headers: auth(um.token),
    });

    expect(segunda.statusCode).toBe(200);
    expect(segunda.json().ativo).toBe(false);

    await app.close();
  });

  it("devolve 404 pra serviço de outra barbearia, sem desativar", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");
    const outra = await criarBarbeariaComToken(app, "outra");
    const alheio = await criarServico(app, outra.token);

    const resposta = await app.inject({
      method: "DELETE",
      url: `/servicos/${alheio.id}`,
      headers: auth(um.token),
    });

    expect(resposta.statusCode).toBe(404);

    const intacto = await prisma.servico.findUniqueOrThrow({
      where: { id: alheio.id },
    });
    expect(intacto.ativo).toBe(true);

    await app.close();
  });

  it("recusa requisição sem token com 401", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");
    const servico = await criarServico(app, um.token);

    const resposta = await app.inject({
      method: "DELETE",
      url: `/servicos/${servico.id}`,
    });

    expect(resposta.statusCode).toBe(401);

    await app.close();
  });
});
