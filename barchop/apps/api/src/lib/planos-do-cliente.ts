import type { Prisma } from "@barchop/database";
import type { Membro } from "../plugins/auth";
import { diaEstaFechado } from "./caixa";
import { PODE_ATENDER } from "./disponibilidade";
import { dataParaDate, somarDias } from "./horas";

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
// depois o caixa (PR 6) e "minhas assinaturas" (PR 10). Online não entra:
// lá quem diz é o provedor, pelo webhook.
export async function marcarAtrasadas(
  db: Prisma.TransactionClient,
  barbeariaId: string,
  hoje: string,
  onde: Prisma.AssinaturaDoClienteWhereInput = {}
): Promise<void> {
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
