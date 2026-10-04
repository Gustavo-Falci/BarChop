import { describe, expect, it } from "vitest";
import { horaParaDate } from "../../src/lib/horas";
import { janelaEfetiva } from "../../src/lib/disponibilidade";

// A janela em que um membro atende num dia é a interseção da jornada
// dele com o funcionamento da barbearia (bloco B). Pura, sem banco.

const h = horaParaDate;
const aberta = { horaAbertura: h("09:00"), horaFechamento: h("18:00"), fechado: false };
const fechada = { horaAbertura: null, horaFechamento: null, fechado: true };
const FECHADO = { horaAbertura: null, horaFechamento: null, fechado: true };

function proprio(inicio: string, fim: string) {
  return { modo: "proprio" as const, horaInicio: h(inicio), horaFim: h(fim) };
}

describe("janelaEfetiva", () => {
  it("acompanhando a barbearia, é o funcionamento", () => {
    expect(janelaEfetiva(aberta, { modo: "barbearia", horaInicio: null, horaFim: null })).toEqual(aberta);
  });

  it("barbearia fechada fecha o dia, seja qual for o modo", () => {
    expect(janelaEfetiva(fechada, { modo: "barbearia", horaInicio: null, horaFim: null })).toEqual(FECHADO);
    expect(janelaEfetiva(fechada, proprio("09:00", "18:00"))).toEqual(FECHADO);
    expect(janelaEfetiva(null, proprio("09:00", "18:00"))).toEqual(FECHADO);
  });

  it("folga, ou dia sem linha de jornada, fecha o dia", () => {
    expect(janelaEfetiva(aberta, { modo: "folga", horaInicio: null, horaFim: null })).toEqual(FECHADO);
    expect(janelaEfetiva(aberta, null)).toEqual(FECHADO);
  });

  it("horário próprio dentro do funcionamento vale inteiro", () => {
    expect(janelaEfetiva(aberta, proprio("10:00", "16:00"))).toEqual({
      horaAbertura: h("10:00"),
      horaFechamento: h("16:00"),
      fechado: false,
    });
  });

  it("horário próprio que passa do funcionamento é recortado nele", () => {
    expect(janelaEfetiva(aberta, proprio("13:00", "20:00"))).toEqual({
      horaAbertura: h("13:00"),
      horaFechamento: h("18:00"),
      fechado: false,
    });
    expect(janelaEfetiva(aberta, proprio("07:00", "12:00"))).toEqual({
      horaAbertura: h("09:00"),
      horaFechamento: h("12:00"),
      fechado: false,
    });
  });

  it("horário próprio sem sobreposição com o funcionamento fecha o dia", () => {
    expect(janelaEfetiva(aberta, proprio("19:00", "22:00"))).toEqual(FECHADO);
    expect(janelaEfetiva(aberta, proprio("18:00", "20:00"))).toEqual(FECHADO);
  });
});
