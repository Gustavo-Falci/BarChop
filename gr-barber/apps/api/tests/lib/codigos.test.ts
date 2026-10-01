import { describe, expect, it } from "vitest";
import { prisma } from "@gr-barber/database";
import {
  consumirCodigo,
  emitirCodigo,
  MAX_TENTATIVAS,
  VALIDADE_DO_CODIGO_MS,
  type AlvoDoCodigo,
} from "../../src/lib/codigos";

const AGORA = new Date("2026-10-01T10:00:00-03:00");

async function alvo(
  sobrescrever: Partial<AlvoDoCodigo> = {}
): Promise<AlvoDoCodigo> {
  const barbearia = await prisma.barbearia.create({
    data: { nome: "Barbearia", slug: `b-${Math.random().toString(36).slice(2, 8)}` },
  });
  return {
    finalidade: "primeiro_acesso",
    destino: "(11) 99999-8888",
    barbeariaId: barbearia.id,
    ...sobrescrever,
  };
}

function errado(codigo: string): string {
  return codigo === "000000" ? "111111" : "000000";
}

describe("códigos de verificação", () => {
  it("emite seis dígitos e aceita o código uma vez só", async () => {
    const a = await alvo();
    const codigo = await emitirCodigo(a, AGORA);

    expect(codigo).toMatch(/^\d{6}$/);
    expect(await consumirCodigo(a, codigo, AGORA)).toBe(true);
    // Usado é usado: o mesmo código não abre a porta duas vezes.
    expect(await consumirCodigo(a, codigo, AGORA)).toBe(false);
  });

  it("não guarda o código em texto", async () => {
    // Quem lê o banco (backup vazado, acesso indevido) não pode sair
    // com códigos válidos na mão.
    const a = await alvo();
    const codigo = await emitirCodigo(a, AGORA);

    const linha = await prisma.codigoVerificacao.findFirstOrThrow();
    expect(linha.codigoHash).not.toContain(codigo);
  });

  it("recusa o código vencido", async () => {
    const a = await alvo();
    const codigo = await emitirCodigo(a, AGORA);
    const depois = new Date(AGORA.getTime() + VALIDADE_DO_CODIGO_MS + 1);

    expect(await consumirCodigo(a, codigo, depois)).toBe(false);
  });

  it("depois de errar o máximo, nem o código certo passa", async () => {
    // Seis dígitos são um milhão de combinações; sem teto de tentativas
    // por código, adivinhar seria questão de paciência.
    const a = await alvo();
    const codigo = await emitirCodigo(a, AGORA);

    for (let i = 0; i < MAX_TENTATIVAS; i++) {
      expect(await consumirCodigo(a, errado(codigo), AGORA)).toBe(false);
    }
    expect(await consumirCodigo(a, codigo, AGORA)).toBe(false);
  });

  it("errar menos que o máximo ainda deixa o certo passar", async () => {
    const a = await alvo();
    const codigo = await emitirCodigo(a, AGORA);

    await consumirCodigo(a, errado(codigo), AGORA);
    expect(await consumirCodigo(a, codigo, AGORA)).toBe(true);
  });

  it("pedir um código novo invalida o anterior", async () => {
    // Senão cada reenvio somaria mais um código válido no ar, e mais
    // MAX_TENTATIVAS chances pra quem adivinha.
    const a = await alvo();
    const primeiro = await emitirCodigo(a, AGORA);
    const segundo = await emitirCodigo(a, AGORA);

    if (primeiro !== segundo) {
      expect(await consumirCodigo(a, primeiro, AGORA)).toBe(false);
    }
    expect(await consumirCodigo(a, segundo, AGORA)).toBe(true);
  });

  it("o código vale só pro destino, a finalidade e a barbearia de onde saiu", async () => {
    const a = await alvo();
    const codigo = await emitirCodigo(a, AGORA);
    const outraBarbearia = await alvo();

    expect(
      await consumirCodigo({ ...a, destino: "(11) 98888-7777" }, codigo, AGORA)
    ).toBe(false);
    expect(
      await consumirCodigo({ ...a, finalidade: "recuperar_senha_cliente" }, codigo, AGORA)
    ).toBe(false);
    expect(
      await consumirCodigo({ ...a, barbeariaId: outraBarbearia.barbeariaId }, codigo, AGORA)
    ).toBe(false);
    // E nenhuma dessas tentativas gastou o código do alvo certo.
    expect(await consumirCodigo(a, codigo, AGORA)).toBe(true);
  });

  it("dois consumos simultâneos do mesmo código: só um passa", async () => {
    // Duas abas confirmando ao mesmo tempo não podem, as duas, trocar a
    // senha com o mesmo código.
    const a = await alvo();
    const codigo = await emitirCodigo(a, AGORA);

    const resultados = await Promise.all([
      consumirCodigo(a, codigo, AGORA),
      consumirCodigo(a, codigo, AGORA),
    ]);

    expect(resultados.filter(Boolean)).toHaveLength(1);
  });
});
