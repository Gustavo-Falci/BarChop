// As regras de agendamento da barbearia (painel v2, marco 3): o que o
// cliente pode marcar, remarcar e cancelar pelo link. Listas fechadas
// num lugar só (o padrão da ADR-0007): a API valida contra elas, o banco
// tem um CHECK com os mesmos valores (migration
// 20261009120000_regras_de_agendamento, com teste que os compara) e a
// tela tira daqui as opções. O painel não passa por nenhuma: encaixa
// livre.
//
// O tipo `RegrasDeAgendamento` de @barchop/types repete estes campos (o
// pacote de tipos não depende de nenhum outro).

// A grade dos horários de início, em minutos desde a meia-noite.
export const INTERVALOS_MINUTOS = [15, 30, 60] as const;
// Quanto antes de agora o cliente pode marcar; 0 = qualquer horário
// depois de agora.
export const ANTECEDENCIAS_MINUTOS = [0, 30, 60, 120, 240, 1440] as const;
// Até quantos dias à frente a agenda abre; `null` (fora da lista) = sem
// limite.
export const JANELAS_DIAS = [7, 14, 30, 60, 90] as const;
// Até quantas horas antes do horário o cliente remarca ou cancela; 0 =
// até o horário começar.
export const PRAZOS_HORAS = [0, 1, 2, 6, 12, 24, 48] as const;

export interface RegrasDeAgendamento {
  intervaloMinutos: (typeof INTERVALOS_MINUTOS)[number];
  antecedenciaMinutos: (typeof ANTECEDENCIAS_MINUTOS)[number];
  aceitaMesmoDia: boolean;
  janelaDias: (typeof JANELAS_DIAS)[number] | null;
  // Desligado, o serviço pode começar antes de fechar e terminar depois.
  cabeAntesDeFechar: boolean;
  prazoRemarcarHoras: (typeof PRAZOS_HORAS)[number];
  prazoCancelarHoras: (typeof PRAZOS_HORAS)[number];
}

// O comportamento de antes das regras: barbearia que ninguém configurou
// agenda exatamente como agendava.
export const REGRAS_PADRAO: RegrasDeAgendamento = {
  intervaloMinutos: 15,
  antecedenciaMinutos: 0,
  aceitaMesmoDia: true,
  janelaDias: null,
  cabeAntesDeFechar: true,
  prazoRemarcarHoras: 0,
  prazoCancelarHoras: 0,
};

export type Agora = { data: string; hora: string };

const UM_DIA_EM_MINUTOS = 24 * 60;

// Data e hora do contrato como minutos numa linha do tempo sem fuso:
// os dois lados da conta estão no relógio da barbearia, então a
// diferença sai certa sem converter fuso nenhum.
function minutosNaLinhaDoTempo(data: string, hora: string): number {
  const [ano, mes, dia] = data.split("-").map(Number);
  const [h, m] = hora.split(":").map(Number);
  return Date.UTC(ano, mes - 1, dia) / 60_000 + h * 60 + m;
}

// Quantos minutos faltam do agora até o horário; negativo se já passou.
export function minutosAte(agora: Agora, data: string, hora: string): number {
  return minutosNaLinhaDoTempo(data, hora) - minutosNaLinhaDoTempo(agora.data, agora.hora);
}

export type RecusaDeRegra =
  | "horario_passado"
  | "mesmo_dia_fechado"
  | "fora_da_antecedencia"
  | "fora_da_janela";

// A regra que impede o cliente de marcar este horário, ou null. O
// minuto atual já não serve (não dá tempo de chegar); com antecedência,
// o horário exatamente no limite ainda serve. O passado vem primeiro: é
// a recusa que explica melhor.
export function regraQueRecusa(
  regras: Pick<RegrasDeAgendamento, "antecedenciaMinutos" | "aceitaMesmoDia" | "janelaDias">,
  agora: Agora,
  data: string,
  hora: string
): RecusaDeRegra | null {
  const faltam = minutosAte(agora, data, hora);
  if (faltam <= 0) return "horario_passado";
  if (!regras.aceitaMesmoDia && data === agora.data) return "mesmo_dia_fechado";
  if (faltam < regras.antecedenciaMinutos) return "fora_da_antecedencia";
  if (
    regras.janelaDias !== null &&
    minutosAte({ data: agora.data, hora: "00:00" }, data, "00:00") > regras.janelaDias * UM_DIA_EM_MINUTOS
  ) {
    return "fora_da_janela";
  }
  return null;
}

// O prazo do cliente pra remarcar ou cancelar já passou? 0 = até o
// horário começar; com horas, no limite ainda dá.
export function prazoDoClientePassou(prazoHoras: number, agora: Agora, data: string, hora: string): boolean {
  const faltam = minutosAte(agora, data, hora);
  return faltam <= 0 || faltam < prazoHoras * 60;
}
