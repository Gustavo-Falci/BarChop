import { describe, expect, it, vi } from "vitest";
import { Prisma } from "@barchop/database";
import { comRetryDeDeadlock } from "../../src/lib/transacao";

// Formato medido contra o Postgres 18 com o Prisma 7.10 (driver adapter,
// ver lib/erro-do-banco.ts): o impasse chega como P2034 e o SQLSTATE fica
// em `meta.driverAdapterError.cause.originalCode`.
function erroDoBanco(codigoP: string, sqlstate: string, kind: string, mensagem: string) {
  return new Prisma.PrismaClientKnownRequestError(`Database error. Code: \`${sqlstate}\``, {
    code: codigoP,
    clientVersion: Prisma.prismaVersion.client,
    meta: {
      driverAdapterError: {
        name: "DriverAdapterError",
        cause: { originalCode: sqlstate, originalMessage: mensagem, kind },
      },
    },
  });
}

function erroDeDeadlock() {
  return erroDoBanco("P2034", "40P01", "TransactionWriteConflict", "impasse detectado");
}

describe("comRetryDeDeadlock", () => {
  it("não repete quando a operação passa de primeira", async () => {
    const operacao = vi.fn().mockResolvedValue("pronto");

    await expect(comRetryDeDeadlock(operacao)).resolves.toBe("pronto");
    expect(operacao).toHaveBeenCalledTimes(1);
  });

  it("repete uma vez quando o Postgres detecta deadlock", async () => {
    const operacao = vi
      .fn()
      .mockRejectedValueOnce(erroDeDeadlock())
      .mockResolvedValue("pronto na segunda");

    // Na segunda tentativa a transação concorrente já commitou ou
    // abortou, então o resultado deixa de depender de quem chegou antes.
    await expect(comRetryDeDeadlock(operacao)).resolves.toBe(
      "pronto na segunda"
    );
    expect(operacao).toHaveBeenCalledTimes(2);
  });

  it("deixa o erro da segunda tentativa subir", async () => {
    const operacao = vi
      .fn()
      .mockRejectedValueOnce(erroDeDeadlock())
      .mockRejectedValue(new Error("conflito de horário"));

    // Uma repetição só: insistir em looping esconderia um problema real
    // atrás de latência.
    await expect(comRetryDeDeadlock(operacao)).rejects.toThrow(
      "conflito de horário"
    );
    expect(operacao).toHaveBeenCalledTimes(2);
  });

  it("não repete erro que não é deadlock", async () => {
    const violacaoDeExclusao = erroDoBanco(
      "P2039",
      "23P01",
      "postgres",
      'valor-chave conflitante viola a restrição de exclusão "sem_conflito_horario"'
    );
    const operacao = vi.fn().mockRejectedValue(violacaoDeExclusao);

    // O 23P01 é resposta final, não contenção: repetir daria o mesmo
    // resultado e atrasaria o 409 que a tela espera.
    await expect(comRetryDeDeadlock(operacao)).rejects.toBe(
      violacaoDeExclusao
    );
    expect(operacao).toHaveBeenCalledTimes(1);
  });

  it("não repete erro de domínio", async () => {
    const operacao = vi.fn().mockRejectedValue(new Error("horário inválido"));

    await expect(comRetryDeDeadlock(operacao)).rejects.toThrow(
      "horário inválido"
    );
    expect(operacao).toHaveBeenCalledTimes(1);
  });
});
