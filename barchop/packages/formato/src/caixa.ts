// A conta do caixa (Onda 2, marco 2, plano `caixa-do-dia`). Esqueleto
// do RED: os tipos já valem, as funções ainda não.

export const MOTIVOS_DA_PARTE = ["atendimento", "cliente", "casa", "gorjeta"] as const;
export type MotivoDaParte = (typeof MOTIVOS_DA_PARTE)[number];

export interface RegrasDeDivisao {
  ativos: readonly string[];
  parteDaCasa: Readonly<Record<string, number>>;
  matriz: readonly { donoDoCliente: string; atendente: string; percentual: number }[];
}

export interface AtendimentoPago {
  atendente: string;
  donoDoCliente: string | null;
  servicosCentavos: number;
  descontoCentavos: number;
  gorjetaCentavos: number;
}

export interface Parte {
  beneficiario: string | null;
  motivo: MotivoDaParte;
  valorCentavos: number;
}

export interface PagamentoDoAcerto {
  recebidoPor: string;
  partes: readonly Parte[];
}

export interface LinhaDoAcerto {
  pessoa: string | null;
  recebeuCentavos: number;
  cabeCentavos: number;
  saldoCentavos: number;
}

export interface Repasse {
  de: string;
  para: string | null;
  valorCentavos: number;
}

export function dividirPagamento(_atendimento: AtendimentoPago, _regras: RegrasDeDivisao): Parte[] {
  throw new Error("não implementado");
}

export function acertoDoDia(_pagamentos: readonly PagamentoDoAcerto[]): {
  pessoas: LinhaDoAcerto[];
  repasses: Repasse[];
} {
  throw new Error("não implementado");
}
