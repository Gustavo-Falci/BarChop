import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app";

describe("GET /health", () => {
  it("responde ok sem precisar abrir porta", async () => {
    const app = buildApp();
    const resposta = await app.inject({ method: "GET", url: "/health" });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual({ status: "ok" });

    await app.close();
  });
});
