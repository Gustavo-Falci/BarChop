import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Tabela } from "../../src/componentes/Tabela";

describe("Tabela", () => {
  it("mostra a mensagem vazia quando não há linhas, e não a tabela", () => {
    // O contrato inteiro do componente pra uma barbearia no primeiro
    // dia, sem nenhum cliente cadastrado ainda: sem este branch a
    // tabela apareceria com cabeçalho e zero linhas, em vez de dizer
    // que não há nada ali.
    render(<Tabela cabecalho={["Nome"]} linhas={[]} vazio="Nenhum cliente por aqui ainda." />);

    expect(screen.getByText("Nenhum cliente por aqui ainda.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("com linhas, mostra a tabela e não a mensagem vazia", async () => {
    const aoAbrir = vi.fn((_id: string) => {});
    render(
      <Tabela
        cabecalho={["Nome", "Telefone"]}
        vazio="Nenhum cliente por aqui ainda."
        aoAbrir={aoAbrir}
        linhas={[{ id: "c1", celulas: ["João Silva", "(11) 99999-8888"] }]}
      />
    );

    expect(screen.queryByText("Nenhum cliente por aqui ainda.")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "João Silva" }));
    expect(aoAbrir).toHaveBeenCalledWith("c1");
  });

  it("a linha inteira abre, não só a célula do nome", async () => {
    // O CSS acende a linha toda no hover; aceitar clique só no nome
    // prometia um alvo que não existia.
    const aoAbrir = vi.fn((_id: string) => {});
    render(
      <Tabela
        cabecalho={["Nome", "Telefone"]}
        vazio="vazio"
        aoAbrir={aoAbrir}
        linhas={[{ id: "c1", celulas: ["João Silva", "(11) 99999-8888"] }]}
      />
    );

    await userEvent.click(screen.getByText("(11) 99999-8888"));

    expect(aoAbrir).toHaveBeenCalledWith("c1");
  });

  it("clicar no nome abre uma vez só, não duas", async () => {
    // O botão do nome continua existindo (é ele que chega pelo teclado),
    // e sem `stopPropagation` o clique nele dispararia o handler dele E
    // o da linha.
    const aoAbrir = vi.fn((_id: string) => {});
    render(
      <Tabela
        cabecalho={["Nome"]}
        vazio="vazio"
        aoAbrir={aoAbrir}
        linhas={[{ id: "c1", celulas: ["João Silva"] }]}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: "João Silva" }));

    expect(aoAbrir).toHaveBeenCalledTimes(1);
  });

  it("as larguras declaradas viram colunas da tabela", () => {
    const { container } = render(
      <Tabela
        cabecalho={["Nome", "Telefone"]}
        vazio="vazio"
        larguras={["70%", "30%"]}
        linhas={[{ id: "c1", celulas: ["João Silva", "(11) 99999-8888"] }]}
      />
    );

    const colunas = container.querySelectorAll("colgroup col");
    expect(colunas).toHaveLength(2);
    expect((colunas[0] as HTMLElement).style.width).toBe("70%");
  });

  it("sem aoAbrir, a linha não vira alvo de clique", () => {
    const { container } = render(
      <Tabela
        cabecalho={["Nome"]}
        vazio="vazio"
        linhas={[{ id: "c1", celulas: ["João Silva"] }]}
      />
    );

    // Sem handler não pode haver cursor de clique: a classe é o que o
    // CSS lê pra desenhar a mãozinha.
    expect(container.querySelector("tbody tr")?.className).toBe("");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
