import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Campo } from "../../src/componentes/Campo";

describe("Campo", () => {
  it("associa o rótulo ao input", () => {
    render(<Campo rotulo="Nome" />);
    expect(screen.getByLabelText("Nome")).toBeInTheDocument();
  });

  it("formata telefone enquanto se digita", async () => {
    // A API guarda "(11) 99999-8888" e recusa qualquer outra forma com
    // 400. Formatar no campo é o que impede o erro de chegar lá.
    render(<Campo rotulo="Telefone" formato="telefone" />);

    const input = screen.getByLabelText("Telefone");
    await userEvent.type(input, "11999998888");

    expect(input).toHaveValue("(11) 99999-8888");
  });

  it("mostra o erro e marca o input como inválido", () => {
    render(<Campo rotulo="Telefone" erro="informe o DDD" />);

    const input = screen.getByLabelText("Telefone");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("informe o DDD")).toBeInTheDocument();
  });

  it("revela e esconde a senha, e o nome do botão diz o que vai acontecer", async () => {
    // Senha que não dá pra conferir é a causa nº 1 de tentativa
    // repetida — e desde o rate limit, tentativa repetida tem custo.
    render(<Campo rotulo="Senha" type="password" />);

    const input = screen.getByLabelText("Senha");
    expect(input).toHaveAttribute("type", "password");

    const botao = screen.getByRole("button", { name: "Mostrar senha" });
    await userEvent.click(botao);

    expect(input).toHaveAttribute("type", "text");
    // O nome muda junto: parado em "Mostrar senha" ele descreveria o
    // estado errado pra quem só ouve o botão.
    expect(screen.getByRole("button", { name: "Ocultar senha" })).toBe(botao);

    await userEvent.click(botao);
    expect(input).toHaveAttribute("type", "password");
  });

  it("o botão de revelar não envia o formulário em volta", async () => {
    // <button> sem type é submit: sem o type="button", conferir a senha
    // tentaria entrar.
    let enviou = false;
    render(
      <form onSubmit={() => { enviou = true; }}>
        <Campo rotulo="Senha" type="password" />
      </form>
    );

    await userEvent.click(screen.getByRole("button", { name: "Mostrar senha" }));

    expect(enviou).toBe(false);
  });

  it("campo que não é senha não ganha botão nenhum", () => {
    // O invólucro e o botão existem só no campo de senha; envolver
    // sempre mudaria o DOM das dez telas que usam Campo.
    render(<Campo rotulo="Telefone" />);

    expect(screen.queryByRole("button")).toBeNull();
  });

  it("anuncia o erro quando ele aparece, e não só quando o foco chega", () => {
    // O `aria-describedby` faz o erro ser lido quando o foco CHEGA no
    // campo. Só que o erro nasce depois de uma ação — quem apertou
    // Enter esperando enviar não está com o foco ali, e sem o `role`
    // nada avisa que apareceu.
    render(<Campo rotulo="Telefone" erro="informe o DDD" />);

    expect(screen.getByRole("alert")).toHaveTextContent("informe o DDD");
  });
});
