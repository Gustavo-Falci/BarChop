import { describe, expect, it } from "vitest";
import { resumirRelatorioDeCsp } from "../../src/lib/relatorio-de-csp";

// Auditoria de segurança de 15/11, SEC-003. A política de script do web
// entra primeiro em modo relatório: o navegador não bloqueia nada, só
// avisa aqui o que bloquearia. O aviso vem de qualquer um na internet —
// então o que vai pro log é pouco, curto e sem segredo.

describe("resumirRelatorioDeCsp", () => {
  it("guarda a página, a diretiva e o que seria bloqueado", () => {
    const resumo = resumirRelatorioDeCsp({
      "csp-report": {
        "document-uri": "https://barbearia-um.barchop.com.br/agendar",
        "effective-directive": "script-src-elem",
        "violated-directive": "script-src-elem",
        "blocked-uri": "https://cdn.exemplo.com/x.js",
        "source-file": "https://barbearia-um.barchop.com.br/_next/static/chunks/a.js",
        "line-number": 12,
        disposition: "report",
      },
    });

    expect(resumo).toEqual({
      pagina: "https://barbearia-um.barchop.com.br/agendar",
      diretiva: "script-src-elem",
      bloqueado: "https://cdn.exemplo.com/x.js",
      arquivo: "https://barbearia-um.barchop.com.br/_next/static/chunks/a.js",
      linha: 12,
      modo: "report",
    });
  });

  it("tira a query e o fragmento, e esconde o token do link do lembrete", () => {
    // O link do lembrete é um link de cancelar que funciona: no log,
    // seria o horário de alguém na mão de quem lê o log.
    const resumo = resumirRelatorioDeCsp({
      "csp-report": {
        "document-uri": "https://barbearia-um.barchop.com.br/lembrete/eyJhbGciOi.segredo.assinatura?x=1#topo",
        "violated-directive": "connect-src",
        "blocked-uri": "https://fora.exemplo.com/coleta?token=abc",
      },
    });

    expect(resumo?.pagina).toBe("https://barbearia-um.barchop.com.br/lembrete/***");
    expect(resumo?.bloqueado).toBe("https://fora.exemplo.com/coleta");
    expect(JSON.stringify(resumo)).not.toMatch(/segredo|token=abc/);
  });

  it("aceita os valores que não são endereço: inline, eval, data", () => {
    const resumo = resumirRelatorioDeCsp({
      "csp-report": { "document-uri": "https://barchop.com.br/", "violated-directive": "script-src", "blocked-uri": "eval" },
    });

    expect(resumo).toMatchObject({ bloqueado: "eval", diretiva: "script-src" });
  });

  it("corta o que é comprido demais e ignora campo de tipo errado", () => {
    const resumo = resumirRelatorioDeCsp({
      "csp-report": {
        "document-uri": `https://barchop.com.br/${"a".repeat(2000)}`,
        "violated-directive": "img-src\n linha falsa de log",
        "blocked-uri": { objeto: true },
        "line-number": "doze",
      },
    });

    expect(resumo!.pagina!.length).toBeLessThanOrEqual(200);
    expect(resumo!.diretiva).not.toMatch(/\n/);
    expect(resumo!.bloqueado).toBeNull();
    expect(resumo!.linha).toBeNull();
  });

  it("o que não é relatório de CSP é ignorado", () => {
    expect(resumirRelatorioDeCsp(null)).toBeNull();
    expect(resumirRelatorioDeCsp("texto")).toBeNull();
    expect(resumirRelatorioDeCsp({ outra: "coisa" })).toBeNull();
    expect(resumirRelatorioDeCsp({ "csp-report": "texto" })).toBeNull();
    // Sem diretiva não há o que investigar.
    expect(resumirRelatorioDeCsp({ "csp-report": { "document-uri": "https://barchop.com.br/" } })).toBeNull();
  });
});
