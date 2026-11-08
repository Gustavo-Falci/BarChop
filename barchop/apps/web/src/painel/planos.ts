import {
  formatarReais,
  cicloDoRecebi,
  type CicloDoCliente,
  type SituacaoDoAssinante,
} from "@barchop/formato";
import type { AssinaturaDoPainel, PlanoDoPainel, ProvedorDePagamento, RecebimentoDoBalcao } from "@barchop/types";
import { PROVEDORES } from "../fluxo/provedores";
import { naForma } from "./caixa";

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

// "por mês": a vitrine pública põe o valor grande e isto ao lado.
export function porCiclo(ciclo: CicloDoCliente): string {
  return POR_CICLO[ciclo];
}

// "R$ 120,00 por mês".
export function precoDoCiclo(plano: Pick<PlanoDoPainel, "precoCentavos" | "ciclo">): string {
  return `${formatarReais(plano.precoCentavos)} ${porCiclo(plano.ciclo)}`;
}

// "2× Corte" ou "Barba sem limite". O "×" e não o plural: o nome do
// serviço é do dono ("Pé de cabelo"), e pluralizar texto livre erraria.
export function servicoDoPlano(servico: PlanoDoPainel["servicos"][number]): string {
  return servico.usosPorCiclo === null ? `${servico.nome} sem limite` : `${servico.usosPorCiclo}× ${servico.nome}`;
}

// "2× Corte, Barba sem limite".
export function resumoDosServicos(servicos: PlanoDoPainel["servicos"]): string {
  return servicos.map(servicoDoPlano).join(", ");
}

export function quantosAssinam(assinantes: number): string {
  if (assinantes === 0) return "Sem assinantes";
  return assinantes === 1 ? "1 assinante" : `${assinantes} assinantes`;
}

// --- O assinante no balcão (PR 7b) ---

export const ROTULO_DA_SITUACAO: Record<SituacaoDoAssinante, string> = {
  pendente: "Pendente",
  teste: "Em teste",
  ativa: "Ativa",
  em_atraso: "Em atraso",
  cancelada: "Cancelada",
};

export const TOM_DA_SITUACAO: Record<SituacaoDoAssinante, "acento" | "neutro" | "ok" | "atencao"> = {
  pendente: "neutro",
  teste: "acento",
  ativa: "ok",
  em_atraso: "atencao",
  cancelada: "neutro",
};

// "Da casa", "De Gustavo": como os grupos da lista de planos.
export function deQuemEOPlano(plano: AssinaturaDoPainel["plano"]): string {
  return plano.vendedor ? `De ${plano.vendedor.nome}` : "Da casa";
}

// "26/11".
export function diaEMes(data: string): string {
  const [, mes, dia] = data.split("-");
  return `${dia}/${mes}`;
}

// Até quando vale, numa frase. Em atraso, o plano não cobre o
// atendimento até o próximo "Recebi".
// A online que não renova sozinha (a InfinitePay): um link por ciclo, e
// o "Recebi" vale nela (decisão 10 do plano pagamentos-online-infinitepay).
export function porLink(assinatura: { provedor?: ProvedorDePagamento | null }): boolean {
  return assinatura.provedor != null && !PROVEDORES[assinatura.provedor].renovaSozinho;
}

// Com o próximo ciclo já pago (`pagoAte`), diz até quando.
export function fraseDoCiclo(
  assinatura: Pick<AssinaturaDoPainel, "situacao" | "cicloTerminaEm"> & {
    pagoAte?: string | null;
    provedor?: ProvedorDePagamento | null;
  }
): string {
  const termina = assinatura.cicloTerminaEm;
  const pagoAte = assinatura.pagoAte ?? null;
  switch (assinatura.situacao) {
    case "pendente":
      return "Esperando o 1º pagamento";
    case "teste":
      return pagoAte
        ? `Teste grátis até ${diaEMes(termina!)} · pago até ${diaEMes(pagoAte)}`
        : `Teste grátis até ${diaEMes(termina!)}`;
    case "ativa":
      if (pagoAte) return `Pago até ${diaEMes(pagoAte)}`;
      return porLink(assinatura) ? `Vale até ${diaEMes(termina!)}` : `Renova em ${diaEMes(termina!)}`;
    case "em_atraso":
      return `Venceu em ${diaEMes(termina!)} · atende como avulso`;
    case "cancelada":
      return "Cancelada";
  }
}

// O ciclo que o "Recebi" de hoje abriria, pela mesma regra da API: no
// balcão, antes da renovação, guarda o próximo; na InfinitePay, não.
export function cicloDoRecebiDeHoje(assinatura: AssinaturaDoPainel, hoje: string) {
  return cicloDoRecebi(assinatura, hoje, assinatura.forma === "no_balcao");
}

// O "Recebi" só aparece quando a API o aceitaria: no balcão ou na
// InfinitePay, e não com o próximo ciclo já pago.
export function podeReceber(assinatura: AssinaturaDoPainel, hoje: string): boolean {
  return (
    (assinatura.forma === "no_balcao" || porLink(assinatura)) &&
    cicloDoRecebiDeHoje(assinatura, hoje).problema === null
  );
}

// O link do ciclo pelo WhatsApp de quem assina, com o texto pronto
// (decisão 13): quem não tem e-mail só recebe por aqui.
export function linkDoCicloPeloZap(assinatura: AssinaturaDoPainel, zap: string): string | null {
  const link = assinatura.linkDoCiclo;
  if (!link) return null;
  const texto =
    `Oi, ${assinatura.cliente.nome}! O link para pagar o plano ${assinatura.plano.nome} ` +
    `(${precoDoCiclo(assinatura)}), com vencimento em ${diaEMes(link.vencimento)}: ${link.url}`;
  return `${zap}?text=${encodeURIComponent(texto)}`;
}

// "R$ 120,00 em dinheiro no caixa de hoje". Com o dia de hoje fechado, a
// API lança no próximo aberto, e a frase diz qual.
export function fraseDoRecebido(recebido: RecebimentoDoBalcao, hoje: string): string {
  const { recebimento } = recebido;
  const caixa = recebimento.data === hoje ? "no caixa de hoje" : `no caixa de ${diaEMes(recebimento.data)}`;
  return `${formatarReais(recebimento.valorCentavos)} ${naForma(recebimento.forma)} ${caixa}`;
}
