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
  // Desligado, o atendimento pode começar antes de fechar e terminar
  // depois (regra da barbearia, painel v2). Só a ponta do fechamento
  // muda: o que está ocupado segue inteiro, e nada passa da meia-noite.
  cabeAntesDeFechar?: boolean; // padrão true
}

const MINUTOS_NO_DIA = 24 * 60;

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
    cabeAntesDeFechar = true,
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

  // `limiteDoInicio`: o último minuto em que um atendimento pode
  // começar no vão. Por padrão, o que termina bem no fim do vão.
  function preencherGap(gapInicio: number, limiteDoInicio: number) {
    // alinha candidatos ao grid de intervaloMinutos a partir da meia-noite,
    // não a partir do início do gap — evita sugerir horários "quebrados"
    // tipo 09:07 só porque o agendamento anterior terminou nesse minuto.
    const primeiroCandidato =
      Math.ceil(gapInicio / intervaloMinutos) * intervaloMinutos;

    for (
      let inicio = primeiroCandidato;
      inicio <= limiteDoInicio;
      inicio += intervaloMinutos
    ) {
      horariosDisponiveis.push(minutosParaHora(inicio));
    }
  }

  for (const ocupado of ocupados) {
    if (ocupado.inicio - cursor >= duracaoTotalMinutos) {
      preencherGap(cursor, ocupado.inicio - duracaoTotalMinutos);
    }
    cursor = Math.max(cursor, ocupado.fim);
  }

  if (cabeAntesDeFechar) {
    if (fechamento - cursor >= duracaoTotalMinutos) {
      preencherGap(cursor, fechamento - duracaoTotalMinutos);
    }
  } else {
    // Começa antes de fechar (o último minuto aberto) e termina antes da
    // meia-noite: o agendamento não atravessa o dia (ver somarMinutos).
    preencherGap(cursor, Math.min(fechamento - 1, MINUTOS_NO_DIA - 1 - duracaoTotalMinutos));
  }

  return horariosDisponiveis;
}
