import { describe, expect, it } from "vitest";
import { buildApp } from "../../src/app";
import type { App } from "../../src/tipos";

// Auditoria de segurança de 15/11, SEC-003: o endereço pra onde o
// navegador manda o que a política de script do web bloquearia. Aberto,
// sem login — quem manda é o navegador de qualquer visitante.

const RELATORIO = {
  "csp-report": {
    "document-uri": "https://barbearia-um.barchop.com.br/",
    "violated-directive": "script-src-elem",
    "blocked-uri": "https://cdn.exemplo.com/x.js",
  },
};

function enviar(app: App, corpo: string, tipo = "application/csp-report") {
  return app.inject({
    method: "POST",
    url: "/relatorios/csp",
    headers: { "content-type": tipo },
    payload: corpo,
  });
}

describe("POST /relatorios/csp", () => {
  it("aceita o relatório do navegador e não devolve nada", async () => {
    const app = buildApp();

    const resposta = await enviar(app, JSON.stringify(RELATORIO));

    expect(resposta.statusCode).toBe(204);
    expect(resposta.body).toBe("");
    await app.close();
  });

  it("aceita também como JSON comum", async () => {
    const app = buildApp();

    expect((await enviar(app, JSON.stringify(RELATORIO), "application/json")).statusCode).toBe(204);
    await app.close();
  });

  it("lixo não derruba nem ganha resposta diferente", async () => {
    // A mesma resposta pra tudo: não ajuda ninguém a sondar.
    const app = buildApp();

    expect((await enviar(app, "isto não é json")).statusCode).toBe(204);
    expect((await enviar(app, JSON.stringify({ outra: "coisa" }))).statusCode).toBe(204);
    await app.close();
  });

  it("recusa corpo grande: relatório de verdade é pequeno", async () => {
    const app = buildApp();
    const grande = JSON.stringify({ "csp-report": { "document-uri": "x".repeat(20 * 1024) } });

    expect((await enviar(app, grande)).statusCode).toBe(413);
    await app.close();
  });

  it("tem limite por IP: ninguém enche o log por aqui", async () => {
    const app = buildApp();
    const respostas: number[] = [];
    for (let i = 0; i < 35; i += 1) {
      respostas.push((await enviar(app, JSON.stringify(RELATORIO))).statusCode);
    }

    expect(respostas.slice(0, 30).every((status) => status === 204)).toBe(true);
    expect(respostas.at(-1)).toBe(429);
    await app.close();
  });
});
