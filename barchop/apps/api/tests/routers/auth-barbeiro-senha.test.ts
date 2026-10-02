import { describe, expect, it } from "vitest";
import { buildApp } from "../../src/app";
import type { CanalDeMemoria } from "../../src/lib/canal";
import type { App } from "../../src/tipos";
import { auth, criarBarbeariaComToken } from "../helpers/barbearia";

// criarBarbeariaComToken(app, "um") cadastra um@exemplo.com com esta senha.
const EMAIL = "um@exemplo.com";
const SENHA_ANTIGA = "senha-forte-123";
const SENHA_NOVA = "nova-senha-789";

function enviadasPara(app: App, para: string) {
  return (app.canal as CanalDeMemoria).enviadas.filter((m) => m.para === para);
}

function codigoEnviadoPara(app: App, para: string): string {
  const mensagem = enviadasPara(app, para).at(-1);
  const codigo = mensagem?.texto.match(/\b\d{6}\b/)?.[0];
  if (!codigo) throw new Error(`nenhum código foi enviado pra ${para}`);
  return codigo;
}

function pedirCodigo(app: App, email: string) {
  return app.inject({ method: "POST", url: "/auth/codigo", payload: { email } });
}

function redefinir(app: App, corpo: { email: string; codigo: string; senha?: string }) {
  return app.inject({
    method: "POST",
    url: "/auth/senha",
    payload: { senha: SENHA_NOVA, ...corpo },
  });
}

function login(app: App, senha: string) {
  return app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email: EMAIL, senha },
  });
}

describe("POST /auth/codigo", () => {
  it("manda o código pro e-mail do barbeiro, com 202", async () => {
    const app = buildApp();
    await criarBarbeariaComToken(app, "um");

    const resposta = await pedirCodigo(app, "Um@Exemplo.com");

    expect(resposta.statusCode).toBe(202);
    expect(resposta.json()).toEqual({ enviado: true });
    expect(enviadasPara(app, EMAIL)).toHaveLength(1);

    await app.close();
  });

  it("responde igual pra e-mail sem conta, e não manda nada", async () => {
    const app = buildApp();

    const resposta = await pedirCodigo(app, "ninguem@exemplo.com");

    expect(resposta.statusCode).toBe(202);
    expect(resposta.json()).toEqual({ enviado: true });
    expect(enviadasPara(app, "ninguem@exemplo.com")).toHaveLength(0);

    await app.close();
  });
});

describe("POST /auth/senha", () => {
  it("com o código certo troca a senha e devolve a sessão", async () => {
    const app = buildApp();
    const barbearia = await criarBarbeariaComToken(app, "um");
    await pedirCodigo(app, EMAIL);

    const resposta = await redefinir(app, {
      email: EMAIL,
      codigo: codigoEnviadoPara(app, EMAIL),
    });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toMatchObject({
      barbeiro: { id: barbearia.barbeiroId, email: EMAIL },
      barbearia: { slug: barbearia.slug },
    });
    expect(typeof resposta.json().token).toBe("string");

    expect((await login(app, SENHA_NOVA)).statusCode).toBe(200);
    expect((await login(app, SENHA_ANTIGA)).statusCode).toBe(401);

    await app.close();
  });

  it("derruba a sessão que estava aberta", async () => {
    const app = buildApp();
    const barbearia = await criarBarbeariaComToken(app, "um");
    const antigo = app.jwt.sign({
      tipo: "barbeiro",
      barbeiroId: barbearia.barbeiroId,
      barbeariaId: barbearia.barbeariaId,
      iat: Math.floor(Date.now() / 1000) - 60,
    });
    await pedirCodigo(app, EMAIL);

    const troca = await redefinir(app, {
      email: EMAIL,
      codigo: codigoEnviadoPara(app, EMAIL),
    });

    const comAntigo = await app.inject({ method: "GET", url: "/me", headers: auth(antigo) });
    const comNovo = await app.inject({
      method: "GET",
      url: "/me",
      headers: auth(troca.json().token),
    });
    expect(comAntigo.statusCode).toBe(401);
    expect(comNovo.statusCode).toBe(200);

    await app.close();
  });

  it("código errado é 422 codigo_invalido e a senha não muda", async () => {
    const app = buildApp();
    await criarBarbeariaComToken(app, "um");
    await pedirCodigo(app, EMAIL);
    const certo = codigoEnviadoPara(app, EMAIL);
    const errado = certo === "000000" ? "111111" : "000000";

    const resposta = await redefinir(app, { email: EMAIL, codigo: errado });

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json().erro).toBe("codigo_invalido");
    expect((await login(app, SENHA_ANTIGA)).statusCode).toBe(200);

    await app.close();
  });

  it("o código vale uma vez só", async () => {
    const app = buildApp();
    await criarBarbeariaComToken(app, "um");
    await pedirCodigo(app, EMAIL);
    const codigo = codigoEnviadoPara(app, EMAIL);

    await redefinir(app, { email: EMAIL, codigo });
    const segunda = await redefinir(app, { email: EMAIL, codigo, senha: "terceira-senha-1" });

    expect(segunda.statusCode).toBe(422);
    expect(segunda.json().erro).toBe("codigo_invalido");

    await app.close();
  });

  it("e-mail sem conta responde o mesmo 422 de código inválido", async () => {
    const app = buildApp();

    const resposta = await redefinir(app, { email: "ninguem@exemplo.com", codigo: "123456" });

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json().erro).toBe("codigo_invalido");

    await app.close();
  });

  it("recusa senha curta com 400", async () => {
    const app = buildApp();

    const resposta = await redefinir(app, { email: EMAIL, codigo: "123456", senha: "curta" });

    expect(resposta.statusCode).toBe(400);

    await app.close();
  });
});
