import type { Prisma } from "@barchop/database";
import { dateParaData, dateParaHora } from "./horas";

// As notificações do sino do painel (plano barra-do-topo, PR B). Só o
// que o CLIENTE faz sozinho vira notificação: o que a equipe faz no
// painel ela já sabe. Grava dentro da transação de quem chama — se a
// ação desfaz, o aviso desfaz junto.

export type EventoDoCliente = "novo" | "cancelado" | "remarcado" | "confirmado";

const TITULOS: Record<EventoDoCliente, string> = {
  novo: "Novo agendamento",
  cancelado: "Agendamento cancelado",
  remarcado: "Agendamento remarcado",
  confirmado: "Presença confirmada",
};

// "15/10 às 10:00": curto, cabe na linha do sino. O dia da semana e o
// ano ficam pra tela do agendamento, que o link abre.
function quando(data: Date, hora: Date): string {
  const [, mes, dia] = dateParaData(data).split("-");
  return `${dia}/${mes} às ${dateParaHora(hora)}`;
}

// O texto sai pronto, e não montado na tela: conta o que aconteceu na
// hora, mesmo que o cliente ou o serviço mudem de nome depois.
function textoDo(
  evento: EventoDoCliente,
  agendamento: {
    data: Date;
    horaInicio: Date;
    cliente: { nome: string };
    barbeiro: { nome: string };
    servicos: { servico: { nome: string } }[];
  },
  de?: { data: Date; horaInicio: Date }
): string {
  const cliente = agendamento.cliente.nome;
  const servicos = agendamento.servicos.map((s) => s.servico.nome).join(", ");
  const horario = quando(agendamento.data, agendamento.horaInicio);
  const com = `com ${agendamento.barbeiro.nome}`;
  const texto = {
    novo: `${cliente} marcou ${servicos} para ${horario} ${com}.`,
    cancelado: `${cliente} cancelou ${servicos} de ${horario} ${com}.`,
    remarcado: `${cliente} remarcou ${de ? `de ${quando(de.data, de.horaInicio)} ` : ""}para ${horario} ${com}.`,
    confirmado: `${cliente} confirmou presença em ${horario} ${com}.`,
  }[evento];
  // A coluna é VARCHAR(500); uma lista enorme de serviços não pode
  // derrubar a ação do cliente por causa do aviso.
  return texto.length > 500 ? `${texto.slice(0, 499)}…` : texto;
}

// Quem recebe: o profissional do agendamento e quem vê a agenda de
// todos (dono e recepção), desde que ativos. É a mesma régua do
// `agendaVisivel` do painel.
export async function notificarAgendamento(
  tx: Prisma.TransactionClient,
  evento: EventoDoCliente,
  agendamentoId: string,
  de?: { data: Date; horaInicio: Date }
): Promise<void> {
  const agendamento = await tx.agendamento.findUniqueOrThrow({
    where: { id: agendamentoId },
    select: {
      barbeariaId: true,
      barbeiroId: true,
      data: true,
      horaInicio: true,
      cliente: { select: { nome: true } },
      barbeiro: { select: { nome: true } },
      servicos: { select: { servico: { select: { nome: true } } } },
    },
  });

  const destinatarios = await tx.barbeiro.findMany({
    where: {
      barbeariaId: agendamento.barbeariaId,
      ativo: true,
      OR: [{ id: agendamento.barbeiroId }, { papel: { in: ["dono", "recepcao"] } }],
    },
    select: { id: true },
  });

  const titulo = TITULOS[evento];
  const texto = textoDo(evento, agendamento, de);
  await tx.notificacao.createMany({
    data: destinatarios.map(({ id }) => ({
      barbeiroId: id,
      tipo: "agendamento" as const,
      titulo,
      texto,
      link: `/painel/agendamentos/${agendamentoId}`,
    })),
  });
}
