import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Privacidade } from "../../src/site/Privacidade";
import { RodapeDoSite } from "../../src/site/RodapeDoSite";
import { Termos } from "../../src/site/Termos";

// Termos de uso e política de privacidade (onda 1s-b). Rascunho base,
// marcado pra revisão jurídica: razão social, CNPJ e e-mail do
// encarregado ainda não existem e aparecem como "a preencher".

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

  it("não promete preço nem lembrete por WhatsApp", () => {
    render(<Termos />);
    expect(document.body.textContent).not.toMatch(/R\$/);
    expect(document.body.textContent).not.toMatch(/lembrete[^.]*whatsapp/i);
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

  it("nomeia quem ajuda a operar: e-mail e hospedagem", () => {
    render(<Privacidade />);
    const texto = document.body.textContent ?? "";
    expect(texto).toMatch(/Resend/);
    expect(texto).toMatch(/Oracle/);
  });

  it("cobre os direitos do titular e o contato do encarregado, ainda a preencher", () => {
    render(<Privacidade />);
    expect(titulos().join(" | ")).toMatch(/seus direitos/i);
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
