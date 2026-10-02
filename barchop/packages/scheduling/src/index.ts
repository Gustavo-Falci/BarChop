// Regra de negócio central do BarChop: dado o horário de
// funcionamento, os agendamentos já existentes de um barbeiro
// num dia, e a duração total dos serviços escolhidos pelo
// cliente, calcula quais horários de início são possíveis.
//
// Pacote sem dependência de framework — pode rodar no backend
// (fonte da verdade) e, se quiser, no client pra preview otimista.
// A validação final sempre acontece no backend, protegida também
// pela exclusion constraint do banco (ver packages/database).

export interface JanelaFuncionamento {
  horaAbertura: string | null; // "HH:mm"
  horaFechamento: string | null;
  fechado: boolean;
}

export interface IntervaloOcupado {
  horaInicio: string; // "HH:mm"
  horaFim: string;
}

export interface CalcularHorariosParams {
  horarioFuncionamento: JanelaFuncionamento;
  agendamentosExistentes: IntervaloOcupado[]; // já filtrados: só do barbeiro/dia em questão, sem os cancelados
  duracaoTotalMinutos: number;
  intervaloMinutos?: number; // granularidade dos horários sugeridos — padrão 15
}

function horaParaMinutos(hora: string): number {
  const [h, m] = hora.split(":").map(Number);
  return h * 60 + m;
}

function minutosParaHora(minutos: number): string {
  const h = Math.floor(minutos / 60)
    .toString()
    .padStart(2, "0");
  const m = (minutos % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

export function calcularHorariosDisponiveis(
  params: CalcularHorariosParams
): string[] {
  const {
    horarioFuncionamento,
    agendamentosExistentes,
    duracaoTotalMinutos,
    intervaloMinutos = 15,
  } = params;

  if (
    horarioFuncionamento.fechado ||
    !horarioFuncionamento.horaAbertura ||
    !horarioFuncionamento.horaFechamento
  ) {
    return [];
  }

  const abertura = horaParaMinutos(horarioFuncionamento.horaAbertura);
  const fechamento = horaParaMinutos(horarioFuncionamento.horaFechamento);

  const ocupados = agendamentosExistentes
    .map((a) => ({
      inicio: horaParaMinutos(a.horaInicio),
      fim: horaParaMinutos(a.horaFim),
    }))
    .sort((a, b) => a.inicio - b.inicio);

  const horariosDisponiveis: string[] = [];
  let cursor = abertura;

  function preencherGap(gapInicio: number, gapFim: number) {
    // alinha candidatos ao grid de intervaloMinutos a partir da meia-noite,
    // não a partir do início do gap — evita sugerir horários "quebrados"
    // tipo 09:07 só porque o agendamento anterior terminou nesse minuto.
    const primeiroCandidato =
      Math.ceil(gapInicio / intervaloMinutos) * intervaloMinutos;

    for (
      let inicio = primeiroCandidato;
      inicio + duracaoTotalMinutos <= gapFim;
      inicio += intervaloMinutos
    ) {
      horariosDisponiveis.push(minutosParaHora(inicio));
    }
  }

  for (const ocupado of ocupados) {
    if (ocupado.inicio - cursor >= duracaoTotalMinutos) {
      preencherGap(cursor, ocupado.inicio);
    }
    cursor = Math.max(cursor, ocupado.fim);
  }

  if (fechamento - cursor >= duracaoTotalMinutos) {
    preencherGap(cursor, fechamento);
  }

  return horariosDisponiveis;
}
