import { describe, expect, it } from "vitest";
import { horaParaDate } from "../../src/lib/horas";
import { minutosAgendados, minutosDeTrabalho } from "../../src/lib/ocupacao";

// A ocupação do Hoje (painel v2, marco 4): quanto da janela de trabalho
// de cada profissional já está agendado. Pura, sem banco.

const h = horaParaDate;
const aberta = { horaAbertura: h("09:00"), horaFechamento: h("18:00"), fechado: false };
const FECHADO = { horaAbertura: null, horaFechamento: null, fechado: true };

function faixa(inicio: string, fim: string) {
  return { horaInicio: h(inicio), horaFim: h(fim) };
}

describe("minutosDeTrabalho", () => {
  it("é a janela inteira sem nada a descontar", () => {
    expect(minutosDeTrabalho(aberta, [])).toBe(540);
  });

  it("dia fechado não tem trabalho", () => {
    expect(minutosDeTrabalho(FECHADO, [faixa("12:00", "13:00")])).toBe(0);
  });

  it("desconta a pausa e o bloqueio de horas", () => {
    expect(minutosDeTrabalho(aberta, [faixa("12:00", "13:00"), faixa("15:00", "16:00")])).toBe(420);
  });

  it("pausa e bloqueio que se sobrepõem descontam uma vez só", () => {
    // 12:00–13:00 e 12:30–14:00 cobrem 12:00–14:00: 120 minutos, não 150.
    expect(minutosDeTrabalho(aberta, [faixa("12:00", "13:00"), faixa("12:30", "14:00")])).toBe(420);
  });

  it("o que cai fora da janela não desconta", () => {
    expect(minutosDeTrabalho(aberta, [faixa("07:00", "08:00")])).toBe(540);
    expect(minutosDeTrabalho(aberta, [faixa("08:00", "10:00"), faixa("17:30", "19:00")])).toBe(450);
  });

  it("desconto que cobre a janela inteira zera, sem ficar negativo", () => {
    expect(minutosDeTrabalho(aberta, [faixa("08:00", "19:00"), faixa("10:00", "11:00")])).toBe(0);
  });
});

describe("minutosAgendados", () => {
  function agendamento(inicio: string, fim: string, status: string) {
    return { ...faixa(inicio, fim), status };
  }

  it("soma pendente, confirmado e concluído", () => {
    expect(
      minutosAgendados([
        agendamento("09:00", "09:45", "pendente"),
        agendamento("10:00", "10:30", "confirmado"),
        agendamento("11:00", "12:00", "concluido"),
      ])
    ).toBe(135);
  });

  it("cancelado e falta devolvem o horário", () => {
    expect(
      minutosAgendados([
        agendamento("09:00", "09:45", "cancelado"),
        agendamento("10:00", "10:30", "no_show"),
        agendamento("11:00", "11:30", "pendente"),
      ])
    ).toBe(30);
  });
});
