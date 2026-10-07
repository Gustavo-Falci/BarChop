import {
  prazoDoClientePassou,
  regraQueRecusa,
  type Agora,
  type RecusaDeRegra,
} from "@barchop/formato";
import type { RegrasDeAgendamento } from "@barchop/types";
import type { ClientePrisma } from "./disponibilidade";
import { ErroDeNegocio } from "./erro-negocio";
import { agoraNaBarbearia, dateParaData, dateParaHora } from "./horas";

// As regras de agendamento da barbearia (painel v2, marco 3) do lado da
// API. A conta mora em @barchop/formato (pura, com o `agora` de fora);
// aqui ficam a leitura do banco e as recusas com código. Valem só pro
// cliente: o painel encaixa livre.

export const SELECT_REGRAS = {
  intervaloMinutos: true,
  antecedenciaMinutos: true,
  aceitaMesmoDia: true,
  janelaDias: true,
  cabeAntesDeFechar: true,
  prazoRemarcarHoras: true,
  prazoCancelarHoras: true,
} as const;

type LinhaDeRegras = {
  intervaloMinutos: number;
  antecedenciaMinutos: number;
  aceitaMesmoDia: boolean;
  janelaDias: number | null;
  cabeAntesDeFechar: boolean;
  prazoRemarcarHoras: number;
  prazoCancelarHoras: number;
};

// A linha do banco no tipo do contrato. Os CHECKs das colunas garantem
// que cada número é uma das opções.
export function regrasDe(linha: LinhaDeRegras): RegrasDeAgendamento {
  return {
    intervaloMinutos: linha.intervaloMinutos as RegrasDeAgendamento["intervaloMinutos"],
    antecedenciaMinutos: linha.antecedenciaMinutos as RegrasDeAgendamento["antecedenciaMinutos"],
    aceitaMesmoDia: linha.aceitaMesmoDia,
    janelaDias: linha.janelaDias as RegrasDeAgendamento["janelaDias"],
    cabeAntesDeFechar: linha.cabeAntesDeFechar,
    prazoRemarcarHoras: linha.prazoRemarcarHoras as RegrasDeAgendamento["prazoRemarcarHoras"],
    prazoCancelarHoras: linha.prazoCancelarHoras as RegrasDeAgendamento["prazoCancelarHoras"],
  };
}

export async function carregarRegras(db: ClientePrisma, barbeariaId: string): Promise<RegrasDeAgendamento> {
  return regrasDe(
    await db.barbearia.findUniqueOrThrow({ where: { id: barbeariaId }, select: SELECT_REGRAS })
  );
}

// O que o cálculo dos horários livres precisa: a grade dos inícios e se
// o serviço tem que terminar até fechar.
export interface Grade {
  intervaloMinutos: number;
  cabeAntesDeFechar: boolean;
}

// O comportamento de antes das regras.
export const GRADE_PADRAO: Grade = { intervaloMinutos: 15, cabeAntesDeFechar: true };

// O cliente usa a grade da barbearia. O painel nunca vê menos que o
// cliente: a grade de 15 contém as de 30 e 60 (todas contam da
// meia-noite), e terminar depois de fechar, se a casa deixa o cliente,
// deixa o painel também.
export function gradeDe(regras: RegrasDeAgendamento, paraCliente: boolean): Grade {
  return {
    intervaloMinutos: paraCliente ? regras.intervaloMinutos : GRADE_PADRAO.intervaloMinutos,
    cabeAntesDeFechar: regras.cabeAntesDeFechar,
  };
}

const MENSAGEM_DA_RECUSA: Record<RecusaDeRegra, string> = {
  horario_passado: "esse horário já passou",
  mesmo_dia_fechado: "a barbearia não aceita marcar pelo link no mesmo dia",
  fora_da_antecedencia: "esse horário está perto demais: a barbearia pede mais antecedência",
  fora_da_janela: "a agenda da barbearia ainda não abriu pra essa data",
};

// O destino de quem marca ou remarca pelo lado do cliente: a mesma
// conta que tirou o horário da tela, agora com o motivo.
export function garantirRegrasDoCliente(
  regras: RegrasDeAgendamento,
  data: string,
  horaInicio: string,
  agora: Agora = agoraNaBarbearia()
): void {
  const recusa = regraQueRecusa(regras, agora, data, horaInicio);
  if (recusa) throw new ErroDeNegocio(MENSAGEM_DA_RECUSA[recusa], recusa);
}

// Remarcar e cancelar pelo link têm prazo; o painel não passa por aqui.
// Vem depois do `garantirAlteravel`, que já recusou o que não está ativo
// ou já começou.
export function garantirPrazoDoCliente(
  agendamento: { data: Date; horaInicio: Date },
  regras: RegrasDeAgendamento,
  acao: "remarcar" | "cancelar",
  agora: Agora = agoraNaBarbearia()
): void {
  const prazo = acao === "remarcar" ? regras.prazoRemarcarHoras : regras.prazoCancelarHoras;
  if (
    prazoDoClientePassou(prazo, agora, dateParaData(agendamento.data), dateParaHora(agendamento.horaInicio))
  ) {
    throw new ErroDeNegocio(
      `o prazo pra ${acao} pelo link acabou: fale com a barbearia`,
      acao === "remarcar" ? "prazo_de_remarcar" : "prazo_de_cancelar"
    );
  }
}
