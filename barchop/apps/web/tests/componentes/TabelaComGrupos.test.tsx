import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Tabela } from "../../src/componentes/Tabela";

const GRUPOS = [
  {
    id: "cabelo",
    titulo: "Cabelo",
    resumo: "2 serviços · R$ 40,00 a R$ 60,00",
    linhas: [
      { id: "s1", celulas: ["Corte", "R$ 40,00"] },
      { id: "s2", celulas: ["Corte + lavagem", "R$ 60,00"] },
    ],
  },
  {
    id: "barba",
    titulo: "Barba",
    linhas: [{ id: "s3", celulas: ["Barba", "R$ 35,00"] }],
  },
];

describe("Tabela com grupos", () => {
  it("cada grupo tem o título como cabeçalho das linhas dele", () => {
    render(<Tabela cabecalho={["Serviço", "Preço"]} grupos={GRUPOS} vazio="Nenhum serviço." />);

    expect(screen.getByRole("rowheader", { name: /Cabelo/ })).toBeInTheDocument();
    expect(screen.getByRole("rowheader", { name: /^Barba/ })).toBeInTheDocument();
    expect(screen.getByText("2 serviços · R$ 40,00 a R$ 60,00")).toBeInTheDocument();
  });

  it("as linhas ficam dentro do bloco do grupo delas", () => {
    // Um <tbody> por grupo: é o que liga a linha ao título pra quem
    // navega a tabela pelo leitor de tela.
    const { container } = render(
      <Tabela cabecalho={["Serviço", "Preço"]} grupos={GRUPOS} vazio="Nenhum serviço." />
    );

    const blocos = container.querySelectorAll("tbody");
    expect(blocos).toHaveLength(2);
    expect(within(blocos[0] as HTMLElement).getByText("Corte + lavagem")).toBeInTheDocument();
    expect(within(blocos[1] as HTMLElement).queryByText("Corte")).not.toBeInTheDocument();
  });

  it("abrir uma linha continua funcionando dentro do grupo", async () => {
    const aoAbrir = vi.fn((_id: string) => {});
    render(
      <Tabela cabecalho={["Serviço", "Preço"]} grupos={GRUPOS} vazio="Nenhum serviço." aoAbrir={aoAbrir} />
    );

    await userEvent.click(screen.getByRole("button", { name: "Barba" }));

    expect(aoAbrir).toHaveBeenCalledWith("s3");
  });

  it("com todos os grupos vazios, é a tabela vazia", () => {
    render(
      <Tabela
        cabecalho={["Serviço", "Preço"]}
        grupos={[{ id: "cabelo", titulo: "Cabelo", linhas: [] }]}
        vazio="Nenhum serviço."
      />
    );

    expect(screen.getByText("Nenhum serviço.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("grupo sem linhas some, e os outros ficam", () => {
    render(
      <Tabela
        cabecalho={["Serviço", "Preço"]}
        grupos={[{ id: "vazio", titulo: "Sobrancelha", linhas: [] }, ...GRUPOS]}
        vazio="Nenhum serviço."
      />
    );

    expect(screen.queryByRole("rowheader", { name: /Sobrancelha/ })).not.toBeInTheDocument();
    expect(screen.getByRole("rowheader", { name: /Cabelo/ })).toBeInTheDocument();
  });
});
