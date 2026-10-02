import { describe, expect, it } from "vitest";
import { prisma } from "@barchop/database";
import { buildApp } from "../../src/app";
import type { CanalDeMemoria } from "../../src/lib/canal";
import { criarBarbeariaComToken } from "../helpers/barbearia";
import { definirSenhaComCodigo, ultimoCodigo } from "../helpers/cliente";
import { decodificarPayload } from "../helpers/decodificar-token";
import type { App } from "../../src/tipos";

const SENHA = "senha-forte-123";
const TELEFONE = "11999998888";

function pedirCodigo(app: App, slug: string, telefone = TELEFONE) {
  return app.inject({
    method: "POST",
    url: `/barbearias/${slug}/auth/cliente/codigo`,
    payload: { telefone },
  });
}

function definirSenha(
  app: App,
  slug: string,
  corpo: { telefone?: string; codigo: string; senha?: string; nome?: string }
) {
  return app.inject({
    method: "POST",
    url: `/barbearias/${slug}/auth/cliente/senha`,
    payload: { telefone: TELEFONE, senha: SENHA, nome: "João da Silva", ...corpo },
  });
}

function login(app: App, slug: string, senha: string) {
  return app.inject({
    method: "POST",
    url: `/barbearias/${slug}/auth/cliente/login`,
    payload: { telefone: TELEFONE, senha },
  });
}

describe("POST /barbearias/:slug/auth/cliente/codigo", () => {
  it("manda um código de seis dígitos pro telefone, em nome da barbearia", async () => {
    const app = buildApp();
    const { slug } = await criarBarbeariaComToken(app);

    const resposta = await pedirCodigo(app, slug);

    expect(resposta.statusCode).toBe(202);
    const [mensagem] = (app.canal as CanalDeMemoria).enviadas;
    // Normalizado: é o mesmo formato em que o cadastro é gravado.
    expect(mensagem.para).toBe("(11) 99999-8888");
    expect(mensagem.texto).toMatch(/\b\d{6}\b/);
    // Quem recebe precisa saber de onde veio — senão é um código solto
    // no WhatsApp, idêntico ao de um golpe.
    expect(mensagem.texto).toContain("Barbearia um");
  });

  it("responde igual tendo ou não conta, e manda o código nos dois casos", async () => {
    // A resposta não pode dizer se o telefone tem conta: era o que o
    // 409 do signup antigo entregava pra quem sondasse.
    const app = buildApp();
    const { slug } = await criarBarbeariaComToken(app);
    await definirSenhaComCodigo(app, slug, { telefone: TELEFONE, senha: SENHA });

    const comConta = await pedirCodigo(app, slug, TELEFONE);
    const semConta = await pedirCodigo(app, slug, "11988887777");

    expect(comConta.statusCode).toBe(semConta.statusCode);
    expect(comConta.body).toBe(semConta.body);
    expect(ultimoCodigo(app, "11988887777")).toMatch(/^\d{6}$/);
  });

  it("recusa telefone inválido com 400", async () => {
    const app = buildApp();
    const { slug } = await criarBarbeariaComToken(app);

    expect((await pedirCodigo(app, slug, "999")).statusCode).toBe(400);
  });

  it("404 em slug que não existe, sem mandar nada", async () => {
    const app = buildApp();

    expect((await pedirCodigo(app, "nao-existe")).statusCode).toBe(404);
    expect((app.canal as CanalDeMemoria).enviadas).toHaveLength(0);
  });
});

describe("POST /barbearias/:slug/auth/cliente/senha", () => {
  it("telefone novo: cria o cadastro e devolve token de cliente", async () => {
    const app = buildApp();
    const { slug, barbeariaId } = await criarBarbeariaComToken(app);
    await pedirCodigo(app, slug);

    const resposta = await definirSenha(app, slug, { codigo: ultimoCodigo(app, TELEFONE) });

    expect(resposta.statusCode).toBe(201);
    expect(resposta.json().cliente).toMatchObject({
      nome: "João da Silva",
      telefone: "(11) 99999-8888",
      temConta: true,
    });
    const payload = decodificarPayload(resposta.json().token);
    expect(payload.tipo).toBe("cliente");
    expect(payload.barbeariaId).toBe(barbeariaId);
  });

  it("cadastro sem senha: define a senha e mantém o nome que o barbeiro registrou", async () => {
    const app = buildApp();
    const { slug, barbeariaId } = await criarBarbeariaComToken(app);
    const existente = await prisma.cliente.create({
      data: { barbeariaId, nome: "João Silva", telefone: "(11) 99999-8888" },
    });
    await pedirCodigo(app, slug);

    const resposta = await definirSenha(app, slug, {
      codigo: ultimoCodigo(app, TELEFONE),
      nome: "Jo",
    });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().cliente.id).toBe(existente.id);
    expect(resposta.json().cliente.nome).toBe("João Silva");
  });

  it("cadastro com senha: é o esqueci a senha — a nova vale e a antiga não", async () => {
    const app = buildApp();
    const { slug } = await criarBarbeariaComToken(app);
    await definirSenhaComCodigo(app, slug, { telefone: TELEFONE, senha: SENHA });
    await pedirCodigo(app, slug);

    const resposta = await definirSenha(app, slug, {
      codigo: ultimoCodigo(app, TELEFONE),
      senha: "outra-senha-456",
    });

    expect(resposta.statusCode).toBe(200);
    expect((await login(app, slug, "outra-senha-456")).statusCode).toBe(200);
    expect((await login(app, slug, SENHA)).statusCode).toBe(401);
  });

  it("código errado não define nada", async () => {
    // É a dívida que esta rota fecha: quem só conhece o número de outra
    // pessoa não chega a definir a senha dela.
    const app = buildApp();
    const { slug } = await criarBarbeariaComToken(app);
    await pedirCodigo(app, slug);
    const certo = ultimoCodigo(app, TELEFONE);

    const resposta = await definirSenha(app, slug, {
      codigo: certo === "000000" ? "111111" : "000000",
    });

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json().erro).toBe("codigo_invalido");
    expect(await prisma.cliente.count()).toBe(0);
  });

  it("sem código pedido, nenhum código vale", async () => {
    const app = buildApp();
    const { slug } = await criarBarbeariaComToken(app);

    const resposta = await definirSenha(app, slug, { codigo: "123456" });

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json().erro).toBe("codigo_invalido");
  });

  it("o código serve uma vez só", async () => {
    const app = buildApp();
    const { slug } = await criarBarbeariaComToken(app);
    await pedirCodigo(app, slug);
    const codigo = ultimoCodigo(app, TELEFONE);

    expect((await definirSenha(app, slug, { codigo })).statusCode).toBe(201);
    expect((await definirSenha(app, slug, { codigo, senha: "outra-senha-456" })).statusCode).toBe(
      422
    );
  });

  it("recusa código fora do formato com 400", async () => {
    const app = buildApp();
    const { slug } = await criarBarbeariaComToken(app);

    expect((await definirSenha(app, slug, { codigo: "12ab" })).statusCode).toBe(400);
  });

  it("exige o nome mesmo de quem já tem cadastro", async () => {
    // Exigir só pra cadastro novo faria "falta o nome" e "código
    // inválido" responderem diferente — e a diferença diria quem tem
    // cadastro antes de qualquer prova de posse do telefone.
    const app = buildApp();
    const { slug } = await criarBarbeariaComToken(app);

    const resposta = await app.inject({
      method: "POST",
      url: `/barbearias/${slug}/auth/cliente/senha`,
      payload: { telefone: TELEFONE, codigo: "123456", senha: SENHA },
    });

    expect(resposta.statusCode).toBe(400);
  });

  it("nunca devolve o senhaHash", async () => {
    const app = buildApp();
    const { slug } = await criarBarbeariaComToken(app);

    const resposta = await definirSenhaComCodigo(app, slug, { telefone: TELEFONE, senha: SENHA });

    expect(resposta.body).not.toContain("scrypt");
    expect(resposta.json().cliente.senhaHash).toBeUndefined();
  });
});

describe("o signup sem código deixou de existir", () => {
  it("POST /barbearias/:slug/auth/cliente/signup responde 404", async () => {
    // Era por ele que quem chegasse primeiro assumia o cadastro de um
    // telefone. Mantê-lo ao lado da rota nova deixaria a porta aberta.
    const app = buildApp();
    const { slug } = await criarBarbeariaComToken(app);

    const resposta = await app.inject({
      method: "POST",
      url: `/barbearias/${slug}/auth/cliente/signup`,
      payload: { nome: "João da Silva", telefone: TELEFONE, senha: SENHA },
    });

    expect(resposta.statusCode).toBe(404);
  });
});
