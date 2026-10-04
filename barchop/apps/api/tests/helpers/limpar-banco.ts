import { prisma } from "@barchop/database";

// TRUNCATE ... CASCADE em vez de deleteMany por tabela: é mais rápido e
// não depende de acertar a ordem das foreign keys.
const TABELAS = [
  "slug_antigo",
  "codigo_verificacao",
  "bloqueio",
  "profissional_servico",
  "jornada_profissional",
  "agendamento_servico",
  "agendamento",
  "servico",
  "horario_funcionamento",
  "barbeiro",
  "cliente",
  "barbearia",
];

// O global-setup já recusa banco que não é de teste, mas só quando a
// config da API é lida. Rodar o vitest da raiz do monorepo pula essa
// config, e o Prisma cai no .env do pacote do banco — o de
// desenvolvimento. Aconteceu em 2026-10-04; o TRUNCATE só não apagou o
// banco de dev porque o teste falhou antes. A trava mora também aqui,
// em quem trunca, e pergunta o nome ao próprio Postgres.
export function exigirBancoDeTeste(nome: string): void {
  if (!nome.endsWith("_test")) {
    throw new Error(
      `limparBanco recusou truncar "${nome || "?"}": só banco *_test. ` +
        "Rode os testes da API com `pnpm --filter @barchop/api test`."
    );
  }
}

export async function limparBanco(): Promise<void> {
  const [{ banco }] = await prisma.$queryRaw<{ banco: string }[]>`SELECT current_database() AS banco`;
  exigirBancoDeTeste(banco ?? "");
  const lista = TABELAS.map((t) => `"${t}"`).join(", ");
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${lista} RESTART IDENTITY CASCADE`
  );
}
