import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  chaveDeCifra,
  cifrar,
  decifrar,
  gerarTokenDoWebhook,
  hashDoToken,
  tokenConfere,
} from "../../src/lib/cifra";

// A cifra da chave do vendedor no provedor (Onda 2, marco 3, PR 8 do
// plano planos-de-assinatura; decisão 10): AES-256-GCM com a
// CHAVE_DE_CIFRA do ambiente, e o token do webhook guardado só como hash.

const chave = randomBytes(32);

describe("cifrar e decifrar", () => {
  it("volta o texto, e a mesma chave cifrada duas vezes sai diferente", () => {
    const segredo = "$aact_hmlg_chave-de-mentira-do-teste";

    const uma = cifrar(segredo, chave);
    const outra = cifrar(segredo, chave);

    expect(decifrar(uma, chave)).toBe(segredo);
    expect(Buffer.compare(uma, outra)).not.toBe(0);
    expect(uma.includes(Buffer.from(segredo))).toBe(false);
  });

  it("um byte trocado ou outra chave não decifram", () => {
    const cifrado = cifrar("segredo", chave);
    const adulterado = Buffer.from(cifrado);
    adulterado[adulterado.length - 1] ^= 1;

    expect(() => decifrar(adulterado, chave)).toThrow();
    expect(() => decifrar(cifrado, randomBytes(32))).toThrow();
    expect(() => decifrar(Buffer.alloc(10), chave)).toThrow();
  });
});

describe("chaveDeCifra", () => {
  it("lê os 32 bytes em base64 do ambiente", () => {
    const base64 = chave.toString("base64");
    expect(chaveDeCifra({ CHAVE_DE_CIFRA: base64 }).equals(chave)).toBe(true);
  });

  it("ausente ou com outro tamanho, lança dizendo como gerar", () => {
    expect(() => chaveDeCifra({})).toThrow(/CHAVE_DE_CIFRA.*openssl rand -base64 32/);
    expect(() => chaveDeCifra({ CHAVE_DE_CIFRA: randomBytes(16).toString("base64") })).toThrow(/32 bytes/);
  });

  it("nos testes, sem a variável, usa uma chave fixa", () => {
    expect(chaveDeCifra({ NODE_ENV: "test" })).toHaveLength(32);
  });
});

describe("token do webhook", () => {
  it("43 caracteres sem espaço (o Asaas pede de 32 a 255), um diferente a cada vez", () => {
    const token = gerarTokenDoWebhook();

    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(gerarTokenDoWebhook()).not.toBe(token);
  });

  it("guarda só o hash, e confere o token pelo hash", () => {
    const token = gerarTokenDoWebhook();
    const hash = hashDoToken(token);

    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(token);
    expect(tokenConfere(token, hash)).toBe(true);
    expect(tokenConfere(gerarTokenDoWebhook(), hash)).toBe(false);
    expect(tokenConfere("", hash)).toBe(false);
    expect(tokenConfere(token, "torto")).toBe(false);
  });
});
