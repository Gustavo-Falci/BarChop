import { describe, expect, it } from "vitest";
import type { AntesDoPix } from "@barchop/types";
import { antesDaDiferenca, antesDoPix } from "../../src/suporte/antesDoPix";

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
  profissionais: null,
};

describe("antesDoPix", () => {
  it("teste que ainda vale: volta pro teste, com o fim dele", () => {
    expect(antesDoPix(NO_TESTE, AGORA)).toEqual({
      rotulo: "Teste até 15/11",
      naRecusa: "A barbearia volta pro teste na hora.",
      depoisDaRecusa: "A barbearia voltou pro teste.",
    });
  });

  it("teste que já acabou: cai no Grátis", () => {
    expect(antesDoPix({ ...NO_TESTE, testeTerminaEm: "2026-11-12T14:43:00.000Z" }, AGORA)).toEqual({
      rotulo: "Teste, acabou em 12/11",
      naRecusa: "O teste já acabou: a barbearia cai no Grátis na hora.",
      depoisDaRecusa: "O teste já tinha acabado: a barbearia caiu no Grátis.",
    });
  });

  it("Grátis", () => {
    expect(antesDoPix({ ...NO_TESTE, situacao: "gratis", testeTerminaEm: null }, AGORA)).toEqual({
      rotulo: "Grátis",
      naRecusa: "A barbearia volta pro Grátis na hora.",
      depoisDaRecusa: "A barbearia voltou pro Grátis.",
    });
  });

  it("renovação: volta pro Pix que já valia, até o fim dele", () => {
    const pix: AntesDoPix = {
      situacao: "ativa",
      plano: "essencial",
      forma: "pix",
      periodoTerminaEm: "2026-12-08T03:00:00.000Z",
      testeTerminaEm: null,
      profissionais: null,
    };
    expect(antesDoPix(pix, AGORA)).toEqual({
      rotulo: "Essencial por Pix até 08/12",
      naRecusa: "A barbearia volta pro Essencial por Pix, que vale até 08/12.",
      depoisDaRecusa: "A barbearia voltou pro Essencial por Pix, que vale até 08/12.",
    });
  });

  it("Pix que já venceu: cai no Grátis", () => {
    const vencido: AntesDoPix = {
      situacao: "ativa",
      plano: "essencial",
      forma: "pix",
      periodoTerminaEm: "2026-11-10T03:00:00.000Z",
      testeTerminaEm: null,
      profissionais: null,
    };
    expect(antesDoPix(vencido, AGORA)).toEqual({
      rotulo: "Grátis",
      naRecusa: "A barbearia volta pro Grátis na hora.",
      depoisDaRecusa: "A barbearia voltou pro Grátis.",
    });
  });

  it("renovação de anual: o fim no outro ano leva o ano", () => {
    const anual: AntesDoPix = {
      situacao: "ativa",
      plano: "completo",
      forma: "pix",
      periodoTerminaEm: "2027-11-27T03:00:00.000Z",
      testeTerminaEm: null,
      profissionais: null,
    };
    expect(antesDoPix(anual, AGORA).rotulo).toBe("Completo por Pix até 27/11/2027");
  });
});

// O Pix da diferença (plano profissional-novo-pago, PR 4b): a recusa
// volta às vagas pagas de antes e quem entrou volta a aguardar.
describe("antesDaDiferenca", () => {
  const ANTES: AntesDoPix = {
    situacao: "ativa",
    plano: "essencial",
    forma: "pix",
    periodoTerminaEm: "2026-12-05T15:00:00.000Z",
    testeTerminaEm: null,
    profissionais: 2,
  };
  const DIFERENCA = { antes: ANTES, profissionais: 4, liberados: 2, periodoTerminaEm: "2026-12-05T15:00:00.000Z" };

  it("as vagas de antes e os liberados, no plural", () => {
    expect(antesDaDiferenca(DIFERENCA, AGORA)).toEqual({
      rotulo: "2 profissionais pagos até 05/12",
      naRecusa: "As vagas voltam a 2 e os 2 liberados voltam a aguardar. Os agendamentos já marcados ficam.",
      depoisDaRecusa: "As vagas voltaram a 2 e os 2 liberados voltaram a aguardar.",
    });
  });

  it("um só: no singular", () => {
    const um = { ...DIFERENCA, antes: { ...ANTES, profissionais: 1 }, profissionais: 2, liberados: 1 };
    expect(antesDaDiferenca(um, AGORA)).toEqual({
      rotulo: "1 profissional pago até 05/12",
      naRecusa: "As vagas voltam a 1 e o liberado volta a aguardar. Os agendamentos já marcados ficam.",
      depoisDaRecusa: "As vagas voltaram a 1 e o liberado voltou a aguardar.",
    });
  });

  it("sem as vagas gravadas: as de agora menos as liberadas", () => {
    const semColuna = { ...DIFERENCA, antes: { ...ANTES, profissionais: null } };
    expect(antesDaDiferenca(semColuna, AGORA).rotulo).toBe("2 profissionais pagos até 05/12");
  });
});
