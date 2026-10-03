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
    select: { id: true },
  });

  if (!barbeiro) {
    throw new ErroDeNegocio(
      "barbeiro não encontrado nesta barbearia",
      "barbeiro_invalido"
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
