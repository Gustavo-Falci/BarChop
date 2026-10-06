import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SecaoNumerada } from "../../src/componentes/SecaoNumerada";

describe("SecaoNumerada", () => {
  it("o número faz parte do título lido: a ordem é informação", () => {
    render(
      <SecaoNumerada numero={1} titulo="A agenda que o cliente vê">
        <p>campos</p>
      </SecaoNumerada>
    );

    expect(
      screen.getByRole("heading", { level: 2, name: "1 · A agenda que o cliente vê" })
    ).toBeInTheDocument();
    expect(screen.getByText("campos")).toBeInTheDocument();
  });

  it("sem número, o título fica sozinho", () => {
    render(
      <SecaoNumerada titulo="Depois de conectar">
        <p>passos</p>
      </SecaoNumerada>
    );

    expect(screen.getByRole("heading", { level: 2, name: "Depois de conectar" })).toBeInTheDocument();
  });

  it("mostra o apoio e o que vai do lado direito da régua", () => {
    render(
      <SecaoNumerada numero={2} titulo="Onde ele te encontra" apoio="Viram ícones no rodapé." lado="0 de 6 no ar">
        <p>redes</p>
      </SecaoNumerada>
    );

    expect(screen.getByText("Viram ícones no rodapé.")).toBeInTheDocument();
    expect(screen.getByText("0 de 6 no ar")).toBeInTheDocument();
  });

  it("é uma região nomeada pelo próprio título", () => {
    // <section> com aria-labelledby vira landmark: quem navega por
    // região pula de "1 · …" pra "2 · …".
    render(
      <SecaoNumerada numero={3} titulo="Mudanças e cancelamento">
        <p>prazos</p>
      </SecaoNumerada>
    );

    expect(screen.getByRole("region", { name: "3 · Mudanças e cancelamento" })).toBeInTheDocument();
  });
});
