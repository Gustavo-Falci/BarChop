import type { AgendamentoComCliente, MinutosDoDia } from "@barchop/types";

// Previsto do dia, não caixa: com dinheiro contando só o concluído, o
// número ficaria zerado até o barbeiro marcar as conclusões, e ele só
// marca se o número servir pra alguma coisa. Cancelado e no_show ficam
// de fora porque o horário voltou a ficar livre.
export const CONTAM = ["pendente", "confirmado", "concluido"] as const;

// O que ainda vai acontecer: concluído já foi, cancelado e falta não vêm.
const POR_VIR = ["pendente", "confirmado"];

function valem(agendamentos: AgendamentoComCliente[]): AgendamentoComCliente[] {
  return agendamentos.filter((a) => (CONTAM as readonly string[]).includes(a.status));
}

// String de ponta a ponta: o preço é Decimal no banco. A soma acontece
// em centavos inteiros por hábito defensivo com dinheiro, não porque
// algum preço de duas casas alcançável aqui derrube essa conta: o erro
// acumulado de somar doubles de duas casas fica na casa de 1e-8 até
// pra mil itens no mesmo dia (mil entradas de "999.99" somam ~7,8e-9),
// muito abaixo dos 0,005 que fariam `toFixed(2)` arredondar pro lado
// errado. Nenhum teste separa as duas formas por isso — não tem entrada
// de duas casas que as separe.
export function previstoDoDia(agendamentos: AgendamentoComCliente[]): string {
  const centavos = valem(agendamentos).reduce(
    (total, a) =>
      total +
      a.servicos.reduce((soma, s) => soma + Math.round(Number(s.precoNoMomento) * 100), 0),
    0
  );
  return (centavos / 100).toFixed(2);
}

// A ocupação em porcentagem (painel v2, marco 4). Os minutos vêm da API,
// que conhece jornada, pausa, data especial e bloqueios. `null`, e não
// zero, sem trabalho no dia: zero diria "aberto e vazio". Passa de 100
// quando o painel encaixou além do horário — esconder isso mentiria.
export function percentual(minutos: MinutosDoDia): number | null {
  if (minutos.minutosDeTrabalho <= 0) return null;
  return Math.round((minutos.minutosAgendados / minutos.minutosDeTrabalho) * 100);
}

function relogio(agora: Date): string {
  return `${String(agora.getHours()).padStart(2, "0")}:${String(agora.getMinutes()).padStart(2, "0")}`;
}

// Os de hoje que ainda não terminaram, em ordem; `emCurso` no que já
// começou. "HH:mm" compara como texto na ordem do relógio, e o relógio
// é o do aparelho, como no resto do painel.
export function proximos(
  agendamentos: AgendamentoComCliente[],
  agora: Date
): { agendamento: AgendamentoComCliente; emCurso: boolean }[] {
  const atual = relogio(agora);
  return agendamentos
    .filter((a) => POR_VIR.includes(a.status) && a.horaFim > atual)
    .sort((a, b) => a.horaInicio.localeCompare(b.horaInicio))
    .map((agendamento) => ({ agendamento, emCurso: agendamento.horaInicio <= atual }));
}

// "45 min", "9h", "4h30".
export function formatarHoras(minutos: number): string {
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return resto === 0 ? `${horas}h` : `${horas}h${String(resto).padStart(2, "0")}`;
}
