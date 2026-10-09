import { describe, expect, it } from "vitest";
import type { CategoriaDeServico, MembroDaEquipe, ServicoSerializado } from "@barchop/types";
import {
  agruparPorCategoria,
  faixaDePreco,
  resumoDoGrupo,
  SEM_CATEGORIA,
  situacaoDoMembro,
} from "../../src/painel/listas";

function servico(
  id: string,
  categoria: CategoriaDeServico | null,
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
  it("grupos na ordem da lista de categorias, com o rótulo", () => {
    // A ordem é a da página pública (CATEGORIAS_DE_SERVICO), não a de
    // quem aparece primeiro; dentro do grupo, a ordem da API fica.
    const grupos = agruparPorCategoria([
      servico("1", "quimica"),
      servico("2", "barba"),
      servico("3", "cabelo"),
      servico("4", "barba"),
    ]);

    expect(grupos.map((grupo) => grupo.titulo)).toEqual(["Cabelo", "Barba", "Química e tratamentos"]);
    expect(grupos[1].servicos.map((s) => s.id)).toEqual(["2", "4"]);
  });

  it("joga quem não tem categoria num grupo próprio, sempre por último", () => {
    // Mesmo vindo primeiro na lista: "Sem categoria" é a sobra, não uma
    // categoria que o dono escolheu.
    const grupos = agruparPorCategoria([
      servico("1", null),
      servico("2", "cabelo"),
    ]);

    expect(grupos.map((grupo) => grupo.titulo)).toEqual(["Cabelo", SEM_CATEGORIA]);
  });

  it("categoria fora da lista cai em \"Sem categoria\", não some", () => {
    const grupos = agruparPorCategoria([
      servico("1", "Cebelo" as CategoriaDeServico),
      servico("2", "cabelo"),
    ]);

    expect(grupos.map((grupo) => grupo.titulo)).toEqual(["Cabelo", SEM_CATEGORIA]);
    expect(grupos[1].servicos.map((s) => s.id)).toEqual(["1"]);
  });

  it("guarda o inativo no grupo dele", () => {
    // É desta tela que se reativa; o inativo não pode sumir do grupo.
    const grupos = agruparPorCategoria([servico("1", "cabelo", "40.00", false)]);

    expect(grupos[0].servicos).toHaveLength(1);
  });

  it("lista vazia não tem grupo", () => {
    expect(agruparPorCategoria([])).toEqual([]);
  });

  it("ids de grupo diferentes pra cada categoria", () => {
    // Viram `key` de <tbody>; repetidos, o React misturaria grupos.
    const grupos = agruparPorCategoria([servico("1", "cabelo"), servico("2", null)]);

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

describe("situação do membro", () => {
  const membro = (ativo: boolean, convitePendente: boolean): MembroDaEquipe => ({
    id: "m1",
    nome: "Ana",
    email: "ana@gr.com",
    telefone: null,
    papel: "profissional",
    atende: true,
    ativo,
    fotoUrl: null,
    convitePendente,
  });

  it("ativo que já entrou", () => {
    expect(situacaoDoMembro(membro(true, false))).toBe("ativo");
  });

  it("ativo que ainda não aceitou o convite", () => {
    expect(situacaoDoMembro(membro(true, true))).toBe("convite");
  });

  it("inativo pesa mais que o convite pendente", () => {
    // Convite de quem foi desativado não é pendência: ele não entra.
    expect(situacaoDoMembro(membro(false, true))).toBe("inativo");
  });
});
