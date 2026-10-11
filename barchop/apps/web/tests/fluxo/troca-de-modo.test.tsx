import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { chaveDoModo } from "../../src/fluxo/aparenciaDaPagina";
import { TrocaDeModo } from "../../src/fluxo/TrocaDeModo";

// O botão lua/sol da página pública (Aparência, "deixar o cliente trocar
// entre claro e escuro"). A escolha fica guardada por barbearia.

describe("TrocaDeModo", () => {
  beforeEach(() => {
    document.documentElement.removeAttribute("data-theme");
    window.localStorage.clear();
  });

  it("no claro, oferece o escuro; clicar troca e guarda", async () => {
    document.documentElement.setAttribute("data-theme", "light");
    render(<TrocaDeModo slug="gr-barber" />);

    await userEvent.click(screen.getByRole("button", { name: "Usar o modo escuro" }));

    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(window.localStorage.getItem(chaveDoModo("gr-barber"))).toBe("escuro");
    expect(screen.getByRole("button", { name: "Usar o modo claro" })).toBeInTheDocument();
  });

  it("sem atributo, parte do tema do sistema", async () => {
    // O setup dos testes não tem matchMedia escuro: o sistema é claro.
    render(<TrocaDeModo slug="gr-barber" />);

    await userEvent.click(screen.getByRole("button", { name: "Usar o modo escuro" }));

    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });
});
