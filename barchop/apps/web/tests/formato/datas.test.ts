import { describe, expect, it } from "vitest";
import {
  diasDoMes,
  ehPassado,
  formatarDataComSemana,
  formatarDataLonga,
  hojeIso,
  horaJaPassou,
} from "../../src/formato/datas";

// O instante entra por parâmetro, como o agoraNaBarbearia da API faz.
// Nada de fake timers: o user-event usa timers por dentro, e as telas
// que dependem destas funções clicam.
const TARDE = new Date("2026-09-09T14:00:00-03:00");

describe("datas do fluxo", () => {
  it("formata sem deslocar o dia pelo fuso", () => {
    // new Date("2026-09-09") é meia-noite UTC; formatar no fuso de São
    // Paulo mostraria 8 de setembro. É o bug clássico deste projeto,
    // onde toda data trafega como "YYYY-MM-DD".
    expect(formatarDataLonga("2026-09-09")).toBe("9 de setembro");
  });

  it("formata com o dia da semana, também sem deslocar pelo fuso", () => {
    // Função separada, e não um campo a mais na formatarDataLonga: aquela
    // é o nome acessível de cada dia do Calendario e das grades do
    // painel, e mudá-la mudaria o que o leitor de tela anuncia.
    expect(formatarDataComSemana("2026-09-29")).toBe("terça, 29 de setembro");
  });

  it("diz qual é o dia de hoje no formato da API", () => {
    expect(hojeIso(TARDE)).toBe("2026-09-09");
  });

  it("reconhece dia passado, e hoje não é passado", () => {
    expect(ehPassado("2026-09-08", TARDE)).toBe(true);
    expect(ehPassado("2026-09-09", TARDE)).toBe(false);
    expect(ehPassado("2026-09-10", TARDE)).toBe(false);
  });

  it("descarta hora que já passou, mas só no dia de hoje", () => {
    expect(horaJaPassou("2026-09-09", "09:00", TARDE)).toBe(true);
    expect(horaJaPassou("2026-09-09", "14:00", TARDE)).toBe(true);
    expect(horaJaPassou("2026-09-09", "14:30", TARDE)).toBe(false);
    // Amanhã às 9 não passou, por mais tarde que seja hoje.
    expect(horaJaPassou("2026-09-10", "09:00", TARDE)).toBe(false);
  });

  it("monta o mês com os vazios do começo da semana", () => {
    // Setembro de 2026 começa numa terça: duas casas vazias antes,
    // porque a semana do calendário começa no domingo, como o design.
    const dias = diasDoMes("2026-09");
    expect(dias.slice(0, 3)).toEqual([null, null, "2026-09-01"]);
    expect(dias.at(-1)).toBe("2026-09-30");
  });
});
