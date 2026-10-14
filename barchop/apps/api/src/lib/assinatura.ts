import { prisma, type Prisma } from "@barchop/database";
import {
  DIAS_DE_TESTE,
  limiteDeProfissionais,
  planoEfetivo,
  type Ciclo,
  type IdDoPlano,
  type SituacaoDaAssinatura,
} from "@barchop/formato";

// A assinatura do BarChop (Onda 2, marco 1): o que a API lê dela. A
// Stripe entra no PR 4 do plano cobranca-do-barchop; aqui é só o banco.

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

export interface ResumoDaAssinatura {
  situacao: SituacaoDaAssinatura;
  plano: IdDoPlano;
  ciclo: Ciclo;
  planoEfetivo: IdDoPlano;
  testeTerminaEm: string | null;
  // Só em teste; fora dele, null.
  diasDeTesteRestantes: number | null;
  periodoTerminaEm: string | null;
  profissionais: number;
  limiteDeProfissionais: number | null;
  // Mais profissionais que o plano que vale agora permite.
  excedente: boolean;
}

// Os ids da Stripe ficam de fora: o painel não precisa deles.
export async function resumoDaAssinatura(barbeariaId: string, agora: Date): Promise<ResumoDaAssinatura> {
  const [linha, profissionais] = await Promise.all([
    prisma.assinatura.findUniqueOrThrow({ where: { barbeariaId } }),
    contarProfissionais(barbeariaId),
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
    profissionais,
    limiteDeProfissionais: limite,
    excedente: limite !== null && profissionais > limite,
  };
}
