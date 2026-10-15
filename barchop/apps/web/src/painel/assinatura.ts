import { PLANOS } from "@barchop/formato";
import type { ResumoDaAssinatura } from "@barchop/types";

// O que a faixa do topo e a tela do plano dizem da assinatura, num
// lugar só: as duas não podem contar histórias diferentes.

const DIA_E_MES = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  timeZone: "America/Sao_Paulo",
});

// "28/10", no fuso da barbearia: a Stripe grava o instante, e às 23h de
// Brasília já é o dia seguinte em UTC.
export function diaEMes(instante: string): string {
  return DIA_E_MES.format(new Date(instante));
}

export function diasQueFaltam(dias: number): string {
  return dias === 1 ? "falta 1 dia" : `faltam ${dias} dias`;
}

export function profissionais(quantidade: number): string {
  return quantidade === 1 ? "1 profissional" : `${quantidade} profissionais`;
}

const LISTA = new Intl.ListFormat("pt-BR", { style: "long", type: "conjunction" });

export function emLista(nomes: string[]): string {
  return LISTA.format(nomes);
}

export function nomeDoPlano(resumo: Pick<ResumoDaAssinatura, "plano">): string {
  return PLANOS[resumo.plano].nome;
}

// A frase da cobrança de quem tem plano pago: cancelada não anuncia
// cobrança nenhuma; assinada no teste diz quando vem a primeira.
export function fraseDaCobranca(resumo: ResumoDaAssinatura): string | null {
  if (resumo.cancelaEm) return `Cancelada: o ${nomeDoPlano(resumo)} vale até ${diaEMes(resumo.cancelaEm)}`;
  if (!resumo.periodoTerminaEm) return null;
  const quando = diaEMes(resumo.periodoTerminaEm);
  return resumo.primeiraCobrancaPendente ? `1ª cobrança em ${quando}` : `Próxima cobrança em ${quando}`;
}

// Tem plano pago na Stripe: assinar de novo não, gerenciar sim.
export function temPlanoPago(resumo: ResumoDaAssinatura): boolean {
  return resumo.situacao === "ativa" || resumo.situacao === "em_atraso";
}
