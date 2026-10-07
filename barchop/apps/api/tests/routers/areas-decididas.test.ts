import { describe, expect, it } from "vitest";
import { buildApp } from "../../src/app";
import type { App } from "../../src/tipos";
import { auth, criarBarbeariaComToken, criarMembroComToken } from "../helpers/barbearia";

// Painel v2, marco 2: as Configurações mostram "X de N decididas". Uma
// área conta como decidida quando foi SALVA pelo menos uma vez, mesmo
// com o valor padrão (decisão do dono do produto, 2026-10-06) — salvar
// é o "eu olhei e é isso mesmo". A API marca na hora do salvar; a tela
// só lê.

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);

async function areas(app: App, token: string): Promise<string[]> {
  const resposta = await app.inject({ method: "GET", url: "/barbearias/me", headers: auth(token) });
  expect(resposta.statusCode).toBe(200);
  return resposta.json().areasDecididas;
}

function patch(app: App, token: string, payload: Record<string, unknown>) {
  return app.inject({ method: "PATCH", url: "/barbearias/me", headers: auth(token), payload });
}

const SEMANA_PADRAO = [1, 2, 3, 4, 5].map((diaSemana) => ({
  diaSemana,
  horaAbertura: "09:00",
  horaFechamento: "18:00",
  fechado: false,
}));

describe("áreas decididas das Configurações", () => {
  it("barbearia nova não decidiu nada ainda", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");

    expect(await areas(app, um.token)).toEqual([]);

    await app.close();
  });

  it("salvar os horários decide Horários, mesmo com a semana padrão", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");

    const resposta = await app.inject({
      method: "PUT",
      url: "/barbearias/me/horarios",
      headers: auth(um.token),
      payload: { horarios: SEMANA_PADRAO },
    });

    expect(resposta.statusCode).toBe(200);
    expect(await areas(app, um.token)).toEqual(["horarios"]);

    await app.close();
  });

  it("cada campo do PATCH decide só a área dele", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");

    expect((await patch(app, um.token, { whatsapp: "11999998888" })).statusCode).toBe(200);
    expect(await areas(app, um.token)).toEqual(["comunicacao"]);

    await patch(app, um.token, { lembreteAtivo: true });
    expect(await areas(app, um.token)).toEqual(["comunicacao", "notificacoes"]);

    await patch(app, um.token, { sobre: "Desde 2010." });
    expect(await areas(app, um.token)).toEqual(["dados_do_negocio", "comunicacao", "notificacoes"]);

    await app.close();
  });

  it("as regras de agendamento decidem a área delas, que vem logo depois de Horários", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");

    await patch(app, um.token, { whatsapp: "11999998888" });
    expect((await patch(app, um.token, { janelaDias: null })).statusCode).toBe(200);

    expect(await areas(app, um.token)).toEqual(["regras_de_agendamento", "comunicacao"]);
    await app.close();
  });

  it("campos de áreas diferentes no mesmo PATCH decidem as duas", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");

    await patch(app, um.token, { nome: "Barbearia Nova", telefone: "1133334444" });

    expect(await areas(app, um.token)).toEqual(["dados_do_negocio", "comunicacao"]);

    await app.close();
  });

  it("salvar de novo não repete a área", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");

    await patch(app, um.token, { lembreteAntecedenciaHoras: 24 });
    await patch(app, um.token, { lembreteAntecedenciaHoras: 2 });

    expect(await areas(app, um.token)).toEqual(["notificacoes"]);

    await app.close();
  });

  it("enviar a capa decide Dados do negócio", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");
    const form = new FormData();
    form.append("arquivo", new Blob([PNG], { type: "image/png" }), "capa.png");
    const requisicao = new Request("http://exemplo", { method: "POST", body: form });

    const resposta = await app.inject({
      method: "POST",
      url: "/barbearias/me/capa",
      payload: Buffer.from(await requisicao.arrayBuffer()),
      headers: { "content-type": requisicao.headers.get("content-type")!, ...auth(um.token) },
    });

    expect(resposta.statusCode).toBe(200);
    expect(await areas(app, um.token)).toEqual(["dados_do_negocio"]);

    await app.close();
  });

  it("PATCH recusado não decide nada", async () => {
    // A marca só vale pra quem salvou: um 400 de validação não é decisão.
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");

    const resposta = await patch(app, um.token, { whatsapp: "abc" });

    expect(resposta.statusCode).toBe(400);
    expect(await areas(app, um.token)).toEqual([]);

    await app.close();
  });

  it("quem não é dono lê as áreas mas não salva", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");
    const recepcao = await criarMembroComToken(app, um.barbeariaId, "recepcao", "r1");

    expect((await patch(app, recepcao.token, { whatsapp: "11999998888" })).statusCode).toBe(403);
    expect(await areas(app, recepcao.token)).toEqual([]);

    await app.close();
  });
});
