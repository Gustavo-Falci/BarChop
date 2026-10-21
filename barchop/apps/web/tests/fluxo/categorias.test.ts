import { describe, expect, it } from "vitest";
import type { CategoriaDeServico, ServicoSerializado } from "@barchop/types";
import { agruparPorCategoria } from "../../src/fluxo/categorias";

// As seções da página pública e do passo de serviços seguem a ordem de
// categorias que o dono arrastou no painel (arrastar e reordenar, PR 4).

function servico(id: string, categoria: CategoriaDeServico | null): ServicoSerializado {
  return {
    id,
    nome: `Serviço ${id}`,
    duracaoMinutos: 30,
    preco: "40.00",
    ativo: true,
    categoria,
    descricao: null,
    fotoUrl: null,
  };
}

describe("seções de serviço da página", () => {
  it("sem ordem salva, a ordem padrão das categorias", () => {
    const grupos = agruparPorCategoria([servico("1", "barba"), servico("2", "cabelo")]);

    expect(grupos.map((grupo) => grupo.categoria)).toEqual(["cabelo", "barba"]);
  });

  it("com ordem salva, as seções seguem ela; dentro, a ordem da API fica", () => {
    const grupos = agruparPorCategoria(
      [servico("1", "cabelo"), servico("2", "barba"), servico("3", "cabelo"), servico("4", null)],
      ["barba", "cabelo"]
    );

    expect(grupos.map((grupo) => grupo.titulo)).toEqual(["Barba", "Cabelo", "Outros serviços"]);
    expect(grupos[1].servicos.map((s) => s.id)).toEqual(["1", "3"]);
  });
});
