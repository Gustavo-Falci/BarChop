import { describe, expect, it, vi } from "vitest";
import { Prisma } from "@barchop/database";
import { comRetryDeDeadlock } from "../../src/lib/transacao";

// Formato medido contra o Postgres 18: o deadlock chega como
// PrismaClientUnknownRequestError, com o SQLSTATE só dentro da mensagem
// — o mesmo formato do 23P01 (ver o plano da fase 4).
function erroDeDeadlock() {
  return new Prisma.PrismaClientUnknownRequestError(
    "Invalid `tx.agendamento.create()` invocation. Error occurred during " +
      'query execution: ConnectorError(ConnectorError { kind: QueryError(' +
      'PostgresError { code: "40P01", message: "impasse detectado" }) })',
    { clientVersion: "5.22.0" }
  );
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
    const violacaoDeExclusao = new Prisma.PrismaClientUnknownRequestError(
      'PostgresError { code: "23P01", message: "viola a restrição de ' +
        'exclusão sem_conflito_horario" }',
      { clientVersion: "5.22.0" }
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
