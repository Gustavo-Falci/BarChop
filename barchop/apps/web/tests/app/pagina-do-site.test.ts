import { describe, expect, it } from "vitest";
import { metadata } from "../../app/(marketing)/page";

// A home é a página que o buscador mostra pra quem procura agenda de
// barbearia: título e descrição próprios, não os padrões do layout.
describe("página da home do site", () => {
  it("tem título e descrição de quem vende o produto", () => {
    expect(metadata.title).toMatch(/BarChop/);
    expect(metadata.description).toMatch(/barbearia/i);
  });
});
