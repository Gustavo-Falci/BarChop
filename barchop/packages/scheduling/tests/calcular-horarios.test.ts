import { describe, expect, it } from "vitest";
import { calcularHorariosDisponiveis } from "../src/index";

const ABERTO = {
  horaAbertura: "09:00",
  horaFechamento: "18:00",
  fechado: false,
};

describe("calcularHorariosDisponiveis", () => {
  it("devolve lista vazia quando o dia está fechado", () => {
    expect(
      calcularHorariosDisponiveis({
        horarioFuncionamento: { horaAbertura: null, horaFechamento: null, fechado: true },
        agendamentosExistentes: [],
        duracaoTotalMinutos: 45,
      })
    ).toEqual([]);
  });

  it("devolve lista vazia quando falta hora de abertura", () => {
    expect(
      calcularHorariosDisponiveis({
        horarioFuncionamento: { horaAbertura: null, horaFechamento: "18:00", fechado: false },
        agendamentosExistentes: [],
        duracaoTotalMinutos: 45,
      })
    ).toEqual([]);
  });

  it("preenche o expediente inteiro quando não há agendamento", () => {
    const horarios = calcularHorariosDisponiveis({
      horarioFuncionamento: ABERTO,
      agendamentosExistentes: [],
      duracaoTotalMinutos: 45,
    });

    expect(horarios[0]).toBe("09:00");
    // 18:00 menos 45min de duração: o último início possível é 17:15
    expect(horarios.at(-1)).toBe("17:15");
  });

  it("pula o intervalo ocupado e retoma no fim dele", () => {
    const horarios = calcularHorariosDisponiveis({
      horarioFuncionamento: ABERTO,
      agendamentosExistentes: [{ horaInicio: "10:00", horaFim: "10:45" }],
      duracaoTotalMinutos: 45,
    });

    // 09:00 e 09:15 cabem antes das 10:00; 09:30 não (terminaria 10:15).
    expect(horarios.slice(0, 3)).toEqual(["09:00", "09:15", "10:45"]);
    expect(horarios).not.toContain("09:30");
  });

  it("descarta gap curto demais pra duração pedida", () => {
    const horarios = calcularHorariosDisponiveis({
      horarioFuncionamento: ABERTO,
      agendamentosExistentes: [
        { horaInicio: "09:00", horaFim: "10:00" },
        { horaInicio: "10:30", horaFim: "11:00" },
      ],
      duracaoTotalMinutos: 45,
    });

    // O gap 10:00–10:30 tem 30min e não comporta 45min.
    expect(horarios).not.toContain("10:00");
    expect(horarios[0]).toBe("11:00");
  });

  it("alinha os candidatos ao grid, não ao fim do agendamento anterior", () => {
    const horarios = calcularHorariosDisponiveis({
      horarioFuncionamento: ABERTO,
      agendamentosExistentes: [{ horaInicio: "09:00", horaFim: "09:07" }],
      duracaoTotalMinutos: 30,
    });

    // Sem alinhamento sairia "09:07". O grid de 15min a partir da
    // meia-noite manda sugerir 09:15.
    expect(horarios[0]).toBe("09:15");
  });

  it("respeita intervaloMinutos customizado", () => {
    const horarios = calcularHorariosDisponiveis({
      horarioFuncionamento: ABERTO,
      agendamentosExistentes: [],
      duracaoTotalMinutos: 30,
      intervaloMinutos: 30,
    });

    expect(horarios.slice(0, 3)).toEqual(["09:00", "09:30", "10:00"]);
  });

  it("devolve lista vazia quando a duração não cabe no expediente", () => {
    expect(
      calcularHorariosDisponiveis({
        horarioFuncionamento: { horaAbertura: "09:00", horaFechamento: "09:30", fechado: false },
        agendamentosExistentes: [],
        duracaoTotalMinutos: 45,
      })
    ).toEqual([]);
  });

  it("trata o fim do agendamento como exclusivo, igual à constraint do banco", () => {
    const horarios = calcularHorariosDisponiveis({
      horarioFuncionamento: ABERTO,
      agendamentosExistentes: [{ horaInicio: "10:00", horaFim: "10:45" }],
      duracaoTotalMinutos: 45,
    });

    // A EXCLUDE constraint usa tsrange '[)', então 10:45 encosta mas
    // não colide. As duas regras têm que concordar.
    expect(horarios).toContain("10:45");
  });
});
