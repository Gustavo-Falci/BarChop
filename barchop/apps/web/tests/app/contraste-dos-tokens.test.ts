import { colors } from "@barchop/design-tokens";
import { describe, expect, it } from "vitest";
import { cssDeTokens } from "../../app/tokens-css";

// Contraste WCAG 2.x entre duas cores #rrggbb.
function luminancia(hex: string): number {
  const canais = [1, 3, 5].map((inicio) => parseInt(hex.slice(inicio, inicio + 2), 16) / 255);
  const [r, g, b] = canais.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contraste(a: string, b: string): number {
  const [clara, escura] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (clara! + 0.05) / (escura! + 0.05);
}

// Os selos do painel ("Configurado", "Faltando", o erro) pintam o texto
// com a cor forte do estado sobre o fundo claro do mesmo estado — e o
// mesmo texto aparece solto sobre a surface (o "Configurar →" em âmbar
// da lista de Configurações). Os dois pares precisam ler nos dois temas.
const ESTADOS = [
  ["ok", "okFundo"],
  ["atencao", "atencaoFundo"],
  ["erro", "erroFundo"],
] as const;

describe("contraste dos tokens de estado", () => {
  for (const tema of ["light", "dark"] as const) {
    const cores: Record<string, string> = colors[tema];

    for (const [texto, fundo] of ESTADOS) {
      it(`${tema}: ${texto} sobre ${fundo} passa 4,5:1`, () => {
        expect(contraste(cores[texto]!, cores[fundo]!)).toBeGreaterThanOrEqual(4.5);
      });

      it(`${tema}: ${texto} sobre a surface passa 4,5:1`, () => {
        expect(contraste(cores[texto]!, cores.surface!)).toBeGreaterThanOrEqual(4.5);
      });

      it(`${tema}: ${fundo} se distingue da surface`, () => {
        // Um fundo de selo igual à surface não desenha selo nenhum.
        expect(cores[fundo]).toBeDefined();
        expect(cores[fundo]).not.toBe(cores.surface);
      });
    }
  }

  it("as cores novas viram custom property", () => {
    expect(cssDeTokens).toContain("--cor-ok:");
    expect(cssDeTokens).toContain("--cor-atencao-fundo:");
    expect(cssDeTokens).toContain("--cor-erro-fundo:");
  });
});

// O texto de apoio (a data sob o título, a ajuda sob o campo, o
// placeholder) aparece sobre os três fundos do painel: o papel, o
// cartão e o papel suave dos blocos e trilhos. Os três precisam ler.
const TEXTOS_DE_APOIO = ["ink", "inkSoft", "muted", "placeholder"] as const;
const FUNDOS = ["paper", "paperFim", "surface", "paperSoft"] as const;

describe("contraste do texto sobre os fundos", () => {
  for (const tema of ["light", "dark"] as const) {
    const cores: Record<string, string> = colors[tema];

    for (const texto of TEXTOS_DE_APOIO) {
      for (const fundo of FUNDOS) {
        it(`${tema}: ${texto} sobre ${fundo} passa 4,5:1`, () => {
          expect(contraste(cores[texto]!, cores[fundo]!)).toBeGreaterThanOrEqual(4.5);
        });
      }
    }

    it(`${tema}: o texto sobre a cor da marca passa 4,5:1`, () => {
      expect(contraste(cores.onAccent!, cores.accent!)).toBeGreaterThanOrEqual(4.5);
    });

    it(`${tema}: o texto sobre o selecionado (paleYellow) passa 4,5:1`, () => {
      expect(contraste(cores.ink!, cores.paleYellow!)).toBeGreaterThanOrEqual(4.5);
    });

    // O ícone e o texto em ouro do item ativo: o ouro da marca puro some
    // no creme do claro, então há um tom próprio pra texto.
    for (const fundo of ["paleYellow", "surface", "paperSoft"] as const) {
      it(`${tema}: a marca como texto sobre ${fundo} passa 4,5:1`, () => {
        expect(contraste(cores.accentText!, cores[fundo]!)).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
});

// A moldura virou fio de 1px com sombra difusa. A sombra deixa de ser
// clara no escuro (a cor do texto contornando tudo era a "moldura
// clara" que brilhava): nos dois temas ela é preta translúcida.
describe("moldura e sombra", () => {
  it("a sombra é escura nos dois temas", () => {
    expect(colors.light.shadow).toBe("#000000");
    expect(colors.dark.shadow).toBe("#000000");
  });

  it("a borda padrão é o fio de 1px", () => {
    expect(cssDeTokens).toContain("--borda-padrao: 1px;");
  });

  it("o fio forte e o fim do degradê viram custom property", () => {
    expect(cssDeTokens).toContain("--cor-line-strong:");
    expect(cssDeTokens).toContain("--cor-paper-fim:");
  });

  it("as sombras difusas têm valor no claro e no escuro", () => {
    const [claro, ...escuros] = cssDeTokens.split("prefers-color-scheme: dark");
    for (const sombra of ["--sombra-1:", "--sombra-2:", "--sombra-botao:"]) {
      expect(claro).toContain(sombra);
      expect(escuros.join("")).toContain(sombra);
    }
  });
});
