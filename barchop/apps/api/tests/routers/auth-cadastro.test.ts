import { describe, expect, it } from "vitest";
import { prisma } from "@barchop/database";
import { buildApp } from "../../src/app";
import type { CanalDeMemoria } from "../../src/lib/canal";
import { emitirCodigo } from "../../src/lib/codigos";
import type { App } from "../../src/tipos";
import { criarBarbeariaComToken } from "../helpers/barbearia";

// Onda 1, F3: o e-mail do dono é verificado ANTES de a barbearia existir
// (decisão do dono, 2026-10-04). O código vai pro e-mail e volta no
// signup. Quem já tem conta não recebe código — recebe um aviso —, e a
// resposta da rota é a mesma nos dois casos: o 409 que dizia se um
// e-mail estava cadastrado deixa de dizer.

const EMAIL = "ze@barbearia.com";

function corpo(slug = "barbearia-do-ze", email = EMAIL) {
  return {
    barbearia: { nome: "Barbearia do Zé", slug },
    barbeiro: { nome: "Zé", email, senha: "senha-forte-123" },
  };
}

function pedirCodigo(app: App, email = EMAIL) {
  return app.inject({ method: "POST", url: "/auth/cadastro/codigo", payload: { email } });
}

function cadastrar(app: App, payload: object) {
  return app.inject({ method: "POST", url: "/auth/signup", payload });
}

function enviadasPara(app: App, para: string) {
  return (app.canal as CanalDeMemoria).enviadas.filter((m) => m.para === para);
}

function codigoEnviadoPara(app: App, para: string): string {
  const codigo = enviadasPara(app, para).at(-1)?.texto.match(/\b\d{6}\b/)?.[0];
  if (!codigo) throw new Error(`nenhum código foi enviado pra ${para}`);
  return codigo;
}

describe("POST /auth/cadastro/codigo", () => {
  it("e-mail livre recebe o código", async () => {
    const app = buildApp();

    const resposta = await pedirCodigo(app);

    expect(resposta.statusCode).toBe(202);
    const [mensagem] = enviadasPara(app, EMAIL);
    expect(mensagem.assunto).toMatch(/código/i);
    expect(mensagem.texto).toMatch(/\b\d{6}\b/);

    await app.close();
  });

  it("e-mail já cadastrado recebe um aviso, sem código, e a resposta é a mesma", async () => {
    const app = buildApp();
    await criarBarbeariaComToken(app, "um");

    const livre = await pedirCodigo(app, "livre@exemplo.com");
    const tomado = await pedirCodigo(app, "UM@exemplo.com");

    expect(tomado.statusCode).toBe(livre.statusCode);
    expect(tomado.json()).toEqual(livre.json());
    const [aviso] = enviadasPara(app, "um@exemplo.com");
    expect(aviso.texto).toMatch(/já tem uma conta/i);
    expect(aviso.texto).not.toMatch(/\b\d{6}\b/);

    await app.close();
  });

  it("e-mail de convite pendente também conta como tomado", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");
    await prisma.barbeiro.create({
      data: { barbeariaId: um.barbeariaId, nome: "Convidado", email: "convidado@exemplo.com", papel: "profissional" },
    });

    await pedirCodigo(app, "convidado@exemplo.com");

    expect(enviadasPara(app, "convidado@exemplo.com")[0].texto).not.toMatch(/\b\d{6}\b/);

    await app.close();
  });

  it("limita os pedidos por e-mail", async () => {
    const app = buildApp();

    for (let pedido = 0; pedido < 3; pedido += 1) {
      expect((await pedirCodigo(app)).statusCode).toBe(202);
    }
    const bloqueado = await pedirCodigo(app);

    expect(bloqueado.statusCode).toBe(429);
    expect(bloqueado.json().erro).toBe("tentativas_excedidas");

    await app.close();
  });
});

describe("POST /auth/signup com o código do e-mail", () => {
  it("cria a barbearia com o código que chegou no e-mail", async () => {
    const app = buildApp();
    await pedirCodigo(app);

    const resposta = await cadastrar(app, { ...corpo(), codigo: codigoEnviadoPara(app, EMAIL) });

    expect(resposta.statusCode).toBe(201);
    expect(resposta.json().barbearia.slug).toBe("barbearia-do-ze");

    await app.close();
  });

  it("sem código não cria nada", async () => {
    const app = buildApp();

    const resposta = await cadastrar(app, corpo());

    expect(resposta.statusCode).toBe(400);
    expect(await prisma.barbearia.count()).toBe(0);

    await app.close();
  });

  it("código errado responde codigo_invalido e não cria nada", async () => {
    const app = buildApp();
    await pedirCodigo(app);
    const certo = codigoEnviadoPara(app, EMAIL);
    const errado = certo === "000000" ? "111111" : "000000";

    const resposta = await cadastrar(app, { ...corpo(), codigo: errado });

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json().erro).toBe("codigo_invalido");
    expect(await prisma.barbearia.count()).toBe(0);

    await app.close();
  });

  it("a tentativa errada fica contada, mesmo com a criação desfeita", async () => {
    // O código é conferido dentro da transação da criação. Se o erro
    // desfizesse a transação inteira, o contador de tentativas voltaria
    // junto — e o código de seis dígitos poderia ser chutado sem fim.
    const app = buildApp();
    await pedirCodigo(app);
    const certo = codigoEnviadoPara(app, EMAIL);
    const errado = certo === "000000" ? "111111" : "000000";

    await cadastrar(app, { ...corpo(), codigo: errado });
    await cadastrar(app, { ...corpo(), codigo: errado });

    const guardado = await prisma.codigoVerificacao.findFirstOrThrow({
      where: { finalidade: "cadastro_dono", destino: EMAIL },
    });
    expect(guardado.tentativas).toBe(2);

    await app.close();
  });

  it("o código de um e-mail não cadastra outro", async () => {
    const app = buildApp();
    await pedirCodigo(app);

    const resposta = await cadastrar(app, {
      ...corpo("barbearia-do-ze", "outro@exemplo.com"),
      codigo: codigoEnviadoPara(app, EMAIL),
    });

    expect(resposta.statusCode).toBe(422);

    await app.close();
  });

  it("o código de redefinir senha não serve pro cadastro", async () => {
    const app = buildApp();
    const codigo = await emitirCodigo({ finalidade: "senha_barbeiro", destino: EMAIL, barbeariaId: null });

    const resposta = await cadastrar(app, { ...corpo(), codigo });

    expect(resposta.statusCode).toBe(422);

    await app.close();
  });

  it("link já usado responde 409 e não queima o código: dá pra tentar outro link", async () => {
    const app = buildApp();
    await criarBarbeariaComToken(app, "um");
    await pedirCodigo(app);
    const codigo = codigoEnviadoPara(app, EMAIL);

    const tomado = await cadastrar(app, { ...corpo("barbearia-um"), codigo });
    const outro = await cadastrar(app, { ...corpo("barbearia-do-ze"), codigo });

    expect(tomado.statusCode).toBe(409);
    expect(outro.statusCode).toBe(201);

    await app.close();
  });

  it("o código vale uma vez só", async () => {
    const app = buildApp();
    await pedirCodigo(app);
    const codigo = codigoEnviadoPara(app, EMAIL);
    await cadastrar(app, { ...corpo(), codigo });

    const segunda = await cadastrar(app, { ...corpo("outra-barbearia"), codigo });

    expect(segunda.statusCode).toBe(422);

    await app.close();
  });
});
