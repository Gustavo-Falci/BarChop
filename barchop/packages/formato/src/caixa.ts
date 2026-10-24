// A conta do caixa (Onda 2, marco 2, plano `caixa-do-dia`): como cada
// pagamento se divide e como fica o acerto do dia. A API grava as partes
// de cada pagamento com esta conta, e o painel mostra a mesma frase do
// efeito antes de registrar — ninguém refaz a conta em outro lugar
// (ADR-0007). Tudo em centavos inteiros; percentuais de 0 a 100.
//
// A ordem da divisão (decisões do dono e do PRD da Onda 2):
// 1. base = serviços − desconto (a gorjeta fica fora);
// 2. a casa leva a parte da casa de quem atendeu;
// 3. do que sobra, o profissional de quem o cliente é (se não for quem
//    atendeu e estiver ativo) leva o percentual da matriz;
// 4. quem atendeu fica com o resto, mais a gorjeta inteira.
// Cada parte arredonda pra baixo; a sobra de centavos fica com quem
// atendeu, então a soma das partes é sempre o valor pago.

// Por que cada parte existe. Vira CHECK em `pagamento_parte.motivo`.
export const MOTIVOS_DA_PARTE = ["atendimento", "cliente", "casa", "gorjeta"] as const;
// As partes que só os planos de assinatura geram (marco 3, conta em
// planos-do-cliente.ts): `plano` é o fixo do plano da casa pra quem
// atendeu; `mensalidade`, o que fica com o barbeiro do plano dele.
export const MOTIVOS_DO_PLANO = ["plano", "mensalidade"] as const;
export type MotivoDaParte = (typeof MOTIVOS_DA_PARTE)[number];
export type MotivoDoPlano = (typeof MOTIVOS_DO_PLANO)[number];

export interface RegrasDeDivisao {
  // Os membros ativos. O dono do cliente que saiu não leva parte.
  ativos: readonly string[];
  // % que fica com a casa de tudo o que cada um atende; ausente = 0.
  parteDaCasa: Readonly<Record<string, number>>;
  // % do dono do cliente quando outro atende; par ausente = 0.
  matriz: readonly { donoDoCliente: string; atendente: string; percentual: number }[];
}

export interface AtendimentoPago {
  atendente: string;
  // De quem o cliente é; `null` = ainda de ninguém.
  donoDoCliente: string | null;
  servicosCentavos: number;
  descontoCentavos: number;
  gorjetaCentavos: number;
}

// `M` deixa o tipo dizer quem gera o quê: o dividirPagamento só os
// motivos do caixa, a conta dos planos só os dela; o acerto aceita todos.
export interface Parte<M extends MotivoDaParte | MotivoDoPlano = MotivoDaParte> {
  // `null` = a casa.
  beneficiario: string | null;
  motivo: M;
  valorCentavos: number;
}

export function dividirPagamento(atendimento: AtendimentoPago, regras: RegrasDeDivisao): Parte[] {
  const { atendente, donoDoCliente, servicosCentavos, descontoCentavos, gorjetaCentavos } = atendimento;
  garantirCentavos(servicosCentavos, "serviços");
  garantirCentavos(descontoCentavos, "desconto");
  garantirCentavos(gorjetaCentavos, "gorjeta");
  if (descontoCentavos > servicosCentavos) {
    throw new RangeError("o desconto passa do valor dos serviços");
  }
  for (const percentual of Object.values(regras.parteDaCasa)) garantirPercentual(percentual);
  for (const { percentual } of regras.matriz) garantirPercentual(percentual);

  const base = servicosCentavos - descontoCentavos;
  const casa = porcentagem(base, regras.parteDaCasa[atendente] ?? 0);
  const resto = base - casa;
  const levaParte = donoDoCliente !== null && donoDoCliente !== atendente && regras.ativos.includes(donoDoCliente);
  const doCliente = levaParte ? porcentagem(resto, percentualDaMatriz(regras, donoDoCliente, atendente)) : 0;

  const partes: Parte[] = [
    { beneficiario: atendente, motivo: "atendimento", valorCentavos: resto - doCliente },
    { beneficiario: donoDoCliente, motivo: "cliente", valorCentavos: doCliente },
    { beneficiario: null, motivo: "casa", valorCentavos: casa },
    { beneficiario: atendente, motivo: "gorjeta", valorCentavos: gorjetaCentavos },
  ];
  return partes.filter((parte) => parte.valorCentavos > 0);
}

export interface PagamentoDoAcerto {
  // Quem ficou com o dinheiro na mão (ou na maquininha).
  recebidoPor: string;
  partes: readonly Parte<MotivoDaParte | MotivoDoPlano>[];
}

export interface LinhaDoAcerto {
  // `null` = a casa.
  pessoa: string | null;
  recebeuCentavos: number;
  cabeCentavos: number;
  // cabe − recebeu: positivo tem a receber, negativo tem a repassar.
  saldoCentavos: number;
}

export interface Repasse {
  de: string;
  // `null` = a casa.
  para: string | null;
  valorCentavos: number;
}

export interface AcertoDoDia {
  // Na ordem em que cada um aparece no dia; a casa por último.
  pessoas: LinhaDoAcerto[];
  // Um por par, já compensado (A deve 30 a B e B deve 25 a A → A repassa 5).
  repasses: Repasse[];
}

export function acertoDoDia(pagamentos: readonly PagamentoDoAcerto[]): AcertoDoDia {
  const linhas = new Map<string | null, LinhaDoAcerto>();
  const linha = (pessoa: string | null): LinhaDoAcerto => {
    let atual = linhas.get(pessoa);
    if (!atual) {
      atual = { pessoa, recebeuCentavos: 0, cabeCentavos: 0, saldoCentavos: 0 };
      linhas.set(pessoa, atual);
    }
    return atual;
  };
  // deve.get(de).get(para) = quanto `de` segura do que é de `para`.
  const deve = new Map<string, Map<string | null, number>>();

  for (const { recebidoPor, partes } of pagamentos) {
    const quemRecebeu = linha(recebidoPor);
    for (const { beneficiario, valorCentavos } of partes) {
      quemRecebeu.recebeuCentavos += valorCentavos;
      linha(beneficiario).cabeCentavos += valorCentavos;
      if (beneficiario === recebidoPor) continue;
      const doDevedor = deve.get(recebidoPor) ?? new Map<string | null, number>();
      doDevedor.set(beneficiario, (doDevedor.get(beneficiario) ?? 0) + valorCentavos);
      deve.set(recebidoPor, doDevedor);
    }
  }

  const casa = linhas.get(null);
  linhas.delete(null);
  const pessoas = [...linhas.values(), ...(casa ? [casa] : [])];
  for (const atual of pessoas) atual.saldoCentavos = atual.cabeCentavos - atual.recebeuCentavos;

  const ordem = pessoas.map((atual) => atual.pessoa);
  const repasses: Repasse[] = [];
  for (const de of ordem) {
    if (de === null) continue;
    for (const para of ordem) {
      if (para === de) continue;
      const vai = deve.get(de)?.get(para) ?? 0;
      const volta = para === null ? 0 : (deve.get(para)?.get(de) ?? 0);
      if (vai > volta) repasses.push({ de, para, valorCentavos: vai - volta });
    }
  }
  return { pessoas, repasses };
}

function percentualDaMatriz(regras: RegrasDeDivisao, donoDoCliente: string, atendente: string): number {
  const regra = regras.matriz.find((par) => par.donoDoCliente === donoDoCliente && par.atendente === atendente);
  return regra?.percentual ?? 0;
}

// As três de baixo são usadas também por planos-do-cliente.ts; ficam
// fora do index.
export function porcentagem(centavos: number, percentual: number): number {
  return Math.floor((centavos * percentual) / 100);
}

export function garantirCentavos(valor: number, nome: string): void {
  if (!Number.isInteger(valor) || valor < 0) {
    throw new RangeError(`${nome} precisa ser um número inteiro de centavos, sem sinal`);
  }
}

export function garantirPercentual(percentual: number): void {
  if (!Number.isInteger(percentual) || percentual < 0 || percentual > 100) {
    throw new RangeError("o percentual vai de 0 a 100");
  }
}
