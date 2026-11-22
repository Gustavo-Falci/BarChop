import { describe, expect, it } from "vitest";
import {
  duracaoDaMudanca,
  fimDaMudanca,
  limiteDepois,
  type LimiteDepoisParams,
} from "../src/index";

const ABERTO = {
  horaAbertura: "09:00",
  horaFechamento: "18:00",
  fechado: false,
};

function dia(extra: Partial<LimiteDepoisParams> = {}): LimiteDepoisParams {
  return {
    horarioFuncionamento: ABERTO,
    // Do profissional no dia, sem o próprio atendimento (09:00–09:30).
    ocupados: [
      { horaInicio: "09:40", horaFim: "10:30", atendimento: true },
      { horaInicio: "12:00", horaFim: "13:00" },
    ],
    horaFimAtual: "09:30",
    ...extra,
  };
}

describe("limiteDepois", () => {
  it("o próximo atendimento é o limite, e diz qual é", () => {
    expect(limiteDepois(dia())).toEqual({ limite: "09:40", indice: 0 });
  });

  it("uma pausa ou bloqueio por horas também limita", () => {
    expect(limiteDepois(dia({ horaFimAtual: "11:00" }))).toEqual({ limite: "12:00", indice: 1 });
  });

  it("o que começa depois, na ordem do relógio, não importa a ordem da lista", () => {
    const ocupados = [
      { horaInicio: "15:00", horaFim: "16:00", atendimento: true },
      { horaInicio: "14:00", horaFim: "14:30", atendimento: true },
    ];
    expect(limiteDepois(dia({ ocupados, horaFimAtual: "13:30" }))).toEqual({ limite: "14:00", indice: 1 });
  });

  it("o que já terminou antes não limita", () => {
    expect(limiteDepois(dia({ horaFimAtual: "13:30" }))).toEqual({ limite: "18:00", indice: null });
  });

  it("colado no próximo: o limite é o fim de hoje", () => {
    expect(limiteDepois(dia({ horaFimAtual: "09:40" }))).toEqual({ limite: "09:40", indice: 0 });
  });

  it("algo que já cobre o fim de hoje (bloqueio criado depois): o limite é o fim de hoje", () => {
    const ocupados = [{ horaInicio: "09:15", horaFim: "10:00" }];
    expect(limiteDepois(dia({ ocupados }))).toEqual({ limite: "09:30", indice: 0 });
  });

  it("sem nada depois, o fechamento", () => {
    expect(limiteDepois(dia({ ocupados: [] }))).toEqual({ limite: "18:00", indice: null });
  });

  it("sem precisar caber antes de fechar, vai até 23:59", () => {
    expect(limiteDepois(dia({ ocupados: [], cabeAntesDeFechar: false }))).toEqual({
      limite: "23:59",
      indice: null,
    });
  });

  it("dia fechado (folga ou bloqueio do dia inteiro): não estica", () => {
    const fechado = { horaAbertura: null, horaFechamento: null, fechado: true };
    expect(limiteDepois(dia({ horarioFuncionamento: fechado }))).toEqual({ limite: "09:30", indice: null });
  });

  it("atendimento que já passa do fechamento: não estica e não encurta", () => {
    expect(limiteDepois(dia({ ocupados: [], horaFimAtual: "18:20" }))).toEqual({ limite: "18:20", indice: null });
  });
});

describe("duracaoDaMudanca", () => {
  it("adicionar: a duração de hoje mais os novos", () => {
    expect(duracaoDaMudanca({ duracaoAtual: 30, somaQueFica: 30, somaNova: 20 })).toBe(50);
  });

  it("encaixe: soma os novos à duração real, não à dos serviços", () => {
    expect(duracaoDaMudanca({ duracaoAtual: 20, somaQueFica: 30, somaNova: 10 })).toBe(30);
  });

  it("tirar: encurta pra soma dos que ficam", () => {
    expect(duracaoDaMudanca({ duracaoAtual: 40, somaQueFica: 30, somaNova: 0 })).toBe(30);
  });

  it("tirar de um encaixe: fica a menor das duas", () => {
    expect(duracaoDaMudanca({ duracaoAtual: 30, somaQueFica: 30, somaNova: 0 })).toBe(30);
    expect(duracaoDaMudanca({ duracaoAtual: 30, somaQueFica: 15, somaNova: 0 })).toBe(15);
  });

  it("tirar e adicionar juntos", () => {
    expect(duracaoDaMudanca({ duracaoAtual: 40, somaQueFica: 30, somaNova: 20 })).toBe(50);
  });
});

describe("fimDaMudanca", () => {
  it("cabe: termina no previsto", () => {
    expect(fimDaMudanca({ horaInicio: "09:00", previstoMinutos: 40, limite: "09:40" })).toEqual({
      cabe: true,
      horaFim: "09:40",
      terminaPrevisto: "09:40",
    });
  });

  it("não cabe: estica até o limite", () => {
    expect(fimDaMudanca({ horaInicio: "09:00", previstoMinutos: 50, limite: "09:40" })).toEqual({
      cabe: false,
      horaFim: "09:40",
      terminaPrevisto: "09:50",
    });
  });

  it("encurtou: termina mais cedo", () => {
    expect(fimDaMudanca({ horaInicio: "09:00", previstoMinutos: 30, limite: "09:40" })).toEqual({
      cabe: true,
      horaFim: "09:30",
      terminaPrevisto: "09:30",
    });
  });

  it("o previsto que passa da meia-noite não cabe", () => {
    expect(fimDaMudanca({ horaInicio: "23:30", previstoMinutos: 40, limite: "23:59" })).toEqual({
      cabe: false,
      horaFim: "23:59",
      terminaPrevisto: "00:10",
    });
  });
});
