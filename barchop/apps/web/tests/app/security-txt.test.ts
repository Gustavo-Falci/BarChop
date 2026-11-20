// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "../../app/.well-known/security.txt/route";
import { config } from "../../proxy";

// Auditoria de segurança de 15/11 (SEC-022): quem acha uma falha não
// tinha a quem avisar. O security.txt (RFC 9116) é onde se procura.
describe("security.txt", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("diz a quem avisar, com o e-mail de quem responde pelo BarChop", async () => {
    vi.stubEnv("NEXT_PUBLIC_VENDEDOR_EMAIL", "contato@exemplo.com");
    vi.stubEnv("NEXT_PUBLIC_URL_DO_SITE", "https://barchop.com.br");

    const resposta = GET();
    const texto = await resposta.text();

    expect(resposta.status).toBe(200);
    expect(resposta.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(texto).toContain("Contact: mailto:contato@exemplo.com\n");
    expect(texto).toContain("Preferred-Languages: pt-BR, en\n");
    expect(texto).toContain("Canonical: https://barchop.com.br/.well-known/security.txt\n");
  });

  it("vence em menos de um ano, como a RFC pede, e nunca no passado", async () => {
    vi.stubEnv("NEXT_PUBLIC_VENDEDOR_EMAIL", "contato@exemplo.com");

    const texto = await GET().text();
    const vence = new Date(texto.match(/^Expires: (.+)$/m)?.[1] ?? "");

    const dias = (vence.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
    expect(dias).toBeGreaterThan(150);
    expect(dias).toBeLessThan(365);
  });

  it("sem o e-mail configurado responde 404, em vez de um arquivo sem contato", () => {
    // O repositório é público e não guarda o e-mail: sem a variável
    // (desenvolvimento), não há o que publicar.
    vi.stubEnv("NEXT_PUBLIC_VENDEDOR_EMAIL", "");

    expect(GET().status).toBe(404);
  });

  it("o proxy não trata .well-known como link de barbearia", () => {
    // Senão barchop.com.br/.well-known/security.txt viraria um
    // redirecionamento pra ".well-known.barchop.com.br".
    const padrao = new RegExp(`^${config.matcher[0]}$`);

    expect(padrao.test("/.well-known/security.txt")).toBe(false);
    expect(padrao.test("/gr-barber")).toBe(true);
  });
});
