import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@barchop/database";
import { buildApp } from "../../src/app";
import { consumirCodigo, emitirCodigo, type AlvoDoCodigo } from "../../src/lib/codigos";
import { chaveDosCodigos, segredoDoServidor } from "../../src/lib/segredos";

// Auditoria de segurança de 15/11, SEC-015.
describe("segredo do servidor", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("a API não sobe com JWT_SECRET curto", () => {
    // Um segredo curto se quebra offline a partir de qualquer token, e
    // com ele se forja token de qualquer tipo.
    vi.stubEnv("JWT_SECRET", "curto-demais");

    expect(() => buildApp()).toThrow(/JWT_SECRET curto demais/);
  });

  it("a mensagem diz o tamanho, nunca o valor", () => {
    expect(() => segredoDoServidor({ JWT_SECRET: "segredo-de-31-caracteres-123456x" .slice(0, 31) })).toThrow(
      /tem 31 caracteres e o mínimo é 32/
    );
    try {
      segredoDoServidor({ JWT_SECRET: "valor-que-nao-pode-aparecer" });
    } catch (erro) {
      expect(String(erro)).not.toContain("valor-que-nao-pode-aparecer");
    }
  });

  it("sem JWT_SECRET continua não subindo", () => {
    expect(() => segredoDoServidor({})).toThrow(/JWT_SECRET não definido/);
  });

  it("aceita o segredo de 32 caracteres ou mais", () => {
    expect(segredoDoServidor({ JWT_SECRET: "a".repeat(32) })).toBe("a".repeat(32));
  });
});

describe("chave dos códigos de verificação", () => {
  const AGORA = new Date("2026-11-15T10:00:00-03:00");
  const alvo: AlvoDoCodigo = { finalidade: "senha_barbeiro", destino: "alvo@exemplo.com", barbeariaId: null };

  it("é derivada do segredo, e não o próprio segredo", async () => {
    // O hash do código não pode ser um HMAC feito com a chave que assina
    // os tokens.
    const codigo = await emitirCodigo(alvo, AGORA);
    const { codigoHash } = await prisma.codigoVerificacao.findFirstOrThrow({ where: { destino: alvo.destino } });

    const comOSegredo = createHmac("sha256", process.env.JWT_SECRET!).update(codigo).digest("hex");
    const comADerivada = createHmac("sha256", chaveDosCodigos()).update(codigo).digest("hex");

    expect(codigoHash).toBe(comADerivada);
    expect(codigoHash).not.toBe(comOSegredo);
  });

  it("muda quando o segredo muda", () => {
    const uma = chaveDosCodigos({ JWT_SECRET: "a".repeat(40) });
    const outra = chaveDosCodigos({ JWT_SECRET: "b".repeat(40) });

    expect(uma).toHaveLength(32);
    expect(uma.equals(outra)).toBe(false);
  });

  it("o código emitido antes da troca de chave ainda vale", async () => {
    // O convite da equipe vive 7 dias: os que estavam no ar no deploy
    // foram gravados com a chave antiga e não podem morrer por isso.
    const codigo = "123456";
    await prisma.codigoVerificacao.create({
      data: {
        ...alvo,
        codigoHash: createHmac("sha256", process.env.JWT_SECRET!).update(codigo).digest("hex"),
        expiraEm: new Date(AGORA.getTime() + 10 * 60 * 1000),
      },
    });

    expect(await consumirCodigo(alvo, "654321", AGORA)).toBe(false);
    expect(await consumirCodigo(alvo, codigo, AGORA)).toBe(true);
  });
});
