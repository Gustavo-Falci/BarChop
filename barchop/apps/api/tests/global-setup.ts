import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Aplica a migration inicial no banco de teste, uma vez, antes de
// qualquer arquivo de teste. `migrate deploy` e não `migrate dev`:
// dev tentaria gerar uma migration nova a partir do schema.prisma, e a
// migration inicial tem SQL escrito à mão (a EXCLUDE constraint) que
// não sai do schema declarativo.
export default function setup(): void {
  const pastaDatabase = fileURLToPath(
    new URL("../../../packages/database", import.meta.url)
  );

  // A suíte trunca todas as tabelas entre os casos. Se o .env.test não
  // existir, o dotenv falha em silêncio e o DATABASE_URL do shell passa
  // adiante — e o TRUNCATE cairia no banco de desenvolvimento. Melhor
  // não rodar do que rodar no banco errado.
  const url = process.env.DATABASE_URL ?? "";
  let banco = "";
  try {
    // A URL nunca é impressa: ela carrega a senha do banco. Um caractere
    // especial não escapado na senha faz o construtor lançar, e o rastro
    // dessa exceção levaria a string inteira junto — por isso o catch.
    banco = url ? new URL(url).pathname.replace(/^\//, "") : "";
  } catch {
    banco = "";
  }

  if (!banco.endsWith("_test")) {
    throw new Error(
      `DATABASE_URL não aponta pro banco de teste (encontrado: "${banco || "vazio"}"). ` +
        `Confira o apps/api/.env.test — a suíte trunca todas as tabelas e se recusa a rodar fora de um banco *_test.`
    );
  }

  // execSync com uma string só, em vez de execFileSync com array de
  // argumentos: no Windows o pnpm é um .cmd, que o execFile só executa
  // com `shell: true` — e essa combinação (shell mais array) dispara o
  // aviso DEP0190 do Node em toda rodada de teste.
  execSync("pnpm exec prisma migrate deploy", {
    cwd: pastaDatabase,
    env: { ...process.env },
    stdio: "inherit",
  });
}
