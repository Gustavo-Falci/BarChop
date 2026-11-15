import { describe, expect, it } from "vitest";
import { prisma } from "@barchop/database";
import { contarNaJanela } from "../../src/lib/contador-de-limite";

const AGORA = new Date("2026-11-15T10:00:00-03:00");
const MINUTO = 60 * 1000;
const JANELA = 10 * MINUTO;

function depois(ms: number): Date {
  return new Date(AGORA.getTime() + ms);
}

describe("contador de limite no banco", () => {
  it("conta a partir de 1 e diz quanto falta pra janela acabar", async () => {
    const primeira = await contarNaJanela("chave", JANELA, AGORA);
    const segunda = await contarNaJanela("chave", JANELA, depois(4 * MINUTO));

    expect(primeira).toEqual({ contagem: 1, ttl: JANELA });
    expect(segunda).toEqual({ contagem: 2, ttl: 6 * MINUTO });
  });

  it("a janela é fixa: tentar de novo não a estica", async () => {
    // Senão quem insiste nunca mais sairia do bloqueio — e o limite é
    // um freio, não um bloqueio de conta.
    await contarNaJanela("chave", JANELA, AGORA);
    await contarNaJanela("chave", JANELA, depois(9 * MINUTO));

    const naVirada = await contarNaJanela("chave", JANELA, depois(JANELA));

    expect(naVirada).toEqual({ contagem: 1, ttl: JANELA });
  });

  it("cada chave tem a contagem dela", async () => {
    await contarNaJanela("login-barbeiro:um@exemplo.com", JANELA, AGORA);
    await contarNaJanela("login-barbeiro:um@exemplo.com", JANELA, AGORA);

    const outra = await contarNaJanela("login-barbeiro:dois@exemplo.com", JANELA, AGORA);

    expect(outra.contagem).toBe(1);
  });

  it("pedidos simultâneos da mesma chave contam todos", async () => {
    // Uma instrução só no banco: dois pedidos não podem, os dois, ler 9
    // e gravar 10.
    const resultados = await Promise.all(
      Array.from({ length: 40 }, () => contarNaJanela("chave", JANELA, AGORA))
    );

    expect(resultados.map((r) => r.contagem).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 40 }, (_, i) => i + 1)
    );
  });

  it("guarda o resumo da chave, nunca o texto", async () => {
    await contarNaJanela("login-barbeiro:alguem@exemplo.com", JANELA, AGORA);

    const [linha] = await prisma.contadorDeLimite.findMany();

    expect(linha.chave).toMatch(/^[0-9a-f]{64}$/);
    expect(linha.chave).not.toContain("alguem");
  });
});
