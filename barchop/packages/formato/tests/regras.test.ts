import { describe, expect, it } from "vitest";
import {
  ANTECEDENCIAS_MINUTOS,
  INTERVALOS_MINUTOS,
  JANELAS_DIAS,
  PRAZOS_HORAS,
  REGRAS_PADRAO,
  minutosAte,
  prazoDoClientePassou,
  regraQueRecusa,
} from "../src/regras";

// Regras de agendamento (painel v2, marco 3): o que o cliente pode
// marcar pelo link. Puro, com o `agora` de fora e tudo em string do
// contrato ("YYYY-MM-DD", "HH:mm") — a API recusa com isto e a tela do
// cliente esconde os botões com isto, sem fuso de máquina no meio.

const AGORA = { data: "2026-11-12", hora: "10:00" };

describe("listas e padrões", () => {
  it("as opções da tela, nesta ordem", () => {
    expect(INTERVALOS_MINUTOS).toEqual([15, 30, 60]);
    expect(ANTECEDENCIAS_MINUTOS).toEqual([0, 30, 60, 120, 240, 1440]);
    expect(JANELAS_DIAS).toEqual([7, 14, 30, 60, 90]);
    expect(PRAZOS_HORAS).toEqual([0, 1, 2, 6, 12, 24, 48]);
  });

  it("os padrões reproduzem o comportamento de antes das regras", () => {
    expect(REGRAS_PADRAO).toEqual({
      intervaloMinutos: 15,
      antecedenciaMinutos: 0,
      aceitaMesmoDia: true,
      janelaDias: null,
      cabeAntesDeFechar: true,
      prazoRemarcarHoras: 0,
      prazoCancelarHoras: 0,
    });
  });
});

describe("minutosAte", () => {
  it("conta os minutos do agora até o horário, atravessando dias", () => {
    expect(minutosAte(AGORA, "2026-11-12", "10:30")).toBe(30);
    expect(minutosAte(AGORA, "2026-11-13", "10:00")).toBe(1440);
    expect(minutosAte(AGORA, "2026-11-12", "09:00")).toBe(-60);
  });

  it("atravessa o mês e o ano", () => {
    expect(minutosAte({ data: "2026-12-31", hora: "23:00" }, "2027-01-01", "01:00")).toBe(120);
  });
});

describe("regraQueRecusa", () => {
  it("com os padrões, só recusa o que já passou (o minuto atual também)", () => {
    expect(regraQueRecusa(REGRAS_PADRAO, AGORA, "2026-11-12", "10:15")).toBeNull();
    expect(regraQueRecusa(REGRAS_PADRAO, AGORA, "2026-11-12", "10:00")).toBe("horario_passado");
    expect(regraQueRecusa(REGRAS_PADRAO, AGORA, "2026-11-11", "15:00")).toBe("horario_passado");
    expect(regraQueRecusa(REGRAS_PADRAO, AGORA, "2027-11-12", "10:00")).toBeNull();
  });

  it("sem marcar no mesmo dia, hoje inteiro fica fora e amanhã não", () => {
    const regras = { ...REGRAS_PADRAO, aceitaMesmoDia: false };
    expect(regraQueRecusa(regras, AGORA, "2026-11-12", "17:00")).toBe("mesmo_dia_fechado");
    expect(regraQueRecusa(regras, AGORA, "2026-11-13", "09:00")).toBeNull();
  });

  it("a antecedência conta do agora, no limite ainda dá, e atravessa a meia-noite", () => {
    const regras = { ...REGRAS_PADRAO, antecedenciaMinutos: 120 as const };
    expect(regraQueRecusa(regras, AGORA, "2026-11-12", "11:45")).toBe("fora_da_antecedencia");
    expect(regraQueRecusa(regras, AGORA, "2026-11-12", "12:00")).toBeNull();

    const umDia = { ...REGRAS_PADRAO, antecedenciaMinutos: 1440 as const };
    expect(regraQueRecusa(umDia, AGORA, "2026-11-13", "09:45")).toBe("fora_da_antecedencia");
    expect(regraQueRecusa(umDia, AGORA, "2026-11-13", "10:00")).toBeNull();
  });

  it("a janela conta dias de calendário a partir de hoje", () => {
    const regras = { ...REGRAS_PADRAO, janelaDias: 7 as const };
    expect(regraQueRecusa(regras, AGORA, "2026-11-19", "18:00")).toBeNull();
    expect(regraQueRecusa(regras, AGORA, "2026-11-20", "09:00")).toBe("fora_da_janela");
  });

  it("o passado ganha das outras recusas", () => {
    const regras = { ...REGRAS_PADRAO, aceitaMesmoDia: false, antecedenciaMinutos: 60 as const };
    expect(regraQueRecusa(regras, AGORA, "2026-11-12", "09:00")).toBe("horario_passado");
  });
});

describe("prazoDoClientePassou", () => {
  it("prazo 0 é até o horário começar", () => {
    expect(prazoDoClientePassou(0, AGORA, "2026-11-12", "10:15")).toBe(false);
    expect(prazoDoClientePassou(0, AGORA, "2026-11-12", "10:00")).toBe(true);
  });

  it("prazo em horas antes do horário, no limite ainda dá", () => {
    expect(prazoDoClientePassou(2, AGORA, "2026-11-12", "12:00")).toBe(false);
    expect(prazoDoClientePassou(2, AGORA, "2026-11-12", "11:59")).toBe(true);
    expect(prazoDoClientePassou(6, AGORA, "2026-11-12", "12:00")).toBe(true);
    expect(prazoDoClientePassou(48, AGORA, "2026-11-14", "10:00")).toBe(false);
  });
});
