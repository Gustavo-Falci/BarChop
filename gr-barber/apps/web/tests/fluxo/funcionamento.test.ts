import { describe, expect, it } from "vitest";
import type { HorarioSerializado } from "@gr-barber/types";
import { agruparSemana, situacaoAgora } from "../../src/fluxo/funcionamento";

// Segunda a sábado das 9 às 18, domingo fechado — a semana do banco de
// dev e do dublê.
function semana(
  excecoes: Partial<Record<number, [string, string] | "fechado">> = {}
): HorarioSerializado[] {
  return [0, 1, 2, 3, 4, 5, 6].map((diaSemana) => {
    const regra = excecoes[diaSemana] ?? (diaSemana === 0 ? "fechado" : ["09:00", "18:00"]);
    return regra === "fechado"
      ? { diaSemana, horaAbertura: null, horaFechamento: null, fechado: true }
      : { diaSemana, horaAbertura: regra[0], horaFechamento: regra[1], fechado: false };
  });
}

// 2026-09-29 é terça.
const TERCA_10H = new Date("2026-09-29T10:00:00-03:00");

describe("semana agrupada", () => {
  it("junta os dias seguidos de mesmo horário e diz que o fechado está fechado", () => {
    // Visto no app: seis linhas iguais de "09:00 às 18:00", e o domingo
    // sumia — quem queria saber se abre domingo ficava sem resposta.
    expect(agruparSemana(semana(), TERCA_10H)).toEqual([
      { dias: "Segunda a sábado", horario: "09:00 às 18:00", hoje: true },
      { dias: "Domingo", horario: "Fechado", hoje: false },
    ]);
  });

  it("dois dias seguidos viram 'e', um só fica sozinho", () => {
    const linhas = agruparSemana(
      semana({ 5: ["09:00", "20:00"], 6: ["09:00", "20:00"], 3: "fechado" }),
      TERCA_10H
    );

    expect(linhas.map((l) => `${l.dias}: ${l.horario}`)).toEqual([
      "Segunda e terça: 09:00 às 18:00",
      "Quarta: Fechado",
      "Quinta: 09:00 às 18:00",
      "Sexta e sábado: 09:00 às 20:00",
      "Domingo: Fechado",
    ]);
  });

  it("dia que a API nem mandou conta como fechado", () => {
    const soSegunda = semana().filter((d) => d.diaSemana === 1);

    expect(agruparSemana(soSegunda, TERCA_10H)).toEqual([
      { dias: "Segunda", horario: "09:00 às 18:00", hoje: false },
      { dias: "Terça a domingo", horario: "Fechado", hoje: true },
    ]);
  });
});

describe("situação de agora", () => {
  it("aberta: diz até quando", () => {
    expect(situacaoAgora(semana(), TERCA_10H)).toBe("Aberto agora · fecha às 18:00");
  });

  it("antes de abrir: diz a hora de hoje", () => {
    const cedo = new Date("2026-09-29T07:30:00-03:00");
    expect(situacaoAgora(semana(), cedo)).toBe("Fechado agora · abre hoje às 09:00");
  });

  it("depois de fechar: diz o próximo dia, chamando amanhã de amanhã", () => {
    const noite = new Date("2026-09-29T20:00:00-03:00");
    expect(situacaoAgora(semana(), noite)).toBe("Fechado agora · abre amanhã às 09:00");
  });

  it("pula o dia fechado e diz o nome do dia", () => {
    // Sábado à noite: domingo é fechado, então abre segunda.
    const sabadoNoite = new Date("2026-10-03T20:00:00-03:00");
    expect(situacaoAgora(semana(), sabadoNoite)).toBe(
      "Fechado agora · abre segunda às 09:00"
    );
  });

  it("sem dia aberto nenhum, não inventa frase", () => {
    const tudoFechado = semana({
      1: "fechado",
      2: "fechado",
      3: "fechado",
      4: "fechado",
      5: "fechado",
      6: "fechado",
    });
    expect(situacaoAgora(tudoFechado, TERCA_10H)).toBeNull();
  });
});
