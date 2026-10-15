import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Privacidade } from "../../src/site/Privacidade";
import { RodapeDoSite } from "../../src/site/RodapeDoSite";
import { Termos } from "../../src/site/Termos";

// Termos de uso e política de privacidade (onda 1s-b; cobrança na
// Onda 2, PR 6). Rascunho base, marcado pra revisão jurídica. Quem vende
// é pessoa física: nome, CPF e e-mail vêm de NEXT_PUBLIC_VENDEDOR_* no
// build — o repositório é público e não guarda o CPF. Sem as variáveis,
// "a preencher". Os dados abaixo são inventados.

const VENDEDOR = {
  NEXT_PUBLIC_VENDEDOR_NOME: "Fulana de Tal",
  NEXT_PUBLIC_VENDEDOR_CPF: "12345678909",
  NEXT_PUBLIC_VENDEDOR_EMAIL: "contato@exemplo.com",
};

function comVendedor(valores: Record<string, string> = VENDEDOR) {
  for (const [nome, valor] of Object.entries(valores)) vi.stubEnv(nome, valor);
}

function semVendedor() {
  comVendedor({ NEXT_PUBLIC_VENDEDOR_NOME: "", NEXT_PUBLIC_VENDEDOR_CPF: "", NEXT_PUBLIC_VENDEDOR_EMAIL: "" });
}

afterEach(() => {
  vi.unstubAllEnvs();
});

function titulos() {
  return screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
}

describe("termos de uso", () => {
  it("tem o título, o aviso de texto em revisão e a data de vigência", () => {
    render(<Termos />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Termos de uso");
    expect(screen.getByText(/texto em revisão/i)).toBeInTheDocument();
    expect(screen.getByText(/vigente desde/i)).toBeInTheDocument();
  });

  it("cobre o serviço, a conta, os dados dos clientes, a disponibilidade e o encerramento", () => {
    render(<Termos />);
    const secoes = titulos().join(" | ");
    expect(secoes).toMatch(/serviço/i);
    expect(secoes).toMatch(/conta/i);
    expect(secoes).toMatch(/dados dos seus clientes/i);
    expect(secoes).toMatch(/disponibilidade/i);
    expect(secoes).toMatch(/encerramento/i);
  });

  it("não escreve preço (fica em /precos) nem promete lembrete por WhatsApp", () => {
    render(<Termos />);
    expect(document.body.textContent).not.toMatch(/R\$/);
    expect(document.body.textContent).not.toMatch(/lembrete[^.]*whatsapp/i);
    expect(document.body.textContent).not.toMatch(/lançamento/i);
  });

  it("quem vende é pessoa física: nome, CPF formatado e e-mail, vindos do build", () => {
    comVendedor();
    render(<Termos />);
    const quemSomos = screen.getByRole("region", { name: "Quem somos" });
    expect(quemSomos).toHaveTextContent("Fulana de Tal");
    expect(quemSomos).toHaveTextContent("CPF 123.456.789-09");
    expect(quemSomos).toHaveTextContent(/pessoa física/i);
    expect(within(quemSomos).getByRole("link", { name: "contato@exemplo.com" })).toHaveAttribute(
      "href",
      "mailto:contato@exemplo.com"
    );
    expect(document.body.textContent).not.toMatch(/CNPJ|razão social/i);
  });

  it("sem as variáveis do build, os dados de quem vende ficam a preencher", () => {
    semVendedor();
    render(<Termos />);
    expect(screen.getByRole("region", { name: "Quem somos" })).toHaveTextContent(/a preencher/i);
  });

  it("explica a cobrança: teste, renovação, troca, cancelamento, atraso e a Stripe", () => {
    render(<Termos />);
    const cobranca = screen.getByRole("region", { name: /cobrança/i });
    expect(cobranca).toHaveTextContent(/14 dias/);
    expect(cobranca).toHaveTextContent(/renova/i);
    expect(cobranca).toHaveTextContent(/só a diferença/);
    expect(cobranca).toHaveTextContent(/cancelar quando quiser/i);
    expect(cobranca).toHaveTextContent(/fim do período/i);
    expect(cobranca).toHaveTextContent(/tenta cobrar de novo/i);
    expect(cobranca).toHaveTextContent(/nada é apagado/i);
    expect(cobranca).toHaveTextContent(/Stripe/);
    expect(within(cobranca).getByRole("link", { name: /preços/i })).toHaveAttribute("href", "/precos");
  });
});

describe("política de privacidade", () => {
  it("tem o título, o aviso e a data de vigência", () => {
    render(<Privacidade />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Política de privacidade");
    expect(screen.getByText(/texto em revisão/i)).toBeInTheDocument();
    expect(screen.getByText(/vigente desde/i)).toBeInTheDocument();
  });

  it("diz quando o BarChop é controlador e quando é operador (LGPD)", () => {
    render(<Privacidade />);
    const texto = document.body.textContent ?? "";
    expect(texto).toMatch(/controlador/i);
    expect(texto).toMatch(/operador/i);
  });

  it("nomeia quem ajuda a operar: e-mail, hospedagem e pagamento", () => {
    render(<Privacidade />);
    const quemAjuda = screen.getByRole("region", { name: /quem nos ajuda/i });
    expect(quemAjuda).toHaveTextContent(/Resend/);
    expect(quemAjuda).toHaveTextContent(/Oracle/);
    expect(quemAjuda).toHaveTextContent(/Stripe/);
  });

  it("diz que o cartão fica com a Stripe, e não com o BarChop", () => {
    render(<Privacidade />);
    expect(document.body.textContent).toMatch(/não vê nem guarda os dados do cartão/i);
  });

  it("o contato é de quem vende, com o e-mail também para o encarregado", () => {
    comVendedor();
    render(<Privacidade />);
    expect(titulos().join(" | ")).toMatch(/seus direitos/i);
    const contato = screen.getByRole("region", { name: /contato/i });
    expect(contato).toHaveTextContent("Fulana de Tal");
    expect(contato).toHaveTextContent("CPF 123.456.789-09");
    expect(within(contato).getByRole("link", { name: "contato@exemplo.com" })).toHaveAttribute(
      "href",
      "mailto:contato@exemplo.com"
    );
    expect(contato).toHaveTextContent(/encarregado/i);
  });

  it("sem as variáveis do build, o contato fica a preencher", () => {
    semVendedor();
    render(<Privacidade />);
    const contato = screen.getByRole("region", { name: /contato/i });
    expect(within(contato).getAllByText(/a preencher/i).length).toBeGreaterThan(0);
  });
});

describe("rodapé do site", () => {
  it("leva aos termos e à privacidade", () => {
    render(<RodapeDoSite />);
    expect(screen.getByRole("link", { name: /termos de uso/i })).toHaveAttribute("href", "/termos");
    expect(screen.getByRole("link", { name: /privacidade/i })).toHaveAttribute("href", "/privacidade");
  });
});
