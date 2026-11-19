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
    // Plano profissional-novo-pago, PR 5.
    expect(secao).toHaveTextContent(/Incluiu um profissional no meio do período: paga na hora só os dias que faltam/);
    expect(secao).toHaveTextContent(/Tirou um: o período em curso não é devolvido/);
  });

  it("a pergunta de mais profissionais diz o que acontece no meio do período", () => {
    render(<Precos />);
    const pergunta = screen.getByText("Quanto fica com mais profissionais?");
    const resposta = pergunta.closest("details")!;
    expect(resposta).toHaveTextContent(/no meio do período cobra na hora só os dias que faltam/);
    expect(resposta).toHaveTextContent(/tirar não devolve o período em curso/);
  });

  // O Pix do BarChop está ligado em produção desde 14/11: a página não
  // pode mais dizer "só cartão", e o que só vale pro cartão (renovar
  // sozinho, a Stripe tentar de novo) diz que é do cartão.
  it("diz que aceita cartão e Pix, e o que muda no Pix", () => {
    render(<Precos />);
    const secao = screen.getByRole("region", { name: "Como a cobrança funciona" });
    expect(secao).toHaveTextContent(/no cartão de crédito, pela Stripe, ou por Pix/);
    expect(secao).toHaveTextContent(/No cartão, o plano se renova sozinho/);
    expect(secao).toHaveTextContent(/No Pix, cada período é um Pix novo/);
    expect(secao).toHaveTextContent(/Se a cobrança no cartão falhar/);
    expect(secao).toHaveTextContent(/no Pix, o período pago começa quando ele acaba/);

    const pergunta = screen.getByText("Aceita Pix ou boleto?").closest("details")!;
    expect(pergunta).toHaveTextContent(/Pix, sim/);
    expect(pergunta).toHaveTextContent(/Boleto ainda não/);
    expect(document.body.textContent).not.toMatch(/só cartão/i);
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
