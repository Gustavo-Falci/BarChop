import { describe, expect, it } from "vitest";
import { buildApp } from "../../src/app";
import type { App } from "../../src/tipos";
import { marcarPeloPainel, prepararAgenda } from "../helpers/agenda";
import { auth, criarBarbeariaComToken, criarMembroComToken } from "../helpers/barbearia";
import { QUINTA } from "../helpers/datas";

// Onda 1, F2: a trilha de primeiros passos do dono. O estado é derivado
// do que já existe — horário, serviço, equipe, primeira reserva pelo
// link — e só dois passos precisam de marca gravada: o link
// compartilhado (não há como deduzir) e o "trabalho sozinho" (decisão do
// dono, 2026-10-04: sem ele o barbeiro solo nunca fecharia a trilha).

function onboarding(app: App, token: string) {
  return app.inject({ method: "GET", url: "/barbearias/me/onboarding", headers: auth(token) });
}

function passos(resposta: { json: () => { passos: { id: string; feito: boolean }[] } }) {
  return Object.fromEntries(resposta.json().passos.map((passo) => [passo.id, passo.feito]));
}

describe("GET /barbearias/me/onboarding", () => {
  it("barbearia recém-criada: nenhum passo feito, na ordem da trilha", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");

    const resposta = await onboarding(app, um.token);

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual({
      passos: [
        { id: "horarios", feito: false },
        { id: "servicos", feito: false },
        { id: "equipe", feito: false },
        { id: "link", feito: false },
        { id: "primeira_reserva", feito: false },
      ],
      completo: false,
    });

    await app.close();
  });

  it("horário e serviço contam quando existem", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    const feitos = passos(await onboarding(app, agenda.token));

    expect(feitos.horarios).toBe(true);
    expect(feitos.servicos).toBe(true);

    await app.close();
  });

  it("serviço desativado não conta", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    await app.inject({
      method: "PATCH",
      url: `/servicos/${agenda.servico.id}`,
      headers: auth(agenda.token),
      payload: { ativo: false },
    });

    expect(passos(await onboarding(app, agenda.token)).servicos).toBe(false);

    await app.close();
  });

  it("a equipe conta com um segundo membro ativo", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");
    await criarMembroComToken(app, um.barbeariaId, "profissional", "ana");

    expect(passos(await onboarding(app, um.token)).equipe).toBe(true);

    await app.close();
  });

  it("\"trabalho sozinho\" fecha o passo da equipe, e dá pra desfazer", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");

    const marcar = await app.inject({
      method: "PATCH",
      url: "/barbearias/me/onboarding",
      headers: auth(um.token),
      payload: { trabalhoSozinho: true },
    });
    expect(marcar.statusCode).toBe(200);
    expect(passos(marcar).equipe).toBe(true);

    await app.inject({
      method: "PATCH",
      url: "/barbearias/me/onboarding",
      headers: auth(um.token),
      payload: { trabalhoSozinho: false },
    });
    expect(passos(await onboarding(app, um.token)).equipe).toBe(false);

    await app.close();
  });

  it("o link conta depois de copiado, por qualquer um da equipe", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");
    const ana = await criarMembroComToken(app, um.barbeariaId, "profissional", "ana");

    const copiado = await app.inject({
      method: "POST",
      url: "/barbearias/me/link-copiado",
      headers: auth(ana.token),
    });

    expect(copiado.statusCode).toBe(204);
    expect(passos(await onboarding(app, um.token)).link).toBe(true);

    await app.close();
  });

  it("só agendamento feito pelo cliente conta como primeira reserva", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    await marcarPeloPainel(app, agenda, { data: QUINTA, horaInicio: "10:00" });

    expect(passos(await onboarding(app, agenda.token)).primeira_reserva).toBe(false);

    await app.inject({
      method: "POST",
      url: `/barbearias/${agenda.slug}/agendamentos`,
      payload: {
        barbeiroId: agenda.barbeiroId,
        servicoIds: [agenda.servico.id],
        data: QUINTA,
        horaInicio: "14:00",
        cliente: { nome: "João", telefone: "11999998888" },
      },
    });

    expect(passos(await onboarding(app, agenda.token)).primeira_reserva).toBe(true);

    await app.close();
  });

  it("completo quando os cinco passos estão feitos", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    await app.inject({
      method: "PATCH",
      url: "/barbearias/me/onboarding",
      headers: auth(agenda.token),
      payload: { trabalhoSozinho: true },
    });
    await app.inject({ method: "POST", url: "/barbearias/me/link-copiado", headers: auth(agenda.token) });
    await app.inject({
      method: "POST",
      url: `/barbearias/${agenda.slug}/agendamentos`,
      payload: {
        barbeiroId: agenda.barbeiroId,
        servicoIds: [agenda.servico.id],
        data: QUINTA,
        horaInicio: "14:00",
        cliente: { nome: "João", telefone: "11999998888" },
      },
    });

    expect((await onboarding(app, agenda.token)).json().completo).toBe(true);

    await app.close();
  });

  it("é do dono: profissional e recepção recebem 403", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");
    const ana = await criarMembroComToken(app, um.barbeariaId, "profissional", "ana");
    const bia = await criarMembroComToken(app, um.barbeariaId, "recepcao", "bia");

    expect((await onboarding(app, ana.token)).statusCode).toBe(403);
    expect((await onboarding(app, bia.token)).statusCode).toBe(403);
    const marcar = await app.inject({
      method: "PATCH",
      url: "/barbearias/me/onboarding",
      headers: auth(ana.token),
      payload: { trabalhoSozinho: true },
    });
    expect(marcar.statusCode).toBe(403);

    await app.close();
  });

  it("não vê o estado de outra barbearia", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");
    const outra = await prepararAgenda(app, { sufixo: "dois" });

    const feitos = passos(await onboarding(app, um.token));

    expect(feitos.horarios).toBe(false);
    expect(feitos.servicos).toBe(false);
    expect(outra.slug).toBe("barbearia-dois");

    await app.close();
  });

  it("sem token, 401", async () => {
    const app = buildApp();

    expect((await app.inject({ method: "GET", url: "/barbearias/me/onboarding" })).statusCode).toBe(401);

    await app.close();
  });
});
