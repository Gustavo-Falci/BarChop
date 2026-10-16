import type { Prisma } from "@barchop/database";
import { MOTIVOS_DA_PARTE, dividirPagamento, type FormaDePagamento } from "@barchop/formato";
import type { FormaDoPagamento, MotivoDaParteDoPagamento, PagamentoDoAgendamento } from "@barchop/types";
import { ErroHttp } from "./erro-http";
import { ErroDeNegocio } from "./erro-negocio";
import { dateParaData } from "./horas";

// O caixa do dia (Onda 2, marco 2, plano caixa-do-dia): gravar o
// pagamento de um atendimento com a divisão congelada e garantir que o
// dia não foi fechado. A conta é `dividirPagamento` (@barchop/formato);
// aqui só se lê o que ela precisa e se grava o que ela devolve.

const MEMBRO = { select: { id: true, nome: true } } as const;

export const INCLUDE_PAGAMENTO = {
  atendente: MEMBRO,
  donoDoCliente: MEMBRO,
  recebidoPor: MEMBRO,
  registradoPor: MEMBRO,
  partes: { include: { beneficiario: MEMBRO } },
} as const;

type PagamentoComTudo = Prisma.PagamentoGetPayload<{ include: typeof INCLUDE_PAGAMENTO }>;

export function serializarPagamento(pagamento: PagamentoComTudo): PagamentoDoAgendamento {
  // As partes saem na ordem da conta (atendimento, cliente, casa,
  // gorjeta), e não na do banco, que não garante nenhuma.
  const ordem = (motivo: string) => MOTIVOS_DA_PARTE.indexOf(motivo as MotivoDaParteDoPagamento);
  const partes = [...pagamento.partes].sort((a, b) => ordem(a.motivo) - ordem(b.motivo));
  return {
    id: pagamento.id,
    agendamentoId: pagamento.agendamentoId,
    data: dateParaData(pagamento.data),
    forma: pagamento.forma as FormaDoPagamento,
    servicosCentavos: pagamento.servicosCentavos,
    descontoCentavos: pagamento.descontoCentavos,
    gorjetaCentavos: pagamento.gorjetaCentavos,
    totalCentavos: pagamento.servicosCentavos - pagamento.descontoCentavos + pagamento.gorjetaCentavos,
    atendente: pagamento.atendente,
    donoDoCliente: pagamento.donoDoCliente,
    recebidoPor: pagamento.recebidoPor,
    registradoPor: pagamento.registradoPor,
    registradoEm: pagamento.registradoEm.toISOString(),
    partes: partes.map((parte) => ({
      beneficiario: parte.beneficiario,
      motivo: parte.motivo as MotivoDaParteDoPagamento,
      valorCentavos: parte.valorCentavos,
    })),
  };
}

export async function diaEstaFechado(db: Prisma.TransactionClient, barbeariaId: string, data: Date): Promise<boolean> {
  const fechamento = await db.fechamentoDoDia.findUnique({
    where: { barbeariaId_data: { barbeariaId, data } },
    select: { id: true },
  });
  return fechamento !== null;
}

// Antes de mexer em pagamento: o dia do caixa tem de estar aberto. Trava
// a linha da barbearia, a mesma que o fechar do dia vai travar (PR 4) —
// sem isso, um pagamento registrado enquanto o dono fecha entraria
// depois da foto do acerto.
export async function garantirDiaAberto(
  tx: Prisma.TransactionClient,
  barbeariaId: string,
  data: Date
): Promise<void> {
  await tx.$queryRaw`SELECT id FROM barbearia WHERE id = ${barbeariaId}::uuid FOR NO KEY UPDATE`;
  if (await diaEstaFechado(tx, barbeariaId, data)) {
    throw new ErroHttp(409, "dia_fechado", "o caixa deste dia está fechado: o dono precisa reabrir");
  }
}

export interface DadosDoPagamento {
  forma: FormaDePagamento;
  servicosCentavos?: number;
  descontoCentavos?: number;
  gorjetaCentavos?: number;
  recebidoPorId?: string;
}

// Registra (ou refaz) o pagamento de um atendimento que quem pede já
// enxerga. Conclui o atendimento e, se o cliente ainda não é de
// ninguém, passa ele para quem atendeu. Editar refaz as partes com as
// regras de agora (decisão 2 do plano).
export async function registrarPagamento(
  tx: Prisma.TransactionClient,
  params: { barbeariaId: string; agendamentoId: string; registradoPorId: string; dados: DadosDoPagamento }
): Promise<PagamentoComTudo> {
  const { barbeariaId, agendamentoId, registradoPorId, dados } = params;
  const agendamento = await tx.agendamento.findUniqueOrThrow({
    where: { id: agendamentoId },
    select: {
      data: true,
      status: true,
      barbeiroId: true,
      cliente: { select: { id: true, profissionalId: true } },
      servicos: { select: { precoNoMomento: true } },
    },
  });
  await garantirDiaAberto(tx, barbeariaId, agendamento.data);

  const atendente = agendamento.barbeiroId;
  // `precoNoMomento` é Decimal(10,2): em centavos, a conta é exata.
  const somaDosServicos = agendamento.servicos.reduce((soma, s) => soma + s.precoNoMomento.mul(100).toNumber(), 0);
  const servicosCentavos = dados.servicosCentavos ?? somaDosServicos;
  const descontoCentavos = dados.descontoCentavos ?? 0;
  const gorjetaCentavos = dados.gorjetaCentavos ?? 0;
  if (descontoCentavos > servicosCentavos) {
    throw new ErroDeNegocio("o desconto passa do valor dos serviços", "valor_invalido");
  }

  const recebidoPorId = dados.recebidoPorId ?? atendente;
  if (dados.recebidoPorId !== undefined) {
    const membro = await tx.barbeiro.findFirst({
      where: { id: dados.recebidoPorId, barbeariaId, ativo: true },
      select: { id: true },
    });
    if (!membro) throw new ErroDeNegocio("quem recebeu não é um membro ativo da equipe", "membro_invalido");
  }

  // O cliente "é de" quem o atendeu primeiro (decisão 3 do plano). O
  // `profissionalId: null` no where não deixa sobrescrever uma troca que
  // o dono tenha feito nesse meio-tempo.
  let donoDoClienteId = agendamento.cliente.profissionalId;
  if (donoDoClienteId === null) {
    await tx.cliente.updateMany({
      where: { id: agendamento.cliente.id, profissionalId: null },
      data: { profissionalId: atendente },
    });
    donoDoClienteId = atendente;
  }

  const membros = await tx.barbeiro.findMany({
    where: { barbeariaId },
    select: { id: true, ativo: true, parteDaCasa: true },
  });
  const matriz = await tx.regraDeDivisao.findMany({
    where: { barbeariaId, atendenteId: atendente },
    select: { donoDoClienteId: true, atendenteId: true, percentual: true },
  });
  const partes = dividirPagamento(
    { atendente, donoDoCliente: donoDoClienteId, servicosCentavos, descontoCentavos, gorjetaCentavos },
    {
      ativos: membros.filter((m) => m.ativo).map((m) => m.id),
      parteDaCasa: Object.fromEntries(membros.map((m) => [m.id, m.parteDaCasa])),
      matriz: matriz.map((r) => ({ donoDoCliente: r.donoDoClienteId, atendente: r.atendenteId, percentual: r.percentual })),
    }
  ).map((parte) => ({ beneficiarioId: parte.beneficiario, motivo: parte.motivo, valorCentavos: parte.valorCentavos }));

  const campos = {
    data: agendamento.data,
    atendenteId: atendente,
    donoDoClienteId,
    recebidoPorId,
    forma: dados.forma,
    servicosCentavos,
    descontoCentavos,
    gorjetaCentavos,
    registradoPorId,
    registradoEm: new Date(),
  };
  const pagamento = await tx.pagamento.upsert({
    where: { agendamentoId },
    create: { barbeariaId, agendamentoId, ...campos, partes: { create: partes } },
    update: { ...campos, partes: { deleteMany: {}, create: partes } },
    include: INCLUDE_PAGAMENTO,
  });

  // Registrar o pagamento conclui o atendimento (decisão 6 do plano).
  if (agendamento.status !== "concluido") {
    await tx.agendamento.update({ where: { id: agendamentoId }, data: { status: "concluido" } });
  }
  return pagamento;
}

// O PATCH de status, antes de tirar o atendimento do `concluido`: o
// pagamento dele sai junto, e com o dia fechado nada muda (409). O
// `agendamento` é o where de quem pede — o profissional não chega ao
// pagamento do colega nem pra saber que o dia está fechado.
export async function soltarPagamento(
  tx: Prisma.TransactionClient,
  agendamento: Prisma.AgendamentoWhereInput
): Promise<void> {
  const pagamento = await tx.pagamento.findFirst({
    where: { agendamento },
    select: { id: true, barbeariaId: true, data: true },
  });
  if (!pagamento) return;
  await garantirDiaAberto(tx, pagamento.barbeariaId, pagamento.data);
  await tx.pagamento.delete({ where: { id: pagamento.id } });
}
