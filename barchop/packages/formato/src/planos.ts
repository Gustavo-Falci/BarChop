// Os planos do BarChop (Onda 2, marco 1): nome, preço, limite de
// profissionais e recursos definidos uma vez (ADR-0007). O site mostra
// a tabela, o painel calcula o preço, a API aplica o limite e o script
// cria os preços na Stripe (ADR-0010), todos lendo daqui; ninguém
// escreve um preço à mão. As listas fechadas viram CHECK no banco na
// migração da assinatura.
//
// Preços em centavos. Profissional = membro ativo com papel `dono` ou
// `profissional`; a recepção não conta.

export const IDS_DOS_PLANOS = ["gratis", "essencial", "completo"] as const;
export type IdDoPlano = (typeof IDS_DOS_PLANOS)[number];

export const CICLOS = ["mensal", "anual"] as const;
export type Ciclo = (typeof CICLOS)[number];

// `teste` (14 dias com tudo liberado), `ativa` e `em_atraso` (a Stripe
// ainda tenta cobrar) vêm da Stripe ou do cadastro; `cancelada` e
// `gratis` usam o Grátis, sem apagar nada.
export const SITUACOES_DA_ASSINATURA = ["teste", "ativa", "em_atraso", "cancelada", "gratis"] as const;
export type SituacaoDaAssinatura = (typeof SITUACOES_DA_ASSINATURA)[number];

export const DIAS_DE_TESTE = 14;

// O anual cobra 10 meses: 2 meses grátis, na base e no extra.
const MESES_COBRADOS_NO_ANUAL = 10;

// O que separa os planos além do limite. Hoje nada é bloqueado por
// eles: cada marco liga o seu quando o recurso existir.
export const RECURSOS = ["caixa", "relatorios", "relatoriosCompletos", "whatsapp", "planosDaBarbearia"] as const;
export type Recurso = (typeof RECURSOS)[number];

export interface Plano {
  id: IdDoPlano;
  nome: string;
  // Com 1 profissional, por mês.
  baseMensalCentavos: number;
  // Por profissional a mais, por mês.
  extraMensalCentavos: number;
  // `null` = sem limite.
  limiteDeProfissionais: number | null;
  recursos: readonly Recurso[];
}

export const PLANOS: Record<IdDoPlano, Plano> = {
  gratis: {
    id: "gratis",
    nome: "Grátis",
    baseMensalCentavos: 0,
    extraMensalCentavos: 0,
    limiteDeProfissionais: 1,
    recursos: [],
  },
  essencial: {
    id: "essencial",
    nome: "Essencial",
    baseMensalCentavos: 3490,
    extraMensalCentavos: 1000,
    limiteDeProfissionais: 3,
    recursos: ["caixa", "relatorios"],
  },
  completo: {
    id: "completo",
    nome: "Completo",
    baseMensalCentavos: 4490,
    extraMensalCentavos: 1500,
    limiteDeProfissionais: null,
    recursos: ["caixa", "relatorios", "relatoriosCompletos", "whatsapp", "planosDaBarbearia"],
  },
};

// A base (1º profissional) e o extra (cada um a mais) no ciclo: os
// degraus do preço graduado na Stripe.
export function precosDoCiclo(plano: IdDoPlano, ciclo: Ciclo): { base: number; extra: number } {
  const meses = ciclo === "anual" ? MESES_COBRADOS_NO_ANUAL : 1;
  const { baseMensalCentavos, extraMensalCentavos } = PLANOS[plano];
  return { base: baseMensalCentavos * meses, extra: extraMensalCentavos * meses };
}

export function limiteDeProfissionais(plano: IdDoPlano): number | null {
  return PLANOS[plano].limiteDeProfissionais;
}

// Quanto a barbearia paga por ciclo com esse número de profissionais.
// Quantidade fora do plano é erro de quem chamou: a tela não deixa
// passar do limite e a API recusa antes.
export function precoDoPlano(plano: IdDoPlano, ciclo: Ciclo, profissionais: number): number {
  const limite = limiteDeProfissionais(plano);
  if (!Number.isInteger(profissionais) || profissionais < 1) {
    throw new RangeError(`profissionais deve ser um inteiro a partir de 1: ${profissionais}`);
  }
  if (limite !== null && profissionais > limite) {
    throw new RangeError(`o plano ${plano} vai até ${limite} profissionais: ${profissionais}`);
  }
  const { base, extra } = precosDoCiclo(plano, ciclo);
  return base + (profissionais - 1) * extra;
}

export function temRecurso(plano: IdDoPlano, recurso: Recurso): boolean {
  return PLANOS[plano].recursos.includes(recurso);
}

export interface SituacaoParaOPlano {
  situacao: SituacaoDaAssinatura;
  plano: IdDoPlano;
  testeTerminaEm: Date | null;
}

// O plano que vale agora: teste vigente libera o Completo; ativa ou em
// atraso vale o contratado; o resto cai no Grátis. O instante do fim do
// teste já conta como vencido, e teste sem data de fim também.
export function planoEfetivo(assinatura: SituacaoParaOPlano, agora: Date): IdDoPlano {
  switch (assinatura.situacao) {
    case "teste":
      return assinatura.testeTerminaEm !== null && agora < assinatura.testeTerminaEm ? "completo" : "gratis";
    case "ativa":
    case "em_atraso":
      return assinatura.plano;
    case "cancelada":
    case "gratis":
      return "gratis";
  }
}
