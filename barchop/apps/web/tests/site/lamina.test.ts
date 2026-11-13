import { describe, expect, it } from "vitest";
import { laminaEm } from "../../src/site/abertura/lamina";

// Home nova, marco 5: na abertura, a lâmina da navalha fecha ao lado do
// cabo como uma barra reta e se deforma nas duas barrigas do B da marca
// (o mesmo traço do MarcaDoBarChop: reta, meia-volta de raio 24 e 33,
// reta). As duas formas têm as mesmas 8 curvas, e deformar é andar cada
// número de uma para a outra.

// Os dois trechos do path ("M… C… C… C… C…"), cada um como pares [x, y].
function trechos(d: string): [number, number][][] {
  return d
    .split("M")
    .filter(Boolean)
    .map((trecho) => {
      const n = trecho.replace(/C/g, " ").trim().split(/\s+/).map(Number);
      const pares: [number, number][] = [];
      for (let i = 0; i < n.length; i += 2) pares.push([n[i], n[i + 1]]);
      return pares;
    });
}

describe("laminaEm", () => {
  it("fechada (0) é a barra reta ao lado do cabo, em x = 92, de 52 a 166", () => {
    const [cima, baixo] = trechos(laminaEm(0));
    for (const [x] of [...cima, ...baixo]) expect(x).toBe(92);
    expect(cima[0]).toEqual([92, 52]);
    expect(baixo.at(-1)).toEqual([92, 166]);
  });

  it("no B (1), as duas barrigas da marca: raio 24 em cima e 33 embaixo, voltando ao cabo", () => {
    const [cima, baixo] = trechos(laminaEm(1));
    expect(cima[0]).toEqual([80, 52]);
    expect(cima.at(-1)).toEqual([80, 100]);
    expect(Math.max(...cima.map(([x]) => x))).toBe(110 + 24);
    expect(baixo[0]).toEqual([80, 100]);
    expect(baixo.at(-1)).toEqual([80, 166]);
    expect(Math.max(...baixo.map(([x]) => x))).toBe(116 + 33);
  });

  it("no meio, cada número está no meio do caminho", () => {
    const [cima] = trechos(laminaEm(0.5));
    expect(cima[0]).toEqual([86, 52]);
  });

  it("as duas formas têm as mesmas 8 curvas, 4 por barriga", () => {
    for (const t of [0, 0.3, 1]) {
      const d = laminaEm(t);
      expect(d.match(/M/g)).toHaveLength(2);
      expect(d.match(/C/g)).toHaveLength(8);
    }
  });

  it("fora de 0..1, fica na ponta", () => {
    expect(laminaEm(-1)).toBe(laminaEm(0));
    expect(laminaEm(2)).toBe(laminaEm(1));
  });
});
