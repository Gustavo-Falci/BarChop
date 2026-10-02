import { describe, expect, it } from "vitest";
import { ErroDeNegocio } from "../../src/lib/erro-negocio";
import { normalizarTelefone } from "../../src/lib/telefone";

// A regra de telefone mora em @barchop/formato, e o erro que ela
// lança não sabe o que é HTTP. As rotas respondem 422 com
// `telefone_invalido` desde a fase 6, e existe teste de rota contando
// com isso — este arquivo é o que garante que a tradução continua
// acontecendo depois de a regra ter saído da API.
describe("adaptador de telefone da API", () => {
  it("traduz o erro do pacote no ErroDeNegocio que as rotas respondem", () => {
    try {
      normalizarTelefone("99999-8888");
      expect.unreachable("normalizarTelefone deveria ter lançado");
    } catch (erro) {
      expect(erro).toBeInstanceOf(ErroDeNegocio);
      expect((erro as ErroDeNegocio).status).toBe(422);
      expect((erro as ErroDeNegocio).codigo).toBe("telefone_invalido");
    }
  });

  it("continua devolvendo o formato guardado pro caminho feliz", () => {
    expect(normalizarTelefone("+55 11 99999-8888")).toBe("(11) 99999-8888");
  });
});
