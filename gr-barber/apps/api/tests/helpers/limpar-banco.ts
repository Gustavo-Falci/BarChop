import { prisma } from "@gr-barber/database";

// TRUNCATE ... CASCADE em vez de deleteMany por tabela: é mais rápido e
// não depende de acertar a ordem das foreign keys.
const TABELAS = [
  "codigo_verificacao",
  "agendamento_servico",
  "agendamento",
  "servico",
  "horario_funcionamento",
  "barbeiro",
  "cliente",
  "barbearia",
];

export async function limparBanco(): Promise<void> {
  const lista = TABELAS.map((t) => `"${t}"`).join(", ");
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${lista} RESTART IDENTITY CASCADE`
  );
}
