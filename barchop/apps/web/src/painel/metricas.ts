import type { AgendamentoComCliente, HorarioSerializado } from "@barchop/types";

// Previsto do dia, não caixa: com dinheiro contando só o concluído, o
// número ficaria zerado até o barbeiro marcar as conclusões, e ele só
// marca se o número servir pra alguma coisa. Cancelado e no_show ficam
// de fora porque o horário voltou a ficar livre.
export const CONTAM = ["pendente", "confirmado", "concluido"] as const;

function valem(agendamentos: AgendamentoComCliente[]): AgendamentoComCliente[] {
  return agendamentos.filter((a) => (CONTAM as readonly string[]).includes(a.status));
}

export function minutosOcupados(agendamentos: AgendamentoComCliente[]): number {
  return valem(agendamentos).reduce(
    (total, a) =>
      total + a.servicos.reduce((soma, s) => soma + s.duracaoNoMomento, 0),
    0
  );
}

export function minutosDeFuncionamento(
  horario: HorarioSerializado | undefined
): number {
  if (!horario || horario.fechado || !horario.horaAbertura || !horario.horaFechamento) {
    return 0;
  }
  const emMinutos = (hora: string) => {
    const [h, m] = hora.split(":").map(Number);
    return h * 60 + m;
  };
  return emMinutos(horario.horaFechamento) - emMinutos(horario.horaAbertura);
}

// `null`, e não zero: zero por cento diria "aberto e vazio", e dia
// fechado não é isso. Dividir por zero seria o outro erro.
export function ocupacao(
  agendamentos: AgendamentoComCliente[],
  horario: HorarioSerializado | undefined
): number | null {
  const janela = minutosDeFuncionamento(horario);
  if (janela <= 0) return null;
  return Math.round((minutosOcupados(agendamentos) / janela) * 100);
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
