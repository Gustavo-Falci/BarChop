import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@barchop/database";
import { buildApp } from "../../src/app";
import type { App } from "../../src/tipos";
import { prepararAgenda, type Agenda } from "../helpers/agenda";
import { auth, criarMembroComToken } from "../helpers/barbearia";
import { criarClienteComToken } from "../helpers/cliente";
import { QUINTA } from "../helpers/datas";

// O cliente que já tem horário com quem ficou fora do link (Grátis acima
// do limite) remarca com o mesmo profissional, pela conta — decisão do
// dono, 14/10/2026. O prazo de remarcar da barbearia continua valendo.
// Agendamento NOVO com quem ficou de fora segue recusado
// (limite-do-plano.test.ts).
//
// O relógio de teste é o de regras-de-agendamento.test.ts: só o
// `agoraNaBarbearia` sem argumento muda, e só quando o teste pede.
const relogio = vi.hoisted(() => ({ agora: null as { data: string; hora: string } | null }));

vi.mock("../../src/lib/horas", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../src/lib/horas")>();
  return {
    ...original,
    agoraNaBarbearia: (instante?: Date) =>
      instante || !relogio.agora ? original.agoraNaBarbearia(instante) : relogio.agora,
  };
});

beforeEach(() => {
  relogio.agora = null;
});

function somarDias(data: string, dias: number): string {
  const dia = new Date(`${data}T12:00:00Z`);
  dia.setUTCDate(dia.getUTCDate() + dias);
  return dia.toISOString().slice(0, 10);
}

const SEXTA = somarDias(QUINTA, 1);

// O cliente da conta tem um horário na QUINTA às 13:00 com o
// profissional; depois a barbearia cai no Grátis com dois profissionais,
// e o profissional sai do link.
async function cenario(app: App) {
  const agenda = await prepararAgenda(app);
  const profissional = await criarMembroComToken(app, agenda.barbeariaId, "profissional", "p");
  const agendamento = (
    await app.inject({
      method: "POST",
      url: "/agendamentos",
      headers: auth(agenda.token),
      payload: {
        barbeiroId: profissional.barbeiroId,
        clienteId: agenda.cliente.id,
        servicoIds: [agenda.servico.id],
        data: QUINTA,
        horaInicio: "13:00",
      },
    })
  ).json();
  const cliente = await criarClienteComToken(app, agenda.slug, agenda.telefone);
  await prisma.assinatura.update({
    where: { barbeariaId: agenda.barbeariaId },
    data: { situacao: "gratis", testeTerminaEm: null },
  });
  return { agenda, profissional, agendamento, cliente };
}

function remarcar(app: App, token: string, id: string, data: string, horaInicio: string) {
  return app.inject({
    method: "POST",
    url: `/clientes/me/agendamentos/${id}/remarcar`,
    headers: auth(token),
    payload: { data, horaInicio },
  });
}

function disponibilidade(
  app: App,
  agenda: Agenda,
  params: { barbeiroId: string; remarcar?: string },
  headers = {},
  rota: "dia" | "mes" = "dia"
) {
  const busca = new URLSearchParams({
    barbeiroId: params.barbeiroId,
    ...(rota === "dia" ? { data: SEXTA } : { mes: SEXTA.slice(0, 7) }),
    ...(params.remarcar ? { remarcar: params.remarcar } : {}),
  });
  busca.append("servicoIds", agenda.servico.id);
  const caminho = rota === "dia" ? "disponibilidade" : "disponibilidade/mes";
  return app.inject({ method: "GET", url: `/barbearias/${agenda.slug}/${caminho}?${busca}`, headers });
}

function prazoDeRemarcar(barbeariaId: string, horas: number) {
  return prisma.barbearia.update({ where: { id: barbeariaId }, data: { prazoRemarcarHoras: horas } });
}

describe("remarcar com quem ficou fora do link", () => {
  it("o cliente remarca com o mesmo profissional", async () => {
    const app = buildApp();
    const { profissional, agendamento, cliente } = await cenario(app);

    const resposta = await remarcar(app, cliente.token, agendamento.id, SEXTA, "10:00");

    expect(resposta.statusCode).toBe(201);
    expect(resposta.json().agendamento.barbeiroId).toBe(profissional.barbeiroId);
    await app.close();
  });

  it("passado o prazo de remarcar, recusa", async () => {
    const app = buildApp();
    const { agenda, agendamento, cliente } = await cenario(app);
    await prazoDeRemarcar(agenda.barbeariaId, 6);
    relogio.agora = { data: QUINTA, hora: "10:00" };

    const resposta = await remarcar(app, cliente.token, agendamento.id, SEXTA, "10:00");

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json().erro).toBe("prazo_de_remarcar");
    await app.close();
  });

  it("a busca de horários do remarcar mostra a agenda do profissional, no dia e no mês", async () => {
    const app = buildApp();
    const { agenda, profissional, agendamento, cliente } = await cenario(app);
    const params = { barbeiroId: profissional.barbeiroId, remarcar: agendamento.id };

    const dia = await disponibilidade(app, agenda, params, auth(cliente.token));
    const mes = await disponibilidade(app, agenda, params, auth(cliente.token), "mes");

    expect(dia.statusCode).toBe(200);
    expect(dia.json().horarios.length).toBeGreaterThan(0);
    expect(mes.statusCode).toBe(200);
    expect(mes.json().dias[SEXTA]).toBe(true);
    await app.close();
  });

  it("sem o login do cliente, a busca do remarcar segue recusada", async () => {
    const app = buildApp();
    const { agenda, profissional, agendamento } = await cenario(app);

    const resposta = await disponibilidade(app, agenda, {
      barbeiroId: profissional.barbeiroId,
      remarcar: agendamento.id,
    });

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json().erro).toBe("barbeiro_invalido");
    await app.close();
  });

  it("o agendamento de outro cliente não abre a agenda", async () => {
    const app = buildApp();
    const { agenda, profissional, agendamento } = await cenario(app);
    const outro = await criarClienteComToken(app, agenda.slug, "11977776666");

    const resposta = await disponibilidade(
      app,
      agenda,
      { barbeiroId: profissional.barbeiroId, remarcar: agendamento.id },
      auth(outro.token)
    );

    expect(resposta.statusCode).toBe(422);
    await app.close();
  });

  it("passado o prazo de remarcar, a busca não abre a agenda", async () => {
    const app = buildApp();
    const { agenda, profissional, agendamento, cliente } = await cenario(app);
    await prazoDeRemarcar(agenda.barbeariaId, 6);
    relogio.agora = { data: QUINTA, hora: "10:00" };

    const resposta = await disponibilidade(
      app,
      agenda,
      { barbeiroId: profissional.barbeiroId, remarcar: agendamento.id },
      auth(cliente.token)
    );

    expect(resposta.statusCode).toBe(422);
    await app.close();
  });

  it("o remarcar só abre o profissional do próprio agendamento", async () => {
    const app = buildApp();
    const { agenda, agendamento, cliente } = await cenario(app);
    const outroDeFora = await criarMembroComToken(app, agenda.barbeariaId, "profissional", "p2");

    const resposta = await disponibilidade(
      app,
      agenda,
      { barbeiroId: outroDeFora.barbeiroId, remarcar: agendamento.id },
      auth(cliente.token)
    );

    expect(resposta.statusCode).toBe(422);
    await app.close();
  });
});
