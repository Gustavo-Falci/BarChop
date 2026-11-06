import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Botao } from "../../src/componentes/Botao";

describe("Botao", () => {
  it("é um button acessível pelo texto", () => {
    render(<Botao>Confirmar agendamento</Botao>);
    expect(
      screen.getByRole("button", { name: "Confirmar agendamento" })
    ).toBeInTheDocument();
  });

  it("chama o onClick", async () => {
    const aoClicar = vi.fn();
    render(<Botao onClick={aoClicar}>Salvar</Botao>);

    await userEvent.click(screen.getByRole("button"));

    expect(aoClicar).toHaveBeenCalledTimes(1);
  });

  it("não dispara quando está carregando", async () => {
    // A tela de confirmação chama uma rota que cria agendamento; dois
    // cliques seriam duas tentativas, e a segunda voltaria
    // horario_ocupado por culpa da primeira.
    const aoClicar = vi.fn();
    render(
      <Botao onClick={aoClicar} carregando>
        Confirmar
      </Botao>
    );

    const botao = screen.getByRole("button");
    expect(botao).toBeDisabled();
    await userEvent.click(botao);
    expect(aoClicar).not.toHaveBeenCalled();
  });
});

// O jsdom não faz layout: o teste lê a regra do CSS. Sem a altura mínima,
// o botão ficava com 42px (padding + linha), abaixo dos 44px de toque que
// o painel usa em todo controle (o voltar, o Sair, as ações).
describe("Botao no toque", () => {
  it("tem pelo menos 44px de altura", () => {
    const css = readFileSync(join(__dirname, "../../src/componentes/Botao.module.css"), "utf8").replace(/\r\n/g, "\n");
    const botao = css.slice(css.indexOf(".botao {"), css.indexOf("\n}\n", css.indexOf(".botao {")));
    expect(botao).toMatch(/min-height:\s*44px/);
  });
});
