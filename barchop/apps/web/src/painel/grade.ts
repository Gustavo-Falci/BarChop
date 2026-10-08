import type {
  AgendamentoComCliente,
  BloqueioSerializado,
  HorarioSerializado,
  OcupacaoDoProfissional,
} from "@barchop/types";
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

// Folga, almoço ou horário fechado de um profissional, já na grade.
export interface BloqueioPosicionado {
  linha: number;
  linhas: number;
  rotulo: string;
}

// O que está fechado dentro da janela da grade, numa coluna (painel v2,
// marco 6): fora do expediente do profissional, ou a pausa do almoço.
export interface FaixaFechada {
  linha: number;
  linhas: number;
  rotulo: "Fechado" | "Pausa";
}

// O expediente do dia de um profissional, como a ocupação da API o
// devolve: a janela efetiva e a pausa. A grade só desenha — a regra é
// da API (janelaEfetiva).
export type ExpedienteDoProfissional = Pick<OcupacaoDoProfissional, "id" | "janela" | "pausa">;

// Uma coluna é um dia (semana, ou dia de quem trabalha sozinho) ou, na
// vista de dia da equipe, um profissional nesse dia — aí ela tem o
// `rotulo` (o nome) e o `barbeiroId`, que vai pro "novo agendamento".
export interface ColunaDeDia {
  chave: string;
  data: string;
  rotulo?: string;
  barbeiroId?: string;
  fechado: boolean;
  eventos: EventoPosicionado[];
  livres: FaixaLivre[];
  bloqueios: BloqueioPosicionado[];
  fechadas: FaixaFechada[];
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
  // Só na vista de dia da equipe: uma coluna por profissional (o dia é
  // o primeiro de `dias`), com os agendamentos e bloqueios de cada um.
  profissionais?: { id: string; nome: string }[];
  bloqueios?: BloqueioSerializado[];
  // Só na vista de dia: o expediente de cada profissional. A coluna de
  // um profissional usa o dele; a coluna única (quem trabalha sozinho,
  // ou o profissional vendo a própria agenda) usa o único que vier.
  // Ausente, a grade segue só o horário da casa, como antes.
  expediente?: ExpedienteDoProfissional[];
}): GradeDeTempo {
  const { dias, horarios, agendamentos, agora, profissionais, bloqueios = [], expediente } = entrada;
  const janelas = (expediente ?? []).flatMap((e) => (e.janela ? [e.janela] : []));

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
  // E o expediente do dia: uma data especial pode abrir antes ou fechar
  // depois do horário da semana.
  const inicios = [
    ...aberturas.map((h) => emMinutos(h.horaAbertura)),
    ...janelas.map((j) => emMinutos(j.abre)),
    ...doPeriodo.map((a) => emMinutos(a.horaInicio)),
  ];
  const fins = [
    ...aberturas.map((h) => emMinutos(h.horaFechamento)),
    ...janelas.map((j) => emMinutos(j.fecha)),
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

  const fimDaJanela = minutoInicial + totalLinhas * MINUTOS_POR_LINHA;

  // Os bloqueios de um profissional que tocam o dia, na grade: dia
  // inteiro cobre a coluna; faixa de horas é recortada na janela.
  function bloqueiosNaColuna(data: string, barbeiroId: string): {
    posicionados: BloqueioPosicionado[];
    bloqueiaMinuto: (minuto: number) => boolean;
  } {
    const doDia = bloqueios.filter(
      (b) => b.barbeiroId === barbeiroId && b.dataInicio <= data && data <= b.dataFim
    );
    const posicionados: BloqueioPosicionado[] = [];
    for (const bloqueio of doDia) {
      const rotulo = bloqueio.motivo ?? "Bloqueado";
      if (!bloqueio.horaInicio || !bloqueio.horaFim) {
        posicionados.push({ linha: 1, linhas: totalLinhas, rotulo });
        continue;
      }
      const inicio = Math.max(emMinutos(bloqueio.horaInicio), minutoInicial);
      const fim = Math.min(emMinutos(bloqueio.horaFim), fimDaJanela);
      if (fim > inicio) {
        posicionados.push({ linha: linhaDe(inicio), linhas: (fim - inicio) / MINUTOS_POR_LINHA, rotulo });
      }
    }
    const bloqueiaMinuto = (minuto: number) =>
      doDia.some(
        (b) =>
          !b.horaInicio ||
          !b.horaFim ||
          (emMinutos(b.horaInicio) <= minuto && minuto < emMinutos(b.horaFim))
      );
    return { posicionados, bloqueiaMinuto };
  }

  // Na equipe, cada coluna é um profissional no mesmo dia; sozinho, cada
  // coluna é um dia com todos os agendamentos.
  const alvos = profissionais
    ? profissionais.map((p) => ({ chave: p.id, data: dias[0], rotulo: p.nome, barbeiroId: p.id }))
    : dias.map((data) => ({ chave: data, data, rotulo: undefined, barbeiroId: undefined }));

  const colunas: ColunaDeDia[] = alvos.map(({ chave, data, rotulo, barbeiroId }) => {
    const horario = horarioDe(data, horarios);
    const doDia = doPeriodo
      .filter((a) => a.data === data && (!barbeiroId || a.barbeiro.id === barbeiroId))
      .sort((um, outro) => um.horaInicio.localeCompare(outro.horaInicio));
    const doExpediente = !expediente
      ? undefined
      : barbeiroId
        ? expediente.find((e) => e.id === barbeiroId)
        : expediente.length === 1
          ? expediente[0]
          : undefined;
    // A coluna única (quem trabalha sozinho) é de um profissional só: os
    // bloqueios dele entram nela como entram nas colunas da equipe.
    const donoDaColuna = barbeiroId ?? doExpediente?.id;
    const { posicionados, bloqueiaMinuto } = donoDaColuna
      ? bloqueiosNaColuna(data, donoDaColuna)
      : { posicionados: [], bloqueiaMinuto: () => false };

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

    // A janela em que se oferece horário: o expediente, quando a API o
    // mandou; senão, o horário da casa no dia da semana.
    const janelaDaColuna = doExpediente
      ? doExpediente.janela && {
          abre: emMinutos(doExpediente.janela.abre),
          fecha: emMinutos(doExpediente.janela.fecha),
        }
      : aberto(horario)
        ? { abre: emMinutos(horario.horaAbertura), fecha: emMinutos(horario.horaFechamento) }
        : null;
    const pausa = doExpediente?.pausa
      ? { inicio: emMinutos(doExpediente.pausa.inicio), fim: emMinutos(doExpediente.pausa.fim) }
      : null;
    const naPausa = (minuto: number) => pausa !== null && pausa.inicio <= minuto && minuto < pausa.fim;

    // O que fica sombreado: antes de abrir, depois de fechar e a pausa,
    // recortados na janela da grade. Sem expediente, nada (a semana).
    const fechadas: FaixaFechada[] = [];
    if (doExpediente && janelaDaColuna) {
      const faixa = (de: number, ate: number, rotulo: FaixaFechada["rotulo"]) => {
        const inicio = Math.max(de, minutoInicial);
        const fim = Math.min(ate, fimDaJanela);
        if (fim > inicio) {
          fechadas.push({ linha: linhaDe(inicio), linhas: (fim - inicio) / MINUTOS_POR_LINHA, rotulo });
        }
      };
      faixa(minutoInicial, janelaDaColuna.abre, "Fechado");
      if (pausa) faixa(pausa.inicio, pausa.fim, "Pausa");
      faixa(janelaDaColuna.fecha, fimDaJanela, "Fechado");
    }

    const livres: FaixaLivre[] = [];
    if (janelaDaColuna) {
      const { abre, fecha } = janelaDaColuna;

      for (let minuto = abre; minuto < fecha; minuto += PASSO_LIVRE) {
        // Ocupado é qualquer minuto entre início e fim, não só o início:
        // é exatamente o que a grade antiga errava, e por isso oferecia
        // 09:15 como livre em cima de um corte das 09:00 às 10:00.
        const ocupado = doDia.some(
          (a) =>
            emMinutos(a.horaInicio) <= minuto && minuto < emMinutos(a.horaFim)
        );
        if (ocupado || bloqueiaMinuto(minuto) || naPausa(minuto)) continue;

        const hora = emHora(minuto);
        livres.push({
          hora,
          linha: linhaDe(minuto),
          linhas: PASSO_LIVRE / MINUTOS_POR_LINHA,
          passada: horaJaPassou(data, hora, agora),
        });
      }
    }

    return {
      chave,
      data,
      rotulo,
      barbeiroId,
      fechado: janelaDaColuna === null,
      eventos,
      livres,
      bloqueios: posicionados,
      fechadas,
    };
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
