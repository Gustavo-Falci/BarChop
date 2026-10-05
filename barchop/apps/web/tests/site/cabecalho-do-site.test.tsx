import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CabecalhoDoSite } from "../../src/site/CabecalhoDoSite";

// No www, os links do painel são relativos de propósito: o proxy manda
// `/painel/…` com 308 pro host `painel.` (src/tenant/rota.ts), e em
// desenvolvimento, sem site configurado, eles abrem ali mesmo.
describe("cabeçalho do site", () => {
  it("a marca volta pra home", () => {
    render(<CabecalhoDoSite />);
    expect(screen.getByRole("link", { name: "BarChop" })).toHaveAttribute("href", "/");
  });

  it("quem já tem conta entra no painel", () => {
    render(<CabecalhoDoSite />);
    expect(screen.getByRole("link", { name: "Entrar" })).toHaveAttribute(
      "href",
      "/painel/entrar"
    );
  });

  it("quem não tem cria a barbearia", () => {
    render(<CabecalhoDoSite />);
    expect(screen.getByRole("link", { name: "Criar barbearia" })).toHaveAttribute(
      "href",
      "/painel/cadastro"
    );
  });
});
