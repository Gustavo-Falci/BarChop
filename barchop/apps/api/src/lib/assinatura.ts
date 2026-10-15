import { prisma, type Prisma } from "@barchop/database";
import {
  DIAS_DE_TESTE,
  PLANOS,
  limiteDeProfissionais,
  planoEfetivo,
  type Ciclo,
  type IdDoPlano,
  type SituacaoDaAssinatura,
} from "@barchop/formato";
import type { ResumoDaAssinatura } from "@barchop/types";
import type { Cobranca } from "./cobranca";
import { ErroDeNegocio } from "./erro-negocio";

// A assinatura do BarChop (Onda 2, marco 1): o que a API lê dela e o
// limite de profissionais do plano. A Stripe entra no PR 4 do plano
// cobranca-do-barchop; aqui é só o banco.

const UM_DIA = 24 * 60 * 60 * 1000;

export function fimDoTeste(agora: Date): Date {
  return new Date(agora.getTime() + DIAS_DE_TESTE * UM_DIA);
}

// Dias que faltam, arredondando pra cima: faltando uma hora, ainda é
// "falta 1 dia". Vencido, zero.
export function diasDeTesteRestantes(testeTerminaEm: Date, agora: Date): number {
  return Math.max(0, Math.ceil((testeTerminaEm.getTime() - agora.getTime()) / UM_DIA));
}

// Quem conta no limite e no preço: membro ativo que é dono ou
// profissional. A recepção não conta (decisão do dono, 13/10/2026).
export function contarProfissionais(
  barbeariaId: string,
  db: Prisma.TransactionClient = prisma
): Promise<number> {
  return db.barbeiro.count({
    where: { barbeariaId, ativo: true, papel: { in: ["dono", "profissional"] } },
  });
}

// O plano que vale agora, ou null para a barbearia sem assinatura (só
// as que os testes criam direto no banco; em produção a migration
// 20261014120000_assinatura deu uma a cada barbearia, e o signup cria).
async function planoQueVale(
  db: Prisma.TransactionClient,
  barbeariaId: string,
  agora: Date
): Promise<IdDoPlano | null> {
  const linha = await db.assinatura.findUnique({
    where: { barbeariaId },
    select: { situacao: true, plano: true, testeTerminaEm: true },
  });
  if (!linha) return null;
  return planoEfetivo(
    {
      situacao: linha.situacao as SituacaoDaAssinatura,
      plano: linha.plano as IdDoPlano,
      testeTerminaEm: linha.testeTerminaEm,
    },
    agora
  );
}

// O convite de cada plano quando a equipe bate no limite.
function mensagemDoLimite(plano: IdDoPlano, limite: number): string {
  const { nome } = PLANOS[plano];
  const quantos = limite === 1 ? "1 profissional" : `${limite} profissionais`;
  return plano === "gratis"
    ? `o plano ${nome} tem ${quantos}: escolha um plano para incluir mais`
    : `o ${nome} vai até ${quantos}: suba para o Completo para incluir mais`;
}

// Antes de a equipe ganhar um profissional (incluir, reativar ou passar
// a atender): recusa se o plano que vale agora já está cheio. Roda
// dentro da transação de quem grava, com a linha da barbearia travada —
// dois convites ao mesmo tempo contariam, cada um, uma vaga livre.
export async function garantirVagaNoPlano(
  tx: Prisma.TransactionClient,
  barbeariaId: string,
  agora: Date
): Promise<void> {
  await tx.$queryRaw`SELECT id FROM barbearia WHERE id = ${barbeariaId}::uuid FOR NO KEY UPDATE`;
  const plano = await planoQueVale(tx, barbeariaId, agora);
  if (plano === null) return;
  const limite = limiteDeProfissionais(plano);
  if (limite === null) return;
  if ((await contarProfissionais(barbeariaId, tx)) >= limite) {
    throw new ErroDeNegocio(mensagemDoLimite(plano, limite), "limite_do_plano");
  }
}

// Quem fica fora do link público quando a equipe passa do limite do
// plano que vale (o Grátis depois do teste ou do cancelamento). Ficam os
// primeiros: quem atende antes de quem não atende, o dono antes do
// profissional, e por ordem de entrada. Os de fora seguem no painel,
// com a agenda e os horários já marcados; só não recebem agendamento
// novo pelo link.
export async function foraDoLink(
  db: Prisma.TransactionClient,
  barbeariaId: string,
  agora: Date
): Promise<string[]> {
  const plano = await planoQueVale(db, barbeariaId, agora);
  const limite = plano === null ? null : limiteDeProfissionais(plano);
  if (limite === null) return [];

  const membros = await db.barbeiro.findMany({
    where: { barbeariaId, ativo: true, papel: { in: ["dono", "profissional"] } },
    orderBy: [{ criadoEm: "asc" }, { id: "asc" }],
    select: { id: true, papel: true, atende: true, senhaHash: true },
  });
  if (membros.length <= limite) return [];

  const atende = (m: (typeof membros)[number]) => (m.atende && m.senhaHash !== null ? 0 : 1);
  const dono = (m: (typeof membros)[number]) => (m.papel === "dono" ? 0 : 1);
  // `sort` é estável: o empate fica na ordem de entrada.
  const ordem = [...membros].sort((a, b) => atende(a) - atende(b) || dono(a) - dono(b));
  return ordem.slice(limite).map((m) => m.id);
}

// No fluxo público, quem ficou fora do link é recusado como quem não
// existe: o mesmo código do barbeiro de outra barbearia.
export async function garantirNoLink(
  db: Prisma.TransactionClient,
  barbeariaId: string,
  barbeiroId: string,
  agora: Date
): Promise<void> {
  if ((await foraDoLink(db, barbeariaId, agora)).includes(barbeiroId)) {
    throw new ErroDeNegocio("barbeiro não encontrado nesta barbearia", "barbeiro_invalido");
  }
}

// Quem saiu do link e perdeu algo com isso: atendia e já tinha entrado
// na equipe. Na ordem do foraDoLink.
async function quemSaiuDoLink(barbeariaId: string, agora: Date): Promise<{ id: string; nome: string }[]> {
  const ids = await foraDoLink(prisma, barbeariaId, agora);
  if (ids.length === 0) return [];
  const membros = await prisma.barbeiro.findMany({
    where: { id: { in: ids }, atende: true, senhaHash: { not: null } },
    select: { id: true, nome: true },
  });
  return ids.flatMap((id) => membros.filter((m) => m.id === id));
}

// Os ids da Stripe ficam de fora: o painel não precisa deles.
export async function resumoDaAssinatura(barbeariaId: string, agora: Date): Promise<ResumoDaAssinatura> {
  const [linha, profissionais, saiuDoLink] = await Promise.all([
    prisma.assinatura.findUniqueOrThrow({ where: { barbeariaId } }),
    contarProfissionais(barbeariaId),
    quemSaiuDoLink(barbeariaId, agora),
  ]);
  // O CHECK da migration garante que as três colunas estão nas listas.
  const assinatura = {
    situacao: linha.situacao as SituacaoDaAssinatura,
    plano: linha.plano as IdDoPlano,
    ciclo: linha.ciclo as Ciclo,
    testeTerminaEm: linha.testeTerminaEm,
  };
  const efetivo = planoEfetivo(assinatura, agora);
  const limite = limiteDeProfissionais(efetivo);
  return {
    situacao: assinatura.situacao,
    plano: assinatura.plano,
    ciclo: assinatura.ciclo,
    planoEfetivo: efetivo,
    testeTerminaEm: linha.testeTerminaEm?.toISOString() ?? null,
    diasDeTesteRestantes:
      assinatura.situacao === "teste" && linha.testeTerminaEm
        ? diasDeTesteRestantes(linha.testeTerminaEm, agora)
        : null,
    periodoTerminaEm: linha.periodoTerminaEm?.toISOString() ?? null,
    // Com teste na Stripe, o 1º período termina no fim do teste (em
    // segundos, então nunca depois); cobrada, ele passa dessa data.
    primeiraCobrancaPendente:
      assinatura.situacao === "ativa" &&
      linha.testeTerminaEm !== null &&
      linha.periodoTerminaEm !== null &&
      linha.periodoTerminaEm <= linha.testeTerminaEm,
    cancelaEm: linha.cancelaEm?.toISOString() ?? null,
    profissionais,
    limiteDeProfissionais: limite,
    excedente: limite !== null && profissionais > limite,
    foraDoLink: saiuDoLink,
    temPortal: linha.stripeCustomerId !== null,
  };
}

interface LogDeAviso {
  warn(objeto: object, mensagem: string): void;
}

// Depois que a equipe muda (e a transação gravou): com plano pago, a
// quantidade na Stripe acompanha os profissionais contados, para cima e
// para baixo, nunca abaixo de 1 — cobrança proporcional na próxima
// fatura. Se a Stripe falhar, a mudança na equipe fica: o aviso vai pro
// log, e o `profissionaisContratados` do webhook mostra a diferença.
export async function sincronizarQuantidade(
  cobranca: Cobranca,
  barbeariaId: string,
  log: LogDeAviso
): Promise<void> {
  const linha = await prisma.assinatura.findUnique({
    where: { barbeariaId },
    select: { situacao: true, stripeSubscriptionId: true, profissionaisContratados: true },
  });
  if (!linha?.stripeSubscriptionId || (linha.situacao !== "ativa" && linha.situacao !== "em_atraso")) return;

  const profissionais = Math.max(1, await contarProfissionais(barbeariaId));
  if (profissionais === linha.profissionaisContratados) return;
  try {
    await cobranca.atualizarQuantidade(linha.stripeSubscriptionId, profissionais);
    await prisma.assinatura.update({ where: { barbeariaId }, data: { profissionaisContratados: profissionais } });
  } catch (erro) {
    log.warn({ err: erro, barbeariaId, profissionais }, "não consegui atualizar a quantidade na Stripe");
  }
}
