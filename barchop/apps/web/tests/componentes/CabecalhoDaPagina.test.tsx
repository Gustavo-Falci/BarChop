import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CabecalhoDaPagina } from "../../src/componentes/CabecalhoDaPagina";
import { Chip } from "../../src/componentes/Chip";

describe("CabecalhoDaPagina", () => {
  it("sem selo nem voltar, é o cabeçalho de sempre: título e nada de link", () => {
    render(<CabecalhoDaPagina titulo="Clientes" apoio="12 no total" />);

    expect(screen.getByRole("heading", { level: 1, name: "Clientes" })).toBeInTheDocument();
    expect(screen.getByText("12 no total")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("o voltar é um link pra tela de cima, com o nome dela", () => {
    // As subtelas de Configurações (Horários, Regras…) voltam pro
    // índice; sem o link, o único caminho de volta era a barra lateral.
    render(
      <CabecalhoDaPagina
        titulo="Horários"
        voltar={{ href: "/painel/configuracoes", rotulo: "Configurações" }}
      />
    );

    const link = screen.getByRole("link", { name: /Configurações/ });
    expect(link).toHaveAttribute("href", "/painel/configuracoes");
  });

  it("o selo fica no cabeçalho, junto do título, e não dentro do nome dele", () => {
    // Dentro do <h1> o leitor de tela anunciaria "Horários Configurado"
    // como se fosse o nome da tela.
    render(
      <CabecalhoDaPagina
        titulo="Horários"
        selo={
          <Chip tom="ok" tamanho="pequeno">
            Configurado
          </Chip>
        }
      />
    );

    expect(screen.getByRole("heading", { level: 1, name: "Horários" })).toBeInTheDocument();
    expect(screen.getByRole("banner")).toHaveTextContent("Configurado");
  });
});
