import type { Prisma } from "@barchop/database";
import { assinanteUsaOPlano, usosRestantes, type SituacaoDoAssinante } from "@barchop/formato";
import type { AssinaturaNoPagamento } from "@barchop/types";
import type { Membro } from "../plugins/auth";
import { temORecurso } from "./assinatura";
import { diaEstaFechado } from "./caixa";
import { PODE_ATENDER } from "./disponibilidade";
import { naoEncontrado } from "./erro-http";
import { ErroDeNegocio } from "./erro-negocio";
import { agoraNaBarbearia, dataParaDate, dateParaData, somarDias } from "./horas";
import { ErroDoProvedor, erroHttpDoProvedor, type ConexaoGravada, type FabricaDeProvedores } from "./provedores";

// Os planos que a barbearia e os barbeiros vendem ao cliente (Onda 2,
// marco 3). A conta mora em @barchop/formato (planos-do-cliente.ts);
// aqui, o que a API lê do banco pra mais de uma rota.

// Quem vende plano próprio: atende (o plano vale só com ele) e é o dono
// ou foi liberado. Tirar a liberação tira da vitrine e para a venda; as
// assinaturas que existem seguem.
export const PODE_VENDER = {
  ...PODE_ATENDER,
  OR: [{ papel: "dono" }, { podeVenderPlanos: true }],
} satisfies Prisma.BarbeiroWhereInput;

// O profissional só enxerga os planos dele (e as assinaturas deles);
// dono e recepção, todos.
export function planosVisiveis(membro: Membro): Prisma.PlanoDeAssinaturaWhereInput {
  return membro.papel === "profissional" ? { vendedorId: membro.id } : {};
}

export function assinaturasVisiveis(membro: Membro): Prisma.AssinaturaDoClienteWhereInput {
  return membro.papel === "profissional" ? { plano: { vendedorId: membro.id } } : {};
}

// O plano que se vende, na vitrine e no assinar online (PRs 4 e 10c):
// ativo, e o de barbeiro só com vendedor que atende e pode vender (o
// dono vende sem a liberação). Tirar o "pode vender" tira da vitrine.
export const PLANO_A_VENDA = {
  ativo: true,
  OR: [{ vendedorId: null }, { vendedor: PODE_VENDER }],
} satisfies Prisma.PlanoDeAssinaturaWhereInput;

// As contas que recebem online: ligadas e do modo que a plataforma
// aceita. A conta do sandbox do teste ponta a ponta não vende depois que
// o modo volta a `real` (decisão 10).
export function contasQueRecebem(barbeariaId: string, modoAceito: string): Prisma.ConexaoDePagamentoWhereInput {
  return { barbeariaId, desconectadaEm: null, modo: modoAceito };
}

// A vitrine aberta: ligada pelo dono e com o recurso no plano do BarChop.
// Fechada, o cliente não vê nem assina, e ninguém fica sabendo qual plano
// do BarChop a barbearia paga.
export async function vitrineAberta(db: Prisma.TransactionClient, barbeariaId: string): Promise<boolean> {
  const { vitrineDePlanos } = await db.barbearia.findUniqueOrThrow({
    where: { id: barbeariaId },
    select: { vitrineDePlanos: true },
  });
  return vitrineDePlanos && (await temORecurso(db, barbeariaId, "planosDaBarbearia", new Date()));
}

// A conta que recebe a mensalidade de um plano: a da casa pro plano da
// casa; a pessoal do vendedor pro plano dele. A conta pessoal do dono
// não recebe plano da casa, nem a da casa o plano dele. Sobre as contas
// já lidas da barbearia (a vitrine lê todas de uma vez); o "assinar
// online" (PR 10) usa a mesma regra.
export function temContaQueRecebe(
  contas: readonly { barbeiroId: string; daCasa: boolean }[],
  vendedorId: string | null
): boolean {
  return contas.some((conta) => (vendedorId === null ? conta.daCasa : !conta.daCasa && conta.barbeiroId === vendedorId));
}

// O ciclo do balcão que passou do dia da renovação sem "recebi" fica em
// atraso (`cicloEmAtraso`, @barchop/formato). Sem tarefa agendada: quem
// lê a situação chama isto antes — a lista de assinantes, o "recebi", e
// depois o caixa (PR 6) e "minhas assinaturas" (PR 10). O atraso da
// online não sai daqui: quem diz é o provedor, pelo webhook. Daqui sai o
// ciclo online já pago antes da renovação (`pago_ate`), que entra quando
// o de agora acaba.
export async function marcarAtrasadas(
  db: Prisma.TransactionClient,
  barbeariaId: string,
  hoje: string,
  onde: Prisma.AssinaturaDoClienteWhereInput = {}
): Promise<void> {
  // Uma a uma, porque o começo novo é o fim de cada uma. São poucas: só
  // as pagas adiantado que viraram o ciclo desde a última leitura.
  const pagas = await db.assinaturaDoCliente.findMany({
    where: {
      ...onde,
      barbeariaId,
      forma: "online",
      situacao: { not: "cancelada" },
      pagoAte: { not: null },
      cicloTerminaEm: { lte: dataParaDate(hoje) },
    },
    select: { id: true, cicloTerminaEm: true, pagoAte: true },
  });
  for (const paga of pagas) {
    await db.assinaturaDoCliente.update({
      where: { id: paga.id },
      data: { situacao: "ativa", cicloComecaEm: paga.cicloTerminaEm, cicloTerminaEm: paga.pagoAte, pagoAte: null },
    });
  }

  await db.assinaturaDoCliente.updateMany({
    where: {
      ...onde,
      barbeariaId,
      forma: "no_balcao",
      situacao: { in: ["ativa", "teste"] },
      cicloTerminaEm: { lt: dataParaDate(hoje) },
    },
    data: { situacao: "em_atraso" },
  });
}

// O dia do caixa de um recebimento: o de hoje, ou o próximo que não está
// fechado (decisão 4 do plano). Quem chama já travou a linha da
// barbearia, a mesma que o fechar do dia trava.
export async function proximoDiaAberto(
  db: Prisma.TransactionClient,
  barbeariaId: string,
  desde: string
): Promise<string> {
  let dia = desde;
  // Um ano de dias fechados seguidos não acontece; o teto só impede
  // laço sem fim.
  for (let i = 0; i < 366; i++) {
    if (!(await diaEstaFechado(db, barbeariaId, dataParaDate(dia)))) return dia;
    dia = somarDias(dia, 1);
  }
  throw new Error(`nenhum dia aberto no caixa da barbearia ${barbeariaId} a partir de ${desde}`);
}

type Ciclo = { cicloComecaEm: Date | null; cicloTerminaEm: Date | null };

// O ciclo vai do começo até a véspera da renovação: no dia da renovação,
// o atendimento já é do ciclo seguinte, que só abre com o "recebi" (ou
// com o webhook, no online).
function diaNoCiclo(ciclo: Ciclo, dia: Date): boolean {
  if (!ciclo.cicloComecaEm || !ciclo.cicloTerminaEm) return false;
  const data = dateParaData(dia);
  return dateParaData(ciclo.cicloComecaEm) <= data && data < dateParaData(ciclo.cicloTerminaEm);
}

// Os usos do ciclo de uma assinatura, por serviço. `menos` = o pagamento
// que está sendo refeito, que não conta contra ele mesmo.
export async function usosNoCiclo(
  db: Prisma.TransactionClient,
  assinatura: Ciclo & { id: string },
  menos: string | null
): Promise<Map<string, number>> {
  if (!assinatura.cicloComecaEm || !assinatura.cicloTerminaEm) return new Map();
  const grupos = await db.usoDoPlano.groupBy({
    by: ["servicoId"],
    where: {
      assinaturaId: assinatura.id,
      data: { gte: assinatura.cicloComecaEm, lt: assinatura.cicloTerminaEm },
      ...(menos ? { pagamentoId: { not: menos } } : {}),
    },
    _count: { _all: true },
  });
  return new Map(grupos.map((g) => [g.servicoId, g._count._all]));
}

export interface PeloPlano {
  // Um por linha do atendimento coberta: o mesmo serviço duas vezes
  // gasta dois usos.
  cobertos: string[];
  // `null` = plano de barbeiro, que não paga fixo.
  fixoCentavos: number | null;
}

// Confere a assinatura que a tela mandou e decide o que o plano cobre no
// atendimento (decisão 2 do plano): vale no dia, é do cliente, e o plano
// de barbeiro só com quem vende. Cada serviço do plano vai até os usos
// do ciclo; o que passa, ou que o plano não tem, é avulso. Quem chama já
// travou a linha da barbearia (garantirDiaAberto): dois pagamentos ao
// mesmo tempo não gastam o mesmo último uso.
export async function conferirOPlano(
  tx: Prisma.TransactionClient,
  params: {
    barbeariaId: string;
    assinaturaId: string;
    agendamento: { clienteId: string; atendenteId: string; data: Date; servicoIds: readonly string[] };
    pagamentoId: string | null;
  }
): Promise<PeloPlano> {
  const { barbeariaId, assinaturaId, agendamento, pagamentoId } = params;
  await marcarAtrasadas(tx, barbeariaId, agoraNaBarbearia().data, { id: assinaturaId });
  const assinatura = await tx.assinaturaDoCliente.findFirst({
    where: { id: assinaturaId, barbeariaId },
    include: {
      plano: {
        select: {
          vendedorId: true,
          fixoPorAtendimentoCentavos: true,
          servicos: { select: { servicoId: true, usosPorCiclo: true } },
        },
      },
    },
  });
  if (!assinatura) throw naoEncontrado();
  if (assinatura.clienteId !== agendamento.clienteId) {
    throw new ErroDeNegocio("esta assinatura é de outro cliente", "assinatura_de_outro_cliente");
  }
  if (!assinanteUsaOPlano(assinatura.situacao as SituacaoDoAssinante)) {
    throw new ErroDeNegocio("esta assinatura não está valendo: pendente, em atraso ou cancelada", "assinatura_inativa");
  }
  if (!diaNoCiclo(assinatura, agendamento.data)) {
    throw new ErroDeNegocio("o dia do atendimento está fora do ciclo pago da assinatura", "fora_do_ciclo");
  }
  const { plano } = assinatura;
  if (plano.vendedorId !== null && plano.vendedorId !== agendamento.atendenteId) {
    throw new ErroDeNegocio("o plano de barbeiro só vale com quem vende", "plano_de_outro_barbeiro");
  }

  const usados = await usosNoCiclo(tx, assinatura, pagamentoId);
  const cobertos: string[] = [];
  let esgotou = false;
  for (const servicoId of agendamento.servicoIds) {
    const regra = plano.servicos.find((s) => s.servicoId === servicoId);
    if (!regra) continue;
    const ja = usados.get(servicoId) ?? 0;
    if (usosRestantes(regra.usosPorCiclo, ja) === 0) {
      esgotou = true;
      continue;
    }
    cobertos.push(servicoId);
    usados.set(servicoId, ja + 1);
  }
  if (cobertos.length === 0) {
    throw esgotou
      ? new ErroDeNegocio("os usos do plano neste ciclo acabaram", "usos_esgotados")
      : new ErroDeNegocio("o plano não cobre nenhum serviço deste atendimento", "servico_fora_do_plano");
  }
  return { cobertos, fixoCentavos: plano.fixoPorAtendimentoCentavos };
}

// As assinaturas vivas do cliente, pra tela do pagamento: os usos que
// sobram no ciclo (sem os deste pagamento) e se valem no dia e com quem
// atende. `somente` = o profissional logado: os planos da casa e os dele.
export async function assinaturasNoPagamento(
  db: Prisma.TransactionClient,
  params: {
    barbeariaId: string;
    agendamento: { clienteId: string; atendenteId: string; data: Date };
    pagamentoId: string | null;
    somente?: string;
  }
): Promise<AssinaturaNoPagamento[]> {
  const { barbeariaId, agendamento, pagamentoId, somente } = params;
  await marcarAtrasadas(db, barbeariaId, agoraNaBarbearia().data, { clienteId: agendamento.clienteId });
  const assinaturas = await db.assinaturaDoCliente.findMany({
    where: {
      barbeariaId,
      clienteId: agendamento.clienteId,
      situacao: { not: "cancelada" },
      ...(somente ? { plano: { OR: [{ vendedorId: null }, { vendedorId: somente }] } } : {}),
    },
    include: {
      plano: {
        select: {
          id: true,
          nome: true,
          vendedorId: true,
          vendedor: { select: { id: true, nome: true } },
          servicos: {
            select: { servicoId: true, usosPorCiclo: true, servico: { select: { nome: true } } },
            orderBy: { servico: { nome: "asc" } },
          },
        },
      },
    },
    orderBy: [{ criadoEm: "asc" }, { id: "asc" }],
  });

  return Promise.all(
    assinaturas.map(async (assinatura) => {
      const usados = await usosNoCiclo(db, assinatura, pagamentoId);
      const { plano } = assinatura;
      return {
        id: assinatura.id,
        situacao: assinatura.situacao as SituacaoDoAssinante,
        cicloComecaEm: assinatura.cicloComecaEm ? dateParaData(assinatura.cicloComecaEm) : null,
        cicloTerminaEm: assinatura.cicloTerminaEm ? dateParaData(assinatura.cicloTerminaEm) : null,
        noCiclo: diaNoCiclo(assinatura, agendamento.data),
        valeComOAtendente: plano.vendedorId === null || plano.vendedorId === agendamento.atendenteId,
        plano: { id: plano.id, nome: plano.nome, daCasa: plano.vendedorId === null, vendedor: plano.vendedor },
        servicos: plano.servicos.map((s) => ({
          servicoId: s.servicoId,
          nome: s.servico.nome,
          usosPorCiclo: s.usosPorCiclo,
          usosRestantes: usosRestantes(s.usosPorCiclo, usados.get(s.servicoId) ?? 0),
        })),
      };
    })
  );
}

// As assinaturas online que vão ser canceladas aqui, com a conta em que
// são cobradas. A do balcão não tem o que cancelar fora.
export const ONLINE_A_CANCELAR = {
  idExterno: true,
  conexao: { select: { provedor: true, modo: true, chaveCifrada: true, desconectadaEm: true } },
} satisfies Prisma.AssinaturaDoClienteSelect;

// Cancela no provedor, antes de cancelar no banco (PR 10b): sem isso, a
// cobrança seguiria caindo no cartão do cliente. Falhou, lança, e nada
// muda aqui. Se o provedor cancelou e o banco não gravou, o
// SUBSCRIPTION_DELETED do webhook cancela depois. A que o provedor não
// acha mais já está cancelada lá.
export async function cancelarNoProvedor(
  fabrica: FabricaDeProvedores,
  assinaturas: readonly {
    idExterno: string | null;
    conexao: (ConexaoGravada & { desconectadaEm: Date | null }) | null;
  }[]
): Promise<void> {
  for (const { idExterno, conexao } of assinaturas) {
    // A conexão desligada não tem mais a chave; o desconectar recusa
    // enquanto há assinatura online viva nela.
    if (!idExterno || !conexao || conexao.desconectadaEm !== null) continue;
    try {
      await fabrica.daConexao(conexao).cancelarAssinatura(idExterno);
    } catch (erro) {
      if (!(erro instanceof ErroDoProvedor)) throw erro;
      if (erro.codigo === "nao_encontrado") continue;
      if (erro.codigo === "chave_invalida") {
        throw new ErroDeNegocio(
          "o Asaas não aceitou a chave da conta conectada: troque a chave em Pagamentos online e tente de novo",
          "chave_da_conta_recusada"
        );
      }
      throw erroHttpDoProvedor(erro);
    }
  }
}
