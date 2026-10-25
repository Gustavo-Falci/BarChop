import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";

// A chave do vendedor no provedor de pagamento, guardada no banco
// (Onda 2, marco 3, plano planos-de-assinatura, decisão 10): AES-256-GCM
// com a CHAVE_DE_CIFRA do ambiente. O GCM confere a integridade: um byte
// trocado no banco não decifra para lixo, lança. Perder a CHAVE_DE_CIFRA
// obriga todo vendedor a conectar de novo.

const IV = 12;
const ETIQUETA = 16;

// Fixa e pública: só os testes, que nunca guardam chave de verdade.
const CHAVE_DOS_TESTES = Buffer.alloc(32, 7);

export function chaveDeCifra(env: Record<string, string | undefined> = process.env): Buffer {
  const base64 = env.CHAVE_DE_CIFRA;
  if (!base64) {
    if (env.NODE_ENV === "test") return CHAVE_DOS_TESTES;
    throw new Error("CHAVE_DE_CIFRA ausente: gere com `openssl rand -base64 32` e ponha no ambiente da API");
  }
  const chave = Buffer.from(base64, "base64");
  if (chave.length !== 32) {
    throw new Error(`CHAVE_DE_CIFRA precisa de 32 bytes em base64, e tem ${chave.length}`);
  }
  return chave;
}

// iv (12) | etiqueta (16) | texto cifrado: tudo o que o decifrar precisa
// num campo só (`chave_cifrada`, BYTEA).
export function cifrar(texto: string, chave: Buffer): Buffer {
  const iv = randomBytes(IV);
  const cifra = createCipheriv("aes-256-gcm", chave, iv);
  const corpo = Buffer.concat([cifra.update(texto, "utf8"), cifra.final()]);
  return Buffer.concat([iv, cifra.getAuthTag(), corpo]);
}

export function decifrar(cifrado: Uint8Array, chave: Buffer): string {
  const bytes = Buffer.from(cifrado);
  if (bytes.length <= IV + ETIQUETA) throw new Error("chave cifrada curta demais");
  const decifra = createDecipheriv("aes-256-gcm", chave, bytes.subarray(0, IV));
  decifra.setAuthTag(bytes.subarray(IV, IV + ETIQUETA));
  return Buffer.concat([decifra.update(bytes.subarray(IV + ETIQUETA)), decifra.final()]).toString("utf8");
}

// O token que o provedor manda em cada evento do webhook. Gerado pelo
// BarChop (o Asaas pede de 32 a 255 caracteres, sem espaço), mostrado
// só ao provedor, e guardado só como hash.
export function gerarTokenDoWebhook(): string {
  return randomBytes(32).toString("base64url");
}

export function hashDoToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

// Compara os hashes com tempo constante: o tempo da resposta não diz
// quantos caracteres do token acertaram.
export function tokenConfere(token: string, hash: string): boolean {
  if (!token || !/^[0-9a-f]{64}$/.test(hash)) return false;
  return timingSafeEqual(Buffer.from(hashDoToken(token), "hex"), Buffer.from(hash, "hex"));
}
