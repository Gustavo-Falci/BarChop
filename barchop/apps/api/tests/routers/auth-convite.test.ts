import { describe, expect, it } from "vitest";
import { prisma } from "@barchop/database";
import { buildApp } from "../../src/app";
import type { CanalDeMemoria } from "../../src/lib/canal";
import { consumirCodigo, emitirCodigo } from "../../src/lib/codigos";
import type { App } from "../../src/tipos";
import { auth, criarBarbeariaComToken, criarMembroComToken } from "../helpers/barbearia";

// Onda 1, A4: o membro convidado define a senha com o código que chegou
// no e-mail e já sai logado. O convite é um código de verificação como
// os outros, com finalidade própria e validade de 7 dias — o dono
// convida hoje, o profissional abre o e-mail no fim de semana.

const EMAIL = "ana@exemplo.com";
const SENHA = "senha-da-ana-123";
const DIA = 24 * 60 * 60 * 1000;

function codigoEnviadoPara(app: App, para: string): string {
  const mensagem = (app.canal as CanalDeMemoria).enviadas.filter((m) => m.para === para).at(-1);
  const codigo = mensagem?.texto.match(/\b\d{6}\b/)?.[0];
  if (!codigo) throw new Error(`nenhum código foi enviado pra ${para}`);
  return codigo;
}

async function convidarAna(app: App, papel = "profissional") {
  const dono = await criarBarbeariaComToken(app);
  const ana = await app.inject({
    method: "POST",
    url: "/equipe",
    headers: auth(dono.token),
    payload: { nome: "Ana Souza", email: EMAIL, papel },
  });
  return { dono, anaId: ana.json().id as string };
}

function aceitar(app: App, corpo: { email?: string; codigo: string; senha?: string }) {
  return app.inject({
    method: "POST",
    url: "/auth/convite/aceitar",
    payload: { email: EMAIL, senha: SENHA, ...corpo },
  });
}

describe("POST /auth/convite/aceitar", () => {
  it("com o código do convite define a senha e devolve a sessão, com o papel", async () => {
    const app = buildApp();
    const { dono, anaId } = await convidarAna(app);

    const resposta = await aceitar(app, { email: "Ana@Exemplo.com", codigo: codigoEnviadoPara(app, EMAIL) });

    expect(resposta.statusCode).toBe(200);
    const corpo = resposta.json();
    expect(corpo.token).toEqual(expect.any(String));
    expect(corpo.barbeiro).toEqual({
      id: anaId,
      nome: "Ana Souza",
      email: EMAIL,
      papel: "profissional",
    });
    expect(corpo.barbearia).toMatchObject({ id: dono.barbeariaId, slug: dono.slug });

    const me = await app.inject({ method: "GET", url: "/me", headers: auth(corpo.token) });
    expect(me.statusCode).toBe(200);

    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: EMAIL, senha: SENHA },
    });
    expect(login.statusCode).toBe(200);
    await app.close();
  });

  it("depois de aceito, o convite some da equipe", async () => {
    const app = buildApp();
    const { dono, anaId } = await convidarAna(app);
    await aceitar(app, { codigo: codigoEnviadoPara(app, EMAIL) });

    const equipe = await app.inject({ method: "GET", url: "/equipe", headers: auth(dono.token) });

    const ana = equipe.json().membros.find((m: { id: string }) => m.id === anaId);
    expect(ana.convitePendente).toBe(false);
    await app.close();
  });

  it("o código vale uma vez só", async () => {
    const app = buildApp();
    await convidarAna(app);
    const codigo = codigoEnviadoPara(app, EMAIL);

    await aceitar(app, { codigo });
    const deNovo = await aceitar(app, { codigo, senha: "outra-senha-456" });

    expect(deNovo.statusCode).toBe(422);
    expect(deNovo.json().erro).toBe("codigo_invalido");
    await app.close();
  });

  it("código errado: 422 codigo_invalido, e a senha continua sem existir", async () => {
    const app = buildApp();
    const { anaId } = await convidarAna(app);
    const certo = codigoEnviadoPara(app, EMAIL);
    const errado = certo === "000000" ? "111111" : "000000";

    const resposta = await aceitar(app, { codigo: errado });

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json().erro).toBe("codigo_invalido");
    const ana = await prisma.barbeiro.findUniqueOrThrow({ where: { id: anaId } });
    expect(ana.senhaHash).toBeNull();
    await app.close();
  });

  it("o código do esqueci-a-senha não serve de convite", async () => {
    // Finalidades separadas: um código de 10 minutos não aceita convite,
    // e o de 7 dias não redefine senha.
    const app = buildApp();
    await convidarAna(app);
    await app.inject({ method: "POST", url: "/auth/codigo", payload: { email: EMAIL } });
    const doEsqueci = codigoEnviadoPara(app, EMAIL);

    const resposta = await aceitar(app, { codigo: doEsqueci });

    expect(resposta.statusCode).toBe(422);
    await app.close();
  });

  it("membro desativado depois do convite: 422 codigo_invalido", async () => {
    const app = buildApp();
    const { dono, anaId } = await convidarAna(app);
    const codigo = codigoEnviadoPara(app, EMAIL);
    await app.inject({
      method: "PATCH",
      url: `/equipe/${anaId}`,
      headers: auth(dono.token),
      payload: { ativo: false },
    });

    const resposta = await aceitar(app, { codigo });

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json().erro).toBe("codigo_invalido");
    await app.close();
  });

  it("membro que já tem senha: o convite não redefine — 422 codigo_invalido", async () => {
    // Sem esta guarda o código de 7 dias viraria um esqueci-a-senha
    // folgado. Emitido direto aqui porque a rota de reenvio já recusa
    // quem tem senha.
    const app = buildApp();
    const dono = await criarBarbeariaComToken(app);
    const membro = await criarMembroComToken(app, dono.barbeariaId, "profissional", "p");
    const email = "profissional-p@exemplo.com";
    const codigo = await emitirCodigo({
      finalidade: "convite_profissional",
      destino: email,
      barbeariaId: null,
    });

    const resposta = await aceitar(app, { email, codigo });

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json().erro).toBe("codigo_invalido");
    const intacto = await app.inject({
      method: "GET",
      url: "/me",
      headers: auth(membro.token),
    });
    expect(intacto.statusCode).toBe(200);
    await app.close();
  });

  it("senha curta: 400", async () => {
    const app = buildApp();
    await convidarAna(app);

    const resposta = await aceitar(app, { codigo: codigoEnviadoPara(app, EMAIL), senha: "curta" });

    expect(resposta.statusCode).toBe(400);
    await app.close();
  });

  it("chutar códigos esbarra no limite por e-mail: 429", async () => {
    const app = buildApp();
    await convidarAna(app);

    let ultima = 0;
    for (let i = 0; i < 11; i++) {
      ultima = (await aceitar(app, { codigo: String(i).padStart(6, "0") })).statusCode;
    }

    expect(ultima).toBe(429);
    await app.close();
  });
});

describe("validade do código de convite", () => {
  it("vale 7 dias, não os 10 minutos dos outros códigos", async () => {
    const alvo = { finalidade: "convite_profissional" as const, destino: EMAIL, barbeariaId: null };
    const agora = new Date("2026-10-05T12:00:00Z");

    const codigo = await emitirCodigo(alvo, agora);
    expect(await consumirCodigo(alvo, codigo, new Date(agora.getTime() + 6 * DIA))).toBe(true);

    const vencido = await emitirCodigo(alvo, agora);
    expect(await consumirCodigo(alvo, vencido, new Date(agora.getTime() + 8 * DIA))).toBe(false);
  });
});
