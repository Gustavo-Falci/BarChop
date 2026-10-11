import { describe, expect, it } from "vitest";
import { prisma } from "@barchop/database";
import { APARENCIA_PADRAO, type Aparencia } from "@barchop/formato";
import { buildApp } from "../../src/app";
import type { App } from "../../src/tipos";
import { auth, criarBarbeariaComToken, criarMembroComToken } from "../helpers/barbearia";

// A Aparência (marco B): o visual da página pública. O que está no ar
// fica em `aparencia`; o que o dono mexe e ainda não publicou, em
// `aparencia_rascunho` — guardado no servidor até ele publicar ou
// descartar (decisão do dono, 2026-10-11). A página pública só vê o que
// está no ar.

const OCEANO: Aparencia = {
  ...APARENCIA_PADRAO,
  tema: "oceano",
  modoPadrao: "claro",
  clienteTrocaModo: true,
  fonte: "poppins",
  fonteDosTitulos: null,
  cantos: "pilula",
  cores: { claro: { marca: "#2563EB", fundo: "#FDF6E3" }, escuro: {} },
};

async function salvarRascunho(app: App, token: string, aparencia: unknown) {
  return app.inject({
    method: "PUT",
    url: "/barbearias/me/aparencia/rascunho",
    headers: auth(token),
    payload: aparencia as Record<string, unknown>,
  });
}

async function publica(app: App, slug: string) {
  return (await app.inject({ method: "GET", url: `/barbearias/${slug}` })).json();
}

describe("leitura", () => {
  it("barbearia que nunca mexeu: o padrão no ar e nenhum rascunho", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");

    const painel = (await app.inject({ method: "GET", url: "/barbearias/me", headers: auth(um.token) })).json();
    expect(painel.aparencia).toEqual(APARENCIA_PADRAO);
    expect(painel.aparenciaRascunho).toBeNull();

    const corpo = await publica(app, um.slug);
    expect(corpo.aparencia).toEqual(APARENCIA_PADRAO);

    await app.close();
  });

  it("o que veio torto do banco sai normalizado, sem quebrar a página", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");
    await prisma.barbearia.update({
      where: { id: um.barbeariaId },
      data: { aparencia: { tema: "neon", cantos: "pilula", cores: { claro: { marca: "azul" } } } },
    });

    const corpo = await publica(app, um.slug);
    expect(corpo.aparencia).toEqual({ ...APARENCIA_PADRAO, cantos: "pilula" });

    await app.close();
  });
});

describe("PUT /barbearias/me/aparencia/rascunho", () => {
  it("guarda o rascunho sem mexer no que está no ar", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");

    const resposta = await salvarRascunho(app, um.token, OCEANO);

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().aparenciaRascunho).toEqual(OCEANO);
    expect(resposta.json().aparencia).toEqual(APARENCIA_PADRAO);
    // O cliente não vê rascunho nenhum.
    const corpo = await publica(app, um.slug);
    expect(corpo.aparencia).toEqual(APARENCIA_PADRAO);
    expect(corpo).not.toHaveProperty("aparenciaRascunho");

    await app.close();
  });

  it("sobrevive a outra leitura (fechar a aba e voltar)", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");
    await salvarRascunho(app, um.token, OCEANO);

    const painel = (await app.inject({ method: "GET", url: "/barbearias/me", headers: auth(um.token) })).json();
    expect(painel.aparenciaRascunho).toEqual(OCEANO);

    await app.close();
  });

  it("rascunho igual ao que está no ar é nada pendente", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");
    await salvarRascunho(app, um.token, OCEANO);

    const resposta = await salvarRascunho(app, um.token, APARENCIA_PADRAO);

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().aparenciaRascunho).toBeNull();

    await app.close();
  });

  it("hex em minúsculas é guardado em maiúsculas", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");

    const resposta = await salvarRascunho(app, um.token, {
      ...APARENCIA_PADRAO,
      cores: { claro: { marca: "#2563eb" }, escuro: {} },
    });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().aparenciaRascunho.cores.claro.marca).toBe("#2563EB");

    await app.close();
  });

  it.each([
    ["tema que não existe", { ...APARENCIA_PADRAO, tema: "neon" }],
    ["cor que não é hex", { ...APARENCIA_PADRAO, cores: { claro: { marca: "red" }, escuro: {} } }],
    ["hex curto", { ...APARENCIA_PADRAO, cores: { claro: { marca: "#fff" }, escuro: {} } }],
    [
      "CSS escondido na cor",
      { ...APARENCIA_PADRAO, cores: { claro: { marca: "#000000;}body{display:none" }, escuro: {} } },
    ],
    ["cor que não é das nove", { ...APARENCIA_PADRAO, cores: { claro: { borda: "#000000" }, escuro: {} } }],
    ["fonte fora da lista", { ...APARENCIA_PADRAO, fonte: "comic-sans" }],
    ["campo a mais", { ...APARENCIA_PADRAO, css: "body{}" }],
    ["campo faltando", { ...APARENCIA_PADRAO, cantos: undefined }],
  ])("recusa %s com 400", async (_, corpo) => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");

    const resposta = await salvarRascunho(app, um.token, corpo);

    expect(resposta.statusCode).toBe(400);
    const painel = (await app.inject({ method: "GET", url: "/barbearias/me", headers: auth(um.token) })).json();
    expect(painel.aparenciaRascunho).toBeNull();

    await app.close();
  });

  it("o rascunho é de cada barbearia", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");
    const dois = await criarBarbeariaComToken(app, "dois");
    await salvarRascunho(app, um.token, OCEANO);

    const painel = (await app.inject({ method: "GET", url: "/barbearias/me", headers: auth(dois.token) })).json();
    expect(painel.aparenciaRascunho).toBeNull();

    await app.close();
  });
});

describe("POST /barbearias/me/aparencia/publicar", () => {
  it("o rascunho vai pro ar e deixa de ser rascunho", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");
    await salvarRascunho(app, um.token, OCEANO);

    const resposta = await app.inject({
      method: "POST",
      url: "/barbearias/me/aparencia/publicar",
      headers: auth(um.token),
    });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().aparencia).toEqual(OCEANO);
    expect(resposta.json().aparenciaRascunho).toBeNull();
    expect((await publica(app, um.slug)).aparencia).toEqual(OCEANO);

    await app.close();
  });

  it("publicar decide a área Aparência das Configurações", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");
    await salvarRascunho(app, um.token, OCEANO);

    const antes = (await app.inject({ method: "GET", url: "/barbearias/me", headers: auth(um.token) })).json();
    expect(antes.areasDecididas).not.toContain("aparencia");
    const resposta = await app.inject({
      method: "POST",
      url: "/barbearias/me/aparencia/publicar",
      headers: auth(um.token),
    });

    expect(resposta.json().areasDecididas).toContain("aparencia");

    await app.close();
  });

  it("sem rascunho, não há o que publicar: 409", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");

    const resposta = await app.inject({
      method: "POST",
      url: "/barbearias/me/aparencia/publicar",
      headers: auth(um.token),
    });

    expect(resposta.statusCode).toBe(409);

    await app.close();
  });
});

describe("DELETE /barbearias/me/aparencia/rascunho", () => {
  it("descarta o rascunho; o que está no ar fica", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");
    await salvarRascunho(app, um.token, OCEANO);
    await app.inject({ method: "POST", url: "/barbearias/me/aparencia/publicar", headers: auth(um.token) });
    await salvarRascunho(app, um.token, { ...OCEANO, cantos: "retos" });

    const resposta = await app.inject({
      method: "DELETE",
      url: "/barbearias/me/aparencia/rascunho",
      headers: auth(um.token),
    });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().aparenciaRascunho).toBeNull();
    expect(resposta.json().aparencia).toEqual(OCEANO);

    await app.close();
  });
});

describe("só o dono", () => {
  it.each(["profissional", "recepcao"] as const)("%s recebe 403 nas três escritas", async (papel) => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");
    const membro = await criarMembroComToken(app, um.barbeariaId, papel, "m");

    const salvar = await salvarRascunho(app, membro.token, OCEANO);
    const publicar = await app.inject({
      method: "POST",
      url: "/barbearias/me/aparencia/publicar",
      headers: auth(membro.token),
    });
    const descartar = await app.inject({
      method: "DELETE",
      url: "/barbearias/me/aparencia/rascunho",
      headers: auth(membro.token),
    });

    expect([salvar.statusCode, publicar.statusCode, descartar.statusCode]).toEqual([403, 403, 403]);

    await app.close();
  });
});
