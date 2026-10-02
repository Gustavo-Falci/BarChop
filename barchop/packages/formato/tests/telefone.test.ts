import { describe, expect, it } from "vitest";
import {
  apenasDigitos,
  formatarTelefoneParcial,
  normalizarTelefone,
  normalizarTelefoneObrigatorio,
  TelefoneInvalido,
} from "../src/index";

describe("normalizarTelefone", () => {
  it("guarda celular com DDD no formato do cadastro", () => {
    expect(normalizarTelefone("11999998888")).toBe("(11) 99999-8888");
  });

  it("guarda fixo com DDD no formato do cadastro", () => {
    expect(normalizarTelefone("1133334444")).toBe("(11) 3333-4444");
  });

  it("reduz as várias formas do mesmo número a uma só", () => {
    const formas = [
      "11999998888",
      "(11) 99999-8888",
      "(11)99999-8888",
      "11 99999 8888",
      "11-99999-8888",
      "+55 11 99999-8888",
      "+5511999998888",
      "5511999998888",
    ];

    // É esta linha que fecha a dívida: com @@unique([barbeariaId,
    // telefone]), cada forma diferente valendo uma linha distinta é o
    // que permitia a mesma pessoa ter vários cadastros reivindicáveis.
    for (const forma of formas) {
      expect(normalizarTelefone(forma)).toBe("(11) 99999-8888");
    }
  });

  it("não confunde o DDD 55 com o código do país", () => {
    // Santa Maria (RS) é DDD 55. Dez dígitos começando em 55 são um
    // fixo de lá, não um número com código de país e sem DDD.
    expect(normalizarTelefone("5533334444")).toBe("(55) 3333-4444");
    expect(normalizarTelefone("551133334444")).toBe("(11) 3333-4444");
  });

  it("devolve null pra ausência, como o normalizarEmail faz", () => {
    expect(normalizarTelefone(null)).toBeNull();
    expect(normalizarTelefone(undefined)).toBeNull();
    expect(normalizarTelefone("")).toBeNull();
  });

  it("recusa número sem DDD", () => {
    // O schema barra antes, com 400. Esta é a rede de baixo: se algum
    // caminho futuro chamar sem passar pelo pattern, o pedido morre
    // aqui em vez de gravar um formato que a chave única não reconhece.
    expect(() => normalizarTelefone("99999-8888")).toThrow(TelefoneInvalido);
  });

  it("recusa contagem de dígitos que não é telefone brasileiro", () => {
    expect(() => normalizarTelefone("12345")).toThrow(TelefoneInvalido);
    expect(() => normalizarTelefone("119999988889")).toThrow(TelefoneInvalido);
  });

  it("recusa telefone ausente quando ele é obrigatório", () => {
    expect(() => normalizarTelefoneObrigatorio("")).toThrow(TelefoneInvalido);
  });
});

describe("formatarTelefoneParcial", () => {
  // A tela chama isto a cada tecla. Lançar no meio da digitação
  // apagaria o campo do usuário antes de ele terminar de digitar — por
  // isso esta função nunca lança, e quem valida é o normalizar.
  it("formata enquanto o número ainda está incompleto", () => {
    expect(formatarTelefoneParcial("")).toBe("");
    expect(formatarTelefoneParcial("1")).toBe("(1");
    expect(formatarTelefoneParcial("11")).toBe("(11)");
    expect(formatarTelefoneParcial("119")).toBe("(11) 9");
    expect(formatarTelefoneParcial("1199999")).toBe("(11) 99999");
    expect(formatarTelefoneParcial("11999998")).toBe("(11) 99999-8");
  });

  it("chega no formato guardado quando o número fica completo", () => {
    expect(formatarTelefoneParcial("11999998888")).toBe("(11) 99999-8888");
    expect(formatarTelefoneParcial("1133334444")).toBe("(11) 3333-4444");
  });

  it("ignora o que não é dígito e o excedente", () => {
    expect(formatarTelefoneParcial("+55 (11) 99999-8888")).toBe(
      "(11) 99999-8888"
    );
    expect(formatarTelefoneParcial("119999988881234")).toBe("(11) 99999-8888");
  });
});

describe("apenasDigitos", () => {
  it("tira a pontuação pra comparação dígito a dígito", () => {
    expect(apenasDigitos("(11) 99999-8888")).toBe("11999998888");
  });
});
