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

// A logo (bloco da marca): mesmo caminho da capa, com o formato da
// moldura na query — o navegador detecta, o dono confirma, a API guarda.
describe("logo da barbearia", () => {
  it("o dono envia com o formato; a página pública mostra os dois", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    const resposta = await enviar(app, "/barbearias/me/logo?formato=redonda", agenda.token, PNG);

    expect(resposta.statusCode).toBe(200);
    const { logoUrl, logoFormato } = resposta.json();
    expect(logoUrl).toMatch(/\/arquivos\/barbearias\/[0-9a-f-]+\/logo\/[0-9a-f-]+\.png$/);
    expect(logoFormato).toBe("redonda");
    const publico = (await app.inject({ method: "GET", url: `/barbearias/${agenda.slug}` })).json();
    expect(publico.logoUrl).toBe(logoUrl);
    expect(publico.logoFormato).toBe("redonda");

    const servido = await app.inject({ method: "GET", url: caminho(logoUrl) });
    expect(servido.statusCode).toBe(200);
    expect(servido.rawPayload.equals(PNG)).toBe(true);
  });

  it("formato fora da lista, ou sem formato, é 400 — e nada é guardado", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    expect((await enviar(app, "/barbearias/me/logo?formato=oval", agenda.token, PNG)).statusCode).toBe(400);
    expect((await enviar(app, "/barbearias/me/logo", agenda.token, PNG)).statusCode).toBe(400);
    const publico = (await app.inject({ method: "GET", url: `/barbearias/${agenda.slug}` })).json();
    expect(publico.logoUrl).toBeNull();
    expect(publico.logoFormato).toBeNull();
  });

  it("arquivo que não é imagem é 422; grande demais é 413", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    const grande = Buffer.concat([PNG, Buffer.alloc(3 * 1024 * 1024)]);

    const svg = await enviar(app, "/barbearias/me/logo?formato=livre", agenda.token, Buffer.from("<svg/>"), "x.png");
    expect(svg.statusCode).toBe(422);
    expect((await enviar(app, "/barbearias/me/logo?formato=livre", agenda.token, grande)).statusCode).toBe(413);
  });

  it("sem token é 401; profissional é 403", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    const profissional = await criarMembroComToken(app, agenda.barbeariaId, "profissional", "p");

    expect((await enviar(app, "/barbearias/me/logo?formato=livre", null, PNG)).statusCode).toBe(401);
    expect((await enviar(app, "/barbearias/me/logo?formato=livre", profissional.token, PNG)).statusCode).toBe(403);
  });

  it("trocar a logo apaga a antiga", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    const antiga = (await enviar(app, "/barbearias/me/logo?formato=quadrada", agenda.token, PNG)).json().logoUrl;

    await enviar(app, "/barbearias/me/logo?formato=redonda", agenda.token, WEBP);

    expect((await app.inject({ method: "GET", url: caminho(antiga) })).statusCode).toBe(404);
  });

  it("tirar a logo limpa a imagem e o formato, e apaga o arquivo", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    const logoUrl = (await enviar(app, "/barbearias/me/logo?formato=redonda", agenda.token, PNG)).json().logoUrl;

    const resposta = await app.inject({ method: "DELETE", url: "/barbearias/me/logo", headers: auth(agenda.token) });

    expect(resposta.statusCode).toBe(204);
    const publico = (await app.inject({ method: "GET", url: `/barbearias/${agenda.slug}` })).json();
    expect(publico.logoUrl).toBeNull();
    expect(publico.logoFormato).toBeNull();
    expect((await app.inject({ method: "GET", url: caminho(logoUrl) })).statusCode).toBe(404);
  });

  it("o formato troca pelo PATCH, sem reenviar a imagem", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    const logoUrl = (await enviar(app, "/barbearias/me/logo?formato=redonda", agenda.token, PNG)).json().logoUrl;

    const patch = await app.inject({
      method: "PATCH",
      url: "/barbearias/me",
      headers: auth(agenda.token),
      payload: { logoFormato: "livre" },
    });

    expect(patch.statusCode).toBe(200);
    expect(patch.json().logoFormato).toBe("livre");
    expect(patch.json().logoUrl).toBe(logoUrl);
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

describe("foto do serviço", () => {
  function publicoDoServico(app: App, agenda: { slug: string; servico: { id: string } }) {
    return app
      .inject({ method: "GET", url: `/barbearias/${agenda.slug}/servicos` })
      .then((r) => r.json().servicos.find((s: { id: string }) => s.id === agenda.servico.id));
  }

  it("o dono envia; o painel e a lista pública mostram; a API serve os bytes", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    const resposta = await enviar(app, `/servicos/${agenda.servico.id}/foto`, agenda.token, WEBP);

    expect(resposta.statusCode).toBe(200);
    const { fotoUrl } = resposta.json();
    expect(fotoUrl).toMatch(new RegExp(`/servicos/${agenda.servico.id}/[0-9a-f-]+\\.webp$`));
    const painel = (await app.inject({ method: "GET", url: "/servicos", headers: auth(agenda.token) })).json();
    expect(painel.servicos[0].fotoUrl).toBe(fotoUrl);
    expect((await publicoDoServico(app, agenda)).fotoUrl).toBe(fotoUrl);
    const servido = await app.inject({ method: "GET", url: caminho(fotoUrl) });
    expect(servido.statusCode).toBe(200);
    expect(servido.rawPayload.equals(WEBP)).toBe(true);
  });

  it("serviço de outra barbearia é 404", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    const outra = await prepararAgenda(app, { sufixo: "dois" });

    const resposta = await enviar(app, `/servicos/${outra.servico.id}/foto`, agenda.token, PNG);

    expect(resposta.statusCode).toBe(404);
  });

  it("só o dono troca foto de serviço", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    const profissional = await criarMembroComToken(app, agenda.barbeariaId, "profissional", "p");

    const resposta = await enviar(app, `/servicos/${agenda.servico.id}/foto`, profissional.token, PNG);

    expect(resposta.statusCode).toBe(403);
  });

  it("arquivo que não é imagem é 422", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    const resposta = await enviar(app, `/servicos/${agenda.servico.id}/foto`, agenda.token, Buffer.from("oi"), "x.png");

    expect(resposta.statusCode).toBe(422);
  });

  it("trocar a foto apaga a antiga; tirar limpa o campo", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    const url = `/servicos/${agenda.servico.id}/foto`;
    const antiga = (await enviar(app, url, agenda.token, PNG)).json().fotoUrl;
    const nova = (await enviar(app, url, agenda.token, JPEG)).json().fotoUrl;

    expect((await app.inject({ method: "GET", url: caminho(antiga) })).statusCode).toBe(404);

    const resposta = await app.inject({ method: "DELETE", url, headers: auth(agenda.token) });

    expect(resposta.statusCode).toBe(204);
    expect((await publicoDoServico(app, agenda)).fotoUrl).toBeNull();
    expect((await app.inject({ method: "GET", url: caminho(nova) })).statusCode).toBe(404);
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
