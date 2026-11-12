import { describe, expect, it, vi } from "vitest";
import { prisma } from "@barchop/database";
import { contar } from "../../src/lib/contagem-do-site";

// Home nova, marco 1: a linha de base de visita → cadastro. Só o total
// por dia e evento, no dia de São Paulo.

async function linhas() {
  const todas = await prisma.contagemDoSite.findMany({
    orderBy: [{ dia: "asc" }, { evento: "asc" }],
  });
  return todas.map((linha) => ({
    dia: linha.dia.toISOString().slice(0, 10),
    evento: linha.evento,
    total: linha.total,
  }));
}

const log = { error: vi.fn() };

describe("contar", () => {
  it("soma no total do dia", async () => {
    const instante = new Date("2026-11-12T15:00:00Z");
    await contar("visita_home", { log, instante });
    await contar("visita_home", { log, instante });

    expect(await linhas()).toEqual([{ dia: "2026-11-12", evento: "visita_home", total: 2 }]);
  });

  it("conta no dia de São Paulo, não no de UTC", async () => {
    // 02:30 de 13/11 em UTC são 23:30 de 12/11 em São Paulo.
    await contar("cadastro", { log, instante: new Date("2026-11-13T02:30:00Z") });

    expect(await linhas()).toEqual([{ dia: "2026-11-12", evento: "cadastro", total: 1 }]);
  });

  it("dia e evento diferentes viram linhas diferentes", async () => {
    await contar("cadastro", { log, instante: new Date("2026-11-12T15:00:00Z") });
    await contar("cadastro_da_home", { log, instante: new Date("2026-11-12T15:00:00Z") });
    await contar("cadastro", { log, instante: new Date("2026-11-13T15:00:00Z") });

    expect(await linhas()).toEqual([
      { dia: "2026-11-12", evento: "cadastro", total: 1 },
      { dia: "2026-11-12", evento: "cadastro_da_home", total: 1 },
      { dia: "2026-11-13", evento: "cadastro", total: 1 },
    ]);
  });

  it("falha no banco não lança: vai pro log e quem chamou segue", async () => {
    const banco = { contagemDoSite: { upsert: vi.fn().mockRejectedValue(new Error("fora do ar")) } };
    const logDoErro = { error: vi.fn() };

    await expect(contar("cadastro", { log: logDoErro, banco: banco as never })).resolves.toBeUndefined();
    expect(logDoErro.error).toHaveBeenCalledOnce();
  });
});
