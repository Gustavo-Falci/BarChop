import type { Prisma } from "@barchop/database";
import { calcularHorariosDisponiveis } from "@barchop/scheduling";
import { ErroDeNegocio } from "./erro-negocio";
import { dateParaHora } from "./horas";

// Aceita tanto o `prisma` quanto o `tx` de dentro de uma transação: as
// rotas de leitura chamam direto, o criarAgendamento chama de dentro da
// transação dele.
export type ClientePrisma = Prisma.TransactionClient;

// Linha crua do horario_funcionamento, ou a ausência dela. Recebe a
// linha do banco de propósito, e não o formato já convertido: assim a
// conversão de Date pra "HH:mm" e a regra "dia sem linha é dia fechado"
// existem num lugar só, em vez de uma cópia por chamador.
export interface LinhaDeHorario {
  horaAbertura: Date | null;
  horaFechamento: Date | null;
  fechado: boolean;
}

export interface IntervaloOcupado {
  horaInicio: Date;
  horaFim: Date;
}

// Um dia da jornada do membro (bloco B): acompanha a barbearia, tem
// horas próprias, ou é folga.
export interface DiaDaJornada {
  modo: "barbearia" | "proprio" | "folga";
  horaInicio: Date | null;
  horaFim: Date | null;
}

export interface BloqueioDoDia {
  dataInicio: Date;
  dataFim: Date;
  horaInicio: Date | null;
  horaFim: Date | null;
}

const FECHADO: LinhaDeHorario = { horaAbertura: null, horaFechamento: null, fechado: true };

// A janela em que o membro atende no dia: a interseção da jornada dele
// com o funcionamento. Barbearia fechada fecha o dia em qualquer modo;
// dia sem linha de jornada é folga, pela mesma regra do funcionamento
// (sem linha = fechado). Horário próprio que passa do funcionamento é
// recortado nele — o membro não atende com a porta fechada.
export function janelaEfetiva(
  funcionamento: LinhaDeHorario | null,
  jornada: DiaDaJornada | null
): LinhaDeHorario {
  if (
    !funcionamento ||
    funcionamento.fechado ||
    !funcionamento.horaAbertura ||
    !funcionamento.horaFechamento
  ) {
    return FECHADO;
  }
  if (!jornada || jornada.modo === "folga") return FECHADO;
  if (jornada.modo === "barbearia") return funcionamento;
  if (!jornada.horaInicio || !jornada.horaFim) return FECHADO;

  // Horas como Date em 1970-01-01 UTC (horaParaDate): o getTime ordena
  // igual ao relógio.
  const inicio = Math.max(funcionamento.horaAbertura.getTime(), jornada.horaInicio.getTime());
  const fim = Math.min(funcionamento.horaFechamento.getTime(), jornada.horaFim.getTime());
  if (inicio >= fim) return FECHADO;

  return { horaAbertura: new Date(inicio), horaFechamento: new Date(fim), fechado: false };
}

function cobreODia(bloqueio: BloqueioDoDia, data: Date): boolean {
  return bloqueio.dataInicio.getTime() <= data.getTime() && data.getTime() <= bloqueio.dataFim.getTime();
}

// Os bloqueios do dia viram o que o `horariosLivres` entende: dia
// inteiro fecha a janela; faixa de horas vira um intervalo ocupado,
// como um agendamento.
export function aplicarBloqueios(
  janela: LinhaDeHorario,
  bloqueios: BloqueioDoDia[],
  data: Date
): { janela: LinhaDeHorario; ocupados: IntervaloOcupado[] } {
  const doDia = bloqueios.filter((bloqueio) => cobreODia(bloqueio, data));
  if (doDia.some((bloqueio) => !bloqueio.horaInicio || !bloqueio.horaFim)) {
    return { janela: FECHADO, ocupados: [] };
  }
  return {
    janela,
    ocupados: doDia.map((bloqueio) => ({
      horaInicio: bloqueio.horaInicio!,
      horaFim: bloqueio.horaFim!,
    })),
  };
}

// O horário pedido cai num bloqueio? Dá o código próprio na criação —
// sem esta checagem o bloqueio só sumiria dos livres, e a recusa sairia
// como `horario_indisponivel`, sem dizer por quê. "HH:mm" compara como
// texto na ordem do relógio.
export function caiEmBloqueio(
  bloqueios: BloqueioDoDia[],
  data: Date,
  horaInicio: string,
  horaFim: string
): boolean {
  return bloqueios
    .filter((bloqueio) => cobreODia(bloqueio, data))
    .some(
      (bloqueio) =>
        !bloqueio.horaInicio ||
        !bloqueio.horaFim ||
        (dateParaHora(bloqueio.horaInicio) < horaFim && horaInicio < dateParaHora(bloqueio.horaFim))
    );
}

// O que um dia precisa pra calcular a agenda de um membro: a janela já
// cruzada com a jornada e os bloqueios que o tocam. Três consultas, e a
// rota do mês tem a versão dela com uma consulta por tabela.
export async function contextoDoDia(
  db: ClientePrisma,
  params: { barbeariaId: string; barbeiroId: string; data: Date }
) {
  const { barbeariaId, barbeiroId, data } = params;
  // getUTCDay: a Date foi construída em UTC por dataParaDate.
  const diaSemana = data.getUTCDay();

  const [funcionamento, jornada, bloqueios] = await Promise.all([
    db.horarioFuncionamento.findUnique({
      where: { barbeariaId_diaSemana: { barbeariaId, diaSemana } },
    }),
    db.jornadaProfissional.findUnique({
      where: { barbeiroId_diaSemana: { barbeiroId, diaSemana } },
    }),
    db.bloqueio.findMany({
      where: { barbeiroId, dataInicio: { lte: data }, dataFim: { gte: data } },
      select: { dataInicio: true, dataFim: true, horaInicio: true, horaFim: true },
    }),
  ]);

  return { janela: janelaEfetiva(funcionamento, jornada), bloqueios };
}

// O membro faz todos os serviços pedidos? Até o bloco C o fluxo público
// mostra o catálogo inteiro, então isto é o que impede marcar com quem
// não faz o serviço.
export async function garantirServicosDoProfissional(
  db: ClientePrisma,
  barbeiroId: string,
  servicoIds: string[]
): Promise<void> {
  const idsUnicos = [...new Set(servicoIds)];
  const feitos = await db.profissionalServico.count({
    where: { barbeiroId, servicoId: { in: idsUnicos } },
  });
  if (feitos !== idsUnicos.length) {
    throw new ErroDeNegocio(
      "esse profissional não faz um dos serviços escolhidos",
      "servico_fora_do_profissional"
    );
  }
}

// O `horariosLivres` não sabe que dia é hoje — só a janela e os
// ocupados. Isto é o relógio por cima dele, nas rotas de leitura: dia
// passado não tem vaga, e hoje só vale o que começa depois de agora (o
// minuto atual já não dá tempo de chegar). Puro, com o `agora` de
// fora, pelo mesmo motivo do `garantirFuturo`: comparação de string no
// formato do contrato, sem Date e sem fuso da máquina.
export function descartarPassados(params: {
  data: string;
  horarios: string[];
  agora: { data: string; hora: string };
}): string[] {
  const { data, horarios, agora } = params;

  if (data < agora.data) return [];
  if (data > agora.data) return horarios;
  return horarios.filter((hora) => hora > agora.hora);
}

export function horariosLivres(params: {
  janela: LinhaDeHorario | null;
  ocupados: IntervaloOcupado[];
  duracaoTotalMinutos: number;
}): string[] {
  const { janela, ocupados, duracaoTotalMinutos } = params;

  return calcularHorariosDisponiveis({
    horarioFuncionamento: {
      horaAbertura: janela?.horaAbertura
        ? dateParaHora(janela.horaAbertura)
        : null,
      horaFechamento: janela?.horaFechamento
        ? dateParaHora(janela.horaFechamento)
        : null,
      // Dia sem linha nenhuma é dia fechado — mesma regra que o PUT de
      // horários grava.
      fechado: janela?.fechado ?? true,
    },
    agendamentosExistentes: ocupados.map((ocupado) => ({
      horaInicio: dateParaHora(ocupado.horaInicio),
      horaFim: dateParaHora(ocupado.horaFim),
    })),
    duracaoTotalMinutos,
  });
}

// O barbeiroId vem do corpo ou da query nos três chamadores — no fluxo
// público, sem token nenhum. Sem esta checagem dava pra ler (e encher) a
// agenda de um barbeiro de outra barbearia.
export async function garantirBarbeiro(
  db: ClientePrisma,
  barbeariaId: string,
  barbeiroId: string
): Promise<void> {
  const barbeiro = await db.barbeiro.findFirst({
    where: { id: barbeiroId, barbeariaId, ativo: true },
    select: { id: true, atende: true },
  });

  if (!barbeiro) {
    throw new ErroDeNegocio(
      "barbeiro não encontrado nesta barbearia",
      "barbeiro_invalido"
    );
  }

  // Código próprio, e não `barbeiro_invalido`: o membro existe, só não
  // recebe cliente. É o que impede a recepção (que nasce sem atender) de
  // marcar horário em si mesma pelo Novo agendamento.
  if (!barbeiro.atende) {
    throw new ErroDeNegocio(
      "esse membro da equipe não atende clientes",
      "profissional_nao_atende"
    );
  }
}

// Serviços lidos do banco, e não do corpo: é daqui que saem preço e
// duração. Confiar no que veio na requisição deixaria o cliente escolher
// quanto paga e quanto tempo ocupa.
export async function carregarServicos(
  db: ClientePrisma,
  barbeariaId: string,
  servicoIds: string[]
) {
  // Set porque a mesma lista com id repetido só conta uma vez — o
  // findMany devolveria uma linha só e a contagem não bateria.
  const idsUnicos = [...new Set(servicoIds)];
  const servicos = await db.servico.findMany({
    where: { id: { in: idsUnicos }, barbeariaId },
  });

  if (servicos.length !== idsUnicos.length) {
    throw new ErroDeNegocio(
      "serviço não encontrado nesta barbearia",
      "servico_invalido"
    );
  }

  const inativo = servicos.find((servico) => !servico.ativo);
  if (inativo) {
    throw new ErroDeNegocio(
      `o serviço "${inativo.nome}" não está mais disponível`,
      "servico_inativo"
    );
  }

  return {
    servicos,
    duracaoTotalMinutos: servicos.reduce(
      (soma, servico) => soma + servico.duracaoMinutos,
      0
    ),
  };
}
