import { describe, expect, it } from "vitest";
import { deslocamentoDoFecho } from "../../../src/telas/painel/fecho";

describe("deslocamento do fecho", () => {
  it("alinha o fecho ao topo do passo aberto", () => {
    expect(deslocamentoDoFecho({ topoDoPasso: 240, altura: 800, alturaDoFecho: 200 })).toBe(240);
  });

  it("com o primeiro passo aberto, não desloca nada", () => {
    expect(deslocamentoDoFecho({ topoDoPasso: 0, altura: 800, alturaDoFecho: 200 })).toBe(0);
  });

  it("não deixa o fecho passar do pé do quadro", () => {
    // Passo aberto lá embaixo: alinhar pelo topo dele jogaria o fecho
    // para fora do quadro e faria a página crescer só por causa dele.
    expect(deslocamentoDoFecho({ topoDoPasso: 700, altura: 800, alturaDoFecho: 200 })).toBe(600);
  });

  it("quadro menor que o fecho não produz deslocamento negativo", () => {
    // Tudo recolhido, a pilha de passos fica mais baixa que o fecho.
    expect(deslocamentoDoFecho({ topoDoPasso: 120, altura: 150, alturaDoFecho: 260 })).toBe(0);
  });

  it("sem passo aberto, volta para o topo", () => {
    expect(deslocamentoDoFecho({ topoDoPasso: null, altura: 800, alturaDoFecho: 200 })).toBe(0);
  });
});
