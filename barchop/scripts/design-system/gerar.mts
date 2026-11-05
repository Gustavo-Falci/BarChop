// Gera, em saida/project/, os arquivos do artefato Design System do BarChop:
// tokens.json, README.md, a capa, a Inter, o pacote de componentes e os cartões.
// O índice (project/design-system.json) mora no artefato e não sai daqui.
// Uso (de barchop/): pnpm design-system
import { cpSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { AQUI, REPO, SAIDA } from "./caminhos.mts";

rmSync(SAIDA, { recursive: true, force: true });
mkdirSync(SAIDA, { recursive: true });

await import("./tokens.mts");
await import("./pacote.mts");
await import("./cartoes.mts");

// O texto da marca e a capa são escritos à mão: vêm de conteudo/ como estão.
cpSync(join(AQUI, "conteudo", "README.md"), join(SAIDA, "README.md"));
cpSync(join(AQUI, "conteudo", "Cover"), join(SAIDA, "components", "Cover"), { recursive: true });

// Só a Inter (OFL). A Clash Grotesk não sai daqui: a licença da Fontshare não
// permite disponibilizá-la em plataforma ou ferramenta de terceiros.
for (const arquivo of ["Inter-Regular-latin.woff2", "Inter-SemiBold-latin.woff2"]) {
  cpSync(join(REPO, "font", "Inter", arquivo), join(SAIDA, "fonts", arquivo));
}
cpSync(join(REPO, "font", "Inter", "LICENSE.txt"), join(SAIDA, "licencas", "Inter-OFL.txt"));

function listar(pasta: string): string[] {
  return readdirSync(pasta).flatMap((nome) => {
    const caminho = join(pasta, nome);
    return statSync(caminho).isDirectory() ? listar(caminho) : [caminho];
  });
}
const arquivos = listar(SAIDA);
console.log(`\n${arquivos.length} arquivos em ${relative(REPO, SAIDA)}/:`);
for (const arquivo of arquivos) console.log("  project/" + relative(SAIDA, arquivo).replace(/\\/g, "/"));
