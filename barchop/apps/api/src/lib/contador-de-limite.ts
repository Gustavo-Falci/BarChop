import { createHash } from "node:crypto";
import { prisma } from "@barchop/database";

// O contador por conta dos limites (lib/limites.ts), guardado no banco.
//
// Em memória ele era um LRU de 5.000 chaves: inundar a rota com chaves
// novas despejava a da conta que estava bloqueada, e o bloqueio sumia no
// meio da janela (auditoria de 15/11, SEC-002). Reiniciar a API também
// zerava todos. No banco não há despejo, e o contador sobrevive ao
// deploy. Os contadores por IP continuam em memória: eles são a rede de
// arrasto, e perder um deles num reinício não devolve tentativa a
// ninguém em particular.

export interface EstadoDoContador {
  // Quantas vezes a chave contou na janela corrente, já com esta.
  contagem: number;
  // Milissegundos até a janela corrente acabar.
  ttl: number;
}

// A chave leva e-mail ou telefone de quem tentou — inclusive de quem
// nunca foi cliente de ninguém. No banco fica só o resumo: dá pra contar
// sem guardar o dado. Sem segredo, de propósito: não é senha, e quem lê
// a tabela não descobre nada que a tabela de contas já não diga.
function resumoDaChave(chave: string): string {
  return createHash("sha256").update(chave).digest("hex");
}

// Conta mais uma e devolve o estado. Uma instrução só: dois pedidos
// simultâneos da mesma chave não podem, os dois, ler 9 e gravar 10.
// A janela é fixa, como a do contador em memória: começa na primeira
// tentativa e, vencida, a próxima tentativa abre outra.
//
// `agora` vem de quem chama, e não do relógio do banco, pra que o teste
// consiga andar com o tempo.
export async function contarNaJanela(
  chave: string,
  janelaMs: number,
  agora: Date = new Date()
): Promise<EstadoDoContador> {
  const fimDaNova = new Date(agora.getTime() + janelaMs);
  const linhas = await prisma.$queryRaw<{ contagem: number; expira_em: Date }[]>`
    INSERT INTO "contador_de_limite" AS c ("chave", "contagem", "expira_em")
    VALUES (${resumoDaChave(chave)}, 1, ${fimDaNova}::timestamptz)
    ON CONFLICT ("chave") DO UPDATE SET
      "contagem" = CASE WHEN c."expira_em" <= ${agora}::timestamptz THEN 1 ELSE c."contagem" + 1 END,
      "expira_em" = CASE WHEN c."expira_em" <= ${agora}::timestamptz THEN ${fimDaNova}::timestamptz ELSE c."expira_em" END
    RETURNING "contagem", "expira_em"
  `;
  const linha = linhas[0];
  return {
    contagem: linha.contagem,
    ttl: Math.max(0, linha.expira_em.getTime() - agora.getTime()),
  };
}

// As linhas vencidas não valem nada: a próxima tentativa da mesma chave
// reabriria a janela de qualquer jeito. A faxina diária chama isto pra
// tabela não guardar pra sempre o rastro de quem tentou uma vez.
export async function apagarContadoresVencidos(agora: Date = new Date()): Promise<number> {
  const { count } = await prisma.contadorDeLimite.deleteMany({
    where: { expiraEm: { lte: agora } },
  });
  return count;
}
