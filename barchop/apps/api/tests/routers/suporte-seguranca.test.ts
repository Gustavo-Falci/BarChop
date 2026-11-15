import { afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@barchop/database";
import { buildApp } from "../../src/app";
import type { CanalDeMemoria } from "../../src/lib/canal";
import { criarOperadorDeSuporte } from "../../src/lib/suporte";
import type { App } from "../../src/tipos";
import { auth, criarBarbeariaComToken } from "../helpers/barbearia";
import { decodificarPayload } from "../helpers/decodificar-token";

// Auditoria de segurança de 15/11, SEC-008. A conta de suporte é a mais
// poderosa da plataforma: confirma pagamentos, troca links e publica
// aviso no sino de todos os donos. Estava protegida só por senha, com
// sessão de 7 dias e sem registro de quem fez o quê.

const EMAIL = "suporte@barchop.com.br";
const SENHA = "senha-do-suporte-123";

async function entrar(app: App, senha = SENHA) {
  return app.inject({ method: "POST", url: "/suporte/login", payload: { email: EMAIL, senha } });
}

async function cenario() {
  const app = buildApp();
  const operador = await criarOperadorDeSuporte({ nome: "Suporte", email: EMAIL, senha: SENHA });
  return { app, operador };
}

function enviadas(app: App) {
  return (app.canal as CanalDeMemoria).enviadas;
}

function publicar(app: App, token: string, link?: string) {
  return app.inject({
    method: "POST",
    url: "/suporte/avisos",
    headers: auth(token),
    payload: { titulo: "Novidade", texto: "Tem coisa nova no painel.", ...(link ? { link } : {}) },
  });
}

describe("sessão do suporte", () => {
  it("vale 2 horas, não 7 dias", async () => {
    const { app } = await cenario();

    const { token } = (await entrar(app)).json();

    const { iat, exp } = decodificarPayload(token) as { iat: number; exp: number };
    expect(exp - iat).toBe(2 * 60 * 60);
    await app.close();
  });

  it("cada entrada avisa o operador por e-mail; senha errada não avisa", async () => {
    // O dono da conta fica sabendo de uma entrada que não foi dele.
    const { app } = await cenario();

    await entrar(app, "senha-errada-123456");
    expect(enviadas(app)).toHaveLength(0);

    await entrar(app);

    const [aviso] = enviadas(app);
    expect(aviso.para).toBe(EMAIL);
    expect(aviso.assunto).toMatch(/acesso/i);
    expect(aviso.texto).not.toContain(SENHA);
    await app.close();
  });
});

describe("link do aviso da plataforma", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("só leva pra dentro do painel ou pros sites do próprio BarChop", async () => {
    // O aviso cai no sino de todos os membros de todas as barbearias, e
    // o painel abre o link no clique. Com qualquer https valendo, uma
    // conta de suporte tomada virava phishing em massa com a cara do
    // painel.
    vi.stubEnv(
      "ORIGENS_PERMITIDAS",
      "https://barchop.com.br,https://painel.barchop.com.br,https://*.barchop.com.br"
    );
    const { app } = await cenario();
    await criarBarbeariaComToken(app);
    const { token } = (await entrar(app)).json();

    for (const link of [
      "https://isca.example.com/atualize",
      "https://barchop.com.br.isca.example.com/",
      "https://barchop.com.br@isca.example.com/",
      "https://isca.example.com/?x=https://barchop.com.br",
    ]) {
      const resposta = await publicar(app, token, link);
      expect(resposta.statusCode, link).toBe(422);
      expect(resposta.json().erro).toBe("link_de_fora");
    }
    expect(await prisma.aviso.count()).toBe(0);

    for (const link of [
      "/painel/faturas",
      "https://barchop.com.br/planos",
      "https://painel.barchop.com.br/painel/faturas",
      "https://ajuda.barchop.com.br/",
    ]) {
      expect((await publicar(app, token, link)).statusCode, link).toBe(201);
    }
    expect((await publicar(app, token)).statusCode).toBe(201);
    await app.close();
  });
});

describe("trilha de auditoria do suporte", () => {
  it("a entrada fica registrada, com o operador e o IP", async () => {
    const { app, operador } = await cenario();

    await entrar(app);

    const [linha] = await prisma.auditoria.findMany();
    expect(linha).toMatchObject({ atorTipo: "suporte", atorId: operador.id, acao: "suporte.login" });
    expect(linha.ip).toBeTruthy();
    await app.close();
  });

  it("publicar aviso registra o título e o link, nunca o token", async () => {
    const { app, operador } = await cenario();
    const { token } = (await entrar(app)).json();

    const aviso = (await publicar(app, token, "/painel/faturas")).json().aviso;

    const linha = await prisma.auditoria.findFirstOrThrow({ where: { acao: "suporte.aviso.publicar" } });
    expect(linha).toMatchObject({ atorId: operador.id, alvoTipo: "aviso", alvoId: aviso.id });
    expect(linha.detalhe).toMatchObject({ titulo: "Novidade", link: "/painel/faturas" });
    expect(JSON.stringify(linha)).not.toContain(token);
    await app.close();
  });

  it("aprovar e recusar a troca de link registram o antes e o depois", async () => {
    const { app, operador } = await cenario();
    const dono = await criarBarbeariaComToken(app, "um");
    const { token } = (await entrar(app)).json();
    const pedir = async (slug: string) =>
      (
        await app.inject({
          method: "POST",
          url: "/barbearias/me/solicitacao-de-link",
          headers: auth(dono.token),
          payload: { slug },
        })
      ).json();

    const primeiro = await pedir("barbearia-nova");
    await app.inject({ method: "POST", url: `/suporte/solicitacoes/${primeiro.id}/aprovar`, headers: auth(token) });
    const segundo = await pedir("barbearia-outra");
    await app.inject({
      method: "POST",
      url: `/suporte/solicitacoes/${segundo.id}/recusar`,
      headers: auth(token),
      payload: { resposta: "Nome reservado." },
    });

    const aprovada = await prisma.auditoria.findFirstOrThrow({ where: { acao: "suporte.link.aprovar" } });
    expect(aprovada).toMatchObject({ atorId: operador.id, barbeariaId: dono.barbeariaId, alvoId: primeiro.id });
    expect(aprovada.detalhe).toMatchObject({ de: "barbearia-um", para: "barbearia-nova" });
    const recusada = await prisma.auditoria.findFirstOrThrow({ where: { acao: "suporte.link.recusar" } });
    expect(recusada).toMatchObject({ barbeariaId: dono.barbeariaId, alvoId: segundo.id });
    await app.close();
  });

  it("ação que falha não deixa linha", async () => {
    const { app } = await cenario();
    const { token } = (await entrar(app)).json();

    await app.inject({
      method: "POST",
      url: "/suporte/solicitacoes/00000000-0000-4000-8000-000000000000/aprovar",
      headers: auth(token),
    });

    expect(await prisma.auditoria.count({ where: { acao: { startsWith: "suporte.link" } } })).toBe(0);
    await app.close();
  });
});
