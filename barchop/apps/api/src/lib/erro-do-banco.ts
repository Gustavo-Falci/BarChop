import { Prisma } from "@barchop/database";

// O que o Postgres disse, lido do erro do Prisma. Desde o Prisma 7 o
// banco fala pelo driver `pg` (@prisma/adapter-pg), e todo erro do banco
// chega como PrismaClientKnownRequestError com o original guardado em
// `meta.driverAdapterError.cause` (medido em 2026-11-25, Prisma 7.10.1,
// Postgres 18):
//
//   22P02 (uuid torto)    → P2007, kind "InvalidInputValue"
//   23505 (unique)        → P2002, kind "UniqueConstraintViolation",
//                           com `constraint.index` (o `meta.target` do
//                           Prisma 5 não existe mais)
//   40P01 (impasse)       → P2034, kind "TransactionWriteConflict"
//   23P01 (EXCLUDE) e o resto → P2039 (P2010 no $queryRaw), kind "postgres"
//
// Daí ler o SQLSTATE e não o código P: ele é do Postgres, não muda com a
// versão do Prisma, e o 23P01 não tem código P próprio.
interface CausaDoBanco {
  originalCode?: unknown;
  originalMessage?: unknown;
  constraint?: { index?: unknown; fields?: unknown };
}

function causa(erro: unknown): CausaDoBanco | undefined {
  if (!(erro instanceof Prisma.PrismaClientKnownRequestError)) return undefined;
  const adapter = (erro.meta as { driverAdapterError?: { cause?: unknown } } | undefined)
    ?.driverAdapterError;
  const c = adapter?.cause;
  return c && typeof c === "object" ? (c as CausaDoBanco) : undefined;
}

// O código de cinco caracteres do Postgres (23P01, 40P01...).
export function sqlstate(erro: unknown): string | undefined {
  const codigo = causa(erro)?.originalCode;
  return typeof codigo === "string" ? codigo : undefined;
}

// A mensagem crua do Postgres, no idioma do servidor. Só pra comparar
// (o nome de uma constraint vem nela): nunca sai numa resposta, porque
// traz valores da linha de outra pessoa.
export function mensagemDoBanco(erro: unknown): string | undefined {
  const mensagem = causa(erro)?.originalMessage;
  return typeof mensagem === "string" ? mensagem : undefined;
}

// Qual unique o P2002 violou: o nome do índice, ou as colunas quando o
// Postgres não diz o nome.
export function indiceDaUnica(erro: unknown): string | undefined {
  const restricao = causa(erro)?.constraint;
  if (!restricao) return undefined;
  if (typeof restricao.index === "string") return restricao.index;
  if (Array.isArray(restricao.fields)) return restricao.fields.join(", ");
  return undefined;
}
