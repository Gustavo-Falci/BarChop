import { describe, expect, it } from "vitest";
import { buildApp } from "../../src/app";
import type { App } from "../../src/tipos";
import { auth, criarMembroComToken } from "../helpers/barbearia";
import { prepararAgenda } from "../helpers/agenda";

// Capa da barbearia e foto do profissional (Onda 1, bloco E2). O arquivo
// passa pela API: ela confere o tipo pelos bytes e o tamanho, guarda, e
// grava a CHAVE — o cliente nunca manda URL nenhuma.

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 2)]);
const WEBP = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP"), Buffer.alloc(64, 3)]);

async function multipart(arquivo: Buffer | null, nome = "imagem.png", tipo = "image/png") {
  const form = new FormData();
  if (arquivo) form.append("arquivo", new Blob([arquivo], { type: tipo }), nome);
  form.append("outro", "campo");
  const requisicao = new Request("http://exemplo", { method: "POST", body: form });
  return {
    payload: Buffer.from(await requisicao.arrayBuffer()),
    headers: { "content-type": requisicao.headers.get("content-type")! },
  };
}

async function enviar(app: App, url: string, token: string | null, arquivo: Buffer | null, nome?: string) {
  const corpo = await multipart(arquivo, nome);
  return app.inject({
    method: "POST",
    url,
    payload: corpo.payload,
    headers: { ...corpo.headers, ...(token ? auth(token) : {}) },
  });
}

// O caminho da URL pública, pra buscar pelo inject.
function caminho(url: string): string {
  return new URL(url).pathname;
}

describe("capa da barbearia", () => {
  it("o dono envia; a página pública mostra; a API serve os mesmos bytes", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    const resposta = await enviar(app, "/barbearias/me/capa", agenda.token, PNG);

    expect(resposta.statusCode).toBe(200);
    const { capaUrl } = resposta.json();
    expect(capaUrl).toMatch(/\/arquivos\/barbearias\/[0-9a-f-]+\/capa\/[0-9a-f-]+\.png$/);
    const publico = (await app.inject({ method: "GET", url: `/barbearias/${agenda.slug}` })).json();
    expect(publico.capaUrl).toBe(capaUrl);

    const servido = await app.inject({ method: "GET", url: caminho(capaUrl) });
    expect(servido.statusCode).toBe(200);
    expect(servido.rawPayload.equals(PNG)).toBe(true);
    expect(servido.headers["content-type"]).toBe("image/png");
    expect(servido.headers["x-content-type-options"]).toBe("nosniff");
    expect(servido.headers["cache-control"]).toContain("immutable");
  });

  it("jpeg e webp também; o tipo vem dos bytes, não do nome", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    const jpeg = await enviar(app, "/barbearias/me/capa", agenda.token, JPEG, "foto.png");
    const webp = await enviar(app, "/barbearias/me/capa", agenda.token, WEBP, "foto.jpg");

    expect(jpeg.json().capaUrl).toMatch(/\.jpg$/);
    expect(webp.json().capaUrl).toMatch(/\.webp$/);
  });

  it("arquivo que não é imagem é recusado, mesmo chamado de .png", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    const resposta = await enviar(app, "/barbearias/me/capa", agenda.token, Buffer.from("<svg onload=alert(1)>"), "x.png");

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json().erro).toBe("tipo_de_imagem_invalido");
    const publico = (await app.inject({ method: "GET", url: `/barbearias/${agenda.slug}` })).json();
    expect(publico.capaUrl).toBeNull();
  });

  it("arquivo grande demais é 413", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    const grande = Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024)]);

    const resposta = await enviar(app, "/barbearias/me/capa", agenda.token, grande);

    expect(resposta.statusCode).toBe(413);
    expect(resposta.json().erro).toBe("arquivo_grande_demais");
  });

  it("sem arquivo é 400", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    expect((await enviar(app, "/barbearias/me/capa", agenda.token, null)).statusCode).toBe(400);
  });

  it("sem token é 401; profissional é 403", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    const profissional = await criarMembroComToken(app, agenda.barbeariaId, "profissional", "p");

    expect((await enviar(app, "/barbearias/me/capa", null, PNG)).statusCode).toBe(401);
    expect((await enviar(app, "/barbearias/me/capa", profissional.token, PNG)).statusCode).toBe(403);
  });

  it("trocar a capa apaga a antiga", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    const antiga = (await enviar(app, "/barbearias/me/capa", agenda.token, PNG)).json().capaUrl;

    await enviar(app, "/barbearias/me/capa", agenda.token, JPEG);

    expect((await app.inject({ method: "GET", url: caminho(antiga) })).statusCode).toBe(404);
  });

  it("tirar a capa limpa o campo e apaga o arquivo", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    const capaUrl = (await enviar(app, "/barbearias/me/capa", agenda.token, PNG)).json().capaUrl;

    const resposta = await app.inject({ method: "DELETE", url: "/barbearias/me/capa", headers: auth(agenda.token) });

    expect(resposta.statusCode).toBe(204);
    const publico = (await app.inject({ method: "GET", url: `/barbearias/${agenda.slug}` })).json();
    expect(publico.capaUrl).toBeNull();
    expect((await app.inject({ method: "GET", url: caminho(capaUrl) })).statusCode).toBe(404);
  });
});

describe("foto do profissional", () => {
  it("o dono envia a foto de um membro; a equipe e a página pública mostram", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    const resposta = await enviar(app, `/equipe/${agenda.barbeiroId}/foto`, agenda.token, JPEG);

    expect(resposta.statusCode).toBe(200);
    const { fotoUrl } = resposta.json();
    expect(fotoUrl).toMatch(new RegExp(`/equipe/${agenda.barbeiroId}/[0-9a-f-]+\\.jpg$`));
    const equipe = (await app.inject({ method: "GET", url: "/equipe", headers: auth(agenda.token) })).json();
    expect(JSON.stringify(equipe)).toContain(fotoUrl);
    const publico = (await app.inject({ method: "GET", url: `/barbearias/${agenda.slug}` })).json();
    expect(publico.barbeiros[0].fotoUrl).toBe(fotoUrl);
  });

  it("membro de outra barbearia é 404", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    const outra = await prepararAgenda(app, { sufixo: "dois" });

    const resposta = await enviar(app, `/equipe/${outra.barbeiroId}/foto`, agenda.token, PNG);

    expect(resposta.statusCode).toBe(404);
  });

  it("só o dono troca foto", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    const profissional = await criarMembroComToken(app, agenda.barbeariaId, "profissional", "p");

    const resposta = await enviar(app, `/equipe/${profissional.barbeiroId}/foto`, profissional.token, PNG);

    expect(resposta.statusCode).toBe(403);
  });

  it("tirar a foto limpa o campo", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    await enviar(app, `/equipe/${agenda.barbeiroId}/foto`, agenda.token, PNG);

    const resposta = await app.inject({
      method: "DELETE",
      url: `/equipe/${agenda.barbeiroId}/foto`,
      headers: auth(agenda.token),
    });

    expect(resposta.statusCode).toBe(204);
    const publico = (await app.inject({ method: "GET", url: `/barbearias/${agenda.slug}` })).json();
    expect(publico.barbeiros[0].fotoUrl).toBeNull();
  });
});

describe("GET /arquivos/*", () => {
  it("caminho fora do formato é 404, sem chegar no disco", async () => {
    const app = buildApp();

    for (const url of [
      "/arquivos/../package.json",
      "/arquivos/barbearias/x/../../../package.json",
      "/arquivos/%2e%2e/package.json",
      "/arquivos/barbearias/00000000-0000-4000-8000-000000000000/capa/00000000-0000-4000-8000-000000000000.png",
    ]) {
      expect((await app.inject({ method: "GET", url })).statusCode).toBe(404);
    }
  });
});
