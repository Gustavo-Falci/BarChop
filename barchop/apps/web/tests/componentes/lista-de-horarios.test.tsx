import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ListaDeHorarios } from "../../src/componentes/ListaDeHorarios";

// Visto no app rodando: 33 horários de um dia inteiro caíam numa
// parede só, e achar "fim da tarde" era contar botão por botão.
describe("lista de horários", () => {
  it("separa os horários em manhã, tarde e noite", () => {
    render(
      <ListaDeHorarios
        horarios={["09:00", "11:45", "12:00", "17:45", "18:00"]}
        aoEscolher={() => {}}
      />
    );

    const manha = screen.getByRole("group", { name: "Manhã" });
    const tarde = screen.getByRole("group", { name: "Tarde" });
    const noite = screen.getByRole("group", { name: "Noite" });

    expect(within(manha).getAllByRole("button").map((b) => b.textContent)).toEqual([
      "09:00",
      "11:45",
    ]);
    expect(within(tarde).getAllByRole("button").map((b) => b.textContent)).toEqual([
      "12:00",
      "17:45",
    ]);
    expect(within(noite).getAllByRole("button").map((b) => b.textContent)).toEqual([
      "18:00",
    ]);
  });

  it("período sem horário não aparece", () => {
    render(<ListaDeHorarios horarios={["09:00", "14:00"]} aoEscolher={() => {}} />);

    expect(screen.queryByRole("group", { name: "Noite" })).not.toBeInTheDocument();
  });

  it("com um período só, não põe cabeçalho", () => {
    // "Tarde" em cima de três horários da tarde é rótulo que não separa
    // nada — só empurra os botões pra baixo.
    render(
      <ListaDeHorarios horarios={["14:00", "14:15", "14:30"]} aoEscolher={() => {}} />
    );

    expect(screen.queryByRole("group")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(3);
  });

  it("escolhe e marca o horário atual", async () => {
    const aoEscolher = vi.fn();
    render(
      <ListaDeHorarios
        horarios={["09:00", "14:00"]}
        selecionada="14:00"
        aoEscolher={aoEscolher}
      />
    );

    expect(screen.getByRole("button", { name: "14:00" })).toHaveAttribute(
      "aria-current",
      "true"
    );
    await userEvent.click(screen.getByRole("button", { name: "09:00" }));
    expect(aoEscolher).toHaveBeenCalledWith("09:00");
  });
});
