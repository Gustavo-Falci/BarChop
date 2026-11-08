import { describe, expect, it } from "vitest";
import { buracosDoDia, encaixeDe, textoDoEncaixe } from "../../src/painel/encaixe";

const ag = (horaInicio: string, horaFim: string, ...duracoes: number[]) => ({
  horaInicio,
  horaFim,
  servicos: duracoes.map((duracaoNoMomento) => ({ duracaoNoMomento })),
});

describe("encaixeDe", () => {
  it("mais curto que os serviços: é encaixe, com as duas durações", () => {
    expect(encaixeDe(ag("10:30", "10:45", 30))).toEqual({ minutos: 15, dosServicos: 30, servicos: 1 });
    expect(encaixeDe(ag("10:00", "10:20", 30, 45))).toEqual({ minutos: 20, dosServicos: 75, servicos: 2 });
  });

  it("do tamanho dos serviços: não é encaixe", () => {
    expect(encaixeDe(ag("10:00", "10:30", 30))).toBeNull();
    expect(encaixeDe(ag("10:00", "11:15", 30, 45))).toBeNull();
  });
});

describe("textoDoEncaixe", () => {
  it("um serviço ou vários", () => {
    expect(textoDoEncaixe({ minutos: 15, dosServicos: 30, servicos: 1 })).toBe("15 min (o serviço tem 30)");
    expect(textoDoEncaixe({ minutos: 20, dosServicos: 75, servicos: 2 })).toBe("20 min (os serviços têm 75)");
  });
});

const JANELA = { abre: "09:00", fecha: "18:00" };

describe("buracosDoDia", () => {
  it("só entre dois ocupados: nem antes do primeiro nem depois do último", () => {
    const buracos = buracosDoDia(
      [
        { inicio: "09:00", fim: "09:30" },
        { inicio: "09:40", fim: "10:30" },
        { inicio: "13:40", fim: "14:30" },
      ],
      { janela: JANELA, pausas: [] }
    );

    expect(buracos).toEqual([
      { inicio: "09:30", fim: "09:40", minutos: 10, duracao: 10 },
      { inicio: "10:30", fim: "13:40", minutos: 190 },
    ]);
  });

  it("menos de 30 min é encaixe, com a duração de 5 em 5 até 25", () => {
    const buracos = buracosDoDia(
      [
        { inicio: "09:00", fim: "09:30" },
        { inicio: "09:57", fim: "10:30" },
        { inicio: "10:37", fim: "11:00" },
        { inicio: "11:30", fim: "12:00" },
      ],
      { janela: JANELA, pausas: [] }
    );

    expect(buracos).toEqual([
      { inicio: "09:30", fim: "09:57", minutos: 27, duracao: 25 },
      { inicio: "10:30", fim: "10:37", minutos: 7, duracao: 5 },
      { inicio: "11:00", fim: "11:30", minutos: 30 },
    ]);
  });

  it("menos de 5 min não é buraco", () => {
    expect(
      buracosDoDia(
        [
          { inicio: "09:00", fim: "09:30" },
          { inicio: "09:34", fim: "10:00" },
        ],
        { janela: JANELA, pausas: [] }
      )
    ).toEqual([]);
  });

  it("um bloqueio por cima de um atendimento: conta o fim mais tarde", () => {
    expect(
      buracosDoDia(
        [
          { inicio: "13:00", fim: "14:00" },
          { inicio: "13:00", fim: "13:40" },
          { inicio: "14:20", fim: "15:00" },
        ],
        { janela: JANELA, pausas: [] }
      )
    ).toEqual([{ inicio: "14:00", fim: "14:20", minutos: 20, duracao: 20 }]);
  });

  it("a pausa corta o buraco, e não o apaga", () => {
    expect(
      buracosDoDia(
        [
          { inicio: "11:00", fim: "11:30" },
          { inicio: "13:00", fim: "13:40" },
        ],
        { janela: JANELA, pausas: [{ inicio: "12:00", fim: "13:00" }] }
      )
    ).toEqual([{ inicio: "11:30", fim: "12:00", minutos: 30 }]);
  });

  it("dia fechado (janela nula): nenhum", () => {
    expect(
      buracosDoDia(
        [
          { inicio: "09:00", fim: "09:30" },
          { inicio: "10:00", fim: "10:30" },
        ],
        { janela: null, pausas: [] }
      )
    ).toEqual([]);
  });

  it("recorta pela janela", () => {
    expect(
      buracosDoDia(
        [
          { inicio: "17:00", fim: "17:30" },
          { inicio: "18:30", fim: "19:00" },
        ],
        { janela: JANELA, pausas: [] }
      )
    ).toEqual([{ inicio: "17:30", fim: "18:00", minutos: 30 }]);
  });

  it("hoje: o buraco que já começou fica de fora", () => {
    const ocupados = [
      { inicio: "09:00", fim: "09:30" },
      { inicio: "09:40", fim: "10:30" },
      { inicio: "11:00", fim: "11:30" },
    ];

    expect(buracosDoDia(ocupados, { janela: JANELA, pausas: [] }, "09:35")).toEqual([
      { inicio: "10:30", fim: "11:00", minutos: 30 },
    ]);
  });
});
