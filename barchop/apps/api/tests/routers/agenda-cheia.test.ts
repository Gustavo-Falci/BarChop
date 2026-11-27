import { describe, expect, it } from "vitest";
import { prisma } from "@barchop/database";
import { buildApp } from "../../src/app";
import type { App } from "../../src/tipos";
import { auth } from "../helpers/barbearia";
import { diasDaJanela, encher, prepararJanelaCurta } from "../helpers/agenda";

async function agendaCheia(app: App, slug: string): Promise<boolean> {
  const resposta = await app.inject({ method: "GET", url: `/barbearias/${slug}/agenda-cheia` });
  expect(resposta.statusCode).toBe(200);
  return resposta.json().cheia;
}

const hora = (hhmm: string) => new Date(`1970-01-01T${hhmm}:00Z`);

describe("GET /barbearias/:slug/agenda-cheia", () => {
  it("com a janela toda ocupada, está cheia", async () => {
    const app = buildApp();
    const agenda = await prepararJanelaCurta(app);
    await encher(agenda);

    expect(await agendaCheia(app, agenda.slug)).toBe(true);
  });

  it("com horário livre na janela, não está cheia", async () => {
    const app = buildApp();
    const agenda = await prepararJanelaCurta(app);

    expect(await agendaCheia(app, agenda.slug)).toBe(false);
  });

  it("sem limite de dias, nunca está cheia", async () => {
    const app = buildApp();
    const agenda = await prepararJanelaCurta(app);
    await encher(agenda);
    await prisma.barbearia.update({ where: { id: agenda.barbeariaId }, data: { janelaDias: null } });

    expect(await agendaCheia(app, agenda.slug)).toBe(false);
  });

  it("um buraco que cabe o serviço mais curto deixa de estar cheia", async () => {
    const app = buildApp();
    const agenda = await prepararJanelaCurta(app);
    await app.inject({
      method: "POST",
      url: "/servicos",
      headers: auth(agenda.token),
      payload: { nome: "Sobrancelha", duracaoMinutos: 15, preco: "20.00" },
    });
    // O último dia da janela, sempre no futuro: 09:45–10:00 livre. Não
    // cabe o Corte de 45 min, cabe a Sobrancelha.
    const ultimo = diasDaJanela().at(-1)!;
    await encher(agenda, { exceto: { dia: ultimo, ate: "09:45" } });

    expect(await agendaCheia(app, agenda.slug)).toBe(false);
  });

  it("sem nenhum agendamento no período (tudo bloqueado), não diz que está cheia", async () => {
    const app = buildApp();
    const agenda = await prepararJanelaCurta(app);
    const dias = diasDaJanela();
    await prisma.bloqueio.create({
      data: {
        barbeariaId: agenda.barbeariaId,
        barbeiroId: agenda.barbeiroId,
        dataInicio: dias[0]!,
        dataFim: dias.at(-1)!,
        horaInicio: hora("09:00"),
        horaFim: hora("10:00"),
      },
    });

    expect(await agendaCheia(app, agenda.slug)).toBe(false);
  });

  it("a agenda livre de quem não atende pelo link não conta", async () => {
    const app = buildApp();
    const agenda = await prepararJanelaCurta(app);
    // Inativo: fora de quem pode atender, mesmo fazendo o serviço (o
    // banco já liga o profissional novo a todos os serviços).
    const inativo = await prisma.barbeiro.create({
      data: { barbeariaId: agenda.barbeariaId, nome: "Rafa", senhaHash: "x", ativo: false },
    });
    expect(
      await prisma.profissionalServico.count({ where: { barbeiroId: inativo.id, servicoId: agenda.servico.id } })
    ).toBe(1);
    await encher(agenda);

    expect(await agendaCheia(app, agenda.slug)).toBe(true);
  });

  it("slug inexistente é 404", async () => {
    const app = buildApp();

    const resposta = await app.inject({ method: "GET", url: "/barbearias/nao-existe/agenda-cheia" });

    expect(resposta.statusCode).toBe(404);
  });
});
