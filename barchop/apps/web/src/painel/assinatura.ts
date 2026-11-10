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

// O plano pago por Pix (plano pix-do-barchop), visto do painel. Vem
// antes de `temPlanoPago`: o "Já paguei" grava a assinatura `ativa`, mas
// nada da Stripe vale pra ela (sem Portal, sem "Próxima cobrança"). O
// vencimento sai do fim do período, nunca da situação: até o cron do
// vencimento passar, a linha segue `ativa` com o período já acabado.
export type EstadoDoPix = "aguardando" | "pago" | "renovar" | "vencido";

// "Pagar o próximo mês" aparece nestes dias antes do fim do período.
export const DIAS_DO_AVISO_DO_PIX = 5;

const UM_DIA = 24 * 60 * 60 * 1000;

export function estadoDoPix(resumo: ResumoDaAssinatura, agora: Date = new Date()): EstadoDoPix | null {
  if (resumo.forma !== "pix" || !resumo.periodoTerminaEm) return null;
  if (resumo.situacao !== "ativa" && resumo.situacao !== "gratis") return null;
  if (resumo.pix.aguardando) return "aguardando";
  const falta = Date.parse(resumo.periodoTerminaEm) - agora.getTime();
  if (falta <= 0) return "vencido";
  if (falta <= DIAS_DO_AVISO_DO_PIX * UM_DIA) return "renovar";
  return "pago";
}

// "mês" ou "ano": o que cada Pix paga.
export function periodoDoCiclo(ciclo: ResumoDaAssinatura["ciclo"]): string {
  return ciclo === "anual" ? "ano" : "mês";
}

// Tem plano pago na Stripe: assinar de novo não, gerenciar sim.
export function temPlanoPago(resumo: ResumoDaAssinatura): boolean {
  return resumo.situacao === "ativa" || resumo.situacao === "em_atraso";
}
