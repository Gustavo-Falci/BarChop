import { describe, expect, it } from "vitest";
import { conferirAmbienteDaSessao } from "../../src/lib/sessao-por-cookie";

// A sessão por cookie (SEC-003) só protege se souber de onde vem cada
// página: sem URL_DO_PAINEL, o cookie do painel valeria vindo da página
// de qualquer barbearia, e sairia sem Secure; sem URL_DAS_BARBEARIAS, o
// do cliente ficaria preso ao painel e todo login de cliente cairia.
// Faltando uma delas em produção, a API não sobe, como já acontece com
// ORIGENS_PERMITIDAS e PROXIES_CONFIAVEIS (lib/borda.ts).

const PRODUCAO = {
  NODE_ENV: "production",
  URL_DO_PAINEL: "https://painel.barchop.com.br",
  URL_DAS_BARBEARIAS: "https://{slug}.barchop.com.br",
};

describe("conferirAmbienteDaSessao", () => {
  it("produção completa passa", () => {
    expect(() => conferirAmbienteDaSessao(PRODUCAO)).not.toThrow();
  });

  it("produção sem URL_DO_PAINEL não sobe", () => {
    expect(() => conferirAmbienteDaSessao({ ...PRODUCAO, URL_DO_PAINEL: undefined })).toThrow(/URL_DO_PAINEL/);
  });

  it("produção com o painel em http não sobe", () => {
    expect(() => conferirAmbienteDaSessao({ ...PRODUCAO, URL_DO_PAINEL: "http://painel.barchop.com.br" })).toThrow(
      /URL_DO_PAINEL/
    );
  });

  it("produção sem URL_DAS_BARBEARIAS não sobe", () => {
    expect(() => conferirAmbienteDaSessao({ ...PRODUCAO, URL_DAS_BARBEARIAS: undefined })).toThrow(
      /URL_DAS_BARBEARIAS/
    );
  });

  it("produção com as barbearias em http não sobe", () => {
    expect(() =>
      conferirAmbienteDaSessao({ ...PRODUCAO, URL_DAS_BARBEARIAS: "http://{slug}.barchop.com.br" })
    ).toThrow(/URL_DAS_BARBEARIAS/);
  });

  it("fora de produção, nada é exigido", () => {
    expect(() => conferirAmbienteDaSessao({})).not.toThrow();
  });
});
