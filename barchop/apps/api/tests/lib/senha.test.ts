import { describe, expect, it } from "vitest";
import { conferirSenha, gerarHashSenha } from "../../src/lib/senha";

describe("gerarHashSenha", () => {
  it("produz o formato scrypt$salt$hash", async () => {
    const hash = await gerarHashSenha("senha-do-barbeiro");
    const partes = hash.split("$");

    expect(partes).toHaveLength(3);
    expect(partes[0]).toBe("scrypt");
  });

  it("gera hash diferente pra mesma senha, por causa do salt", async () => {
    const a = await gerarHashSenha("mesma-senha");
    const b = await gerarHashSenha("mesma-senha");

    expect(a).not.toBe(b);
  });
});

describe("conferirSenha", () => {
  it("aceita a senha correta", async () => {
    const hash = await gerarHashSenha("senha-do-barbeiro");
    expect(await conferirSenha("senha-do-barbeiro", hash)).toBe(true);
  });

  it("recusa a senha errada", async () => {
    const hash = await gerarHashSenha("senha-do-barbeiro");
    expect(await conferirSenha("outra-senha", hash)).toBe(false);
  });

  it("recusa hash malformado sem estourar", async () => {
    expect(await conferirSenha("qualquer", "nao-e-um-hash")).toBe(false);
    expect(await conferirSenha("qualquer", "scrypt$soh-duas-partes")).toBe(false);
    expect(await conferirSenha("qualquer", "bcrypt$c2FsdA==$aGFzaA==")).toBe(false);
  });
});
