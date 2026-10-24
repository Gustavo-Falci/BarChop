import { formatarReais, type CicloDoCliente } from "@barchop/formato";
import type { PlanoDoPainel } from "@barchop/types";

// As frases dos planos que o cliente assina (Onda 2, marco 3), as mesmas
// na lista e no cadastro.

export const ROTULO_DO_CICLO: Record<CicloDoCliente, string> = {
  mensal: "Mês",
  trimestral: "Trimestre",
  anual: "Ano",
};

const POR_CICLO: Record<CicloDoCliente, string> = {
  mensal: "por mês",
  trimestral: "por trimestre",
  anual: "por ano",
};

// "R$ 120,00 por mês".
export function precoDoCiclo(plano: Pick<PlanoDoPainel, "precoCentavos" | "ciclo">): string {
  return `${formatarReais(plano.precoCentavos)} ${POR_CICLO[plano.ciclo]}`;
}

// "2× Corte, Barba sem limite". O "×" e não o plural: o nome do serviço
// é do dono ("Pé de cabelo"), e pluralizar texto livre erraria.
export function resumoDosServicos(servicos: PlanoDoPainel["servicos"]): string {
  return servicos
    .map((s) => (s.usosPorCiclo === null ? `${s.nome} sem limite` : `${s.usosPorCiclo}× ${s.nome}`))
    .join(", ");
}

export function quantosAssinam(assinantes: number): string {
  if (assinantes === 0) return "Sem assinantes";
  return assinantes === 1 ? "1 assinante" : `${assinantes} assinantes`;
}
