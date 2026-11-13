import { describe, expect, it } from "vitest";
import { QUADROS_MEDIDOS, podeTer3D, quadrosLentos, type Ambiente } from "../../src/site/cena/podeTer3D";

// Home nova, marco 3: quem fica só com a imagem parada da cadeira.
// Antes de baixar qualquer coisa, o aparelho passa por estas portas; o
// que o navegador não informa não conta contra.
const BOM: Ambiente = {
  reduzido: false,
  webgl2: true,
  economia: false,
  memoria: 8,
  nucleos: 8,
  conexao: "4g",
};

describe("pode ter 3D", () => {
  it("aparelho bom ganha a cadeira 3D", () => {
    expect(podeTer3D(BOM)).toBe(true);
  });

  it("navegador que não informa memória, núcleos nem conexão também ganha", () => {
    expect(
      podeTer3D({ reduzido: false, webgl2: true, economia: false, memoria: undefined, nucleos: undefined, conexao: undefined })
    ).toBe(true);
  });

  it("com reduzir movimento, fica a imagem", () => {
    expect(podeTer3D({ ...BOM, reduzido: true })).toBe(false);
  });

  it("sem WebGL2, fica a imagem", () => {
    expect(podeTer3D({ ...BOM, webgl2: false })).toBe(false);
  });

  it("com economia de dados, fica a imagem", () => {
    expect(podeTer3D({ ...BOM, economia: true })).toBe(false);
  });

  it("pouca memória ou poucos núcleos, fica a imagem", () => {
    expect(podeTer3D({ ...BOM, memoria: 2 })).toBe(false);
    expect(podeTer3D({ ...BOM, nucleos: 2 })).toBe(false);
    expect(podeTer3D({ ...BOM, memoria: 4, nucleos: 4 })).toBe(true);
  });

  it("conexão de 2G, fica a imagem", () => {
    expect(podeTer3D({ ...BOM, conexao: "2g" })).toBe(false);
    expect(podeTer3D({ ...BOM, conexao: "slow-2g" })).toBe(false);
    expect(podeTer3D({ ...BOM, conexao: "3g" })).toBe(true);
  });
});

describe("quadros lentos", () => {
  const quadros = (ms: number) => Array.from({ length: QUADROS_MEDIDOS }, () => ms);

  it("só decide depois de medir os quadros todos", () => {
    expect(quadrosLentos([90, 90, 90])).toBe(false);
  });

  it("mediana acima de 40 ms volta pra imagem", () => {
    expect(quadrosLentos(quadros(50))).toBe(true);
    expect(quadrosLentos(quadros(17))).toBe(false);
  });

  it("um engasgo só (a compilação dos shaders) não derruba", () => {
    const comEngasgo = quadros(16);
    comEngasgo[0] = 400;
    comEngasgo[1] = 120;
    expect(quadrosLentos(comEngasgo)).toBe(false);
  });
});
