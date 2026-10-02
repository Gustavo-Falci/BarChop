import type { AgendamentoComCliente, HorarioSerializado } from "@barchop/types";
import { hojeIso, horaJaPassou } from "../formato/datas";

// Uma linha da grade é 5 minutos. `duracaoMinutos` é multipleOf 5
// (apps/api/src/routers/servicos.ts:21) e os inícios caem na grade de 15
// do packages/scheduling: todo evento alinha exato, e nenhum cálculo
// aqui arredonda. Se algum precisar de Math.round, o cálculo está errado.
export const MINUTOS_POR_LINHA = 5;

// A granularidade que se OFERECE para criar, que é a do motor de
// disponibilidade — não a da grade. São números diferentes de propósito:
// a grade desenha em 5 para caber qualquer duração, e oferece em 15
// porque é o que a API aceita marcar.
const PASSO_LIVRE = 15;

export interface EventoPosicionado {
  agendamento: AgendamentoComCliente;
  linha: number; // 1-based, entra direto em grid-row
  linhas: number; // span
  pista: number; // 0-based, qual pista dentro do grupo sobreposto
  pistas: number; // quantas pistas o grupo tem
}

export interface FaixaLivre {
  hora: string; // "HH:mm" — o que vai na URL de novo agendamento
  linha: number;
  linhas: number;
  passada: boolean;
}

export interface ColunaDeDia {
  data: string;
  fechado: boolean;
  eventos: EventoPosicionado[];
  livres: FaixaLivre[];
}

export interface GradeDeTempo {
  minutoInicial: number;
  minutoFinal: number;
  totalLinhas: number;
  colunas: ColunaDeDia[];
  // Onde desenhar a régua do agora, ou null quando o instante não cai
  // em nenhum dos dias mostrados. `linha` é sempre inteira, porque vai
  // em grid-row; o que sobra do minuto dentro dela vai em `fracao`
  // (0 ≤ fracao < 1), que o CSS converte em deslocamento.
  agora: { data: string; linha: number; fracao: number } | null;
}

function emMinutos(hora: string): number {
  const [h, m] = hora.split(":").map(Number);
  return h * 60 + m;
}

function emHora(minutos: number): string {
  const h = String(Math.floor(minutos / 60)).padStart(2, "0");
  const m = String(minutos % 60).padStart(2, "0");
  return `${h}:${m}`;
}

function diaDaSemanaDe(data: string): number {
  return new Date(`${data}T12:00:00Z`).getUTCDay();
}

function horarioDe(
  data: string,
  horarios: HorarioSerializado[]
): HorarioSerializado | undefined {
  return horarios.find((h) => h.diaSemana === diaDaSemanaDe(data));
}

// `fechado` vence as horas: os campos são independentes em
// HorarioSerializado, e esta função não pode depender da disciplina de
// quem a chama.
function aberto(
  horario: HorarioSerializado | undefined
): horario is HorarioSerializado & {
  horaAbertura: string;
  horaFechamento: string;
} {
  return Boolean(
    horario && !horario.fechado && horario.horaAbertura && horario.horaFechamento
  );
}

// Agrupa os eventos que se cruzam e distribui cada grupo em pistas.
// Recebe a lista já ordenada por início, e escreve `pista` e `pistas`
// nela.
//
// Encostar não é sobrepor: um evento que começa exatamente no fim do
// anterior fecha o grupo. Sem essa distinção, um dia cheio de
// atendimentos seguidos viraria uma coluna espremida em dezenas de
// pistas de um pixel.
function distribuirEmPistas(eventos: EventoPosicionado[]): void {
  const pistasUsadas = (doGrupo: EventoPosicionado[]) =>
    doGrupo.reduce((maior, e) => Math.max(maior, e.pista + 1), 0);

  let grupo: EventoPosicionado[] = [];
  let fimDoGrupo = -1;

  const fecharGrupo = () => {
    const total = pistasUsadas(grupo);
    for (const evento of grupo) evento.pistas = total;
    grupo = [];
    fimDoGrupo = -1;
  };

  for (const evento of eventos) {
    const inicio = evento.linha;
    const fim = evento.linha + evento.linhas;

    if (grupo.length > 0 && inicio >= fimDoGrupo) fecharGrupo();

    // Primeira pista em que nenhum evento do grupo ainda está no ar.
    const ocupadas = new Set(
      grupo.filter((e) => e.linha + e.linhas > inicio).map((e) => e.pista)
    );
    let pista = 0;
    while (ocupadas.has(pista)) pista += 1;

    evento.pista = pista;
    grupo.push(evento);
    fimDoGrupo = Math.max(fimDoGrupo, fim);
  }

  if (grupo.length > 0) fecharGrupo();
}

export function gradeDeTempo(entrada: {
  dias: string[];
  horarios: HorarioSerializado[];
  agendamentos: AgendamentoComCliente[];
  agora: Date;
}): GradeDeTempo {
  const { dias, horarios, agendamentos, agora } = entrada;

  // Só o que pertence aos dias mostrados: quem chama pode ter buscado um
  // intervalo maior (o mês busca a grade inteira).
  const doPeriodo = agendamentos.filter(
    (a) => dias.includes(a.data) && a.status !== "cancelado"
  );

  const aberturas = dias.map((d) => horarioDe(d, horarios)).filter(aberto);

  // A janela cobre o horário de funcionamento E todo agendamento que
  // exista. Agendamento fora do horário acontece: PATCH /horarios não
  // valida contra os já marcados, e deixá-lo fora da janela o tornaria
  // invisível — a pior falha possível nesta tela.
  const inicios = [
    ...aberturas.map((h) => emMinutos(h.horaAbertura)),
    ...doPeriodo.map((a) => emMinutos(a.horaInicio)),
  ];
  const fins = [
    ...aberturas.map((h) => emMinutos(h.horaFechamento)),
    ...doPeriodo.map((a) => emMinutos(a.horaFim)),
  ];

  const minutoInicial = inicios.length ? Math.min(...inicios) : 0;
  const minutoFinal = fins.length ? Math.max(...fins) : 0;
  const totalLinhas = Math.max(
    0,
    (minutoFinal - minutoInicial) / MINUTOS_POR_LINHA
  );

  const linhaDe = (minuto: number) =>
    (minuto - minutoInicial) / MINUTOS_POR_LINHA + 1;

  const colunas: ColunaDeDia[] = dias.map((data) => {
    const horario = horarioDe(data, horarios);
    const doDia = doPeriodo
      .filter((a) => a.data === data)
      .sort((um, outro) => um.horaInicio.localeCompare(outro.horaInicio));

    const eventos: EventoPosicionado[] = doDia.map((agendamento) => {
      const inicio = emMinutos(agendamento.horaInicio);
      const fim = emMinutos(agendamento.horaFim);
      return {
        agendamento,
        linha: linhaDe(inicio),
        linhas: (fim - inicio) / MINUTOS_POR_LINHA,
        pista: 0,
        pistas: 1,
      };
    });

    distribuirEmPistas(eventos);

    const livres: FaixaLivre[] = [];
    if (aberto(horario)) {
      const abre = emMinutos(horario.horaAbertura);
      const fecha = emMinutos(horario.horaFechamento);

      for (let minuto = abre; minuto < fecha; minuto += PASSO_LIVRE) {
        // Ocupado é qualquer minuto entre início e fim, não só o início:
        // é exatamente o que a grade antiga errava, e por isso oferecia
        // 09:15 como livre em cima de um corte das 09:00 às 10:00.
        const ocupado = doDia.some(
          (a) =>
            emMinutos(a.horaInicio) <= minuto && minuto < emMinutos(a.horaFim)
        );
        if (ocupado) continue;

        const hora = emHora(minuto);
        livres.push({
          hora,
          linha: linhaDe(minuto),
          linhas: PASSO_LIVRE / MINUTOS_POR_LINHA,
          passada: horaJaPassou(data, hora, agora),
        });
      }
    }

    return { data, fechado: !aberto(horario), eventos, livres };
  });

  const hoje = hojeIso(agora);
  const minutoAgora = agora.getHours() * 60 + agora.getMinutes();
  const mostrandoHoje = dias.includes(hoje);
  const dentroDaJanela =
    minutoAgora >= minutoInicial && minutoAgora < minutoFinal;

  // O agora é a única posição desta grade que não cai em múltiplo de 5
  // — e a exceção ao "nenhum cálculo aqui arredonda" do topo. A linha
  // vai para baixo até o múltiplo de 5 anterior, e o resto do minuto vira
  // `fracao`. Passar a linha fracionária (13.4) direto ao grid-row a
  // invalida, e a régua aparece depois do fechamento.
  const passados = minutoAgora - minutoInicial;
  const resto = passados % MINUTOS_POR_LINHA;

  return {
    minutoInicial,
    minutoFinal,
    totalLinhas,
    colunas,
    agora:
      mostrandoHoje && dentroDaJanela
        ? {
            data: hoje,
            linha: linhaDe(minutoAgora - resto),
            fracao: resto / MINUTOS_POR_LINHA,
          }
        : null,
  };
}

export interface CelulaDoMes {
  data: string;
  doMes: boolean; // false nas células de preenchimento das bordas
  fechado: boolean;
  agendamentos: AgendamentoComCliente[];
}

function somarDias(data: string, dias: number): string {
  const d = new Date(`${data}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

// Semanas completas de domingo a sábado, com datas REAIS nas bordas.
//
// Diferente de `diasDoMes` (src/formato/datas.ts), que devolve null antes
// do dia 1 e serve o Calendario do fluxo do cliente: aqui a borda mostra
// agendamentos dos meses vizinhos, e um buraco os esconderia. Não troque
// uma pela outra.
export function gradeDoMes(entrada: {
  mes: string; // "YYYY-MM"
  horarios: HorarioSerializado[];
  agendamentos: AgendamentoComCliente[];
}): CelulaDoMes[] {
  const { mes, horarios, agendamentos } = entrada;
  const [ano, numero] = mes.split("-").map(Number);

  const primeiroDoMes = `${mes}-01`;
  const diasNoMes = new Date(Date.UTC(ano, numero, 0)).getUTCDate();
  const ultimoDoMes = `${mes}-${String(diasNoMes).padStart(2, "0")}`;

  const inicio = somarDias(primeiroDoMes, -diaDaSemanaDe(primeiroDoMes));
  const fim = somarDias(ultimoDoMes, 6 - diaDaSemanaDe(ultimoDoMes));

  const validos = agendamentos.filter((a) => a.status !== "cancelado");

  const celulas: CelulaDoMes[] = [];
  for (let data = inicio; data <= fim; data = somarDias(data, 1)) {
    celulas.push({
      data,
      doMes: data >= primeiroDoMes && data <= ultimoDoMes,
      fechado: !aberto(horarioDe(data, horarios)),
      agendamentos: validos
        .filter((a) => a.data === data)
        .sort((um, outro) => um.horaInicio.localeCompare(outro.horaInicio)),
    });
  }

  return celulas;
}

// Domingo a sábado, como a grade do design system e como o Calendario
// do fluxo do cliente.
export function diasDaSemana(data: string): string[] {
  const referencia = new Date(`${data}T00:00:00Z`);
  const domingo = new Date(referencia);
  domingo.setUTCDate(referencia.getUTCDate() - referencia.getUTCDay());

  return Array.from({ length: 7 }, (_, indice) => {
    const dia = new Date(domingo);
    dia.setUTCDate(domingo.getUTCDate() + indice);
    return dia.toISOString().slice(0, 10);
  });
}
