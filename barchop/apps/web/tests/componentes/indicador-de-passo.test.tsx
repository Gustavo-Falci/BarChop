import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { IndicadorDePasso } from "../../src/componentes/IndicadorDePasso";

// O indicador do fluxo de agendar (17/10): o texto é o que o leitor de
// tela lê; os quatro segmentos são desenho, com os feitos pintados.
describe("indicador de passo", () => {
  it("diz em que passo o cliente está, de quatro", () => {
    render(<IndicadorDePasso atual={3} />);

    expect(screen.getByText("Passo 3 de 4")).toBeInTheDocument();
  });

  it("pinta os passos até o atual", () => {
    const { container } = render(<IndicadorDePasso atual={2} />);

    const segmentos = container.querySelectorAll("[aria-hidden] > span");
    expect(segmentos).toHaveLength(4);
    expect([...segmentos].map((s) => s.hasAttribute("data-feito"))).toEqual([true, true, false, false]);
  });
});
