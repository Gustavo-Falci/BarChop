import { describe, expect, it } from "vitest";
import { prisma } from "@barchop/database";
import { contarNaJanela } from "../../src/lib/contador-de-limite";
import { fazerFaxina, registrarFaxina, TRABALHO_FAXINA } from "../../src/lib/faxina";
import { filaDeMemoria } from "../../src/lib/fila";

const log = { info: () => {}, warn: () => {} };
const AGORA = new Date("2026-11-15T03:30:00-03:00");
const MINUTO = 60 * 1000;

describe("faxina diária", () => {
  it("apaga os contadores de limite vencidos e deixa os que ainda valem", async () => {
    // O contador guarda (em resumo) quem tentou entrar. Passada a janela
    // ele não limita mais nada, e não há por que continuar no banco.
    const haUmaHora = new Date(AGORA.getTime() - 60 * MINUTO);
    await contarNaJanela("login-barbeiro:vencido@exemplo.com", 10 * MINUTO, haUmaHora);
    await contarNaJanela("login-barbeiro:valendo@exemplo.com", 10 * MINUTO, AGORA);

    await fazerFaxina({ log, agora: AGORA });

    expect(await prisma.contadorDeLimite.count()).toBe(1);
    // O que sobrou é o que ainda vale: a próxima tentativa segue contando.
    const seguinte = await contarNaJanela("login-barbeiro:valendo@exemplo.com", 10 * MINUTO, AGORA);
    expect(seguinte.contagem).toBe(2);
  });

  it("fica registrada de madrugada e roda quando o cron bate", async () => {
    const fila = filaDeMemoria();
    await contarNaJanela("login-barbeiro:antigo@exemplo.com", MINUTO, new Date("2020-01-01T00:00:00Z"));

    await registrarFaxina(fila, { log });
    await fila.rodarRepeticao(TRABALHO_FAXINA);

    expect(fila.repeticoes).toEqual([{ trabalho: TRABALHO_FAXINA, cron: "30 3 * * *" }]);
    expect(await prisma.contadorDeLimite.count()).toBe(0);
  });
});
