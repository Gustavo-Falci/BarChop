import { describe, expect, it } from "vitest";
import { prisma } from "@barchop/database";
import { contarNaJanela } from "../../src/lib/contador-de-limite";
import { lerCpf } from "../../src/lib/cpf";
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

  it("apaga os códigos de verificação usados ou vencidos há mais de um dia", async () => {
    // Auditoria de 15/11, SEC-009: a política diz que os códigos "não
    // são guardados depois de usados", e a tabela guardava pra sempre o
    // e-mail ou o telefone de quem pediu — inclusive de quem só digitou
    // um endereço e nunca virou cliente. Um dia de folga: é a janela em
    // que ainda serve pra apurar um abuso.
    const DIA = 24 * 60 * MINUTO;
    const base = { finalidade: "senha_barbeiro", codigoHash: "x".repeat(64), barbeariaId: null };
    const antigo = new Date(AGORA.getTime() - 2 * DIA);
    await prisma.codigoVerificacao.createMany({
      data: [
        { ...base, destino: "usado-antigo@exemplo.com", expiraEm: antigo, usadoEm: antigo },
        { ...base, destino: "vencido-antigo@exemplo.com", expiraEm: antigo },
        { ...base, destino: "usado-hoje@exemplo.com", expiraEm: AGORA, usadoEm: new Date(AGORA.getTime() - 60 * MINUTO) },
        { ...base, destino: "valendo@exemplo.com", expiraEm: new Date(AGORA.getTime() + 10 * MINUTO) },
        // O convite vive 7 dias: emitido há 2, ainda vale.
        { ...base, finalidade: "convite_profissional", destino: "convite@exemplo.com", criadoEm: antigo, expiraEm: new Date(AGORA.getTime() + 5 * DIA) },
      ],
    });

    await fazerFaxina({ log, agora: AGORA });

    const sobraram = await prisma.codigoVerificacao.findMany({ select: { destino: true }, orderBy: { destino: "asc" } });
    expect(sobraram.map((c) => c.destino)).toEqual(["convite@exemplo.com", "usado-hoje@exemplo.com", "valendo@exemplo.com"]);
  });

  it("cifra os CPFs que ainda estavam em claro", async () => {
    // SEC-009: os CPFs gravados antes de 15/11 estão em claro na coluna
    // antiga. A faxina passa cada um pra coluna cifrada e apaga o claro.
    const barbearia = await prisma.barbearia.create({ data: { nome: "Barbearia", slug: "barbearia" } });
    const cliente = await prisma.cliente.create({
      data: { barbeariaId: barbearia.id, nome: "João", telefone: "11999998888", cpf: "52998224725" },
    });

    await fazerFaxina({ log, agora: AGORA });

    const depois = await prisma.cliente.findUniqueOrThrow({ where: { id: cliente.id } });
    expect(depois.cpf).toBeNull();
    expect(lerCpf(depois)).toBe("52998224725");
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
