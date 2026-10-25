import { describe, expect, it } from "vitest";
import { normalizarCpf } from "../src/index";

// O CPF do assinante online (marco 3, PR 10c): o Asaas não cobra sem ele.
// Guardado só com os 11 dígitos.
describe("normalizarCpf", () => {
  it("aceita com ou sem máscara e devolve os 11 dígitos", () => {
    expect(normalizarCpf("529.982.247-25")).toBe("52998224725");
    expect(normalizarCpf(" 52998224725 ")).toBe("52998224725");
    expect(normalizarCpf("111.444.777-35")).toBe("11144477735");
  });

  it("recusa dígito verificador errado, tamanho errado e todos iguais", () => {
    expect(normalizarCpf("529.982.247-24")).toBeNull();
    expect(normalizarCpf("5299822472")).toBeNull();
    expect(normalizarCpf("529982247250")).toBeNull();
    expect(normalizarCpf("111.111.111-11")).toBeNull();
    expect(normalizarCpf("")).toBeNull();
  });
});
