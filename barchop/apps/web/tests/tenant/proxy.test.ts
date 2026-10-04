// @vitest-environment node
import { NextRequest } from "next/server";
import {
  getRedirectUrl,
  getRewrittenUrl,
  isRewrite,
  unstable_doesMiddlewareMatch,
} from "next/experimental/testing/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { config, proxy } from "../../proxy";
import { CABECALHO_DA_BARBEARIA } from "../../src/tenant/rota";

function pedir(url: string, cabecalhos: Record<string, string> = {}) {
  const { host } = new URL(url);
  return new NextRequest(url, { headers: { host, ...cabecalhos } });
}

// O NextResponse.next({ request: { headers } }) leva os cabeçalhos da
// requisição pro app por estes, na resposta do proxy.
function cabecalhoRepassado(resposta: Response, nome: string) {
  return resposta.headers.get(`x-middleware-request-${nome}`);
}

describe("proxy", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("reescreve o host da barbearia pra /[slug], com a query", () => {
    vi.stubEnv("NEXT_PUBLIC_URL_DO_SITE", "https://barchop.com.br");

    const resposta = proxy(pedir("https://gr-barber.barchop.com.br/agendar?servicos=s1"));

    expect(isRewrite(resposta)).toBe(true);
    const destino = new URL(getRewrittenUrl(resposta)!);
    expect(destino.pathname).toBe("/gr-barber/agendar");
    expect(destino.search).toBe("?servicos=s1");
  });

  it("conta pro app de qual barbearia é o host", () => {
    vi.stubEnv("NEXT_PUBLIC_URL_DO_SITE", "https://barchop.com.br");

    const resposta = proxy(pedir("https://gr-barber.barchop.com.br/"));

    expect(cabecalhoRepassado(resposta, CABECALHO_DA_BARBEARIA)).toBe("gr-barber");
  });

  it("não deixa quem chama inventar a barbearia pelo cabeçalho", () => {
    vi.stubEnv("NEXT_PUBLIC_URL_DO_SITE", "https://barchop.com.br");

    const resposta = proxy(
      pedir("https://barchop.com.br/", { [CABECALHO_DA_BARBEARIA]: "outra" })
    );

    expect(cabecalhoRepassado(resposta, CABECALHO_DA_BARBEARIA)).toBeNull();
  });

  it("redireciona o caminho antigo pro host da barbearia, com 308", () => {
    vi.stubEnv("NEXT_PUBLIC_URL_DO_SITE", "https://barchop.com.br");

    const resposta = proxy(pedir("https://barchop.com.br/gr-barber/agendar"));

    expect(resposta.status).toBe(308);
    expect(getRedirectUrl(resposta)).toBe("https://gr-barber.barchop.com.br/agendar");
  });

  it("sem site configurado, não mexe em nada", () => {
    vi.stubEnv("NEXT_PUBLIC_URL_DO_SITE", "");

    const resposta = proxy(pedir("http://localhost:3000/gr-barber"));

    expect(isRewrite(resposta)).toBe(false);
    expect(getRedirectUrl(resposta)).toBeNull();
  });
});

describe("o matcher do proxy", () => {
  function roda(url: string) {
    return unstable_doesMiddlewareMatch({ config, url });
  }

  it("roda nas páginas, inclusive no link do lembrete com pontos", () => {
    expect(roda("/")).toBe(true);
    expect(roda("/agendar/data")).toBe(true);
    expect(roda("/lembrete/aaa.bbb.ccc")).toBe(true);
  });

  it("não roda nos arquivos do Next nem nos estáticos", () => {
    expect(roda("/_next/static/chunks/app.js")).toBe(false);
    expect(roda("/_next/image")).toBe(false);
    expect(roda("/favicon.ico")).toBe(false);
  });
});
