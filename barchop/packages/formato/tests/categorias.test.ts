import { describe, expect, it } from "vitest";
import { CATEGORIAS_DE_SERVICO, ordenarCategorias } from "../src/pagina";

// A ordem das seções de serviços (arrastar e reordenar, PR 2). O banco
// guarda o que o dono arrastou (`barbearia.ordem_categorias`); quem lê
// recebe sempre a lista inteira.

describe("ordenarCategorias", () => {
  it("sem nada salvo, é a ordem padrão", () => {
    expect(ordenarCategorias([])).toEqual([...CATEGORIAS_DE_SERVICO]);
  });

  it("as salvas vêm primeiro; as que faltam vão pro fim, na ordem padrão", () => {
    expect(ordenarCategorias(["infantil", "barba"])).toEqual([
      "infantil",
      "barba",
      "cabelo",
      "combo",
      "sobrancelha",
      "quimica",
    ]);
  });

  it("ignora valor fora da lista e repetido", () => {
    // O CHECK do banco e o schema da rota já barram os dois; a função
    // não confia, porque a lista vai direto pra tela.
    expect(ordenarCategorias(["massagem", "barba", "barba"])).toEqual([
      "barba",
      "cabelo",
      "combo",
      "sobrancelha",
      "quimica",
      "infantil",
    ]);
  });
});
