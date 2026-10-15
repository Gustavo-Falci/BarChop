import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Gratis } from "../../src/site/Gratis";
import { Precos } from "../../src/site/Precos";

// /precos e /gratis (Onda 2, PR 6 da cobrança). /precos mostra a tabela
// e explica como a cobrança funciona; /gratis leva ao cadastro com o
// Grátis em destaque (resposta do dono em 13/10). As regras ditas aqui
// são as que a Stripe e a API aplicam.
describe("página de preços", () => {
  it("abre com o título e a tabela dos planos", () => {
    render(<Precos />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Preços");
    expect(screen.getByRole("list", { name: "Planos" })).toBeInTheDocument();
  });

  it("explica como a cobrança funciona", () => {
    render(<Precos />);
    const secao = screen.getByRole("region", { name: "Como a cobrança funciona" });
    expect(secao).toHaveTextContent(/14 dias/);
    expect(secao).toHaveTextContent(/sem cartão/i);
    expect(secao).toHaveTextContent(/Stripe/);
    expect(secao).toHaveTextContent(/cancel/i);
    expect(secao).toHaveTextContent(/só a diferença/);
    expect(secao).toHaveTextContent(/nada é apagado/i);
  });

  it("as perguntas abrem ao tocar, e o convite leva ao cadastro", () => {
    render(<Precos />);
    const perguntas = screen.getByRole("region", { name: "Perguntas frequentes" });
    expect(within(perguntas).getAllByRole("group").length).toBeGreaterThan(0);
    const convites = screen.getAllByRole("link", { name: /criar minha barbearia/i });
    expect(convites.length).toBeGreaterThan(0);
    for (const convite of convites) expect(convite).toHaveAttribute("href", "/painel/cadastro");
  });
});

describe("página do Grátis", () => {
  it("o Grátis em destaque: R$ 0, para sempre, com 1 profissional", () => {
    render(<Gratis />);
    const titulo = screen.getByRole("heading", { level: 1 });
    expect(titulo).toHaveTextContent(/grátis/i);
    expect(document.body.textContent).toMatch(/R\$\s0,00/);
    expect(document.body.textContent).toMatch(/1 profissional/);
  });

  it("conta que começa com 14 dias de tudo liberado e que nada é apagado", () => {
    render(<Gratis />);
    expect(document.body.textContent).toMatch(/14 dias/);
    expect(document.body.textContent).toMatch(/nada é apagado/i);
  });

  it("leva ao cadastro, e quem quer mais vê os planos", () => {
    render(<Gratis />);
    const convites = screen.getAllByRole("link", { name: /criar minha barbearia/i });
    for (const convite of convites) expect(convite).toHaveAttribute("href", "/painel/cadastro");
    expect(screen.getByRole("link", { name: /ver os planos/i })).toHaveAttribute("href", "/precos");
  });
});
