import { describe, expect, it } from "vitest";
import type { DiaDaJornada } from "@barchop/types";
import { resumoDaPausa } from "../../../src/telas/painel/pausa";

// Painel v2, marco 3: o resumo da pausa de cada membro na seção "Pausas
// da equipe" de Horários, no mesmo jeito de escrever a rotina.

function semana(dias: Partial<Record<number, Partial<DiaDaJornada>>>): DiaDaJornada[] {
  return [0, 1, 2, 3, 4, 5, 6].map((diaSemana) => ({
    diaSemana,
    modo: "barbearia",
    horaInicio: null,
    horaFim: null,
    pausaInicio: null,
    pausaFim: null,
    ...dias[diaSemana],
  }));
}

const ALMOCO = { pausaInicio: "12:00", pausaFim: "13:00" };

describe("resumo da pausa", () => {
  it("sem pausa em dia nenhum", () => {
    expect(resumoDaPausa(semana({}))).toBe("Sem pausa");
  });

  it("a mesma pausa em dias seguidos vira um trecho", () => {
    expect(resumoDaPausa(semana({ 1: ALMOCO, 2: ALMOCO, 3: ALMOCO, 4: ALMOCO, 5: ALMOCO }))).toBe(
      "Seg a sex, 12:00–13:00"
    );
  });

  it("pausa guardada num dia de folga não conta", () => {
    expect(resumoDaPausa(semana({ 1: ALMOCO, 0: { modo: "folga", ...ALMOCO } }))).toBe("Seg, 12:00–13:00");
  });

  it("pausas diferentes entre os dias não cabem numa frase", () => {
    expect(resumoDaPausa(semana({ 1: ALMOCO, 2: { pausaInicio: "13:00", pausaFim: "14:00" } }))).toBe(
      "Pausas diferentes por dia"
    );
  });
});
