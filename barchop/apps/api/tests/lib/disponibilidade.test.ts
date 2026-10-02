import { describe, expect, it } from "vitest";
import { horariosLivres } from "../../src/lib/disponibilidade";
import { horaParaDate } from "../../src/lib/horas";

function janela(abertura: string, fechamento: string) {
  return {
    horaAbertura: horaParaDate(abertura),
    horaFechamento: horaParaDate(fechamento),
    fechado: false,
  };
}

describe("horariosLivres", () => {
  it("devolve a grade inteira quando o dia está vazio", () => {
    const horarios = horariosLivres({
      janela: janela("09:00", "11:00"),
      ocupados: [],
      duracaoTotalMinutos: 60,
    });

    expect(horarios).toEqual(["09:00", "09:15", "09:30", "09:45", "10:00"]);
  });

  it("tira os horários que colidem com o que já existe", () => {
    const horarios = horariosLivres({
      janela: janela("09:00", "12:00"),
      ocupados: [
        { horaInicio: horaParaDate("10:00"), horaFim: horaParaDate("10:45") },
      ],
      duracaoTotalMinutos: 45,
    });

    expect(horarios).toContain("09:00");
    // 09:30 + 45min invadiria as 10:00.
    expect(horarios).not.toContain("09:30");
    // Borda meio-aberta: começar às 10:45 encosta e é válido.
    expect(horarios).toContain("10:45");
  });

  it("devolve vazio quando o dia está fechado", () => {
    expect(
      horariosLivres({
        janela: { horaAbertura: null, horaFechamento: null, fechado: true },
        ocupados: [],
        duracaoTotalMinutos: 30,
      })
    ).toEqual([]);
  });

  it("trata dia sem linha nenhuma como fechado", () => {
    // A regra vive aqui, e não em cada chamador: é o mesmo significado
    // que o PUT de horários grava (dia ausente vira fechado).
    expect(
      horariosLivres({
        janela: null,
        ocupados: [],
        duracaoTotalMinutos: 30,
      })
    ).toEqual([]);
  });

  it("devolve vazio quando a duração não cabe no expediente", () => {
    expect(
      horariosLivres({
        janela: janela("09:00", "09:30"),
        ocupados: [],
        duracaoTotalMinutos: 45,
      })
    ).toEqual([]);
  });
});
