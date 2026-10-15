import { formatarReais, precoDoPlano } from "@barchop/formato";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TabelaDePrecos } from "../../src/site/TabelaDePrecos";

// O formatarReais separa "R$" do valor com espaço rígido (160), e o
// toHaveTextContent normaliza só o texto da página, não o esperado.
function reais(centavos: number): string {
  return formatarReais(centavos).replaceAll(String.fromCharCode(160), " ");
}

// A tabela dos três planos do site (Onda 2, PR 6 da cobrança). Os preços
// saem de planos.ts, como no painel e na Stripe: ninguém escreve um
// preço à mão. Os testes calculam o esperado pelo mesmo módulo.
function plano(nome: string) {
  return screen.getByRole("listitem", { name: nome });
}

describe("tabela de preços do site", () => {
  it("mostra os três planos, na ordem: Grátis, Essencial, Completo", () => {
    render(<TabelaDePrecos />);
    const nomes = within(screen.getByRole("list", { name: "Planos" }))
      .getAllByRole("heading", { level: 3 })
      .map((titulo) => titulo.textContent);
    expect(nomes).toEqual(["Grátis", "Essencial", "Completo"]);
  });

  it("o preço mensal de cada plano vem de planos.ts", () => {
    render(<TabelaDePrecos />);
    expect(plano("Grátis")).toHaveTextContent(reais(0));
    expect(plano("Essencial")).toHaveTextContent(reais(precoDoPlano("essencial", "mensal", 1)));
    expect(plano("Completo")).toHaveTextContent(reais(precoDoPlano("completo", "mensal", 1)));
  });

  it("os pagos dizem o anual, o extra por profissional e o limite", () => {
    render(<TabelaDePrecos />);
    const essencial = plano("Essencial");
    expect(essencial).toHaveTextContent(reais(precoDoPlano("essencial", "anual", 1)));
    expect(essencial).toHaveTextContent(`+ ${reais(1000)} por profissional a mais`);
    expect(essencial).toHaveTextContent("Até 3 profissionais");

    const completo = plano("Completo");
    expect(completo).toHaveTextContent(reais(precoDoPlano("completo", "anual", 1)));
    expect(completo).toHaveTextContent(`+ ${reais(1500)} por profissional a mais`);
    expect(completo).toHaveTextContent("Profissionais sem limite");

    expect(plano("Grátis")).toHaveTextContent("1 profissional");
  });

  it("o que ainda não existe aparece como em breve", () => {
    render(<TabelaDePrecos />);
    expect(plano("Completo")).toHaveTextContent(/WhatsApp[^.]*\(em breve\)/);
    expect(plano("Essencial")).toHaveTextContent(/Caixa[^.]*\(em breve\)/);
  });

  it("todo plano leva ao cadastro, que começa com o teste de 14 dias", () => {
    render(<TabelaDePrecos />);
    for (const nome of ["Grátis", "Essencial", "Completo"]) {
      const convite = within(plano(nome)).getByRole("link");
      expect(convite).toHaveAttribute("href", "/painel/cadastro");
    }
  });
});
