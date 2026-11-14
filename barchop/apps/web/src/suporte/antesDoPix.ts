import { PLANOS, planoEfetivo } from "@barchop/formato";
import type { AntesDoPix } from "@barchop/types";
import { diaEMes } from "../painel/assinatura";

// O que era antes do Pix, que é pra onde a recusa volta (plano
// pix-do-barchop, PR 3). Pelo plano que valeria agora, não pela
// situação gravada: um teste que já acabou, ou um Pix vencido, cai no
// Grátis, e o cartão do Suporte não pode prometer outra coisa.
export function antesDoPix(antes: AntesDoPix, agora: Date = new Date()): { rotulo: string; naRecusa: string } {
  const efetivo = planoEfetivo(
    {
      situacao: antes.situacao,
      plano: antes.plano,
      forma: antes.forma,
      testeTerminaEm: antes.testeTerminaEm ? new Date(antes.testeTerminaEm) : null,
      periodoTerminaEm: antes.periodoTerminaEm ? new Date(antes.periodoTerminaEm) : null,
    },
    agora
  );

  if (antes.situacao === "teste") {
    if (efetivo !== "gratis" && antes.testeTerminaEm) {
      return {
        rotulo: `Teste até ${diaEMes(antes.testeTerminaEm)}`,
        naRecusa: "A barbearia volta pro teste na hora.",
      };
    }
    return {
      rotulo: antes.testeTerminaEm ? `Teste, acabou em ${diaEMes(antes.testeTerminaEm)}` : "Teste, já acabou",
      naRecusa: "O teste já acabou: a barbearia cai no Grátis na hora.",
    };
  }

  if (efetivo === "gratis") {
    return { rotulo: "Grátis", naRecusa: "A barbearia volta pro Grátis na hora." };
  }

  const nome = PLANOS[efetivo].nome;
  if (antes.forma === "pix" && antes.periodoTerminaEm) {
    const ate = diaEMes(antes.periodoTerminaEm);
    return {
      rotulo: `${nome} por Pix até ${ate}`,
      naRecusa: `A barbearia volta pro ${nome} por Pix, que vale até ${ate}.`,
    };
  }
  return { rotulo: `${nome} no cartão`, naRecusa: `A barbearia volta pro ${nome} no cartão.` };
}
