import { DIAS_DE_TESTE, formatarReais, precosDoCiclo } from "@barchop/formato";
import { describe, expect, it } from "vitest";
import { textoDoLlms } from "../../src/site/llms";
import { paginasDoSitemap } from "../../src/site/rastreadores";

// O /llms.txt (llmstxt.org): o resumo do site pra quem lê com IA. Puro,
// como o robots e o sitemap: quem lê NEXT_PUBLIC_URL_DO_SITE é a rota.
describe("llms.txt", () => {
  const texto = textoDoLlms("https://barchop.com.br");
  const linhas = texto.split("\n");

  it("abre com o nome no título e o resumo em citação", () => {
    expect(linhas[0]).toBe("# BarChop");
    const resumo = linhas.find((linha) => linha.startsWith("> "));
    expect(resumo).toContain("agenda online para barbearias");
  });

  it("lista toda página do sitemap, com o endereço inteiro", () => {
    for (const { url } of paginasDoSitemap("https://barchop.com.br")) {
      expect(texto).toContain(`](${url})`);
    }
  });

  it("todo link é inteiro", () => {
    const links = [...texto.matchAll(/\]\(([^)]+)\)/g)].map((achado) => achado[1]);
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) expect(link).toMatch(/^https:\/\/barchop\.com\.br\//);
  });

  it("os preços saem de planos.ts, nunca escritos à mão", () => {
    const essencial = precosDoCiclo("essencial", "mensal");
    const completo = precosDoCiclo("completo", "anual");
    expect(texto).toContain(formatarReais(essencial.base));
    expect(texto).toContain(formatarReais(essencial.extra));
    expect(texto).toContain(formatarReais(completo.base));
    expect(texto).toContain("Até 2 profissionais");
    expect(texto).toContain("Profissionais sem limite");
    expect(texto).toContain(`${DIAS_DE_TESTE} dias`);
  });

  // Plano profissional-novo-pago, PR 5: a mesma regra dos Termos e de Preços.
  it("diz o que custa incluir ou tirar um profissional no meio do período", () => {
    expect(texto).toContain(
      "Incluir um profissional no meio do período cobra na hora só os dias que faltam; tirar um não devolve o período em curso, e a próxima cobrança já vem com um a menos."
    );
  });

  it("sem o site configurado, os links ficam relativos", () => {
    // Desenvolvimento: não há endereço inteiro pra dar.
    const local = textoDoLlms(undefined);
    expect(local).toContain("](/precos)");
    expect(local).not.toContain("https://");
  });
});
