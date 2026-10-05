import { describe, expect, it } from "vitest";
import { origemPermitida, origensPermitidas, proxiesConfiaveis } from "../../src/lib/borda";

// Onda 1, G2: a API atrás do Caddy na VM da OCI. Quantos proxies na
// frente são de confiança (pro `request.ip` ser o do cliente, e não o do
// proxy) e de quais sites o navegador pode chamar a API.

describe("proxiesConfiaveis", () => {
  it("fora de produção e sem a variável, não confia em proxy nenhum", () => {
    expect(proxiesConfiaveis({})).toBe(false);
    expect(proxiesConfiaveis({ NODE_ENV: "development" })).toBe(false);
  });

  it("lê quantos saltos de proxy são de confiança", () => {
    expect(proxiesConfiaveis({ PROXIES_CONFIAVEIS: "1" })).toBe(1);
    expect(proxiesConfiaveis({ PROXIES_CONFIAVEIS: "2" })).toBe(2);
  });

  it.each(["0", "-1", "1.5", "sim", "true", ""])("recusa o valor torto %j", (valor) => {
    expect(() => proxiesConfiaveis({ PROXIES_CONFIAVEIS: valor })).toThrow(/PROXIES_CONFIAVEIS/);
  });

  it("em produção a API não sobe sem a variável: os limites por IP virariam um limite global", () => {
    expect(() => proxiesConfiaveis({ NODE_ENV: "production" })).toThrow(/PROXIES_CONFIAVEIS/);
    expect(proxiesConfiaveis({ NODE_ENV: "production", PROXIES_CONFIAVEIS: "1" })).toBe(1);
  });
});

describe("origensPermitidas", () => {
  it("fora de produção e sem a variável, aceita qualquer origem (dev local)", () => {
    expect(origensPermitidas({})).toBe(true);
  });

  it("em produção a API não sobe sem a lista", () => {
    expect(() => origensPermitidas({ NODE_ENV: "production" })).toThrow(/ORIGENS_PERMITIDAS/);
  });

  it.each(["barchop.com.br", "*", "https://*", "ftp://barchop.com.br", "https://barchop.com.br/painel"])(
    "recusa a origem torta %j",
    (origem) => {
      expect(() => origensPermitidas({ ORIGENS_PERMITIDAS: origem })).toThrow(/ORIGENS_PERMITIDAS/);
    }
  );

  it("aceita as origens da lista, exatas, sem diferença de espaço em volta", () => {
    const lista = origensPermitidas({
      ORIGENS_PERMITIDAS: " https://painel.barchop.com.br , https://www.barchop.com.br",
    });

    expect(origemPermitida(lista, "https://painel.barchop.com.br")).toBe(true);
    expect(origemPermitida(lista, "https://www.barchop.com.br")).toBe(true);
    expect(origemPermitida(lista, "http://painel.barchop.com.br")).toBe(false);
    expect(origemPermitida(lista, "https://painel.barchop.com.br.golpe.com")).toBe(false);
  });

  it("o coringa vale pra um nível de subdomínio: as barbearias", () => {
    const lista = origensPermitidas({ ORIGENS_PERMITIDAS: "https://*.barchop.com.br" });

    expect(origemPermitida(lista, "https://gr-barber.barchop.com.br")).toBe(true);
    expect(origemPermitida(lista, "https://barchop.com.br")).toBe(false);
    expect(origemPermitida(lista, "https://a.b.barchop.com.br")).toBe(false);
    expect(origemPermitida(lista, "https://gr-barber.barchop.com.br.golpe.com")).toBe(false);
    expect(origemPermitida(lista, "https://golpe-barchop.com.br")).toBe(false);
  });
});
