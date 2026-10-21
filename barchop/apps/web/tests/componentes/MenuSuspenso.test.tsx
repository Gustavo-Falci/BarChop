import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { MenuSuspenso } from "../../src/componentes/MenuSuspenso";

// Motion PR 2: o painel sai com animação (AnimatePresence). Fechado, ele
// tem de sumir do DOM — um painel invisível que ficasse lá prenderia o
// Tab e o leitor de tela.

function Menu() {
  const [aberto, setAberto] = useState(false);
  return (
    <MenuSuspenso
      rotulo="Sua conta"
      gatilho="Conta"
      aberto={aberto}
      aoAlternar={() => setAberto((valor) => !valor)}
      aoFechar={() => setAberto(false)}
    >
      <button type="button" data-fecha>
        Sair
      </button>
    </MenuSuspenso>
  );
}

describe("MenuSuspenso", () => {
  it("abre, e fechar pelo Esc faz o painel sumir e devolve o foco", async () => {
    render(<Menu />);

    await userEvent.click(screen.getByRole("button", { name: "Conta" }));
    expect(screen.getByRole("group", { name: "Sua conta" })).toBeInTheDocument();

    await userEvent.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("group", { name: "Sua conta" })).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Conta" })).toHaveFocus();
  });

  it("clicar numa linha que fecha também faz o painel sumir", async () => {
    render(<Menu />);

    await userEvent.click(screen.getByRole("button", { name: "Conta" }));
    await userEvent.click(screen.getByRole("button", { name: "Sair" }));

    await waitFor(() => expect(screen.queryByRole("group", { name: "Sua conta" })).not.toBeInTheDocument());
  });
});
