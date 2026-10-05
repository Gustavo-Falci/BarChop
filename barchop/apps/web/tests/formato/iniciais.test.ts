import { describe, expect, it } from "vitest";
import { iniciais } from "../../src/formato/iniciais";

// O monograma da fachada (barbearia sem capa) e o da equipe (membro sem
// foto). Até duas letras, das palavras que contam.
describe("iniciais", () => {
  it("duas palavras viram duas letras maiúsculas", () => {
    expect(iniciais("GR Barber")).toBe("GB");
    expect(iniciais("gustavo falci")).toBe("GF");
  });

  it("pula as preposições do nome", () => {
    expect(iniciais("Barbearia do Zé")).toBe("BZ");
    expect(iniciais("Corte da Esquina")).toBe("CE");
  });

  it("de três palavras ou mais, a primeira e a última", () => {
    expect(iniciais("Ana Paula Souza")).toBe("AS");
  });

  it("uma palavra só vira uma letra", () => {
    expect(iniciais("TESTE1")).toBe("T");
  });

  it("mantém o acento", () => {
    expect(iniciais("Ébano Barbearia")).toBe("ÉB");
  });

  it("ignora o que não começa com letra ou número", () => {
    expect(iniciais("@ Navalha & Cia")).toBe("NC");
  });

  it("nome vazio não inventa letra", () => {
    expect(iniciais("   ")).toBe("");
  });
});
