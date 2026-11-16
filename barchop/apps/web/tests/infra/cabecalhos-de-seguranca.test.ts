import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
// CommonJS de propósito: quem usa é o next.config.js, que o Next carrega
// antes de saber compilar TypeScript.
import { cabecalhosDeSeguranca } from "../../cabecalhos-de-seguranca";
import nextConfig from "../../next.config";

// Auditoria de segurança de 15/11 (SEC-003): o site, o painel e as
// páginas das barbearias respondiam sem nenhum cabeçalho de segurança.
// Não havia XSS conhecido; estes são a segunda linha, pra quando houver.

function valorDe(cabecalhos: { key: string; value: string }[], chave: string): string | undefined {
  return cabecalhos.find((c) => c.key.toLowerCase() === chave.toLowerCase())?.value;
}

describe("cabeçalhos de segurança do web", () => {
  const SITE = "https://barchop.com.br";

  it("manda o navegador voltar sempre por HTTPS, nos subdomínios também", () => {
    // Cada barbearia mora num subdomínio: sem o includeSubDomains, a
    // primeira visita por http:// a uma delas seguiria interceptável.
    expect(valorDe(cabecalhosDeSeguranca(SITE), "Strict-Transport-Security")).toBe(
      "max-age=31536000; includeSubDomains"
    );
  });

  it("proíbe adivinhar o tipo do arquivo e limita o que o Referer leva", () => {
    const cabecalhos = cabecalhosDeSeguranca(SITE);

    expect(valorDe(cabecalhos, "X-Content-Type-Options")).toBe("nosniff");
    // O link do lembrete leva o token no caminho: pra outro site vai só
    // a origem, nunca o caminho.
    expect(valorDe(cabecalhos, "Referrer-Policy")).toBe("strict-origin-when-cross-origin");
  });

  it("desliga câmera, microfone e localização, que o produto não usa", () => {
    expect(valorDe(cabecalhosDeSeguranca(SITE), "Permissions-Policy")).toBe(
      "camera=(), microphone=(), geolocation=()"
    );
  });

  it("só o painel pode abrir as páginas num iframe", () => {
    // A prévia da página (Configurações → Aparência) abre a página da
    // barbearia, que mora em outro host, num iframe do painel. Qualquer
    // outro site fica de fora: é o que fecha o clickjacking.
    const csp = valorDe(cabecalhosDeSeguranca(SITE), "Content-Security-Policy") ?? "";

    expect(csp).toContain("frame-ancestors 'self' https://painel.barchop.com.br");
  });

  it("sem o site configurado (desenvolvimento), a prévia é da mesma origem", () => {
    const csp = valorDe(cabecalhosDeSeguranca(undefined), "Content-Security-Policy") ?? "";

    expect(csp).toContain("frame-ancestors 'self'");
    expect(csp).not.toContain("painel.");
  });

  it("fecha plugin, <base> e formulário pra fora, sem tocar nos scripts", () => {
    // As diretivas que não dependem de nonce. A de script fica pra
    // quando houver quem leia os relatórios: errada, ela tira a página
    // do ar.
    const csp = valorDe(cabecalhosDeSeguranca(SITE), "Content-Security-Policy") ?? "";

    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).not.toContain("script-src");
    expect(csp).not.toContain("default-src");
  });
});

// O resto da SEC-003: a política que limita de onde vem script e pra
// onde a página pode falar. Entra em modo relatório — o navegador não
// bloqueia nada, só avisa a API do que bloquearia — porque uma regra
// errada aqui tiraria a página do ar pra todo mundo.
describe("política de conteúdo em modo relatório", () => {
  const SITE = "https://barchop.com.br";
  const PRODUCAO = { urlDaApi: "https://api.barchop.com.br", producao: true };

  function relatorio(opcoes: Parameters<typeof cabecalhosDeSeguranca>[1]): string | undefined {
    return valorDe(cabecalhosDeSeguranca(SITE, opcoes), "Content-Security-Policy-Report-Only");
  }

  it("script só da própria origem; nada de fora, nada de eval", () => {
    const politica = relatorio(PRODUCAO) ?? "";

    expect(politica).toContain("default-src 'self'");
    // 'unsafe-inline' fica: os scripts de tema do layout são em linha, e
    // tirar isso pede nonce (página dinâmica) — decisão à parte.
    expect(politica).toContain("script-src 'self' 'unsafe-inline'");
    expect(politica).not.toContain("unsafe-eval");
    expect(politica).not.toMatch(/script-src[^;]*https?:/);
  });

  it("a página só fala com a própria origem e com a API", () => {
    // É o que impede um script injetado de mandar o token pra fora por
    // fetch: o destino tem que estar na lista.
    expect(relatorio(PRODUCAO)).toContain("connect-src 'self' https://api.barchop.com.br");
  });

  it("iframe só das páginas das barbearias, que o painel mostra na prévia", () => {
    expect(relatorio(PRODUCAO)).toContain("frame-src 'self' https://*.barchop.com.br");
  });

  it("avisa a API do que seria bloqueado", () => {
    expect(relatorio(PRODUCAO)).toContain("report-uri https://api.barchop.com.br/relatorios/csp");
  });

  it("a API com caminho ou barra no fim vira só a origem", () => {
    const politica = relatorio({ urlDaApi: "https://api.barchop.com.br/", producao: true }) ?? "";

    expect(politica).toContain("connect-src 'self' https://api.barchop.com.br;");
    expect(politica).toContain("report-uri https://api.barchop.com.br/relatorios/csp");
  });

  it("fora de produção ou sem a API configurada, não há política de relatório", () => {
    // Em desenvolvimento o Next usa eval e a página viveria mandando
    // relatório do próprio ambiente.
    expect(relatorio({ urlDaApi: "http://localhost:3333", producao: false })).toBeUndefined();
    expect(relatorio({ urlDaApi: undefined, producao: true })).toBeUndefined();
    expect(relatorio(undefined)).toBeUndefined();
  });

  it("não muda a política que já vale de verdade", () => {
    const csp = valorDe(cabecalhosDeSeguranca(SITE, PRODUCAO), "Content-Security-Policy") ?? "";

    expect(csp).not.toContain("script-src");
    expect(csp).toContain("frame-ancestors 'self' https://painel.barchop.com.br");
  });
});

describe("next.config", () => {
  it("põe os cabeçalhos em todas as rotas", async () => {
    const regras = (await nextConfig.headers?.()) ?? [];

    expect(regras).toHaveLength(1);
    expect(regras[0].source).toBe("/:path*");
    expect(regras[0].headers).toEqual(
      cabecalhosDeSeguranca(process.env.NEXT_PUBLIC_URL_DO_SITE, {
        urlDaApi: process.env.NEXT_PUBLIC_API_URL,
        producao: process.env.NODE_ENV === "production",
      })
    );
  });

  it("não anuncia o framework", () => {
    expect(nextConfig.poweredByHeader).toBe(false);
  });
});

describe("borda", () => {
  const caddyfile = () =>
    readFileSync(join(__dirname, "../../../../infra/caddy/Caddyfile"), "utf8").replace(/\r\n/g, "\n");

  it("o otimizador de imagens do Next não fica exposto", () => {
    // O app não usa next/image, e o otimizador foi o alvo do aviso mais
    // grave de 2026 (GHSA-2464-fhr4-w9xw). O que não é usado não precisa
    // responder.
    expect(caddyfile()).toMatch(/@otimizador path \/_next\/image\*/);
    expect(caddyfile()).toMatch(/respond @otimizador 404/);
  });
});
