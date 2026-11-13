import { readFileSync } from "node:fs";
import { join } from "node:path";
import { formatarReais, precoDoPlano } from "@barchop/formato";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

// `next/font/local` só existe dentro do build do Next (o topo da home
// carrega os pesos leves da Clash): o dublê devolve só o `.variable`.
vi.mock("next/font/local", () => ({
  default: ({ variable }: { variable: string }) => ({ variable }),
}));

import { Home } from "../../src/site/Home";

// O formatarReais separa "R$" do valor com espaço rígido (160), e o
// toHaveTextContent normaliza só o texto da página, não o esperado.
function reais(centavos: number): string {
  return formatarReais(centavos).replaceAll(String.fromCharCode(160), " ");
}

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

  it("todo convite pra começar leva ao cadastro da barbearia, marcado como vindo da home", () => {
    render(<Home />);
    const convites = screen.getAllByRole("link", { name: /criar minha barbearia/i });
    // O do topo e o do fim da página. A marca ?origem=home é o que a
    // linha de base da home nova conta (marco 1).
    expect(convites.length).toBeGreaterThanOrEqual(2);
    for (const convite of convites) {
      expect(convite).toHaveAttribute("href", "/painel/cadastro?origem=home");
    }
  });

  it("os planos da home também levam ao cadastro marcado como vindo da home", () => {
    render(<Home />);
    const secao = screen.getByRole("region", { name: "Planos" });
    const convites = within(secao).getAllByRole("link", { name: /começar grátis|testar 14 dias/i });
    expect(convites).toHaveLength(3);
    for (const convite of convites) {
      expect(convite).toHaveAttribute("href", "/painel/cadastro?origem=home");
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

  // Os planos chegaram com a cobrança (Onda 2, PR 6): a Home mostra a
  // tabela lida de planos.ts e leva aos detalhes em /precos. O "grátis
  // durante o lançamento" saiu de vez.
  it("mostra os planos com os preços de planos.ts e leva a /precos", () => {
    render(<Home />);
    const secao = screen.getByRole("region", { name: "Planos" });
    expect(within(secao).getByRole("list", { name: "Planos" })).toBeInTheDocument();
    expect(secao).toHaveTextContent(reais(precoDoPlano("essencial", "mensal", 1)));
    expect(within(secao).getByRole("link", { name: /todos os detalhes/i })).toHaveAttribute("href", "/precos");
    expect(document.body.textContent).not.toMatch(/lançamento/i);
  });

  it("o convite do topo promete o teste de 14 dias, sem cartão", () => {
    render(<Home />);
    const topo = screen.getByRole("heading", { level: 1 }).closest("section") as HTMLElement;
    expect(topo).toHaveTextContent(/14 dias/);
    expect(topo).toHaveTextContent(/sem cartão/i);
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

  // Home nova, marco 2: o topo do protótipo entra no lugar do antigo.
  it("abre com o topo novo e o cabeçalho escuro, que olha o topo", () => {
    render(<Home />);
    expect(screen.getByRole("banner")).toHaveAttribute("data-tema", "escuro");
    expect(screen.getByRole("region", { name: "Sua barbearia agenda sozinha." })).toHaveAttribute(
      "id",
      "topo-da-home"
    );
    // A agenda de exemplo do topo antigo saiu.
    expect(screen.queryByText("Confirmado pelo cliente")).not.toBeInTheDocument();
  });

  it("o \"Ver como funciona\" do topo cai na seção, abaixo do cabeçalho fixo", () => {
    render(<Home />);
    expect(screen.getByRole("link", { name: "Ver como funciona" })).toHaveAttribute(
      "href",
      "#como-funciona"
    );
    expect(document.getElementById("como-funciona")).toBe(
      screen.getByRole("region", { name: "Como funciona" })
    );
    const css = readFileSync(join(__dirname, "../../src/site/Home.module.css"), "utf8");
    expect(css).toMatch(/\.secao\s*\{[^}]*scroll-margin-top/);
  });

  // Home nova, marco 4: as seções de baixo na linguagem do protótipo. O
  // nome de cada seção (o que o leitor de tela anuncia) é o rótulo curto
  // de sempre; o título grande é a frase leve + forte.
  it.each([
    ["Soa familiar?", "Cadeira vazia é horário perdido."],
    ["Como funciona", "Três passos e a agenda anda."],
    ["O que vem junto", "Do link ao lembrete, tudo num lugar só."],
    ["Planos", "Comece grátis, mude quando crescer."],
    ["Perguntas frequentes", "Antes de começar, o que todo mundo pergunta."],
  ])("a seção \"%s\" tem o rótulo em cima e o título \"%s\"", (rotulo, titulo) => {
    render(<Home />);
    const secao = screen.getByRole("region", { name: rotulo });
    expect(within(secao).getByRole("heading", { level: 2 })).toHaveTextContent(titulo);
  });

  it("nenhuma seção da home desenha caixa: sem cartão, tarja nem raio", () => {
    render(<Home />);
    const css = readFileSync(join(__dirname, "../../src/site/Home.module.css"), "utf8");
    expect(css).not.toMatch(/border-radius/);
    expect(css).not.toMatch(/border-left/);
    expect(screen.getByRole("list", { name: "Planos" })).toHaveAttribute("data-variante", "linhas");
  });

  it("fecha no escuro com o convite e o teste sem cartão", () => {
    render(<Home />);
    const fecho = screen.getByRole("region", { name: "Comece hoje, sem falar com ninguém." });
    expect(fecho).toHaveAttribute("id", "comecar");
    expect(within(fecho).getByRole("link", { name: /criar minha barbearia/i })).toHaveAttribute(
      "href",
      "/painel/cadastro?origem=home"
    );
    expect(fecho).toHaveTextContent(/sem cartão/i);
    const css = readFileSync(join(__dirname, "../../src/site/Home.module.css"), "utf8");
    expect(css).toMatch(/\.fecho\s*\{[^}]*background:\s*#151412/);
  });

  // A cadeira do topo é derivada do modelo "Barber Chair" (CC BY 4.0):
  // a licença pede o crédito, o link da licença e que diga que mudou.
  it("dá o crédito da cadeira, com o link do modelo e da licença", () => {
    render(<Home />);
    const credito = screen.getByText(/Barber Chair/).closest("p")!;
    expect(credito).toHaveTextContent(/sweedboy69/);
    expect(within(credito).getByRole("link", { name: "Barber Chair" })).toHaveAttribute(
      "href",
      "https://sketchfab.com/3d-models/barber-chair-b608436ca02d40c6a914fca72f7b3619"
    );
    expect(within(credito).getByRole("link", { name: "CC BY 4.0" })).toHaveAttribute(
      "href",
      "https://creativecommons.org/licenses/by/4.0/"
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
