import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Vazio } from "../../src/componentes/Vazio";

describe("Vazio", () => {
  it("com ícone, desenha o ícone e o esconde do leitor de tela", () => {
    // O ícone ilustra a frase; anunciá-lo seria ler a mesma coisa duas
    // vezes (ou ler "imagem" antes do que importa).
    const { container } = render(
      <Vazio mensagem="Tudo em dia" icone={<svg data-testid="icone" />} />
    );

    expect(screen.getByTestId("icone")).toBeInTheDocument();
    expect(container.querySelector('[aria-hidden="true"]')).toContainElement(
      screen.getByTestId("icone")
    );
  });

  it("sem ícone, nada de círculo vazio no lugar", () => {
    const { container } = render(<Vazio mensagem="Nenhum cliente por aqui ainda." />);

    expect(screen.getByText("Nenhum cliente por aqui ainda.")).toBeInTheDocument();
    expect(container.querySelector('[aria-hidden="true"]')).toBeNull();
  });
});
