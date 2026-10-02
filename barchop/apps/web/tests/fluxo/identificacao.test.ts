import { describe, expect, it } from "vitest";
import { validarDados } from "../../src/fluxo/identificacao";

describe("validar os dados de quem vai ser atendido", () => {
  it("devolve nome aparado e telefone no formato que a API guarda", () => {
    // O telefone precisa sair normalizado: é por ele que a API acha o
    // cadastro. Um formato diferente cria um cliente duplicado — e a
    // resposta é 201 igual, então nada na tela denunciaria.
    expect(validarDados("  João  ", "11999998888")).toEqual({
      ok: true,
      dados: { nome: "João", telefone: "(11) 99999-8888" },
    });
  });

  it("aponta cada campo errado separadamente", () => {
    // Um erro por campo: nome vazio não pode mostrar a instrução de DDD
    // do telefone, que está certo.
    expect(validarDados("   ", "11999998888")).toEqual({
      ok: false,
      erros: { nome: "Informe seu nome", telefone: undefined },
    });
    expect(validarDados("João", "9999")).toEqual({
      ok: false,
      erros: {
        nome: undefined,
        telefone: "Informe o DDD e o número, como (11) 99999-8888",
      },
    });
  });

  it("telefone vazio também pede o DDD", () => {
    const resultado = validarDados("João", "");
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.erros.telefone).toBe(
        "Informe o DDD e o número, como (11) 99999-8888"
      );
    }
  });
});
