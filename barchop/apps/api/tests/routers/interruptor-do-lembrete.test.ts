import { describe, expect, it } from "vitest";
import { prisma } from "@barchop/database";
import { buildApp } from "../../src/app";
import { canalDeMemoria } from "../../src/lib/canal";
import type { Fila, FilaDeMemoria } from "../../src/lib/fila";
import { enviarLembrete } from "../../src/lib/lembrete";
import { auth } from "../helpers/barbearia";
import { QUINTA } from "../helpers/datas";
import { marcarPeloPainel, prepararAgenda, type Agenda } from "../helpers/agenda";
import type { App } from "../../src/tipos";

// Onda 1, G2c (decisão do dono, 2026-10-05): o lembrete tem interruptor
// por barbearia, ligado nas novas. A GR Barber entra desligada na
// migração do G3, pra medir as faltas antes; ligar enfileira os
// agendamentos futuros que já existem — os migrados nunca passaram por
// agendarLembrete.

const log = { info: () => {}, error: () => {} };
const antes = new Date("2000-01-01T00:00:00.000Z");

function lembretesNaFila(fila: Fila) {
  return (fila as FilaDeMemoria).pendentes.filter((p) => p.trabalho === "lembrete");
}

function ligar(app: App, agenda: Agenda, lembreteAtivo: boolean) {
  return app.inject({
    method: "PATCH",
    url: "/barbearias/me",
    headers: auth(agenda.token),
    payload: { lembreteAtivo },
  });
}

describe("interruptor do lembrete", () => {
  it("a barbearia nova nasce com o lembrete ligado", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    const resposta = await app.inject({ method: "GET", url: "/barbearias/me", headers: auth(agenda.token) });

    expect(resposta.json().lembreteAtivo).toBe(true);
  });

  it("desligado, marcar não agenda lembrete", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    const desligou = await ligar(app, agenda, false);
    await marcarPeloPainel(app, agenda, { data: QUINTA, horaInicio: "10:00" });

    expect(desligou.statusCode).toBe(200);
    expect(desligou.json().lembreteAtivo).toBe(false);
    expect(lembretesNaFila(app.fila)).toEqual([]);
  });

  it("desligado depois de o lembrete entrar na fila, o tratador não manda", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app, { email: "joao@exemplo.com" });
    const agendamento = await marcarPeloPainel(app, agenda, { data: QUINTA, horaInicio: "10:00" });
    await ligar(app, agenda, false);
    const canal = canalDeMemoria();

    await enviarLembrete({ agendamentoId: agendamento.id }, { canal, log, agora: () => antes });

    expect(canal.enviadas).toEqual([]);
    const gravado = await prisma.agendamento.findUniqueOrThrow({ where: { id: agendamento.id } });
    expect(gravado.lembreteEnviadoEm).toBeNull();
  });

  it("ligar enfileira os futuros ativos que ainda não receberam lembrete", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    await ligar(app, agenda, false);
    const futuro = await marcarPeloPainel(app, agenda, { data: QUINTA, horaInicio: "10:00" });
    const cancelado = await marcarPeloPainel(app, agenda, { data: QUINTA, horaInicio: "11:00" });
    const jaLembrado = await marcarPeloPainel(app, agenda, { data: QUINTA, horaInicio: "13:00" });
    await prisma.agendamento.update({ where: { id: cancelado.id }, data: { status: "cancelado" } });
    await prisma.agendamento.update({ where: { id: jaLembrado.id }, data: { lembreteEnviadoEm: new Date() } });

    const ligou = await ligar(app, agenda, true);

    expect(ligou.statusCode).toBe(200);
    expect(lembretesNaFila(app.fila).map((p) => p.dados)).toEqual([{ agendamentoId: futuro.id }]);
  });

  it("ligar o que já está ligado não enfileira de novo", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    await marcarPeloPainel(app, agenda, { data: QUINTA, horaInicio: "10:00" });
    ((app.fila as FilaDeMemoria).pendentes as unknown[]).splice(0);

    await ligar(app, agenda, true);

    expect(lembretesNaFila(app.fila)).toEqual([]);
  });

  it("os agendamentos de outra barbearia não entram na fila", async () => {
    const app = buildApp();
    const um = await prepararAgenda(app, { sufixo: "um" });
    const dois = await prepararAgenda(app, { sufixo: "dois" });
    await ligar(app, um, false);
    await ligar(app, dois, false);
    await marcarPeloPainel(app, dois, { data: QUINTA, horaInicio: "10:00" });

    await ligar(app, um, true);

    expect(lembretesNaFila(app.fila)).toEqual([]);
  });
});
