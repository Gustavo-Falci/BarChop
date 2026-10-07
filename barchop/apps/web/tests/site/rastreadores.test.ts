import { describe, expect, it } from "vitest";
import { baseDoSite, paginasDoSitemap, regrasDoRobots } from "../../src/site/rastreadores";

// O robots.txt e o sitemap.xml saem do mesmo app em todo host (site,
// painel e barbearias): o proxy deixa os dois passarem sem reescrita.
describe("robots.txt", () => {
  it("libera o site e as barbearias, e fecha o painel", () => {
    const robots = regrasDoRobots("https://barchop.com.br");
    const regras = Array.isArray(robots.rules) ? robots.rules : [robots.rules];

    expect(regras).toHaveLength(1);
    expect(regras[0].userAgent).toBe("*");
    expect(regras[0].allow).toBe("/");
    expect(regras[0].disallow).toContain("/painel");
  });

  it("fecha o link do lembrete, que leva um token no caminho", () => {
    // No host da barbearia é /lembrete/<token>; no /[slug] do
    // desenvolvimento, /<slug>/lembrete/<token>.
    const robots = regrasDoRobots("https://barchop.com.br");
    const regras = Array.isArray(robots.rules) ? robots.rules : [robots.rules];

    expect(regras[0].disallow).toContain("/lembrete/");
    expect(regras[0].disallow).toContain("/*/lembrete/");
  });

  it("aponta o sitemap no host do site", () => {
    expect(regrasDoRobots("https://barchop.com.br").sitemap).toBe(
      "https://barchop.com.br/sitemap.xml"
    );
  });

  it("sem o site configurado, não aponta sitemap nenhum", () => {
    expect(regrasDoRobots(undefined).sitemap).toBeUndefined();
    expect(regrasDoRobots("").sitemap).toBeUndefined();
  });
});

describe("sitemap.xml", () => {
  it("lista só as páginas do site, com o endereço inteiro", () => {
    const urls = paginasDoSitemap("https://barchop.com.br").map((pagina) => pagina.url);

    expect(urls).toEqual([
      "https://barchop.com.br/",
      "https://barchop.com.br/termos",
      "https://barchop.com.br/privacidade",
    ]);
  });

  it("sem o site configurado, sai vazio", () => {
    // Endereço relativo não vale em sitemap; melhor nada que errado.
    expect(paginasDoSitemap(undefined)).toEqual([]);
    expect(paginasDoSitemap("")).toEqual([]);
  });
});

// A base dos endereços do Open Graph: a prévia do WhatsApp e do Google
// só aceita URL inteira.
describe("base do site", () => {
  it("é a raiz do site configurado", () => {
    expect(baseDoSite("https://barchop.com.br")?.toString()).toBe("https://barchop.com.br/");
  });

  it("sem o site configurado, fica de fora (o Next cai no localhost)", () => {
    expect(baseDoSite(undefined)).toBeUndefined();
    expect(baseDoSite("")).toBeUndefined();
  });
});
