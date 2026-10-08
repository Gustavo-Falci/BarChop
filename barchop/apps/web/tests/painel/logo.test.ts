import { describe, expect, it } from "vitest";
import { sugerirFormatoDaLogo, type PixelsDaImagem } from "../../src/painel/logo";

// A sugestão da moldura sai dos pixels do arquivo que o dono escolheu,
// antes do envio. Imagens sintéticas: cada pixel é preenchido por uma
// função (x, y) → [r, g, b, a].
function imagem(
  largura: number,
  altura: number,
  pixel: (x: number, y: number) => [number, number, number, number]
): PixelsDaImagem {
  const data = new Uint8ClampedArray(largura * altura * 4);
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      data.set(pixel(x, y), (y * largura + x) * 4);
    }
  }
  return { width: largura, height: altura, data };
}

const PRETO: [number, number, number, number] = [20, 20, 20, 255];
const BRANCO: [number, number, number, number] = [255, 255, 255, 255];
const NADA: [number, number, number, number] = [0, 0, 0, 0];

function dentroDoCirculo(x: number, y: number, lado: number) {
  const r = lado / 2;
  return (x + 0.5 - r) ** 2 + (y + 0.5 - r) ** 2 <= r * r;
}

describe("sugerirFormatoDaLogo", () => {
  it("círculo cheio com fundo transparente é redonda", () => {
    const logo = imagem(100, 100, (x, y) => (dentroDoCirculo(x, y, 100) ? PRETO : NADA));

    expect(sugerirFormatoDaLogo(logo)).toBe("redonda");
  });

  it("quadrado cheio até a borda é quadrada", () => {
    expect(sugerirFormatoDaLogo(imagem(100, 100, () => PRETO))).toBe("quadrada");
  });

  it("logo redonda sobre fundo branco opaco vira quadrada: o fundo faz parte da imagem", () => {
    // É o caso em que a detecção não tem como saber — o dono troca na
    // tela. Sugerir quadrada não corta nada do desenho.
    const logo = imagem(100, 100, (x, y) => (dentroDoCirculo(x, y, 100) ? PRETO : BRANCO));

    expect(sugerirFormatoDaLogo(logo)).toBe("quadrada");
  });

  it("logo larga é sem moldura, qualquer que seja o fundo", () => {
    expect(sugerirFormatoDaLogo(imagem(300, 100, () => PRETO))).toBe("livre");
    expect(sugerirFormatoDaLogo(imagem(100, 300, () => PRETO))).toBe("livre");
  });

  it("desenho solto com fundo transparente (não é círculo) é sem moldura", () => {
    // Uma barra horizontal no meio: cantos transparentes, mas a borda do
    // círculo inscrito fica quase toda vazia.
    const logo = imagem(100, 100, (_x, y) => (y >= 40 && y < 60 ? PRETO : NADA));

    expect(sugerirFormatoDaLogo(logo)).toBe("livre");
  });

  it("quase quadrada (até 1,2 de proporção) ainda conta como quadrada", () => {
    expect(sugerirFormatoDaLogo(imagem(110, 100, () => PRETO))).toBe("quadrada");
  });

  it("imagem vazia ou toda transparente é sem moldura", () => {
    expect(sugerirFormatoDaLogo(imagem(0, 0, () => NADA))).toBe("livre");
    expect(sugerirFormatoDaLogo(imagem(50, 50, () => NADA))).toBe("livre");
  });
});
