import { PLANOS, planoEfetivo } from "@barchop/formato";
import type { AntesDoPix } from "@barchop/types";
import { diaEMes, pontasDoPeriodo } from "../painel/assinatura";

export interface OQueEraAntes {
  // A linha "Antes" do cartão.
  rotulo: string;
  // O apoio da resposta, antes de recusar.
  naRecusa: string;
  // O resultado, depois de recusar.
  depoisDaRecusa: string;
}

// O que era antes do Pix, que é pra onde a recusa volta (plano
// pix-do-barchop, PR 3). Pelo plano que valeria agora, não pela
// situação gravada: um teste que já acabou, ou um Pix vencido, cai no
// Grátis, e o cartão do Suporte não pode prometer outra coisa.
export function antesDoPix(antes: AntesDoPix, agora: Date = new Date()): OQueEraAntes {
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
        depoisDaRecusa: "A barbearia voltou pro teste.",
      };
    }
    return {
      rotulo: antes.testeTerminaEm ? `Teste, acabou em ${diaEMes(antes.testeTerminaEm)}` : "Teste, já acabou",
      naRecusa: "O teste já acabou: a barbearia cai no Grátis na hora.",
      depoisDaRecusa: "O teste já tinha acabado: a barbearia caiu no Grátis.",
    };
  }

  if (efetivo === "gratis") {
    return {
      rotulo: "Grátis",
      naRecusa: "A barbearia volta pro Grátis na hora.",
      depoisDaRecusa: "A barbearia voltou pro Grátis.",
    };
  }

  const nome = PLANOS[efetivo].nome;
  if (antes.forma === "pix" && antes.periodoTerminaEm) {
    // Renovação de um anual: o fim cai no outro ano e leva o ano.
    const ate = pontasDoPeriodo(agora.toISOString(), antes.periodoTerminaEm)[1];
    return {
      rotulo: `${nome} por Pix até ${ate}`,
      naRecusa: `A barbearia volta pro ${nome} por Pix, que vale até ${ate}.`,
      depoisDaRecusa: `A barbearia voltou pro ${nome} por Pix, que vale até ${ate}.`,
    };
  }
  return {
    rotulo: `${nome} no cartão`,
    naRecusa: `A barbearia volta pro ${nome} no cartão.`,
    depoisDaRecusa: `A barbearia voltou pro ${nome} no cartão.`,
  };
}
