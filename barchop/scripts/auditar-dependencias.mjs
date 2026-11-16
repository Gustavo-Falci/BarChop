// Falha quando uma dependência do que vai pra produção (a API, o web e
// os pacotes internos) tem falha conhecida alta ou crítica. Roda no CI
// (.github/workflows/ci.yml) — auditoria de segurança de 15/11, SEC-016.
//
// Por que não o `pnpm audit --audit-level=high` direto: ele olha o
// lockfile inteiro, e o apps/mobile (Expo, que ainda não é publicado)
// arrasta ferramentas de build com avisos que não chegam a ninguém. O
// job ficaria vermelho pra sempre, e job sempre vermelho ninguém lê.
// Aqui o aviso só do mobile é listado, mas não derruba.
//
// Uso (de barchop/): node scripts/auditar-dependencias.mjs
import { spawnSync } from "node:child_process";

const GRAVES = new Set(["high", "critical"]);
// O caminho começa pelo pacote do workspace que puxa a dependência; no
// Windows vem com barra invertida.
const DO_MOBILE = /^apps[\\/]mobile(\s|$)/;
// Com o node-linker=hoisted o que sobe pra raiz aparece também como
// vindo de ".": sozinho não diz de quem é.
const DA_RAIZ = /^\.(\s|$)/;

// Uma string só, com shell: no Windows o pnpm é um .cmd, e shell mais
// array de argumentos dispara o aviso DEP0190 do Node.
const execucao = spawnSync("pnpm audit --prod --json", {
  encoding: "utf8",
  shell: true,
  maxBuffer: 64 * 1024 * 1024,
});

let relatorio;
try {
  relatorio = JSON.parse(execucao.stdout);
} catch {
  // Sem resposta do registro não dá pra dizer que está limpo.
  console.error("o pnpm audit não devolveu JSON (registro fora do ar?):");
  console.error((execucao.stderr || execucao.stdout || "").slice(0, 2000));
  process.exit(1);
}
if (relatorio.error) {
  console.error(`o pnpm audit falhou: ${relatorio.error.message ?? JSON.stringify(relatorio.error)}`);
  process.exit(1);
}

const avisos = Object.values(relatorio.advisories ?? {});
const graves = avisos.filter((aviso) => GRAVES.has(aviso.severity));

// Só do mobile: pelo menos um caminho passa pelo apps/mobile, e nenhum
// passa por outro pacote. Na dúvida (caminho só da raiz), conta.
function soDoMobile(aviso) {
  const caminhos = aviso.findings.flatMap((achado) => achado.paths);
  return (
    caminhos.some((caminho) => DO_MOBILE.test(caminho)) &&
    caminhos.every((caminho) => DO_MOBILE.test(caminho) || DA_RAIZ.test(caminho))
  );
}

function linha(aviso) {
  const versoes = [...new Set(aviso.findings.map((achado) => achado.version))].join(", ");
  return `  ${aviso.severity.padEnd(8)} ${aviso.module_name}@${versoes} — ${aviso.title} (${aviso.github_advisory_id}; corrigido em ${aviso.patched_versions})`;
}

const derrubam = graves.filter((aviso) => !soDoMobile(aviso));
const toleradas = graves.filter(soDoMobile);

console.log(`${avisos.length} aviso(s) no total; ${graves.length} alto(s) ou crítico(s).`);
if (toleradas.length > 0) {
  console.log("\nSó no apps/mobile (não publicado) — não derruba, mas resolva antes de publicar o app:");
  for (const aviso of toleradas) console.log(linha(aviso));
}
if (derrubam.length > 0) {
  console.error("\nNo que vai pra produção:");
  for (const aviso of derrubam) {
    console.error(linha(aviso));
    const caminhos = aviso.findings.flatMap((achado) => achado.paths).filter((caminho) => !DO_MOBILE.test(caminho));
    for (const caminho of caminhos.slice(0, 5)) console.error(`      ${caminho}`);
  }
  process.exit(1);
}
console.log("\nNada alto nem crítico no que vai pra produção.");
