import { describe, expect, it } from "vitest";
import type { DiaDaJornada } from "@barchop/types";
import { resumoDaPausa, textoDasPausas } from "../../../src/telas/painel/pausa";

// Painel v2, marco 3: o resumo da pausa de cada membro na seção "Pausas
// da equipe" de Horários, no mesmo jeito de escrever a rotina.

function semana(dias: Partial<Record<number, Partial<DiaDaJornada>>>): DiaDaJornada[] {
  return [0, 1, 2, 3, 4, 5, 6].map((diaSemana) => ({
    diaSemana,
    modo: "barbearia",
    horaInicio: null,
    horaFim: null,
    pausas: [],
    ...dias[diaSemana],
  }));
}

const ALMOCO = { pausas: [{ inicio: "12:00", fim: "13:00" }] };
const ALMOCO_E_CAFE = { pausas: [{ inicio: "12:00", fim: "13:00" }, { inicio: "16:00", fim: "16:15" }] };

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
    expect(resumoDaPausa(semana({ 1: ALMOCO, 2: { pausas: [{ inicio: "13:00", fim: "14:00" }] } }))).toBe(
      "Pausas diferentes por dia"
    );
  });

  it("as mesmas duas pausas em todo dia de trabalho cabem numa frase", () => {
    expect(
      resumoDaPausa(semana({ 1: ALMOCO_E_CAFE, 2: ALMOCO_E_CAFE, 3: ALMOCO_E_CAFE, 4: ALMOCO_E_CAFE, 5: ALMOCO_E_CAFE }))
    ).toBe("Seg a sex, 12:00–13:00 e 16:00–16:15");
  });

  it("um dia com uma pausa a mais já é diferente", () => {
    expect(resumoDaPausa(semana({ 1: ALMOCO, 2: ALMOCO_E_CAFE }))).toBe("Pausas diferentes por dia");
  });
});

describe("texto das pausas", () => {
  it("uma, duas ou três", () => {
    const almoco = { inicio: "12:00", fim: "13:00" };
    const cafe = { inicio: "16:00", fim: "16:15" };
    const lanche = { inicio: "19:00", fim: "19:30" };
    expect(textoDasPausas([almoco])).toBe("12:00–13:00");
    expect(textoDasPausas([almoco, cafe])).toBe("12:00–13:00 e 16:00–16:15");
    expect(textoDasPausas([almoco, cafe, lanche])).toBe("12:00–13:00, 16:00–16:15 e 19:00–19:30");
  });
});
