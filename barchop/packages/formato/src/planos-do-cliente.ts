// Os planos que a barbearia e os barbeiros vendem ao cliente (Onda 2,
// marco 3, plano `planos-de-assinatura`). Não confundir com os planos do
// BarChop (planos.ts), que a barbearia paga. Listas fechadas e a conta
// num lugar só (ADR-0007): a API valida e grava com elas, o banco tem o
// CHECK com os mesmos valores e o painel mostra a mesma frase do efeito.
//
// Decisões do dono (24/10):
// - plano de barbeiro: a mensalidade cai na conta dele, e a casa leva o
//   % da "parte da casa" dele sobre ela; vale só com ele;
// - plano da casa: a mensalidade é da casa, e quem atende ganha um
//   valor fixo por atendimento, pago do dinheiro da casa.
// Tudo em centavos inteiros; a conta é sobre o preço do plano, não sobre
// o líquido da taxa do provedor.

import { garantirCentavos, garantirPercentual, porcentagem, type Parte } from "./caixa";
import { FORMAS_DE_PAGAMENTO } from "./pagina";

export const CICLOS_DO_CLIENTE = ["mensal", "trimestral", "anual"] as const;
export type CicloDoCliente = (typeof CICLOS_DO_CLIENTE)[number];

// `pendente` espera o 1º pagamento; `teste` e `ativa` usam o plano;
// `em_atraso` é atendido como avulso até pagar.
export const SITUACOES_DO_ASSINANTE = ["pendente", "teste", "ativa", "em_atraso", "cancelada"] as const;
export type SituacaoDoAssinante = (typeof SITUACOES_DO_ASSINANTE)[number];

// Paga pelo provedor (online) ou combinado no balcão, marcado à mão.
export const FORMAS_DA_ASSINATURA = ["online", "no_balcao"] as const;
export type FormaDaAssinatura = (typeof FORMAS_DA_ASSINATURA)[number];

// Onde a conta de quem vende está. Um conector por provedor; o Asaas é o
// primeiro (Mercado Pago, Stripe e InfinitePay depois).
export const PROVEDORES_DE_PAGAMENTO = ["asaas"] as const;
export type ProvedorDePagamento = (typeof PROVEDORES_DE_PAGAMENTO)[number];

// A chave conectada é de sandbox (`teste`) ou de produção (`real`).
export const MODOS_DA_CONEXAO = ["teste", "real"] as const;
export type ModoDaConexao = (typeof MODOS_DA_CONEXAO)[number];

// O CHECK de `pagamento.forma`. Lista à parte para o `plano` não vazar
// pras formas aceitas da página pública (`barbearia.formas_pagamento`).
export const FORMAS_DO_CAIXA = [...FORMAS_DE_PAGAMENTO, "plano"] as const;
export type FormaDoCaixa = (typeof FORMAS_DO_CAIXA)[number];

// O CHECK de `recebimento_do_plano.forma`: as formas do balcão e mais
// `online`, a mensalidade que caiu na conta de quem vende pelo provedor
// (e não na mão de alguém da equipe).
export const FORMAS_DA_MENSALIDADE = [...FORMAS_DE_PAGAMENTO, "online"] as const;
export type FormaDaMensalidade = (typeof FORMAS_DA_MENSALIDADE)[number];

// Como o cliente pagou a mensalidade online, como o provedor conta.
export const MEIOS_DO_ONLINE = ["pix", "cartao", "boleto", "outra"] as const;
export type MeioDoOnline = (typeof MEIOS_DO_ONLINE)[number];

export const MAX_DIAS_DE_TESTE_DO_CLIENTE = 30;

const MESES_DO_CICLO: Record<CicloDoCliente, number> = { mensal: 1, trimestral: 3, anual: 12 };

export function assinanteUsaOPlano(situacao: SituacaoDoAssinante): boolean {
  return situacao === "ativa" || situacao === "teste";
}

// A mensalidade recebida, já dividida. `vendedor` nulo = plano da casa.
export function dividirMensalidade(mensalidade: {
  precoCentavos: number;
  vendedor: string | null;
  parteDaCasa: number;
}): Parte<"mensalidade" | "casa">[] {
  const { precoCentavos, vendedor, parteDaCasa } = mensalidade;
  garantirCentavos(precoCentavos, "preço");
  garantirPercentual(parteDaCasa);
  if (vendedor === null) return [{ beneficiario: null, motivo: "casa", valorCentavos: precoCentavos }];

  const casa = porcentagem(precoCentavos, parteDaCasa);
  const partes: Parte<"mensalidade" | "casa">[] = [
    { beneficiario: vendedor, motivo: "mensalidade", valorCentavos: precoCentavos - casa },
    { beneficiario: null, motivo: "casa", valorCentavos: casa },
  ];
  return partes.filter((parte) => parte.valorCentavos > 0);
}

// O que um atendimento pelo plano gera, além do avulso cobrado à parte.
// `fixoCentavos` nulo = plano de barbeiro, que não gera nada: ele já
// recebeu a mensalidade.
export function parteDoPlano(atendimento: { atendente: string; fixoCentavos: number | null }): Parte<"plano">[] {
  const { atendente, fixoCentavos } = atendimento;
  if (fixoCentavos === null) return [];
  garantirCentavos(fixoCentavos, "fixo por atendimento");
  if (fixoCentavos === 0) return [];
  return [{ beneficiario: atendente, motivo: "plano", valorCentavos: fixoCentavos }];
}

const PADRAO_DATA = /^(\d{4})-(\d{2})-(\d{2})$/;

// O dia em que o próximo ciclo começa (o ciclo vale de `inicio` até a
// véspera). Dia que não existe no mês cai no último; `diaDeVencimento`
// (padrão: o dia do início) faz o ciclo voltar pro dia certo depois de
// um mês curto — senão 31/01 viraria 28 pra sempre.
export function fimDoCiclo(inicio: string, ciclo: CicloDoCliente, diaDeVencimento?: number): string {
  const partes = PADRAO_DATA.exec(inicio);
  if (!partes) throw new RangeError(`data fora do formato AAAA-MM-DD: ${inicio}`);
  const [ano, mes, dia] = [Number(partes[1]), Number(partes[2]), Number(partes[3])];
  if (mes < 1 || mes > 12 || dia < 1 || dia > diasNoMes(ano, mes)) {
    throw new RangeError(`data que não existe: ${inicio}`);
  }
  const vencimento = diaDeVencimento ?? dia;
  if (!Number.isInteger(vencimento) || vencimento < 1 || vencimento > 31) {
    throw new RangeError("o dia de vencimento vai de 1 a 31");
  }

  const meses = mes - 1 + MESES_DO_CICLO[ciclo];
  const anoFinal = ano + Math.floor(meses / 12);
  const mesFinal = (meses % 12) + 1;
  const diaFinal = Math.min(vencimento, diasNoMes(anoFinal, mesFinal));
  return `${anoFinal}-${doisDigitos(mesFinal)}-${doisDigitos(diaFinal)}`;
}

// No balcão, o fim do ciclo é o dia da renovação: até ele a assinatura
// está em dia; no dia seguinte, sem "recebi", fica em atraso. Datas
// "AAAA-MM-DD", que ordenam como texto.
export function cicloEmAtraso(terminaEm: string, hoje: string): boolean {
  return terminaEm < hoje;
}

export interface CicloPago {
  cicloComecaEm: string;
  cicloTerminaEm: string;
  // O ciclo seguinte, já pago, que começa quando este acabar.
  pagoAte: string | null;
}

// O ciclo depois de uma cobrança online paga. No online, quem marca o
// ciclo é o vencimento da cobrança, como no provedor: paga atrasada, o
// ciclo começa no vencimento mesmo, e o seguinte vence no dia de sempre.
// Paga antes da renovação (o Pix adiantado, ou durante o teste grátis),
// o ciclo de agora segue até o fim, com os usos dele, e o pago fica em
// `pagoAte`. `null` = a cobrança é de um ciclo que já passou.
export function cicloPagoOnline(
  atual: { cicloComecaEm: string | null; cicloTerminaEm: string | null },
  vencimento: string,
  ciclo: CicloDoCliente,
  hoje: string
): CicloPago | null {
  const { cicloComecaEm, cicloTerminaEm } = atual;
  if (cicloComecaEm !== null && vencimento < cicloComecaEm) return null;
  const fim = fimDoCiclo(vencimento, ciclo);
  if (cicloComecaEm !== null && cicloTerminaEm !== null && hoje < cicloTerminaEm && vencimento >= cicloTerminaEm) {
    return { cicloComecaEm, cicloTerminaEm, pagoAte: fim };
  }
  return { cicloComecaEm: vencimento, cicloTerminaEm: fim, pagoAte: null };
}

export type ProblemaDoRecebimento = "cancelada" | "ciclo_em_dia";

// O "recebi" do balcão abre um ciclo novo a partir de hoje. Antes do dia
// da renovação o ciclo pago ainda vale, e um segundo "recebi" é recusado:
// guardar um ciclo que começa no futuro tiraria os usos de hoje da conta.
export function problemaDoRecebimento(
  assinatura: { situacao: SituacaoDoAssinante; cicloTerminaEm: string | null },
  hoje: string
): ProblemaDoRecebimento | null {
  if (assinatura.situacao === "cancelada") return "cancelada";
  const emCiclo = assinatura.situacao === "ativa" || assinatura.situacao === "teste";
  if (emCiclo && assinatura.cicloTerminaEm !== null && hoje < assinatura.cicloTerminaEm) return "ciclo_em_dia";
  return null;
}

// `null` = ilimitado.
export function usosRestantes(usosPorCiclo: number | null, usados: number): number | null {
  if (usosPorCiclo === null) return null;
  return Math.max(0, usosPorCiclo - usados);
}

export interface AssinaturaParaPrever {
  situacao: SituacaoDoAssinante;
  cicloComecaEm: string | null;
  cicloTerminaEm: string | null;
  // O ciclo seguinte, já pago online, que começa no fim deste.
  pagoAte: string | null;
  // `null` = plano da casa.
  vendedorId: string | null;
  servicos: readonly { servicoId: string; usosPorCiclo: number | null }[];
  // Os usos já gastos no ciclo de agora, por serviço.
  usados: Readonly<Record<string, number>>;
}

export interface HorarioParaPrever {
  id: string;
  data: string;
  horaInicio: string;
  barbeiroId: string;
  servicoIds: readonly string[];
}

// O que o plano vai cobrir em cada horário marcado (a marca "Corte pelo
// plano" da Minha conta). Quem decide é o balcão, no pagamento: aqui, a
// mesma regra (conferirOPlano, na API), pra prometer só o que ele aceita.
// A assinatura vale (ativa ou teste), o dia cai no ciclo (o de agora ou
// o seguinte já pago, com os usos zerados), o plano de barbeiro só com
// quem vende, e cada linha do plano gasta um uso. Os usos que sobram vão
// pros horários mais cedo; com duas assinaturas, a primeira (na ordem de
// quem chama) que cobre algo fica com o horário. Devolve os serviços
// cobertos, um por linha, só dos horários com marca.
export function preverPeloPlano(
  assinaturas: readonly AssinaturaParaPrever[],
  horarios: readonly HorarioParaPrever[]
): Map<string, string[]> {
  const ciclos = assinaturas.map((assinatura) => {
    const { cicloComecaEm: comeca, cicloTerminaEm: termina, pagoAte } = assinatura;
    const janelas: { comeca: string; termina: string; usados: Map<string, number> }[] = [];
    if (assinanteUsaOPlano(assinatura.situacao) && comeca !== null && termina !== null) {
      janelas.push({ comeca, termina, usados: new Map(Object.entries(assinatura.usados)) });
      if (pagoAte !== null) janelas.push({ comeca: termina, termina: pagoAte, usados: new Map() });
    }
    return { assinatura, janelas };
  });

  const emOrdem = [...horarios].sort((a, b) =>
    `${a.data} ${a.horaInicio}`.localeCompare(`${b.data} ${b.horaInicio}`)
  );
  const previsao = new Map<string, string[]>();
  for (const horario of emOrdem) {
    for (const { assinatura, janelas } of ciclos) {
      if (assinatura.vendedorId !== null && assinatura.vendedorId !== horario.barbeiroId) continue;
      const janela = janelas.find((j) => j.comeca <= horario.data && horario.data < j.termina);
      if (!janela) continue;
      const usados = new Map(janela.usados);
      const cobertos: string[] = [];
      for (const servicoId of horario.servicoIds) {
        const regra = assinatura.servicos.find((s) => s.servicoId === servicoId);
        if (!regra) continue;
        const ja = usados.get(servicoId) ?? 0;
        if (usosRestantes(regra.usosPorCiclo, ja) === 0) continue;
        cobertos.push(servicoId);
        usados.set(servicoId, ja + 1);
      }
      if (cobertos.length === 0) continue;
      janela.usados = usados;
      previsao.set(horario.id, cobertos);
      break;
    }
  }
  return previsao;
}

export interface PlanoParaConferir {
  daCasa: boolean;
  precoCentavos: number;
  diasDeTeste: number;
  fixoPorAtendimentoCentavos: number | null;
  // `null` = ilimitado.
  servicos: readonly { usosPorCiclo: number | null }[];
  aceitaOnline: boolean;
  aceitaNoBalcao: boolean;
}

export type ProblemaDoPlano = "preco" | "dias_de_teste" | "fixo" | "servicos" | "usos" | "formas";

// O primeiro problema do plano, ou `null`. A API recusa com ele e a tela
// marca o campo; o CHECK do banco repete o que dá pra repetir.
export function problemaDoPlano(plano: PlanoParaConferir): ProblemaDoPlano | null {
  if (!Number.isInteger(plano.precoCentavos) || plano.precoCentavos <= 0) return "preco";
  const { diasDeTeste } = plano;
  if (!Number.isInteger(diasDeTeste) || diasDeTeste < 0 || diasDeTeste > MAX_DIAS_DE_TESTE_DO_CLIENTE) {
    return "dias_de_teste";
  }
  const fixo = plano.fixoPorAtendimentoCentavos;
  if (plano.daCasa ? fixo === null || !Number.isInteger(fixo) || fixo < 0 : fixo !== null) return "fixo";
  if (plano.servicos.length === 0) return "servicos";
  for (const { usosPorCiclo } of plano.servicos) {
    if (usosPorCiclo !== null && (!Number.isInteger(usosPorCiclo) || usosPorCiclo < 1)) return "usos";
  }
  if (!plano.aceitaOnline && !plano.aceitaNoBalcao) return "formas";
  return null;
}

function diasNoMes(ano: number, mes: number): number {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

function doisDigitos(numero: number): string {
  return String(numero).padStart(2, "0");
}
