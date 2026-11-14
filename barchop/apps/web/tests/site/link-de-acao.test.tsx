import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LinkDeAcao } from "../../src/site/LinkDeAcao";

// O rótulo que sobe dos botões do protótipo (barchop-prototipo, base.css):
// no hover e no foco do teclado o texto sobe e uma cópia entra por baixo.
// A cópia é só desenho: o leitor de tela lê o nome uma vez.
describe("LinkDeAcao com o rótulo que sobe", () => {
  it("o nome do link é o texto uma vez só; a cópia fica escondida", () => {
    render(
      <LinkDeAcao href="/painel/cadastro" rotuloQueSobe>
        Criar barbearia
      </LinkDeAcao>
    );

    const link = screen.getByRole("link", { name: "Criar barbearia" });
    expect(link).toHaveAttribute("data-rotulo", "sobe");
    const copias = link.querySelectorAll('[aria-hidden="true"]');
    expect(copias).toHaveLength(1);
    expect(copias[0]).toHaveTextContent("Criar barbearia");
  });

  it("sem o efeito, o link é só o texto", () => {
    render(<LinkDeAcao href="/precos">Ver planos</LinkDeAcao>);

    const link = screen.getByRole("link", { name: "Ver planos" });
    expect(link).not.toHaveAttribute("data-rotulo");
    expect(link.querySelector('[aria-hidden="true"]')).toBeNull();
  });
});
