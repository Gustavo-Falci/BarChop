import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

// As fontes saem do repositório, nunca da internet: o build da imagem do
// web chegou a quebrar na VM porque o next/font/google não conseguiu
// baixar a Inter do fonts.gstatic.com. O dublê do google lança — se o
// app/fontes.ts voltar a usar, a importação quebra aqui.
// `vi.hoisted`: o vi.mock sobe pro topo do arquivo, antes de qualquer
// `const` comum.
const chamadasLocais = vi.hoisted(
  () => [] as { src: { path: string }[]; variable: string; preload?: boolean }[]
);

vi.mock("next/font/local", () => ({
  default: (opcoes: { src: { path: string }[]; variable: string; preload?: boolean }) => {
    chamadasLocais.push(opcoes);
    return { variable: opcoes.variable };
  },
}));

vi.mock("next/font/google", () => {
  throw new Error("as fontes não podem vir do Google no build");
});

describe("fontes do app", () => {
  it("vêm todas do repositório, com o arquivo no lugar", async () => {
    const fontes = await import("../../app/fontes");

    expect(fontes.inter.variable).toBe("--fonte-corpo");
    expect(fontes.clashGrotesk.variable).toBe("--fonte-display");
    // O `path` do next/font/local é relativo ao app/fontes.ts; o vitest
    // roda com o cwd em apps/web.
    expect(chamadasLocais.length).toBe(7);
    for (const { path } of chamadasLocais.flatMap((chamada) => chamada.src)) {
      expect(existsSync(resolve(process.cwd(), "app", path)), path).toBe(true);
    }
  });

  // As cinco da Aparência (marco F): só a página pública que escolheu uma
  // delas baixa o arquivo — sem pré-carga, a @font-face só busca quando
  // alguém usa a família.
  it("as fontes da Aparência, sem pré-carga", async () => {
    const fontes = await import("../../app/fontes");

    expect(fontes.FONTES_DA_APARENCIA.map((fonte) => fonte.variable)).toEqual([
      "--fonte-roboto",
      "--fonte-poppins",
      "--fonte-montserrat",
      "--fonte-open-sans",
      "--fonte-lato",
    ]);
    const daAparencia = chamadasLocais.filter((chamada) => chamada.variable !== "--fonte-corpo" && chamada.variable !== "--fonte-display");
    expect(daAparencia).toHaveLength(5);
    for (const chamada of daAparencia) expect(chamada.preload).toBe(false);
  });
});
