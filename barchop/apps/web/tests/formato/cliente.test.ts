import { describe, expect, it } from "vitest";
import {
  EMAIL_MAX,
  NOME_MAX,
  validarEmailDeCliente,
  validarNomeDeCliente,
} from "../../src/formato/cliente";

// Direto no validador, e não só pela tela: o dublê da API aceita o que a
// API recusa, então um teste que digita um e-mail torto no formulário e
// espera um erro passaria com a guarda errada — bastaria a tela mostrar
// qualquer mensagem. Aqui o que está sob teste é o limite em si, que é o
// que precisa continuar espelhando apps/api/src/routers/clientes.ts.
describe("validarNomeDeCliente", () => {
  it("recusa o vazio e o de uma letra — a API exige dois caracteres", () => {
    expect(validarNomeDeCliente("")).toEqual({
      erro: "Escreva o nome do cliente.",
    });
    expect(validarNomeDeCliente("   ")).toEqual({
      erro: "Escreva o nome do cliente.",
    });
    expect(validarNomeDeCliente("A")).toEqual({
      erro: "Escreva o nome do cliente.",
    });
  });

  it("conta o limite depois do trim, como a API conta", () => {
    // O espaço em volta não é enviado, então não pode ser o que reprova.
    const noLimite = "a".repeat(NOME_MAX);
    expect(validarNomeDeCliente(`  ${noLimite}  `)).toEqual({ valor: noLimite });
    expect(validarNomeDeCliente("a".repeat(NOME_MAX + 1))).toEqual({
      erro: `No máximo ${NOME_MAX} caracteres.`,
    });
  });

  it("devolve o nome já aparado", () => {
    expect(validarNomeDeCliente("  Ana Souza ")).toEqual({ valor: "Ana Souza" });
  });
});

describe("validarEmailDeCliente", () => {
  it("vazio é null, não erro: o campo é opcional", () => {
    expect(validarEmailDeCliente("")).toEqual({ valor: null });
    expect(validarEmailDeCliente("   ")).toEqual({ valor: null });
  });

  it("recusa o que o PADRAO_EMAIL da API recusaria", () => {
    for (const torto of ["ana", "ana@", "@exemplo.com", "ana@exemplo", "a na@e.com"]) {
      expect(validarEmailDeCliente(torto)).toEqual({
        erro: "Use um endereço como ana@exemplo.com",
      });
    }
  });

  it("aplica o mesmo normalizarEmail da gravação", () => {
    // Sem isto a tela mandaria "Ana@Exemplo.com" e o banco guardaria
    // minúsculo — o que voltasse do GET não seria o que foi digitado.
    expect(validarEmailDeCliente(" Ana@Exemplo.COM ")).toEqual({
      valor: "ana@exemplo.com",
    });
  });

  it("para no comprimento máximo da coluna", () => {
    const longo = `${"a".repeat(EMAIL_MAX)}@exemplo.com`;
    expect(validarEmailDeCliente(longo)).toEqual({
      erro: `No máximo ${EMAIL_MAX} caracteres.`,
    });
  });
});
