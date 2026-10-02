import { Prisma } from "@barchop/database";

// Dois inserts concorrentes no mesmo horário podem terminar de duas
// formas, e qual delas sai depende de tempo: ou um deles bate na
// `sem_conflito_horario` (SQLSTATE 23P01, que o tratador de erros
// traduz pra 409), ou o Postgres detecta um impasse (40P01) e mata uma
// das transações. O impasse acontece porque cada transação grava a
// própria tupla antes de a constraint conferir a outra, e aí cada uma
// passa a esperar a transação da outra.
//
// Sem tratar, o 40P01 chega no tratador como erro desconhecido e vira
// 500 — dois clientes confirmando o mesmo horário no mesmo instante
// receberiam "erro interno" em vez de "esse horário já está ocupado".
function ehDeadlock(erro: unknown): boolean {
  return (
    erro instanceof Prisma.PrismaClientUnknownRequestError &&
    erro.message.includes("40P01")
  );
}

// Remédio padrão pra impasse: repetir. Uma vez só, e não em looping —
// na segunda tentativa a transação concorrente já commitou ou já
// abortou, então o resultado deixa de depender de quem chegou primeiro:
// ou o horário está tomado e sai o 409 da constraint, ou ele vagou e o
// agendamento passa. Insistir mais que isso esconderia contenção real
// atrás de latência.
export async function comRetryDeDeadlock<T>(
  operacao: () => Promise<T>
): Promise<T> {
  try {
    return await operacao();
  } catch (erro) {
    if (!ehDeadlock(erro)) throw erro;
    return operacao();
  }
}
