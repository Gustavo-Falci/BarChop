import { describe, expect, it } from "vitest";
import type { AntesDoPix } from "@barchop/types";
import { antesDoPix } from "../../src/suporte/antesDoPix";

// O Pix do BarChop, PR 3: o cartão do Suporte diz o que era antes do
// Pix, que é pra onde a recusa volta. O primeiro caso real é uma
// barbearia em teste: "volta pro Grátis" seria mentira enquanto o teste
// não acaba.
const AGORA = new Date("2026-11-13T12:00:00.000Z");

const NO_TESTE: AntesDoPix = {
  situacao: "teste",
  plano: "gratis",
  forma: "cartao",
  periodoTerminaEm: null,
  testeTerminaEm: "2026-11-15T14:43:00.000Z",
};

describe("antesDoPix", () => {
  it("teste que ainda vale: volta pro teste, com o fim dele", () => {
    expect(antesDoPix(NO_TESTE, AGORA)).toEqual({
      rotulo: "Teste até 15/11",
      naRecusa: "A barbearia volta pro teste na hora.",
    });
  });

  it("teste que já acabou: cai no Grátis", () => {
    expect(antesDoPix({ ...NO_TESTE, testeTerminaEm: "2026-11-12T14:43:00.000Z" }, AGORA)).toEqual({
      rotulo: "Teste, acabou em 12/11",
      naRecusa: "O teste já acabou: a barbearia cai no Grátis na hora.",
    });
  });

  it("Grátis", () => {
    expect(antesDoPix({ ...NO_TESTE, situacao: "gratis", testeTerminaEm: null }, AGORA)).toEqual({
      rotulo: "Grátis",
      naRecusa: "A barbearia volta pro Grátis na hora.",
    });
  });

  it("renovação: volta pro Pix que já valia, até o fim dele", () => {
    const pix: AntesDoPix = {
      situacao: "ativa",
      plano: "essencial",
      forma: "pix",
      periodoTerminaEm: "2026-12-08T03:00:00.000Z",
      testeTerminaEm: null,
    };
    expect(antesDoPix(pix, AGORA)).toEqual({
      rotulo: "Essencial por Pix até 08/12",
      naRecusa: "A barbearia volta pro Essencial por Pix, que vale até 08/12.",
    });
  });

  it("Pix que já venceu: cai no Grátis", () => {
    const vencido: AntesDoPix = {
      situacao: "ativa",
      plano: "essencial",
      forma: "pix",
      periodoTerminaEm: "2026-11-10T03:00:00.000Z",
      testeTerminaEm: null,
    };
    expect(antesDoPix(vencido, AGORA)).toEqual({
      rotulo: "Grátis",
      naRecusa: "A barbearia volta pro Grátis na hora.",
    });
  });
});
