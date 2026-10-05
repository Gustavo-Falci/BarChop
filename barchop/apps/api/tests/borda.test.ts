import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app";
import { comCodigo } from "./helpers/barbearia";

// Onda 1, G2: o que a borda configura chega mesmo nas rotas — CORS por
// lista e o IP do cliente atrás do proxy.

const MAX_SIGNUP_BARBEIRO = 5;

function preflight(app: ReturnType<typeof buildApp>, origem: string) {
  return app.inject({
    method: "OPTIONS",
    url: "/auth/login",
    headers: { origin: origem, "access-control-request-method": "POST" },
  });
}

async function signups(app: ReturnType<typeof buildApp>, ips: string[]) {
  const status: number[] = [];
  for (const [indice, ip] of ips.entries()) {
    const resposta = await app.inject({
      method: "POST",
      url: "/auth/signup",
      headers: { "x-forwarded-for": ip },
      payload: await comCodigo({
        barbearia: { nome: `Barbearia ${indice}`, slug: `barbearia-borda-${indice}` },
        barbeiro: { nome: `Dono ${indice}`, email: `borda-${indice}@exemplo.com`, senha: "senha-forte-123" },
      }),
    });
    status.push(resposta.statusCode);
  }
  return status;
}

const IPS_DIFERENTES = Array.from({ length: MAX_SIGNUP_BARBEIRO + 1 }, (_, i) => `203.0.113.${i + 1}`);

describe("CORS por lista", () => {
  it("responde o preflight de uma origem da lista", async () => {
    const app = buildApp({ ambiente: { ORIGENS_PERMITIDAS: "https://*.barchop.com.br" } });

    const resposta = await preflight(app, "https://gr-barber.barchop.com.br");

    expect(resposta.headers["access-control-allow-origin"]).toBe("https://gr-barber.barchop.com.br");
    await app.close();
  });

  it("não libera origem fora da lista", async () => {
    const app = buildApp({ ambiente: { ORIGENS_PERMITIDAS: "https://*.barchop.com.br" } });

    const resposta = await preflight(app, "https://golpe.com");

    expect(resposta.headers["access-control-allow-origin"]).toBeUndefined();
    await app.close();
  });
});

describe("IP do cliente atrás do proxy", () => {
  it("com o proxy de confiança, o limite por IP conta cada cliente, não o proxy", async () => {
    const app = buildApp({ ambiente: { PROXIES_CONFIAVEIS: "1" } });

    const status = await signups(app, IPS_DIFERENTES);

    expect(status).not.toContain(429);
    await app.close();
  });

  it("sem proxy de confiança, o X-Forwarded-For de quem chama não renova o orçamento", async () => {
    const app = buildApp({ ambiente: {} });

    const status = await signups(app, IPS_DIFERENTES);

    expect(status.at(-1)).toBe(429);
    await app.close();
  });
});
