import { prisma, type Prisma } from "@barchop/database";

// A trilha de auditoria (auditoria de segurança de 15/11, SEC-008 e
// SEC-009): quem fez o quê, em quê, quando e de onde.
//
// Entra aqui o que o Suporte da plataforma faz (ele confirma pagamentos,
// troca links e fala com todos os donos) e o que os comandos de operação
// fazem com dado pessoal (exportar e apagar). Não é log de aplicação: é
// o registro que responde "quem mexeu nisto?" meses depois.
//
// `detalhe` leva o mínimo pra entender a ação. Nunca senha, token,
// código nem dado de cliente final.

export type AtorDaAuditoria = "suporte" | "sistema" | "dono";

export interface Registro {
  ator: { tipo: AtorDaAuditoria; id?: string | null };
  acao: string;
  alvo?: { tipo: string; id?: string | null };
  barbeariaId?: string | null;
  detalhe?: Prisma.InputJsonObject;
  ip?: string | null;
}

// `db`: a transação de quem age, quando há uma. A linha da trilha nasce
// junto com a ação ou não nasce — ação sem registro é o que a trilha
// existe pra impedir, e registro de ação desfeita seria mentira.
export async function registrarAuditoria(
  db: Prisma.TransactionClient | typeof prisma,
  registro: Registro
): Promise<void> {
  await db.auditoria.create({
    data: {
      atorTipo: registro.ator.tipo,
      atorId: registro.ator.id ?? null,
      acao: registro.acao,
      alvoTipo: registro.alvo?.tipo ?? null,
      alvoId: registro.alvo?.id ?? null,
      barbeariaId: registro.barbeariaId ?? null,
      ...(registro.detalhe ? { detalhe: registro.detalhe } : {}),
      ip: registro.ip ?? null,
    },
  });
}

// Dois anos: o bastante pra apurar um incidente descoberto tarde e pra
// uma disputa de cobrança; passado isso, o IP e o rastro de quem operou
// não têm mais por que ficar.
export const RETENCAO_DA_AUDITORIA_MS = 2 * 365 * 24 * 60 * 60 * 1000;

export async function apagarAuditoriaAntiga(agora: Date = new Date()): Promise<number> {
  const { count } = await prisma.auditoria.deleteMany({
    where: { criadoEm: { lt: new Date(agora.getTime() - RETENCAO_DA_AUDITORIA_MS) } },
  });
  return count;
}
