import { readFileSync } from "node:fs";
import { join } from "node:path";
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

  it("leva aos preços", () => {
    render(<CabecalhoDoSite />);
    expect(screen.getByRole("link", { name: "Preços" })).toHaveAttribute("href", "/precos");
  });

  // Com Preços, Entrar e Criar barbearia, o cabeçalho passava de 375px
  // (48px a mais). No celular estreito o Preços sai — o rodapé e a Home
  // levam aos preços. O jsdom não faz layout: o teste lê a regra do CSS.
  it("no celular estreito, o Preços sai do cabeçalho pra caber", () => {
    const css = readFileSync(join(__dirname, "../../src/site/CabecalhoDoSite.module.css"), "utf8");
    expect(css).toMatch(/@media \(max-width: 419px\)\s*\{[^}]*\.precos\s*\{[^}]*display:\s*none/);
    render(<CabecalhoDoSite />);
    expect(screen.getByRole("link", { name: "Preços" }).className).toMatch(/precos/);
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
