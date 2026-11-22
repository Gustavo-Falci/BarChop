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
  // Um atendimento (e não pausa ou bloqueio): é o fim dele que o "logo
  // depois do anterior" oferece.
  atendimento?: boolean;
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
  // Além da grade, o minuto em que um atendimento termina (09:40 quando o
  // anterior sai às 09:40), se a duração cabe ali. Fim de pausa ou de
  // bloqueio não conta: o vão já é do profissional.
  logoDepoisDoAnterior?: boolean; // padrão false
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
    logoDepoisDoAnterior = false,
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
      atendimento: a.atendimento === true,
    }))
    .sort((a, b) => a.inicio - b.inicio);

  const horariosDisponiveis: string[] = [];
  let cursor = abertura;
  // Se quem empurrou o cursor até aqui foi um atendimento. É de quem
  // terminou por último: um bloqueio que passa do atendimento leva o vão.
  let cursorDeAtendimento = false;

  // `limiteDoInicio`: o último minuto em que um atendimento pode
  // começar no vão. Por padrão, o que termina bem no fim do vão.
  function preencherGap(gapInicio: number, limiteDoInicio: number) {
    // O "logo depois": o próprio início do vão, quando ele é o fim de um
    // atendimento fora da grade. Vem antes dos da grade, então a lista
    // segue em ordem.
    const foraDaGrade = gapInicio % intervaloMinutos !== 0;
    if (logoDepoisDoAnterior && cursorDeAtendimento && foraDaGrade && gapInicio <= limiteDoInicio) {
      horariosDisponiveis.push(minutosParaHora(gapInicio));
    }

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
    if (ocupado.fim > cursor) {
      cursor = ocupado.fim;
      cursorDeAtendimento = ocupado.atendimento;
    } else if (ocupado.fim === cursor && ocupado.atendimento) {
      // Pausa e atendimento terminando juntos: conta o atendimento.
      cursorDeAtendimento = true;
    }
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

// Por que um horário qualquer não serve: dia fechado, fora do expediente
// ou batendo com o que já está ocupado. `indice` é a posição do que bate
// em `agendamentosExistentes`, pra quem chamou dizer com quem.
export type HorarioNaoCabe =
  | { motivo: "fechado" }
  | { motivo: "fora_do_expediente" }
  | { motivo: "ocupado"; indice: number };

// O "Outro horário" do painel: qualquer minuto, e não só os da grade. As
// mesmas pontas do `calcularHorariosDisponiveis` — tudo que a lista
// oferece cabe aqui, e o que cabe aqui na grade está na lista (testes).
// `intervaloMinutos` e `logoDepoisDoAnterior` não entram: só dizem quais
// minutos a lista sugere.
export function horarioCabe(
  params: CalcularHorariosParams,
  horaInicio: string
): HorarioNaoCabe | null {
  const {
    horarioFuncionamento,
    agendamentosExistentes,
    duracaoTotalMinutos,
    cabeAntesDeFechar = true,
  } = params;

  if (
    horarioFuncionamento.fechado ||
    !horarioFuncionamento.horaAbertura ||
    !horarioFuncionamento.horaFechamento
  ) {
    return { motivo: "fechado" };
  }

  const abertura = horaParaMinutos(horarioFuncionamento.horaAbertura);
  const fechamento = horaParaMinutos(horarioFuncionamento.horaFechamento);
  const inicio = horaParaMinutos(horaInicio);
  const fim = inicio + duracaoTotalMinutos;

  const dentro = cabeAntesDeFechar
    ? fim <= fechamento
    : inicio <= fechamento - 1 && inicio <= MINUTOS_NO_DIA - 1 - duracaoTotalMinutos;
  if (inicio < abertura || !dentro) return { motivo: "fora_do_expediente" };

  // O que bate e começa primeiro: é o que a frase vai citar.
  let indice = -1;
  agendamentosExistentes.forEach((ocupado, i) => {
    const comeca = horaParaMinutos(ocupado.horaInicio);
    if (comeca < fim && inicio < horaParaMinutos(ocupado.horaFim)) {
      if (indice === -1 || comeca < horaParaMinutos(agendamentosExistentes[indice].horaInicio)) {
        indice = i;
      }
    }
  });
  return indice === -1 ? null : { motivo: "ocupado", indice };
}

// Mudar os serviços de um agendamento que já existe (pedido do dono,
// 22/11/2026). Até onde ele pode esticar: o primeiro compromisso do
// profissional depois do fim de hoje — atendimento, pausa ou bloqueio
// por horas —, senão o fechamento (23:59 quando a barbearia deixa
// terminar depois de fechar). Nunca antes do fim de hoje: o que já cobre
// esse fim (um bloqueio criado depois, um encaixe colado) só impede de
// esticar. Dia fechado também não estica. `indice` é de quem limita,
// pra frase "quando começa Fulano"; null quando é o expediente.
export interface LimiteDepoisParams {
  horarioFuncionamento: JanelaFuncionamento;
  // Do profissional no dia, sem os cancelados e sem o próprio atendimento.
  ocupados: IntervaloOcupado[];
  horaFimAtual: string; // "HH:mm"
  cabeAntesDeFechar?: boolean; // padrão true
}

export interface LimiteDepois {
  limite: string; // "HH:mm"
  indice: number | null;
}

export function limiteDepois(params: LimiteDepoisParams): LimiteDepois {
  const { horarioFuncionamento, ocupados, horaFimAtual, cabeAntesDeFechar = true } = params;
  const fimAtual = horaParaMinutos(horaFimAtual);

  if (
    horarioFuncionamento.fechado ||
    !horarioFuncionamento.horaAbertura ||
    !horarioFuncionamento.horaFechamento
  ) {
    return { limite: horaFimAtual, indice: null };
  }

  let limite = cabeAntesDeFechar
    ? horaParaMinutos(horarioFuncionamento.horaFechamento)
    : MINUTOS_NO_DIA - 1;
  let indice: number | null = null;
  ocupados.forEach((ocupado, i) => {
    if (horaParaMinutos(ocupado.horaFim) <= fimAtual) return;
    const comeca = Math.max(horaParaMinutos(ocupado.horaInicio), fimAtual);
    if (comeca < limite || (comeca === limite && indice === null)) {
      limite = comeca;
      indice = i;
    }
  });

  if (limite < fimAtual) return { limite: horaFimAtual, indice: null };
  return { limite: minutosParaHora(limite), indice };
}

// A duração depois da mudança: a de hoje (que já conta o encaixe) mais a
// dos serviços novos. Tirar encurta pra soma dos que ficam; se já era
// encaixe, fica a menor das duas.
export function duracaoDaMudanca(params: {
  duracaoAtual: number;
  somaQueFica: number;
  somaNova: number;
}): number {
  return Math.min(params.duracaoAtual, params.somaQueFica) + params.somaNova;
}

// Cabe quando o previsto termina até o limite; senão o fim estica até o
// limite e o agendamento vira encaixe (dura menos que os serviços).
// `terminaPrevisto` é só pra frase: depois da meia-noite dá a volta.
export function fimDaMudanca(params: {
  horaInicio: string;
  previstoMinutos: number;
  limite: string;
}): { cabe: boolean; horaFim: string; terminaPrevisto: string } {
  const fimPrevisto = horaParaMinutos(params.horaInicio) + params.previstoMinutos;
  const limite = horaParaMinutos(params.limite);
  const cabe = fimPrevisto <= limite;
  return {
    cabe,
    horaFim: minutosParaHora(cabe ? fimPrevisto : limite),
    terminaPrevisto: minutosParaHora(fimPrevisto % MINUTOS_NO_DIA),
  };
}
