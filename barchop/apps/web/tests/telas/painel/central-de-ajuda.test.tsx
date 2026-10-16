import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { CentralDeAjuda } from "../../../src/telas/painel/CentralDeAjuda";

describe("central de ajuda", () => {
  it("abre com o título e as perguntas fechadas, uma por linha", () => {
    render(<CentralDeAjuda />);

    expect(screen.getByRole("heading", { level: 1, name: "Central de ajuda" })).toBeInTheDocument();
    const perguntas = screen.getAllByRole("group");
    expect(perguntas.length).toBeGreaterThanOrEqual(6);
    for (const pergunta of perguntas) {
      expect(pergunta).not.toHaveAttribute("open");
    }
  });

  it("abrir uma pergunta mostra a resposta com o caminho pra tela certa", async () => {
    render(<CentralDeAjuda />);

    await userEvent.click(screen.getByText("Como bloqueio um horário ou tiro folga?"));

    const pergunta = screen.getByText("Como bloqueio um horário ou tiro folga?").closest("details")!;
    expect(pergunta).toHaveAttribute("open");
    expect(within(pergunta).getByRole("link", { name: "Folgas" })).toHaveAttribute(
      "href",
      "/painel/bloqueios"
    );
  });

  it("o caixa tem perguntas que levam ao Caixa e à divisão do dinheiro", async () => {
    render(<CentralDeAjuda />);

    await userEvent.type(screen.getByRole("searchbox", { name: "Buscar na ajuda" }), "caixa");

    const perguntas = screen.getAllByRole("group");
    const links = perguntas.flatMap((p) => within(p).queryAllByRole("link", { hidden: true }));
    expect(links.map((l) => l.getAttribute("href"))).toEqual(
      expect.arrayContaining(["/painel/caixa", "/painel/configuracoes/divisao"])
    );
  });

  it("a busca filtra as perguntas e diz quando nada casa", async () => {
    render(<CentralDeAjuda />);

    await userEvent.type(screen.getByRole("searchbox", { name: "Buscar na ajuda" }), "lembrete");

    expect(screen.getAllByRole("group").length).toBeGreaterThan(0);
    for (const pergunta of screen.getAllByRole("group")) {
      expect(pergunta.textContent?.toLowerCase()).toContain("lembrete");
    }

    await userEvent.clear(screen.getByRole("searchbox", { name: "Buscar na ajuda" }));
    await userEvent.type(screen.getByRole("searchbox", { name: "Buscar na ajuda" }), "xyzzy");

    expect(screen.queryAllByRole("group")).toHaveLength(0);
    expect(screen.getByText(/Nenhuma pergunta com/)).toBeInTheDocument();
  });
});
