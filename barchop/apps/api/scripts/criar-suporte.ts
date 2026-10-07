// Cria uma conta de suporte da plataforma (bloco F4). É a única porta:
// não existe rota que crie suporte, de propósito.
//
// Uso, na VM ou em desenvolvimento (de barchop/):
//   SENHA_DO_SUPORTE='...' pnpm --filter @barchop/api criar-suporte "Nome" email@barchop.com.br
//
// Em produção o script vai no bundle (tsup.config.ts) e roda dentro do
// contêiner da API, que não tem pnpm nem tsx: ver infra/README.md.
//
// A senha vem do ambiente, e não de um argumento, pra não ficar no
// histórico do shell. Mínimo de 12 caracteres.
import { prisma } from "@barchop/database";
import { criarOperadorDeSuporte } from "../src/lib/suporte";

async function main() {
  const [nome, email] = process.argv.slice(2);
  const senha = process.env.SENHA_DO_SUPORTE ?? "";
  if (!nome || !email) {
    throw new Error('uso: SENHA_DO_SUPORTE=... pnpm --filter @barchop/api criar-suporte "Nome" email');
  }
  const operador = await criarOperadorDeSuporte({ nome, email, senha });
  console.log(`conta de suporte criada: ${operador.nome} <${operador.email}>`);
}

main()
  .catch((erro: unknown) => {
    console.error(erro instanceof Error ? erro.message : erro);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
