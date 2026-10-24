import type { Prisma } from "@barchop/database";
import {
  FORMAS_DE_PAGAMENTO,
  MOTIVOS_DA_PARTE,
  acertoDoDia,
  dividirPagamento,
  type AcertoDoDia,
  type FormaDePagamento,
} from "@barchop/formato";
import type {
  CaixaDoDia,
  DivisaoDoDinheiro,
  FormaDoPagamento,
  MembroDoCaixa,
  MotivoDaParteDoPagamento,
  PagamentoDoAgendamento,
  PendenciaDoCaixa,
  SalvarDivisao,
} from "@barchop/types";
import { ErroHttp } from "./erro-http";
import { ErroDeNegocio } from "./erro-negocio";
import { dataParaDate, dateParaData, dateParaHora } from "./horas";

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

// As partes na ordem da conta (atendimento, cliente, casa, gorjeta), e
// não na do banco, que não garante nenhuma.
function naOrdemDaConta<T extends { motivo: string }>(partes: readonly T[]): T[] {
  const ordem = (motivo: string) => MOTIVOS_DA_PARTE.indexOf(motivo as MotivoDaParteDoPagamento);
  return [...partes].sort((a, b) => ordem(a.motivo) - ordem(b.motivo));
}

export function serializarPagamento(pagamento: PagamentoComTudo): PagamentoDoAgendamento {
  const partes = naOrdemDaConta(pagamento.partes);
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

// A data do caixa vem da tela, como na ocupação: a API não decide que
// dia é hoje. "2026-02-30" passa no pattern e morre aqui.
export function diaDoCaixa(data: string): Date {
  try {
    return dataParaDate(data);
  } catch {
    throw new ErroDeNegocio(`a data ${data} não existe`, "data_invalida");
  }
}

const INCLUDE_PAGAMENTO_DO_CAIXA = {
  ...INCLUDE_PAGAMENTO,
  agendamento: { select: { horaInicio: true, cliente: { select: { id: true, nome: true } } } },
} as const;

type PagamentoDoDia = Prisma.PagamentoGetPayload<{ include: typeof INCLUDE_PAGAMENTO_DO_CAIXA }>;

// Na ordem do dia; no mesmo horário (dois profissionais), por id, pra a
// ordem — e com ela o acerto — não mudar de uma leitura pra outra.
function pagamentosDoDia(db: Prisma.TransactionClient, barbeariaId: string, data: Date): Promise<PagamentoDoDia[]> {
  return db.pagamento.findMany({
    where: { barbeariaId, data },
    include: INCLUDE_PAGAMENTO_DO_CAIXA,
    orderBy: [{ agendamento: { horaInicio: "asc" } }, { id: "asc" }],
  });
}

function contarOAcerto(pagamentos: readonly PagamentoDoDia[]): AcertoDoDia {
  return acertoDoDia(
    pagamentos.map((pagamento) => ({
      recebidoPor: pagamento.recebidoPorId,
      partes: naOrdemDaConta(pagamento.partes).map((parte) => ({
        beneficiario: parte.beneficiarioId,
        motivo: parte.motivo as MotivoDaParteDoPagamento,
        valorCentavos: parte.valorCentavos,
      })),
    }))
  );
}

// O caixa de um dia. `somente` = o profissional logado: ele vê os
// pagamentos em que entra (atendeu, recebeu ou leva parte), a linha dele
// no acerto, os repasses dele e as pendências da agenda dele. O acerto
// é contado com o dia inteiro e só depois recortado — o saldo dele
// depende do que os outros receberam por ele.
export async function caixaDoDia(
  db: Prisma.TransactionClient,
  params: { barbeariaId: string; data: Date; somente?: string }
): Promise<CaixaDoDia> {
  const { barbeariaId, data, somente } = params;
  const fechamento = await db.fechamentoDoDia.findUnique({
    where: { barbeariaId_data: { barbeariaId, data } },
    include: { fechadoPor: MEMBRO },
  });
  const todos = await pagamentosDoDia(db, barbeariaId, data);
  // Dia fechado: vale a foto gravada ao fechar, não uma conta nova.
  const acerto = fechamento ? (fechamento.acerto as unknown as AcertoDoDia) : contarOAcerto(todos);

  const pendentes = await db.agendamento.findMany({
    where: {
      barbeariaId,
      data,
      ...(somente ? { barbeiroId: somente } : {}),
      OR: [{ status: { in: ["pendente", "confirmado"] } }, { status: "concluido", pagamento: { is: null } }],
    },
    select: {
      id: true,
      horaInicio: true,
      status: true,
      cliente: { select: { id: true, nome: true } },
      barbeiro: MEMBRO,
    },
    orderBy: [{ horaInicio: "asc" }, { id: "asc" }],
  });

  const membros = await db.barbeiro.findMany({ where: { barbeariaId }, select: { id: true, nome: true } });
  const nomes = new Map(membros.map((m) => [m.id, m.nome]));
  const membro = (id: string): MembroDoCaixa => ({ id, nome: nomes.get(id) ?? "" });

  const entra = (p: PagamentoDoDia) =>
    p.atendenteId === somente || p.recebidoPorId === somente || p.partes.some((parte) => parte.beneficiarioId === somente);
  const pagamentos = somente ? todos.filter(entra) : todos;
  const pessoas = somente ? acerto.pessoas.filter((l) => l.pessoa === somente) : acerto.pessoas;
  const repasses = somente ? acerto.repasses.filter((r) => r.de === somente || r.para === somente) : acerto.repasses;

  const porForma = FORMAS_DE_PAGAMENTO.map((forma) => {
    const daForma = pagamentos.filter((p) => p.forma === forma);
    return {
      forma,
      quantidade: daForma.length,
      valorCentavos: daForma.reduce((soma, p) => soma + p.servicosCentavos - p.descontoCentavos + p.gorjetaCentavos, 0),
    };
  });

  return {
    data: dateParaData(data),
    fechamento: fechamento
      ? { fechadoEm: fechamento.fechadoEm.toISOString(), fechadoPor: fechamento.fechadoPor }
      : null,
    pagamentos: pagamentos.map((p) => ({
      ...serializarPagamento(p),
      horaInicio: dateParaHora(p.agendamento.horaInicio),
      cliente: p.agendamento.cliente,
    })),
    totais: { totalCentavos: porForma.reduce((soma, f) => soma + f.valorCentavos, 0), porForma },
    acerto: {
      pessoas: pessoas.map((l) => ({ ...l, pessoa: l.pessoa === null ? null : membro(l.pessoa) })),
      repasses: repasses.map((r) => ({
        de: r.de === null ? null : membro(r.de),
        para: r.para === null ? null : membro(r.para),
        valorCentavos: r.valorCentavos,
      })),
    },
    pendencias: pendentes.map((a) => ({
      agendamentoId: a.id,
      horaInicio: dateParaHora(a.horaInicio),
      status: a.status as PendenciaDoCaixa["status"],
      cliente: a.cliente,
      barbeiro: a.barbeiro,
    })),
  };
}

// Fechar o dia (só o dono): grava a foto do acerto. A trava da
// barbearia em garantirDiaAberto deixa o fechar e os pagamentos em fila
// — nenhum pagamento entra depois da foto. Dia já fechado é 409.
export async function fecharODia(
  tx: Prisma.TransactionClient,
  params: { barbeariaId: string; data: Date; fechadoPorId: string }
): Promise<void> {
  const { barbeariaId, data, fechadoPorId } = params;
  await garantirDiaAberto(tx, barbeariaId, data);
  const acerto = contarOAcerto(await pagamentosDoDia(tx, barbeariaId, data));
  await tx.fechamentoDoDia.create({
    data: { barbeariaId, data, fechadoPorId, acerto: acerto as unknown as Prisma.InputJsonObject },
  });
}

// Quem entra na divisão do dinheiro: membro ativo que atende (dono ou
// profissional). A recepção não atende; quem saiu não leva parte
// (dividirPagamento já ignora o dono do cliente inativo).
function membrosDaDivisao(db: Prisma.TransactionClient, barbeariaId: string) {
  return db.barbeiro.findMany({
    where: { barbeariaId, ativo: true, atende: true, papel: { in: ["dono", "profissional"] } },
    orderBy: [{ criadoEm: "asc" }, { id: "asc" }],
    select: { id: true, nome: true, parteDaCasa: true },
  });
}

// O cliente só "é de" quem entra na divisão (PATCH /clientes/:id).
export async function garantirMembroDaDivisao(
  db: Prisma.TransactionClient,
  barbeariaId: string,
  membroId: string
): Promise<void> {
  if (!(await membrosDaDivisao(db, barbeariaId)).some((m) => m.id === membroId)) {
    throw new ErroDeNegocio("o profissional não é um membro ativo que atende", "membro_invalido");
  }
}

export async function divisaoDaBarbearia(db: Prisma.TransactionClient, barbeariaId: string): Promise<DivisaoDoDinheiro> {
  const membros = await membrosDaDivisao(db, barbeariaId);
  const posicao = new Map(membros.map((m, i) => [m.id, i]));
  // Só os pares entre quem está na divisão: a regra de quem saiu fica
  // guardada, mas não aparece.
  const linhas = await db.regraDeDivisao.findMany({
    where: { barbeariaId, donoDoClienteId: { in: [...posicao.keys()] }, atendenteId: { in: [...posicao.keys()] } },
    select: { donoDoClienteId: true, atendenteId: true, percentual: true },
  });
  const ordem = (r: (typeof linhas)[number]) =>
    (posicao.get(r.donoDoClienteId) ?? 0) * membros.length + (posicao.get(r.atendenteId) ?? 0);
  return { membros, matriz: [...linhas].sort((a, b) => ordem(a) - ordem(b)) };
}

// Grava a divisão que o dono montou. A matriz substitui a dos pares
// entre os membros da divisão (par em 0 não vira linha: ausente = 0); a
// parte da casa muda só para quem veio. Tudo na transação de quem chama:
// um membro inválido no meio não deixa metade gravada.
export async function salvarDivisao(
  tx: Prisma.TransactionClient,
  barbeariaId: string,
  divisao: SalvarDivisao
): Promise<void> {
  const ids = new Set((await membrosDaDivisao(tx, barbeariaId)).map((m) => m.id));
  const garantirMembro = (id: string) => {
    if (!ids.has(id)) throw new ErroDeNegocio("um dos membros não é um membro ativo que atende", "membro_invalido");
  };

  const vistos = new Set<string>();
  for (const { membroId } of divisao.parteDaCasa) {
    garantirMembro(membroId);
    if (vistos.has(membroId)) throw new ErroDeNegocio("o mesmo membro veio duas vezes", "regra_invalida");
    vistos.add(membroId);
  }
  const pares = new Set<string>();
  for (const { donoDoClienteId, atendenteId } of divisao.matriz) {
    garantirMembro(donoDoClienteId);
    garantirMembro(atendenteId);
    if (donoDoClienteId === atendenteId) {
      throw new ErroDeNegocio("com o próprio cliente, quem atende fica com tudo", "regra_invalida");
    }
    const par = `${donoDoClienteId}:${atendenteId}`;
    if (pares.has(par)) throw new ErroDeNegocio("o mesmo par veio duas vezes", "regra_invalida");
    pares.add(par);
  }

  for (const { membroId, percentual } of divisao.parteDaCasa) {
    await tx.barbeiro.update({ where: { id: membroId }, data: { parteDaCasa: percentual } });
  }
  await tx.regraDeDivisao.deleteMany({
    where: { barbeariaId, donoDoClienteId: { in: [...ids] }, atendenteId: { in: [...ids] } },
  });
  await tx.regraDeDivisao.createMany({
    data: divisao.matriz.filter((r) => r.percentual > 0).map((r) => ({ barbeariaId, ...r })),
  });
}
