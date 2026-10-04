import { describe, expect, it } from "vitest";
import { prisma } from "@barchop/database";
import { exigirBancoDeTeste, limparBanco } from "./helpers/limpar-banco";

describe("banco de teste", () => {
  it("conecta e começa vazio", async () => {
    expect(await prisma.barbearia.count()).toBe(0);
  });

  it("aplicou a EXCLUDE constraint escrita à mão na migration", async () => {
    // Essa constraint não sai do schema.prisma — ela existe só no SQL
    // da migration inicial. Se `migrate deploy` não a aplicou, todo o
    // teste de corrida da fase 4 daria falso positivo.
    const linhas = await prisma.$queryRaw<{ conname: string }[]>`
      SELECT conname FROM pg_constraint WHERE conname = 'sem_conflito_horario'
    `;
    expect(linhas).toHaveLength(1);
  });

  it("limpa o banco quando limparBanco roda", async () => {
    await prisma.barbearia.create({
      data: { nome: "Barbearia Teste", slug: "teste-limpeza" },
    });
    expect(await prisma.barbearia.count()).toBe(1);

    // Chama o helper direto, em vez de criar uma linha num caso e
    // conferir no seguinte que ela sumiu. Aquele formato só provaria
    // alguma coisa se os dois casos rodassem nessa ordem — isolado, o
    // segundo passaria de graça.
    await limparBanco();
    expect(await prisma.barbearia.count()).toBe(0);
  });

  it("o limparBanco se recusa a truncar banco que não é de teste", () => {
    // O global-setup já recusa, mas só quando a config da API é lida.
    // Rodar o vitest da raiz do monorepo pula essa config, e o Prisma cai
    // no .env do pacote do banco — o de desenvolvimento (aconteceu em
    // 2026-10-04). A trava tem que estar também em quem trunca.
    expect(() => exigirBancoDeTeste("gr_barber")).toThrow(/_test/);
    expect(() => exigirBancoDeTeste("")).toThrow(/_test/);
    expect(() => exigirBancoDeTeste("gr_barber_test")).not.toThrow();
  });
});
