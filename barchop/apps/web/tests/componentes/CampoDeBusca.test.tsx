import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CampoDeBusca } from "../../src/componentes/CampoDeBusca";

describe("CampoDeBusca", () => {
  it("o rótulo nomeia o campo mesmo escondido dos olhos", () => {
    // O `placeholder` não nomeia nada para leitor de tela — some ao
    // digitar e não é lido como nome do controle. Por isso o <label>
    // continua no DOM, escondido só visualmente.
    render(
      <CampoDeBusca
        rotulo="Buscar por nome ou telefone"
        exemplo="Nome ou telefone"
        valor=""
        onChange={() => {}}
      />
    );

    expect(screen.getByLabelText(/buscar por nome ou telefone/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Nome ou telefone")).toBeInTheDocument();
  });

  it("a tecla de atalho traz o foco pro campo", async () => {
    render(<CampoDeBusca rotulo="Buscar" valor="" onChange={() => {}} />);

    const campo = screen.getByLabelText("Buscar");
    expect(campo).not.toHaveFocus();

    await userEvent.keyboard("/");

    expect(campo).toHaveFocus();
  });

  it("o atalho não rouba o foco de quem já está escrevendo", async () => {
    // Digitar "3/4" em qualquer outro campo da tela não pode teletransportar
    // a pessoa para a busca no meio da frase.
    render(
      <>
        <input aria-label="Observações" />
        <CampoDeBusca rotulo="Buscar" valor="" onChange={() => {}} />
      </>
    );

    const outro = screen.getByLabelText("Observações");
    await userEvent.click(outro);
    await userEvent.keyboard("3/4");

    expect(outro).toHaveFocus();
    expect(outro).toHaveValue("3/4");
  });

  it("com texto, oferece apagar — e devolve o foco ao campo", async () => {
    const onChange = vi.fn((_valor: string) => {});
    render(<CampoDeBusca rotulo="Buscar" valor="marcos" onChange={onChange} />);

    await userEvent.click(screen.getByRole("button", { name: /apagar busca/i }));

    expect(onChange).toHaveBeenCalledWith("");
    // Sem devolver o foco, apagar a busca deixa o teclado no vazio e
    // obriga a clicar de novo para continuar procurando.
    expect(screen.getByLabelText("Buscar")).toHaveFocus();
  });

  it("sem texto, mostra a dica da tecla no lugar do apagar", () => {
    const { rerender } = render(
      <CampoDeBusca rotulo="Buscar" valor="" onChange={() => {}} />
    );

    expect(screen.getByText("/")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /apagar busca/i })).not.toBeInTheDocument();

    rerender(<CampoDeBusca rotulo="Buscar" valor="a" onChange={() => {}} />);

    expect(screen.queryByText("/")).not.toBeInTheDocument();
  });
});
