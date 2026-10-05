import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Home } from "../../src/site/Home";

// A home do SaaS (marco 1s): quem chega em barchop.com.br entende a
// promessa e vai pro cadastro sem falar com ninguém. O site só promete
// o que o produto já faz — daí os testes do que a página NÃO diz.
describe("home do site", () => {
  it("abre com a promessa", () => {
    render(<Home />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Sua barbearia agenda sozinha."
    );
  });

  it("todo convite pra começar leva ao cadastro da barbearia", () => {
    render(<Home />);
    const convites = screen.getAllByRole("link", { name: /criar minha barbearia/i });
    // O do topo e o do fim da página.
    expect(convites.length).toBeGreaterThanOrEqual(2);
    for (const convite of convites) {
      expect(convite).toHaveAttribute("href", "/painel/cadastro");
    }
  });

  it("explica como funciona em três passos, na ordem", () => {
    render(<Home />);
    const secao = screen.getByRole("region", { name: "Como funciona" });
    const passos = within(within(secao).getByRole("list")).getAllByRole("listitem");
    expect(passos).toHaveLength(3);
    expect(passos[0]).toHaveTextContent(/cadastr/i);
    expect(passos[1]).toHaveTextContent(/link/i);
    expect(passos[2]).toHaveTextContent(/lembrete/i);
  });

  // Preço e planos ficam pra Onda 2, com a cobrança (ADR-0007): até lá
  // o site não escreve valor nenhum, pra não prometer o que a API não
  // aplica.
  it("diz que é grátis no lançamento, sem valor em reais", () => {
    render(<Home />);
    const secao = screen.getByRole("region", { name: "Preço" });
    expect(secao).toHaveTextContent(/grátis/i);
    expect(document.body.textContent).not.toMatch(/R\$/);
  });

  // O lembrete sai por e-mail; o WhatsApp oficial espera a Meta
  // (ADR-0009). A dor do WhatsApp pode e deve aparecer — o que não pode
  // é uma frase ligar o lembrete ao WhatsApp.
  it("não promete lembrete pelo WhatsApp", () => {
    render(<Home />);
    const frases = (document.body.textContent ?? "").split(/[.?!]/);
    const prometeWhatsapp = frases.filter(
      (frase) => /lembrete/i.test(frase) && /whatsapp/i.test(frase)
    );
    expect(prometeWhatsapp).toEqual([]);
    expect(screen.getByRole("region", { name: "O que vem junto" })).toHaveTextContent(
      /e-mail/i
    );
  });

  it("as perguntas frequentes abrem a resposta ao tocar", async () => {
    render(<Home />);
    const secao = screen.getByRole("region", { name: "Perguntas frequentes" });
    const pergunta = within(secao).getByText("Quanto custa?");
    const item = pergunta.closest("details");
    expect(item).not.toHaveAttribute("open");

    await userEvent.click(pergunta);

    expect(item).toHaveAttribute("open");
  });
});
