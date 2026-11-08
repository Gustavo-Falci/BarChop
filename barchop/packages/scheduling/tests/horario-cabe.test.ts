import { describe, expect, it } from "vitest";
import {
  calcularHorariosDisponiveis,
  horarioCabe,
  type CalcularHorariosParams,
} from "../src/index";

const ABERTO = {
  horaAbertura: "09:00",
  horaFechamento: "18:00",
  fechado: false,
};

function dia(extra: Partial<CalcularHorariosParams> = {}): CalcularHorariosParams {
  return {
    horarioFuncionamento: ABERTO,
    agendamentosExistentes: [
      { horaInicio: "09:00", horaFim: "09:30", atendimento: true },
      { horaInicio: "09:40", horaFim: "10:30", atendimento: true },
      { horaInicio: "12:00", horaFim: "13:00" },
    ],
    duracaoTotalMinutos: 30,
    ...extra,
  };
}

describe("horarioCabe", () => {
  it("qualquer minuto que cabe no vão serve, mesmo fora da grade", () => {
    expect(horarioCabe(dia(), "10:35")).toBeNull();
    expect(horarioCabe(dia(), "11:30")).toBeNull();
    expect(horarioCabe(dia(), "13:00")).toBeNull();
  });

  it("dia fechado: fechado", () => {
    expect(
      horarioCabe(
        dia({ horarioFuncionamento: { horaAbertura: null, horaFechamento: null, fechado: true } }),
        "10:00"
      )
    ).toEqual({ motivo: "fechado" });
  });

  it("antes de abrir ou passando do fechamento: fora do expediente", () => {
    expect(horarioCabe(dia(), "08:50")).toEqual({ motivo: "fora_do_expediente" });
    expect(horarioCabe(dia(), "17:35")).toEqual({ motivo: "fora_do_expediente" });
    expect(horarioCabe(dia(), "17:30")).toBeNull();
  });

  it("sem precisar caber antes de fechar: começa até o último minuto aberto", () => {
    const solto = dia({ cabeAntesDeFechar: false });

    expect(horarioCabe(solto, "17:59")).toBeNull();
    expect(horarioCabe(solto, "18:00")).toEqual({ motivo: "fora_do_expediente" });
  });

  it("bate com o que está ocupado: diz qual, pelo índice da lista recebida", () => {
    // 09:30 + 30 = 10:00 entra no das 09:40.
    expect(horarioCabe(dia(), "09:30")).toEqual({ motivo: "ocupado", indice: 1 });
    // 11:45 + 30 = 12:15 entra na pausa.
    expect(horarioCabe(dia(), "11:45")).toEqual({ motivo: "ocupado", indice: 2 });
  });

  it("encostar não é bater: termina quando o outro começa", () => {
    expect(horarioCabe(dia(), "11:30")).toBeNull();
    expect(horarioCabe(dia({ duracaoTotalMinutos: 10 }), "09:30")).toBeNull();
  });

  it("dois no caminho: diz o primeiro", () => {
    expect(horarioCabe(dia({ duracaoTotalMinutos: 120 }), "09:20")).toEqual({
      motivo: "ocupado",
      indice: 0,
    });
  });

  // A lista e a conferência não podem discordar: o que a lista oferece
  // cabe, e o que cabe na grade de 15 está na lista.
  it.each([
    ["o dia de exemplo", dia()],
    ["serviço longo", dia({ duracaoTotalMinutos: 75 })],
    ["sem caber antes de fechar", dia({ cabeAntesDeFechar: false, duracaoTotalMinutos: 45 })],
    ["com logo depois", dia({ logoDepoisDoAnterior: true })],
    [
      "ocupado passando do fechamento",
      dia({
        agendamentosExistentes: [{ horaInicio: "17:00", horaFim: "18:30", atendimento: true }],
        cabeAntesDeFechar: false,
      }),
    ],
    ["dia vazio, fecha 23:30", dia({ agendamentosExistentes: [], horarioFuncionamento: { ...ABERTO, horaFechamento: "23:30" }, cabeAntesDeFechar: false, duracaoTotalMinutos: 60 })],
  ])("concorda com a lista: %s", (_nome, params) => {
    const lista = calcularHorariosDisponiveis(params);

    for (const hora of lista) expect(horarioCabe(params, hora), hora).toBeNull();

    for (let minuto = 0; minuto < 24 * 60; minuto += 15) {
      const hora = `${String(Math.floor(minuto / 60)).padStart(2, "0")}:${String(minuto % 60).padStart(2, "0")}`;
      expect(lista.includes(hora), hora).toBe(horarioCabe(params, hora) === null);
    }
  });
});
