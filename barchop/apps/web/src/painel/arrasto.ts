import { hojeIso, horaJaPassou } from "../formato/datas";
import { MINUTOS_POR_LINHA, type GradeDeTempo } from "./grade";

// Pra onde vai o agendamento arrastado na agenda (arrastar e reordenar,
// PR 7). Puro: a tela mede quantas linhas e colunas o ponteiro andou, e
// isto diz o destino — o fantasma que aparece durante o arrasto e o que
// vai pra confirmação.
//
// Encaixa de 15 em 15, a grade do que a API aceita marcar. A coluna do
// lado é o dia seguinte (semana) ou o outro profissional (dia da
// equipe). A checagem é local, com a grade já carregada: em cima de
// outro agendamento do mesmo profissional, fora da janela, no fechado,
// no bloqueio ou no passado, o destino sai inválido e a tela não deixa
// soltar. Quem decide no fim é a API.

const PASSO = 15;

export interface DestinoDoArrasto {
  data: string;
  horaInicio: string;
  horaFim: string;
  // Só quando o destino troca de profissional (coluna de outro, no dia
  // da equipe).
  barbeiroId?: string;
  // Onde desenhar o fantasma.
  coluna: number;
  linha: number;
  linhas: number;
  valido: boolean;
}

function emMinutos(hora: string): number {
  const [h, m] = hora.split(":").map(Number);
  return h * 60 + m;
}

function emHora(minutos: number): string {
  const limitado = Math.max(0, Math.min(minutos, 24 * 60 - PASSO));
  return `${String(Math.floor(limitado / 60)).padStart(2, "0")}:${String(limitado % 60).padStart(2, "0")}`;
}

function cruza(inicio: number, fim: number, outroInicio: number, outroFim: number): boolean {
  return inicio < outroFim && outroInicio < fim;
}

// Nulo quando não há o que mudar: o bloco voltou pro mesmo lugar, ou
// andou menos que meio passo.
export function destinoDoArrasto(
  grade: GradeDeTempo,
  agendamentoId: string,
  deslocamento: { linhas: number; colunas: number },
  agora: Date
): DestinoDoArrasto | null {
  const origem = grade.colunas.findIndex((coluna) =>
    coluna.eventos.some((evento) => evento.agendamento.id === agendamentoId)
  );
  if (origem < 0) return null;
  const agendamento = grade.colunas[origem].eventos.find((evento) => evento.agendamento.id === agendamentoId)!
    .agendamento;

  const duracao = emMinutos(agendamento.horaFim) - emMinutos(agendamento.horaInicio);
  const inicio =
    Math.round((emMinutos(agendamento.horaInicio) + deslocamento.linhas * MINUTOS_POR_LINHA) / PASSO) * PASSO;
  const fim = inicio + duracao;
  const indice = Math.max(0, Math.min(grade.colunas.length - 1, origem + deslocamento.colunas));
  const coluna = grade.colunas[indice];
  const barbeiroId = coluna.barbeiroId ?? agendamento.barbeiro.id;
  const horaInicio = emHora(inicio);

  if (coluna.data === agendamento.data && horaInicio === agendamento.horaInicio && barbeiroId === agendamento.barbeiro.id) {
    return null;
  }

  const minutoDaLinha = (linha: number) => grade.minutoInicial + (linha - 1) * MINUTOS_POR_LINHA;
  const emCimaDeFaixa = [...coluna.fechadas, ...coluna.bloqueios].some((faixa) =>
    cruza(inicio, fim, minutoDaLinha(faixa.linha), minutoDaLinha(faixa.linha) + faixa.linhas * MINUTOS_POR_LINHA)
  );
  // Só o mesmo profissional ocupa: na semana de quem tem equipe, a coluna
  // do dia junta todo mundo. E o próprio não conta — ele sai de lá.
  const emCimaDeOutro = coluna.eventos.some(
    (evento) =>
      evento.agendamento.id !== agendamentoId &&
      evento.agendamento.barbeiro.id === barbeiroId &&
      cruza(inicio, fim, emMinutos(evento.agendamento.horaInicio), emMinutos(evento.agendamento.horaFim))
  );
  const passado = coluna.data < hojeIso(agora) || horaJaPassou(coluna.data, horaInicio, agora);

  return {
    data: coluna.data,
    horaInicio,
    horaFim: emHora(fim),
    ...(barbeiroId !== agendamento.barbeiro.id ? { barbeiroId } : {}),
    coluna: indice,
    linha: (inicio - grade.minutoInicial) / MINUTOS_POR_LINHA + 1,
    linhas: duracao / MINUTOS_POR_LINHA,
    valido:
      !coluna.fechado &&
      inicio >= grade.minutoInicial &&
      fim <= grade.minutoFinal &&
      !emCimaDeFaixa &&
      !emCimaDeOutro &&
      !passado,
  };
}
