import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { CentralDeAjuda } from "../../../src/telas/painel/CentralDeAjuda";

// Onda C, PR 5: cada pergunta é um botão que abre e fecha a resposta
// (`aria-expanded`), e os assuntos têm título normal, sem caixa alta.

// As perguntas: os botões que abrem e fecham.
function perguntas(): HTMLElement[] {
  return screen.getAllByRole("button").filter((botao) => botao.hasAttribute("aria-expanded"));
}

function pergunta(texto: string): HTMLElement {
  return screen.getByRole("button", { name: texto });
}

// A resposta que o botão controla (no DOM mesmo fechada, com `hidden`:
// a busca lê o mesmo texto que aparece).
function respostaDe(botao: HTMLElement): HTMLElement {
  const id = botao.getAttribute("aria-controls");
  const resposta = id ? document.getElementById(id) : null;
  if (!resposta) throw new Error("pergunta sem resposta");
  return resposta;
}

function linksDasPerguntas(): (string | null)[] {
  return perguntas()
    .flatMap((botao) => within(respostaDe(botao)).queryAllByRole("link", { hidden: true }))
    .map((link) => link.getAttribute("href"));
}

describe("central de ajuda", () => {
  it("abre com o título e as perguntas fechadas, uma por linha", () => {
    render(<CentralDeAjuda />);

    expect(screen.getByRole("heading", { level: 1, name: "Central de ajuda" })).toBeInTheDocument();
    expect(perguntas().length).toBeGreaterThanOrEqual(6);
    for (const botao of perguntas()) {
      expect(botao).toHaveAttribute("aria-expanded", "false");
      expect(respostaDe(botao)).not.toBeVisible();
    }
  });

  it("os assuntos são títulos de seção", () => {
    render(<CentralDeAjuda />);

    for (const tema of ["Agenda", "Sua página", "Clientes", "Caixa", "Planos de assinatura"]) {
      expect(screen.getByRole("heading", { level: 2, name: tema })).toBeInTheDocument();
    }
  });

  it("abrir uma pergunta mostra a resposta com o caminho pra tela certa; tocar de novo fecha", async () => {
    render(<CentralDeAjuda />);
    const botao = pergunta("Como bloqueio um horário ou tiro folga?");

    await userEvent.click(botao);

    expect(botao).toHaveAttribute("aria-expanded", "true");
    expect(respostaDe(botao)).toBeVisible();
    expect(within(respostaDe(botao)).getByRole("link", { name: "Folgas" })).toHaveAttribute(
      "href",
      "/painel/bloqueios"
    );

    await userEvent.click(botao);

    expect(botao).toHaveAttribute("aria-expanded", "false");
    expect(respostaDe(botao)).not.toBeVisible();
  });

  it("o caixa tem perguntas que levam ao Caixa e à divisão do dinheiro", async () => {
    render(<CentralDeAjuda />);

    await userEvent.type(screen.getByRole("searchbox", { name: "Buscar na ajuda" }), "caixa");

    expect(linksDasPerguntas()).toEqual(expect.arrayContaining(["/painel/caixa", "/painel/configuracoes/divisao"]));
  });

  it("os planos de assinatura levam aos Planos e aos Pagamentos online", async () => {
    render(<CentralDeAjuda />);

    await userEvent.type(screen.getByRole("searchbox", { name: "Buscar na ajuda" }), "stripe");

    expect(linksDasPerguntas()).toEqual(
      expect.arrayContaining(["/painel/planos", "/painel/configuracoes/pagamentos-online"])
    );
  });

  it("a busca filtra as perguntas e diz quando nada casa", async () => {
    render(<CentralDeAjuda />);

    await userEvent.type(screen.getByRole("searchbox", { name: "Buscar na ajuda" }), "lembrete");

    expect(perguntas().length).toBeGreaterThan(0);
    for (const botao of perguntas()) {
      const texto = `${botao.textContent} ${respostaDe(botao).textContent}`.toLowerCase();
      expect(texto).toContain("lembrete");
    }

    await userEvent.clear(screen.getByRole("searchbox", { name: "Buscar na ajuda" }));
    await userEvent.type(screen.getByRole("searchbox", { name: "Buscar na ajuda" }), "xyzzy");

    expect(screen.queryAllByRole("button").filter((b) => b.hasAttribute("aria-expanded"))).toHaveLength(0);
    expect(screen.getByText(/Nenhuma pergunta com/)).toBeInTheDocument();
  });
});
