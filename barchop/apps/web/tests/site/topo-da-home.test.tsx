import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen, within } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TopoDaHome } from "../../src/site/TopoDaHome";

// Home nova, marco 2: o topo do protótipo, parado. Fundo escuro, "Bar"
// fino atrás da cadeira e "Chop" pesado na frente, a promessa como
// título, o status de exemplo, o apoio e os convites. Tudo no HTML do
// servidor: nada aqui depende de JavaScript.
function topo() {
  render(<TopoDaHome />);
  return screen.getByRole("region", { name: "Sua barbearia agenda sozinha." });
}

describe("topo da home", () => {
  it("o título é a promessa, e o nome gigante fica fora da leitura", () => {
    const secao = topo();
    expect(within(secao).getByRole("heading", { level: 1 }).textContent).toBe(
      "Sua barbearia agenda sozinha."
    );
    // "Bar" e "Chop" são desenho: o leitor de tela não soletra o nome.
    const nome = within(secao).getByText("Bar").parentElement!;
    expect(nome).toHaveAttribute("aria-hidden", "true");
    expect(nome).toHaveTextContent("BarChop");
  });

  it("serve de âncora pro cabeçalho da home", () => {
    expect(topo()).toHaveAttribute("id", "topo-da-home");
  });

  it("o convite leva ao cadastro marcado como vindo da home", () => {
    within(topo())
      .getAllByRole("link", { name: "Criar minha barbearia grátis" })
      .forEach((convite) => expect(convite).toHaveAttribute("href", "/painel/cadastro?origem=home"));
  });

  it("o segundo botão leva a como funciona, na própria home", () => {
    expect(within(topo()).getByRole("link", { name: "Ver como funciona" })).toHaveAttribute(
      "href",
      "#como-funciona"
    );
  });

  it("o status diz que é exemplo", () => {
    expect(topo()).toHaveTextContent("Exemplo · próximo horário livre 14:40");
  });

  it("promete o teste de 14 dias, sem cartão, e diz o que o produto é", () => {
    const secao = topo();
    expect(secao).toHaveTextContent(/14 dias com tudo liberado/);
    expect(secao).toHaveTextContent(/sem cartão/i);
    expect(secao).toHaveTextContent("Agenda online para barbearias");
    expect(secao).toHaveTextContent(/link da sua barbearia/);
  });

  it("a cadeira é imagem decorativa, pronta na primeira pintura", () => {
    const html = renderToString(<TopoDaHome />);
    const secao = topo();
    // alt vazio: some da árvore de acessibilidade.
    const imagem = secao.querySelector("picture img")!;
    expect(imagem).toHaveAttribute("alt", "");
    expect(imagem).toHaveAttribute("src", "/home/cadeira-1280.webp");
    // Largura e altura reservam o lugar (sem pulo de layout).
    expect(imagem).toHaveAttribute("width");
    expect(imagem).toHaveAttribute("height");
    expect(html).toMatch(/fetchPriority="high"|fetchpriority="high"/);
    // AVIF e WebP, e o recorte do celular até 760px.
    const fontes = [...secao.querySelectorAll("picture source")];
    expect(fontes.map((f) => f.getAttribute("type"))).toEqual([
      "image/avif",
      "image/webp",
      "image/avif",
      "image/webp",
    ]);
    expect(fontes[0]).toHaveAttribute("media", "(max-width: 760px)");
    expect(fontes[0].getAttribute("srcset")).toContain("/home/cadeira-celular-640.avif 640w");
    expect(fontes[2].getAttribute("srcset")).toContain("/home/cadeira-2200.avif 2200w");
  });

  // O jsdom não faz layout: os testes de CSS leem as regras.
  const css = () =>
    readFileSync(join(__dirname, "../../src/site/TopoDaHome.module.css"), "utf8").replace(
      /\r\n/g,
      "\n"
    );

  it("no celular baixo, o apoio e a nota saem pra não cobrir o Chop", () => {
    expect(css()).toMatch(
      /@media \(max-width: 760px\) and \(max-height: 720px\)\s*\{[^}]*\.apoio[^{]*\.nota[^{]*\{[^}]*display:\s*none/
    );
  });

  it("com reduzir movimento, o ponto do status para", () => {
    expect(css()).toMatch(
      /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.ponto\s*\{[^}]*animation:\s*none/
    );
  });

  it("ocupa a tela inteira, medida pela tela com as barras do navegador", () => {
    expect(css()).toMatch(/\.topo\s*\{[^}]*height:\s*100svh/);
  });
});
