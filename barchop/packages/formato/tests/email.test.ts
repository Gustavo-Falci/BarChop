import { describe, expect, it } from "vitest";
import { normalizarEmail } from "../src/index";

describe("normalizarEmail", () => {
  it("reduz caixa e espaços à forma guardada", () => {
    expect(normalizarEmail("  Gu@Exemplo.COM ")).toBe("gu@exemplo.com");
  });

  it("devolve null pra ausência", () => {
    expect(normalizarEmail(null)).toBeNull();
    expect(normalizarEmail(undefined)).toBeNull();
    expect(normalizarEmail("")).toBeNull();
  });
});
