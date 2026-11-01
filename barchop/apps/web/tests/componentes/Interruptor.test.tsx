import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Interruptor } from "../../src/componentes/Interruptor";

// O interruptor das Configurações (redesenho, 01/11): liga e desliga na
// hora, ao contrário da caixinha, que pede confirmação. Botão com
// role="switch", como o "Mostrar os planos na página" de Planos.
describe("Interruptor", () => {
  it("é um switch nomeado pelo rótulo, que diz se está ligado", () => {
    render(<Interruptor rotulo="Aberto na segunda" ligado aoTrocar={() => {}} />);

    expect(screen.getByRole("switch", { name: "Aberto na segunda" })).toHaveAttribute("aria-checked", "true");
  });

  it("tocar avisa o valor novo", async () => {
    const aoTrocar = vi.fn();
    render(<Interruptor rotulo="Lembrete" ligado={false} aoTrocar={aoTrocar} />);

    await userEvent.click(screen.getByRole("switch", { name: "Lembrete" }));

    expect(aoTrocar).toHaveBeenCalledWith(true);
  });

  it("com o rótulo oculto, o nome continua pra quem ouve", () => {
    render(<Interruptor rotulo="Aberto no domingo" rotuloOculto ligado={false} aoTrocar={() => {}} />);

    const interruptor = screen.getByRole("switch", { name: "Aberto no domingo" });
    expect(interruptor).not.toHaveTextContent("Aberto no domingo");
  });
});
