import { describe, expect, it } from "vitest";
import type { AgendamentoComCliente, BloqueioSerializado, HorarioSerializado } from "@barchop/types";
import { gradeDeTempo, MINUTOS_POR_LINHA } from "../../src/painel/grade";

// Onda 1, C3: na vista de dia, uma coluna por profissional, com os
// agendamentos de cada um e os bloqueios dele.

const HORARIOS: HorarioSerializado[] = [0, 1, 2, 3, 4, 5, 6].map((diaSemana) => ({
  diaSemana,
  horaAbertura: diaSemana === 0 ? null : "09:00",
  horaFechamento: diaSemana === 0 ? null : "18:00",
  fechado: diaSemana === 0,
}));

const TERCA = "2026-09-08";
const AGORA = new Date("2026-09-08T08:00:00-03:00");
const EQUIPE = [
  { id: "bb1", nome: "Rafael" },
  { id: "m2", nome: "Ana" },
];

function agendamento(id: string, barbeiroId: string, horaInicio: string, horaFim: string): AgendamentoComCliente {
  return {
    id,
    data: TERCA,
    horaInicio,
    horaFim,
    status: "confirmado",
    origem: "cliente",
    observacoes: null,
    barbeiro: { id: barbeiroId, nome: barbeiroId === "m2" ? "Ana" : "Rafael" },
    servicos: [{ servicoId: "s1", nome: "Corte", precoNoMomento: "40.00", duracaoNoMomento: 30 }],
    cliente: { id: "c1", nome: "João", telefone: "(11) 99999-0001", email: null, temConta: false },
  };
}

function bloqueio(entrada: Partial<BloqueioSerializado>): BloqueioSerializado {
  return {
    id: "x1",
    barbeiroId: "m2",
    dataInicio: TERCA,
    dataFim: TERCA,
    horaInicio: null,
    horaFim: null,
    motivo: null,
    ...entrada,
  };
}

describe("gradeDeTempo por profissional", () => {
  it("uma coluna por profissional, com o nome e só os agendamentos dele", () => {
    const grade = gradeDeTempo({
      dias: [TERCA],
      horarios: HORARIOS,
      agendamentos: [agendamento("a1", "bb1", "10:00", "10:30"), agendamento("a2", "m2", "11:00", "11:30")],
      agora: AGORA,
      profissionais: EQUIPE,
    });

    expect(grade.colunas.map((coluna) => coluna.rotulo)).toEqual(["Rafael", "Ana"]);
    expect(grade.colunas.map((coluna) => coluna.barbeiroId)).toEqual(["bb1", "m2"]);
    expect(grade.colunas[0].eventos.map((e) => e.agendamento.id)).toEqual(["a1"]);
    expect(grade.colunas[1].eventos.map((e) => e.agendamento.id)).toEqual(["a2"]);
    // O horário do Rafael ocupado não tira o livre da Ana.
    expect(grade.colunas[1].livres.map((f) => f.hora)).toContain("10:00");
    expect(grade.colunas[0].livres.map((f) => f.hora)).not.toContain("10:00");
  });

  it("o almoço vira um bloco na coluna e some dos horários livres", () => {
    const grade = gradeDeTempo({
      dias: [TERCA],
      horarios: HORARIOS,
      agendamentos: [],
      agora: AGORA,
      profissionais: EQUIPE,
      bloqueios: [bloqueio({ horaInicio: "12:00", horaFim: "13:00", motivo: "Almoço" })],
    });

    const ana = grade.colunas[1];
    expect(ana.livres.map((f) => f.hora)).not.toContain("12:00");
    expect(ana.livres.map((f) => f.hora)).not.toContain("12:45");
    expect(ana.livres.map((f) => f.hora)).toContain("13:00");
    expect(ana.bloqueios).toEqual([
      { linha: (12 * 60 - 9 * 60) / MINUTOS_POR_LINHA + 1, linhas: 60 / MINUTOS_POR_LINHA, rotulo: "Almoço" },
    ]);
    expect(grade.colunas[0].bloqueios).toEqual([]);
  });

  it("bloqueio do dia inteiro cobre a coluna e não deixa horário livre", () => {
    const grade = gradeDeTempo({
      dias: [TERCA],
      horarios: HORARIOS,
      agendamentos: [],
      agora: AGORA,
      profissionais: EQUIPE,
      bloqueios: [bloqueio({ dataInicio: "2026-09-07", dataFim: "2026-09-09" })],
    });

    const ana = grade.colunas[1];
    expect(ana.livres).toEqual([]);
    expect(ana.bloqueios).toEqual([{ linha: 1, linhas: grade.totalLinhas, rotulo: "Bloqueado" }]);
  });

  it("sem profissionais, as colunas continuam sendo os dias", () => {
    const grade = gradeDeTempo({
      dias: [TERCA],
      horarios: HORARIOS,
      agendamentos: [],
      agora: AGORA,
    });

    expect(grade.colunas).toHaveLength(1);
    expect(grade.colunas[0].rotulo).toBeUndefined();
    expect(grade.colunas[0].bloqueios).toEqual([]);
  });
});
