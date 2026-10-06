import { describe, expect, it } from "vitest";
import type { HorarioSerializado } from "@barchop/types";
import {
  aplicarRotina,
  difereDaRotina,
  fraseDaRotina,
  rotinaDaSemana,
} from "../../src/telas/painel/configuracoes/rotina";

// A rotina da semana dos Horários (painel v2, marco 2, PR C): os dias em
// que abre e um horário só, aplicados de uma vez. A semana continua
// sendo o que vai pra API — a rotina é um jeito rápido de preenchê-la.

function semana(abertos: Record<number, [string, string]>): HorarioSerializado[] {
  return [0, 1, 2, 3, 4, 5, 6].map((diaSemana) => {
    const horas = abertos[diaSemana];
    return horas
      ? { diaSemana, horaAbertura: horas[0], horaFechamento: horas[1], fechado: false }
      : { diaSemana, horaAbertura: null, horaFechamento: null, fechado: true };
  });
}

const SEG_A_SEX: Record<number, [string, string]> = {
  1: ["09:00", "18:00"],
  2: ["09:00", "18:00"],
  3: ["09:00", "18:00"],
  4: ["09:00", "18:00"],
  5: ["09:00", "18:00"],
};

describe("rotina da semana", () => {
  it("lê a rotina da semana salva: os dias abertos e o horário mais comum", () => {
    const salva = semana({ ...SEG_A_SEX, 6: ["08:00", "13:00"] });

    expect(rotinaDaSemana(salva)).toEqual({ dias: [1, 2, 3, 4, 5, 6], abre: "09:00", fecha: "18:00" });
  });

  it("semana toda fechada vira rotina sem dias, com o horário padrão", () => {
    expect(rotinaDaSemana(semana({}))).toEqual({ dias: [], abre: "09:00", fecha: "18:00" });
  });

  it("aplicar abre os dias marcados no horário da rotina e fecha os outros", () => {
    const resultado = aplicarRotina(semana({ 0: ["10:00", "14:00"] }), {
      dias: [1, 2, 3, 4, 5],
      abre: "09:00",
      fecha: "18:00",
    });

    expect(resultado).toEqual(semana(SEG_A_SEX));
  });

  it("dia aberto com horário diferente da rotina é diferente; fechado fora da rotina não é", () => {
    const rotina = { dias: [1, 2, 3, 4, 5], abre: "09:00", fecha: "18:00" };
    const salva = semana({ ...SEG_A_SEX, 5: ["09:00", "20:00"] });

    expect(difereDaRotina(salva[5]!, rotina)).toBe(true);
    expect(difereDaRotina(salva[1]!, rotina)).toBe(false);
    expect(difereDaRotina(salva[0]!, rotina)).toBe(false);
  });

  it("dia fechado que a rotina abre, ou aberto que ela fecha, é diferente", () => {
    const rotina = { dias: [1, 2, 3, 4, 5], abre: "09:00", fecha: "18:00" };
    const salva = semana({ 1: ["09:00", "18:00"], 6: ["09:00", "18:00"] });

    expect(difereDaRotina(salva[2]!, rotina)).toBe(true);
    expect(difereDaRotina(salva[6]!, rotina)).toBe(true);
  });

  it.each([
    [[1, 2, 3, 4, 5], "Seg a sex, 09:00–18:00"],
    [[1, 2, 3, 4, 5, 6], "Seg a sáb, 09:00–18:00"],
    [[0, 1, 2, 3, 4, 5, 6], "Todos os dias, 09:00–18:00"],
    [[1, 3, 5], "Seg, qua e sex, 09:00–18:00"],
    [[6, 0], "Sáb e dom, 09:00–18:00"],
    [[2, 3, 4, 6], "Ter a qui e sáb, 09:00–18:00"],
    [[], "Fechado a semana toda"],
  ])("frase da rotina %j", (dias, frase) => {
    expect(fraseDaRotina({ dias, abre: "09:00", fecha: "18:00" })).toBe(frase);
  });
});
