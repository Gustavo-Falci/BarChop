import { describe, expect, it } from "vitest";
import type { ServicoSerializado } from "@barchop/types";
import {
  agruparPorCategoria,
  faixaDePreco,
  resumoDoGrupo,
  SEM_CATEGORIA,
} from "../../src/painel/listas";

function servico(
  id: string,
  categoria: string | null,
  preco = "40.00",
  ativo = true
): ServicoSerializado {
  return {
    id,
    nome: `Serviço ${id}`,
    duracaoMinutos: 30,
    preco,
    ativo,
    categoria,
    descricao: null,
    fotoUrl: null,
  };
}

// O Intl separa "R$" do número com espaço não separável; comparar com
// o espaço comum deixa o teste legível sem fingir que o caractere é
// outro.
const comEspacoComum = (texto: string) => texto.replace(/\s/g, " ");

describe("agrupar serviços por categoria", () => {
  it("mantém a ordem em que cada categoria aparece na lista da API", () => {
    // A API já ordena (ativos antes, nome asc); a tela não reordena —
    // só junta quem é da mesma categoria.
    const grupos = agruparPorCategoria([
      servico("1", "Cabelo"),
      servico("2", "Barba"),
      servico("3", "Cabelo"),
    ]);

    expect(grupos.map((grupo) => grupo.titulo)).toEqual(["Cabelo", "Barba"]);
    expect(grupos[0].servicos.map((s) => s.id)).toEqual(["1", "3"]);
  });

  it("joga quem não tem categoria num grupo próprio, sempre por último", () => {
    // Mesmo vindo primeiro na lista: "Sem categoria" é a sobra, não uma
    // categoria que o dono escolheu.
    const grupos = agruparPorCategoria([
      servico("1", null),
      servico("2", "Cabelo"),
    ]);

    expect(grupos.map((grupo) => grupo.titulo)).toEqual(["Cabelo", SEM_CATEGORIA]);
  });

  it("guarda o inativo no grupo dele", () => {
    // É desta tela que se reativa; o inativo não pode sumir do grupo.
    const grupos = agruparPorCategoria([servico("1", "Cabelo", "40.00", false)]);

    expect(grupos[0].servicos).toHaveLength(1);
  });

  it("lista vazia não tem grupo", () => {
    expect(agruparPorCategoria([])).toEqual([]);
  });

  it("ids de grupo diferentes pra cada categoria", () => {
    // Viram `key` de <tbody>; repetidos, o React misturaria grupos.
    const grupos = agruparPorCategoria([servico("1", "Cabelo"), servico("2", null)]);

    expect(new Set(grupos.map((grupo) => grupo.id)).size).toBe(2);
  });
});

describe("faixa de preço", () => {
  it("um preço só quando todos custam o mesmo", () => {
    expect(comEspacoComum(faixaDePreco([servico("1", null, "40.00"), servico("2", null, "40.00")]))).toBe(
      "R$ 40,00"
    );
  });

  it("do menor ao maior", () => {
    expect(comEspacoComum(faixaDePreco([servico("1", null, "60.00"), servico("2", null, "25.50")]))).toBe(
      "R$ 25,50 a R$ 60,00"
    );
  });

  it("compara número, não texto", () => {
    // Como texto, "100.00" < "40.00" — o corte de cem reais viraria o
    // mais barato da categoria.
    expect(comEspacoComum(faixaDePreco([servico("1", null, "100.00"), servico("2", null, "40.00")]))).toBe(
      "R$ 40,00 a R$ 100,00"
    );
  });
});

describe("resumo do grupo", () => {
  it("conta no singular e mostra o preço", () => {
    expect(comEspacoComum(resumoDoGrupo([servico("1", null, "40.00")]))).toBe("1 serviço · R$ 40,00");
  });

  it("conta no plural e mostra a faixa", () => {
    expect(
      comEspacoComum(resumoDoGrupo([servico("1", null, "40.00"), servico("2", null, "25.00")]))
    ).toBe("2 serviços · R$ 25,00 a R$ 40,00");
  });
});
