import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { depoisDaSaida } from "../../src/movimento/depoisDaSaida";
import { JanelaDeNovidades } from "../../src/painel/JanelaDeNovidades";

// Motion PR 2: a janela (<dialog>) sai com fade pelo CSS, mas quem a
// abriu desmonta ela no `close` — e a saída morreria no meio. O
// `depoisDaSaida` segura o aviso até as animações do elemento acabarem.

function animacaoPendente() {
  let acabar!: () => void;
  const finished = new Promise<void>((pronto) => {
    acabar = pronto;
  });
  return { animacao: { finished } as unknown as Animation, acabar };
}

describe("depoisDaSaida", () => {
  afterEach(() => {
    delete (HTMLElement.prototype as Partial<HTMLElement>).getAnimations;
  });

  it("sem animação nenhuma (ou sem a API, como no jsdom), avisa na hora", () => {
    const feito = vi.fn();

    depoisDaSaida(document.createElement("dialog"), feito);
    depoisDaSaida(null, feito);

    expect(feito).toHaveBeenCalledTimes(2);
  });

  it("com animação rodando, espera ela acabar", async () => {
    const { animacao, acabar } = animacaoPendente();
    const elemento = document.createElement("dialog");
    elemento.getAnimations = () => [animacao];
    const feito = vi.fn();

    depoisDaSaida(elemento, feito);
    await Promise.resolve();
    expect(feito).not.toHaveBeenCalled();

    acabar();
    await vi.waitFor(() => expect(feito).toHaveBeenCalledTimes(1));
  });

  it("a janela de novidades só avisa que fechou depois da saída", async () => {
    const { animacao, acabar } = animacaoPendente();
    HTMLElement.prototype.getAnimations = () => [animacao];
    const aoFechar = vi.fn();
    render(<JanelaDeNovidades aoFechar={aoFechar} />);

    await userEvent.click(screen.getByRole("button", { name: "Fechar" }));
    expect(aoFechar).not.toHaveBeenCalled();

    acabar();
    await vi.waitFor(() => expect(aoFechar).toHaveBeenCalledTimes(1));
  });
});
