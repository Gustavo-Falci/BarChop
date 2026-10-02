import { describe, expect, it } from "vitest";
import { buildApp } from "../../src/app";
import { auth, criarBarbeariaComToken } from "../helpers/barbearia";

const CORTE = { nome: "Corte", duracaoMinutos: 45, preco: "45.00" };

describe("POST /servicos", () => {
  it("cria o serviço na barbearia do token", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");

    const resposta = await app.inject({
      method: "POST",
      url: "/servicos",
      headers: auth(um.token),
      payload: CORTE,
    });

    expect(resposta.statusCode).toBe(201);

    const corpo = resposta.json();
    expect(corpo.nome).toBe("Corte");
    expect(corpo.duracaoMinutos).toBe(45);
    // String, não number: o Decimal do Prisma viraria `{}` no JSON, e
    // float perderia centavo.
    expect(corpo.preco).toBe("45.00");
    expect(corpo.ativo).toBe(true);
    expect(typeof corpo.id).toBe("string");

    await app.close();
  });

  it("completa a segunda casa do preço", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");

    const resposta = await app.inject({
      method: "POST",
      url: "/servicos",
      headers: auth(um.token),
      payload: { nome: "Barba", duracaoMinutos: 20, preco: "30.5" },
    });

    expect(resposta.json().preco).toBe("30.50");

    await app.close();
  });

  it("normaliza preço mandado como número", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");

    const resposta = await app.inject({
      method: "POST",
      url: "/servicos",
      headers: auth(um.token),
      payload: { ...CORTE, preco: 45 },
    });

    // O AJV do Fastify roda com `coerceTypes` ligado — que é o que faz
    // params e query string, sempre texto, chegarem tipados nas rotas.
    // O efeito colateral aqui é que o número 45 vira "45" antes do
    // pattern. Não é problema: o valor entra no banco como Decimal e
    // volta com as duas casas. O que o pattern barra de verdade é o
    // preço malformado — ver o caso abaixo.
    expect(resposta.statusCode).toBe(201);
    expect(resposta.json().preco).toBe("45.00");

    await app.close();
  });

  it("recusa preço com mais de duas casas com 400", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");

    const resposta = await app.inject({
      method: "POST",
      url: "/servicos",
      headers: auth(um.token),
      payload: { ...CORTE, preco: "45.999" },
    });

    // Centavo não tem terceira casa: aceitar seria deixar o banco
    // arredondar em silêncio e o barbeiro ver um preço que não digitou.
    expect(resposta.statusCode).toBe(400);

    await app.close();
  });

  it("recusa duração fora da faixa com 400", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");

    const zerada = await app.inject({
      method: "POST",
      url: "/servicos",
      headers: auth(um.token),
      payload: { ...CORTE, duracaoMinutos: 0 },
    });
    expect(zerada.statusCode).toBe(400);

    // Duração que passa o dia inteiro corromperia o hora_fim do
    // agendamento na fase 4.
    const gigante = await app.inject({
      method: "POST",
      url: "/servicos",
      headers: auth(um.token),
      payload: { ...CORTE, duracaoMinutos: 2000 },
    });
    expect(gigante.statusCode).toBe(400);

    await app.close();
  });

  it("recusa barbeariaId no corpo com 400", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");
    const outra = await criarBarbeariaComToken(app, "outra");

    const resposta = await app.inject({
      method: "POST",
      url: "/servicos",
      headers: auth(um.token),
      payload: { ...CORTE, barbeariaId: outra.barbeariaId },
    });

    expect(resposta.statusCode).toBe(400);

    await app.close();
  });

  it("recusa requisição sem token com 401", async () => {
    const app = buildApp();

    const resposta = await app.inject({
      method: "POST",
      url: "/servicos",
      payload: CORTE,
    });

    expect(resposta.statusCode).toBe(401);

    await app.close();
  });
});

describe("GET /servicos", () => {
  it("lista só os serviços da barbearia do token", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");
    const outra = await criarBarbeariaComToken(app, "outra");

    await app.inject({
      method: "POST",
      url: "/servicos",
      headers: auth(um.token),
      payload: CORTE,
    });
    await app.inject({
      method: "POST",
      url: "/servicos",
      headers: auth(outra.token),
      payload: { nome: "Serviço da outra", duracaoMinutos: 30, preco: "20.00" },
    });

    const resposta = await app.inject({
      method: "GET",
      url: "/servicos",
      headers: auth(um.token),
    });

    expect(resposta.statusCode).toBe(200);

    const { servicos } = resposta.json();
    expect(servicos).toHaveLength(1);
    expect(servicos[0].nome).toBe("Corte");

    await app.close();
  });

  it("devolve lista vazia pra barbearia sem serviço", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");

    const resposta = await app.inject({
      method: "GET",
      url: "/servicos",
      headers: auth(um.token),
    });

    expect(resposta.json()).toEqual({ servicos: [] });

    await app.close();
  });

  it("recusa requisição sem token com 401", async () => {
    const app = buildApp();

    const resposta = await app.inject({ method: "GET", url: "/servicos" });

    expect(resposta.statusCode).toBe(401);

    await app.close();
  });
});

describe("GET /barbearias/:slug/servicos", () => {
  it("lista os ativos da barbearia do slug, com o preço serializado", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");

    await app.inject({
      method: "POST",
      url: "/servicos",
      headers: auth(um.token),
      payload: CORTE,
    });

    // Sem token: é o cliente escolhendo os serviços pelo link público.
    const resposta = await app.inject({
      method: "GET",
      url: "/barbearias/barbearia-um/servicos",
    });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().servicos[0]).toMatchObject({
      nome: "Corte",
      duracaoMinutos: 45,
      preco: "45.00",
    });

    await app.close();
  });

  it("devolve 404 pra slug que não existe", async () => {
    const app = buildApp();

    const resposta = await app.inject({
      method: "GET",
      url: "/barbearias/nao-existe/servicos",
    });

    expect(resposta.statusCode).toBe(404);
    expect(resposta.json().erro).toBe("nao_encontrado");

    await app.close();
  });
});
