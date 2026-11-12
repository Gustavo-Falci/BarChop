import { describe, expect, it } from "vitest";
import { prisma } from "@barchop/database";
import { buildApp } from "../../src/app";
import type { App } from "../../src/tipos";

// Home nova, marco 1: a home avisa que foi vista, uma vez por aba. Aberta
// (sem login) e sem nada que identifique quem visitou; o limite por IP
// segura quem tentar inflar a conta.

const MAX_VISITAS_POR_IP = 20;

function avisar(app: App, payload: object = { pagina: "home" }) {
  return app.inject({ method: "POST", url: "/site/visita", payload });
}

async function visitas() {
  const linhas = await prisma.contagemDoSite.findMany({ where: { evento: "visita_home" } });
  return linhas.reduce((soma, linha) => soma + linha.total, 0);
}

describe("POST /site/visita", () => {
  it("conta a visita da home e responde 204", async () => {
    const app = buildApp();
    const resposta = await avisar(app);

    expect(resposta.statusCode).toBe(204);
    expect(await visitas()).toBe(1);
  });

  it("página que não é contada → 400, sem contar", async () => {
    const app = buildApp();

    expect((await avisar(app, { pagina: "precos" })).statusCode).toBe(400);
    expect((await avisar(app, {})).statusCode).toBe(400);
    expect((await avisar(app, { pagina: "home", extra: 1 })).statusCode).toBe(400);
    expect(await visitas()).toBe(0);
  });

  it("o mesmo IP não passa do limite por minuto", async () => {
    const app = buildApp();
    const antes: number[] = [];
    for (let i = 0; i < MAX_VISITAS_POR_IP; i += 1) antes.push((await avisar(app)).statusCode);
    const bloqueado = await avisar(app);

    expect(antes).not.toContain(429);
    expect(bloqueado.statusCode).toBe(429);
    expect(await visitas()).toBe(MAX_VISITAS_POR_IP);
  });
});
