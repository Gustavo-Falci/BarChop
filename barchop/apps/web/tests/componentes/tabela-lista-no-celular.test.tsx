import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Tabela, type Linha } from "../../src/componentes/Tabela";
import { comTelaDeCelular } from "../ajudantes/tela";

// Redesenho do celular, PR 6. No celular, a linha que traz `noCelular`
// deixa de ser o cartão "Rótulo: valor" e vira um item de lista: o nome
// (o botão que abre), uma linha de detalhe embaixo e o valor à direita.
// Cada tela diz o que vai em cada lugar; quem não diz segue no cartão.

const SERVICOS: Linha[] = [
  {
    id: "s1",
    celulas: ["Corte", "30 min", "R$ 40,00"],
    noCelular: { detalhe: "30 min · site e painel", valor: "R$ 40,00" },
  },
  {
    id: "s2",
    atenuada: true,
    celulas: ["Barba", "20 min", "R$ 25,00"],
    noCelular: { detalhe: "20 min · fora do agendamento", valor: "R$ 25,00" },
  },
];

function montar(props: Partial<Parameters<typeof Tabela>[0]> = {}) {
  const aoAbrir = vi.fn((_id: string) => {});
  render(
    <Tabela cabecalho={["Nome", "Duração", "Preço"]} vazio="Nenhum serviço." aoAbrir={aoAbrir} linhas={SERVICOS} {...props} />
  );
  return aoAbrir;
}

describe("Tabela no celular", () => {
  let desfazer: () => void = () => {};
  afterEach(() => desfazer());

  it("vira lista: o nome é o botão, e o detalhe e o valor ficam ao lado dele, sem rótulo", async () => {
    desfazer = comTelaDeCelular();
    const aoAbrir = montar();

    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    const itens = screen.getAllByRole("listitem");
    expect(itens).toHaveLength(2);
    // O nome acessível é só o nome: o detalhe mora fora do botão.
    const botao = within(itens[0]!).getByRole("button", { name: "Corte" });
    expect(itens[0]).toHaveTextContent("30 min · site e painel");
    expect(itens[0]).toHaveTextContent("R$ 40,00");
    expect(document.querySelector("[data-rotulo]")).toBeNull();

    await userEvent.click(botao);
    expect(aoAbrir).toHaveBeenCalledWith("s1");
  });

  it("tocar em qualquer parte do item abre, como a linha da tabela", async () => {
    desfazer = comTelaDeCelular();
    const aoAbrir = montar();

    await userEvent.click(screen.getByText("20 min · fora do agendamento"));

    expect(aoAbrir).toHaveBeenCalledWith("s2");
  });

  it("a linha atenuada continua atenuada", () => {
    desfazer = comTelaDeCelular();
    montar();

    expect(screen.getAllByRole("listitem")[1]).toHaveAttribute("data-atenuada");
  });

  it("as ações da linha ficam no item, fora do botão do nome", () => {
    desfazer = comTelaDeCelular();
    montar({
      linhas: [
        {
          id: "c1",
          celulas: ["João Silva", "(11) 99999-0001"],
          noCelular: { detalhe: "(11) 99999-0001", acoes: <button type="button">Agendar para João Silva</button> },
        },
      ],
    });

    const item = screen.getByRole("listitem");
    expect(within(item).getByRole("button", { name: "Agendar para João Silva" })).toBeInTheDocument();
    expect(within(item).getByRole("button", { name: "João Silva" })).not.toHaveTextContent("Agendar");
  });

  it("o grupo vira título de seção, com o resumo, antes da lista dele", () => {
    desfazer = comTelaDeCelular();
    montar({
      linhas: undefined,
      grupos: [{ id: "cabelo", titulo: "Cabelo", resumo: "2 serviços", linhas: SERVICOS }],
    });

    const titulo = screen.getByRole("heading", { name: /cabelo/i });
    expect(titulo).toHaveTextContent("2 serviços");
    expect(screen.getByRole("list", { name: "Cabelo" })).toBeInTheDocument();
  });

  it("sem quem abra, o nome é texto, não botão", () => {
    desfazer = comTelaDeCelular();
    montar({ aoAbrir: undefined });

    expect(screen.queryByRole("button", { name: "Corte" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("listitem")[0]).toHaveTextContent("Corte");
  });

  it("tela que não diz o conteúdo do celular segue na tabela de cartões", () => {
    desfazer = comTelaDeCelular();
    montar({ linhas: [{ id: "c1", celulas: ["João Silva", "(11) 99999-0001"] }] });

    expect(screen.getByRole("table")).toBeInTheDocument();
  });

  it("acima de 640px segue a tabela, como antes", () => {
    desfazer = comTelaDeCelular(700);
    montar();

    expect(screen.getByRole("table")).toBeInTheDocument();
  });

  it("no desktop segue a tabela", () => {
    montar();

    expect(screen.getByRole("table")).toBeInTheDocument();
  });
});
