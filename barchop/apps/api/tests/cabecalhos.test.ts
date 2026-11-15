import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app";

// Auditoria de segurança de 15/11 (SEC-003): a API respondia sem nenhum
// cabeçalho de segurança. Ela só devolve JSON, então a política pode ser
// a mais fechada que existe.
const ESPERADOS = {
  "strict-transport-security": "max-age=31536000; includeSubDomains",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
};

describe("cabeçalhos de segurança da API", () => {
  it("vão em toda resposta que deu certo", async () => {
    const app = buildApp();

    const resposta = await app.inject({ method: "GET", url: "/health" });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.headers).toMatchObject(ESPERADOS);
    await app.close();
  });

  it("vão também no 404, no 401 e no 400", async () => {
    // É nas respostas de erro que um navegador mais seria enganado a
    // tratar o corpo como outra coisa.
    const app = buildApp();

    const naoExiste = await app.inject({ method: "GET", url: "/nao-existe" });
    const semToken = await app.inject({ method: "GET", url: "/me" });
    const corpoTorto = await app.inject({ method: "POST", url: "/auth/login", payload: { email: 1 } });

    expect(naoExiste.statusCode).toBe(404);
    expect(naoExiste.headers).toMatchObject(ESPERADOS);
    expect(semToken.statusCode).toBe(401);
    expect(semToken.headers).toMatchObject(ESPERADOS);
    expect(corpoTorto.statusCode).toBe(400);
    expect(corpoTorto.headers).toMatchObject(ESPERADOS);
    await app.close();
  });

  it("vão no preflight de CORS, que responde antes de qualquer rota", async () => {
    const app = buildApp();

    const resposta = await app.inject({
      method: "OPTIONS",
      url: "/auth/login",
      headers: { origin: "http://localhost:3000", "access-control-request-method": "POST" },
    });

    expect(resposta.headers).toMatchObject(ESPERADOS);
    await app.close();
  });
});
