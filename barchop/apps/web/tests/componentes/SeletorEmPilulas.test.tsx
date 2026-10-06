import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SeletorEmPilulas } from "../../src/componentes/SeletorEmPilulas";

const INTERVALOS = [
  { valor: "15", rotulo: "15 min" },
  { valor: "30", rotulo: "30 min" },
  { valor: "60", rotulo: "60 min" },
];

describe("SeletorEmPilulas", () => {
  it("é um grupo de rádios nomeado pela legenda", () => {
    // Rádio nativo, e não botão: setas do teclado, um valor só por
    // grupo e o envio do formulário vêm de graça.
    render(
      <SeletorEmPilulas nome="intervalo" legenda="Intervalo entre horários" opcoes={INTERVALOS} valor="30" aoTrocar={() => {}} />
    );

    expect(screen.getByRole("group", { name: "Intervalo entre horários" })).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(3);
  });

  it("marca a opção do valor atual", () => {
    render(<SeletorEmPilulas nome="intervalo" legenda="Intervalo" opcoes={INTERVALOS} valor="30" aoTrocar={() => {}} />);

    expect(screen.getByRole("radio", { name: "30 min" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "15 min" })).not.toBeChecked();
  });

  it("escolher outra avisa o valor dela", async () => {
    const aoTrocar = vi.fn();
    render(<SeletorEmPilulas nome="intervalo" legenda="Intervalo" opcoes={INTERVALOS} valor="30" aoTrocar={aoTrocar} />);

    await userEvent.click(screen.getByRole("radio", { name: "60 min" }));

    expect(aoTrocar).toHaveBeenCalledWith("60");
  });

  it("mostra o efeito da escolha logo abaixo, anunciado quando muda", () => {
    render(
      <SeletorEmPilulas
        nome="intervalo"
        legenda="Intervalo"
        opcoes={INTERVALOS}
        valor="30"
        aoTrocar={() => {}}
        efeito="Seus clientes vão ver: 9:00, 9:30, 10:00…"
      />
    );

    const efeito = screen.getByText("Seus clientes vão ver: 9:00, 9:30, 10:00…");
    expect(efeito).toHaveAttribute("aria-live", "polite");
  });
});
