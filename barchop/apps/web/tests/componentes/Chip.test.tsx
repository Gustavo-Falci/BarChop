import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Chip } from "../../src/componentes/Chip";

describe("Chip", () => {
  it("sem tom, continua amarelo — os usos que já existem não mudam", () => {
    render(<Chip>convite pendente</Chip>);

    expect(screen.getByText("convite pendente").className).toMatch(/acento/);
  });

  it.each(["ok", "atencao", "erro", "neutro"] as const)(
    "o tom %s vira a classe que pinta o estado",
    (tom) => {
      render(<Chip tom={tom}>Configurado</Chip>);

      expect(screen.getByText("Configurado").className).toMatch(new RegExp(tom));
    }
  );

  it("tamanho pequeno é o selo ao lado do título", () => {
    render(
      <Chip tom="atencao" tamanho="pequeno">
        Faltando
      </Chip>
    );

    expect(screen.getByText("Faltando").className).toMatch(/pequeno/);
  });

  it("sem tamanho, não leva a classe do selo", () => {
    render(<Chip>inativo</Chip>);

    expect(screen.getByText("inativo").className).not.toMatch(/pequeno/);
  });
});
