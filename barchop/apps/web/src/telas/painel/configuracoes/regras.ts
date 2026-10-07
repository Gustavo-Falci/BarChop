import {
  ANTECEDENCIAS_MINUTOS,
  INTERVALOS_MINUTOS,
  JANELAS_DIAS,
  PRAZOS_HORAS,
} from "@barchop/formato";
import type { RegrasDeAgendamento } from "@barchop/types";

// Os rótulos e as frases da área Regras de agendamento (painel v2, marco
// 3). As opções vêm de @barchop/formato, as mesmas que a API aceita; aqui
// fica só como o dono as lê e o que cada uma faz pro cliente.

function duracao(minutos: number): string {
  if (minutos === 1440) return "1 dia";
  return minutos >= 60 ? `${minutos / 60} h` : `${minutos} min`;
}

export const OPCOES_DE_INTERVALO = INTERVALOS_MINUTOS.map((minutos) => ({
  valor: String(minutos),
  rotulo: duracao(minutos),
}));

export const OPCOES_DE_ANTECEDENCIA = ANTECEDENCIAS_MINUTOS.map((minutos) => ({
  valor: String(minutos),
  rotulo: minutos === 0 ? "Nenhuma" : duracao(minutos),
}));

// "Sem limite" é o `null` da API; no rádio vira a string "sem".
export const OPCOES_DE_JANELA = [
  ...JANELAS_DIAS.map((dias) => ({ valor: String(dias), rotulo: `${dias} dias` })),
  { valor: "sem", rotulo: "Sem limite" },
];

export const OPCOES_DE_PRAZO = PRAZOS_HORAS.map((horas) => ({
  valor: String(horas),
  rotulo: horas === 0 ? "Até começar" : `${horas} h`,
}));

export const OPCOES_SIM_NAO = [
  { valor: "sim", rotulo: "Sim" },
  { valor: "nao", rotulo: "Não" },
];

export function efeitoDoIntervalo(minutos: number): string {
  return `O cliente vê horários de ${minutos} em ${minutos} minutos.`;
}

export function efeitoDaAntecedencia(minutos: number): string {
  return minutos === 0
    ? "O cliente marca qualquer horário que ainda não começou."
    : `O cliente marca com pelo menos ${duracao(minutos)} antes do horário.`;
}

export function efeitoDoMesmoDia(aceita: boolean): string {
  return aceita
    ? "O cliente pode marcar pra hoje."
    : "Pelo link, só a partir de amanhã. Pra hoje, você encaixa pelo painel.";
}

export function efeitoDaJanela(dias: number | null): string {
  return dias === null
    ? "A agenda fica aberta sem limite de data."
    : `O cliente marca até ${dias} dias à frente.`;
}

export function efeitoDoCabe(cabe: boolean): string {
  return cabe
    ? "O serviço termina até a hora de fechar."
    : "O último horário pode começar antes de fechar e terminar depois.";
}

export function efeitoDoPrazo(horas: number, acao: "remarca" | "cancela"): string {
  return horas === 0
    ? `O cliente ${acao} pelo link até o horário começar.`
    : `O cliente ${acao} pelo link até ${horas} h antes. Depois, só falando com a barbearia.`;
}

// A linha do índice quando a área já foi decidida.
export function resumoDasRegras(regras: RegrasDeAgendamento): string {
  const janela = regras.janelaDias === null ? "agenda sem limite" : `agenda de ${regras.janelaDias} dias`;
  return `Grade de ${duracao(regras.intervaloMinutos)} · ${janela}`;
}
