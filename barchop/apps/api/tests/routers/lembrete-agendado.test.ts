import { describe, expect, it } from "vitest";
import { prisma } from "@barchop/database";
import { buildApp } from "../../src/app";
import { filaDeMemoria, type Fila, type FilaDeMemoria } from "../../src/lib/fila";
import { momentoDoLembrete } from "../../src/lib/lembrete";
import { auth } from "../helpers/barbearia";
import { criarClienteComToken } from "../helpers/cliente";
import { QUINTA, proximoDiaDaSemana } from "../helpers/datas";
import { marcarPeloPainel, prepararAgenda } from "../helpers/agenda";

// Quem agenda o lembrete são as rotas que criam ou reativam um
// agendamento. O envio em si é do tratador (tests/lib/lembrete.test.ts).
function lembretesNaFila(fila: Fila) {
  return (fila as FilaDeMemoria).pendentes.filter((p) => p.trabalho === "lembrete");
}

describe("lembrete agendado", () => {
  it("marcar pelo painel agenda o lembrete 24 h antes, com a chave do agendamento", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    const agendamento = await marcarPeloPainel(app, agenda, { data: QUINTA, horaInicio: "10:00" });

    expect(lembretesNaFila(app.fila)).toEqual([
      {
        trabalho: "lembrete",
        dados: { agendamentoId: agendamento.id },
        quando: momentoDoLembrete(QUINTA, "10:00", 24),
        chave: `lembrete:${agendamento.id}`,
      },
    ]);
  });

  it("usa a antecedência da barbearia", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    await prisma.barbearia.update({
      where: { id: agenda.barbeariaId },
      data: { lembreteAntecedenciaHoras: 2 },
    });

    await marcarPeloPainel(app, agenda, { data: QUINTA, horaInicio: "10:00" });

    expect(lembretesNaFila(app.fila).map((p) => p.quando)).toEqual([
      momentoDoLembrete(QUINTA, "10:00", 2),
    ]);
  });

  it("a antecedência só aceita 2, 12 ou 24 horas", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    await expect(
      prisma.barbearia.update({
        where: { id: agenda.barbeariaId },
        data: { lembreteAntecedenciaHoras: 5 },
      })
    ).rejects.toThrow();
  });

  it("marcar pela página pública agenda o lembrete", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    const resposta = await app.inject({
      method: "POST",
      url: `/barbearias/${agenda.slug}/agendamentos`,
      payload: {
        servicoIds: [agenda.servico.id],
        data: QUINTA,
        horaInicio: "11:00",
        cliente: { nome: "Maria", telefone: "11977776666" },
      },
    });

    expect(resposta.statusCode).toBe(201);
    expect(lembretesNaFila(app.fila).map((p) => p.dados)).toEqual([
      { agendamentoId: resposta.json().id },
    ]);
  });

  it("remarcar agenda o lembrete do agendamento novo", async () => {
    // Remarcar cancela o antigo e cria outro: o trabalho do antigo fica
    // na fila e o tratador o descarta ao reler o status.
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    const cliente = await criarClienteComToken(app, agenda.slug, "11955554444");
    const original = (
      await app.inject({
        method: "POST",
        url: `/barbearias/${agenda.slug}/agendamentos`,
        payload: {
          servicoIds: [agenda.servico.id],
          data: QUINTA,
          horaInicio: "10:00",
          cliente: { nome: "João", telefone: "11955554444" },
        },
      })
    ).json();

    const outroDia = proximoDiaDaSemana(5);
    const resposta = await app.inject({
      method: "POST",
      url: `/clientes/me/agendamentos/${original.id}/remarcar`,
      headers: auth(cliente.token),
      payload: { data: outroDia, horaInicio: "15:00" },
    });

    expect(resposta.statusCode).toBe(201);
    const novo = resposta.json().agendamento;
    const doNovo = lembretesNaFila(app.fila).filter(
      (p) => (p.dados as { agendamentoId: string }).agendamentoId === novo.id
    );
    expect(doNovo.map((p) => p.quando)).toEqual([momentoDoLembrete(outroDia, "15:00", 24)]);
  });

  it("reativar um cancelado agenda o lembrete de novo", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    const agendamento = await marcarPeloPainel(app, agenda, { data: QUINTA, horaInicio: "10:00" });
    // O trabalho da criação já rodou (e foi descartado, com o
    // agendamento cancelado na hora): a fila está vazia.
    ((app.fila as FilaDeMemoria).pendentes as unknown[]).splice(0);

    for (const status of ["cancelado", "confirmado"]) {
      const resposta = await app.inject({
        method: "PATCH",
        url: `/agendamentos/${agendamento.id}`,
        headers: auth(agenda.token),
        payload: { status },
      });
      expect(resposta.statusCode).toBe(200);
    }

    expect(lembretesNaFila(app.fila).map((p) => p.chave)).toEqual([
      `lembrete:${agendamento.id}`,
    ]);
  });

  it("momento do lembrete já passado ainda agenda: sai na hora (decisão do dono)", async () => {
    // Marcar às 15h pras 18h com antecedência de 24 h: o lembrete não é
    // pulado. Quem descarta é o tratador, e só se o horário já começou.
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    await marcarPeloPainel(app, agenda, { data: "2026-09-10", horaInicio: "10:00" });

    const [lembrete] = lembretesNaFila(app.fila);
    expect(lembrete!.quando.getTime()).toBeLessThan(Date.now());
  });

  it("fila fora do ar não derruba o agendamento: ele já está gravado", async () => {
    // Um 500 aqui faria o cliente tentar de novo e bater no 409 do
    // próprio horário que acabou de marcar.
    const quebrada: Fila = {
      ...filaDeMemoria(),
      async agendar() {
        throw new Error("banco da fila fora do ar");
      },
    };
    const app = buildApp({ fila: quebrada });
    const agenda = await prepararAgenda(app);

    const resposta = await app.inject({
      method: "POST",
      url: "/agendamentos",
      headers: auth(agenda.token),
      payload: {
        barbeiroId: agenda.barbeiroId,
        clienteId: agenda.cliente.id,
        servicoIds: [agenda.servico.id],
        data: QUINTA,
        horaInicio: "10:00",
      },
    });

    expect(resposta.statusCode).toBe(201);
  });
});
