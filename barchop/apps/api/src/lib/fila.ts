import { randomUUID } from "node:crypto";
import type { PgBoss } from "pg-boss";

// Trabalhos que rodam depois, fora da requisiÃ§Ã£o â€” o primeiro Ã© o
// lembrete do agendamento. Quem agenda e quem trata falam sÃ³ com esta
// interface; o pg-boss (Postgres, sem infraestrutura nova) fica atrÃ¡s
// dela, e os testes de rota usam a de memÃ³ria.
export interface OpcoesDeAgendar {
  // NÃ£o roda antes disso. Ausente = assim que houver worker livre.
  quando?: Date;
  // Enquanto houver um trabalho com esta chave esperando ou rodando, um
  // segundo com a mesma chave Ã© descartado. Ausente = nunca deduplica.
  chave?: string;
}

export type Tratador<T> = (dados: T) => Promise<void>;

export interface Fila {
  nome: string;
  // `false` quando a chave jÃ¡ estava na fila e nada foi agendado.
  agendar<T extends object>(trabalho: string, dados: T, opcoes?: OpcoesDeAgendar): Promise<boolean>;
  trabalhar<T extends object>(trabalho: string, tratador: Tratador<T>): Promise<void>;
}

interface Pendente {
  trabalho: string;
  dados: object;
  quando: Date;
  chave: string | undefined;
}

export interface FilaDeMemoria extends Fila {
  // Pros testes conferirem o que foi agendado, e pra quando.
  pendentes: readonly Pendente[];
  // Roda o que jÃ¡ venceu atÃ© `agora`. O relÃ³gio Ã© de quem testa: nada
  // roda sozinho, entÃ£o o teste decide o instante sem fake timers.
  rodarVencidos(agora: Date): Promise<number>;
}

export function filaDeMemoria(): FilaDeMemoria {
  const pendentes: Pendente[] = [];
  const tratadores = new Map<string, Tratador<object>>();

  return {
    nome: "memoria",
    pendentes,
    async agendar(trabalho, dados, { quando, chave } = {}) {
      if (chave !== undefined && pendentes.some((p) => p.trabalho === trabalho && p.chave === chave)) {
        return false;
      }
      pendentes.push({ trabalho, dados, quando: quando ?? new Date(0), chave });
      return true;
    },
    async trabalhar(trabalho, tratador) {
      tratadores.set(trabalho, tratador as Tratador<object>);
    },
    async rodarVencidos(agora) {
      const vencidos = pendentes.filter(
        (p) => p.quando <= agora && tratadores.has(p.trabalho)
      );
      for (const pendente of vencidos) {
        // Sai da lista sÃ³ depois de rodar: enquanto roda, a chave segue
        // ocupada â€” Ã© o que o pg-boss faz com o trabalho `active`.
        try {
          await tratadores.get(pendente.trabalho)!(pendente.dados);
        } finally {
          pendentes.splice(pendentes.indexOf(pendente), 1);
        }
      }
      return vencidos.length;
    },
  };
}

// A polÃ­tica `exclusive` Ã© a que faz a `singletonKey` valer: no padrÃ£o
// (`standard`) o pg-boss grava a chave e nÃ£o deduplica nada. Ela barra
// a mesma chave enquanto o trabalho espera, Ã© repetido ou roda; depois
// de concluÃ­do, a chave fica livre.
const POLITICA = "exclusive";

export function filaDoPgBoss(
  boss: PgBoss,
  { segundosEntreBuscas = 2 }: { segundosEntreBuscas?: number } = {}
): Fila {
  // O `send` numa fila que nÃ£o existe lanÃ§a. `createQueue` Ã© idempotente,
  // mas Ã© uma ida ao banco: uma vez por trabalho e por processo basta.
  const criadas = new Map<string, Promise<void>>();
  const garantirFila = (trabalho: string): Promise<void> => {
    let criando = criadas.get(trabalho);
    if (!criando) {
      criando = boss.createQueue(trabalho, { policy: POLITICA }).catch((erro: unknown) => {
        // Falhou (banco fora, por exemplo): a prÃ³xima chamada tenta de
        // novo, em vez de herdar a promessa rejeitada pra sempre.
        criadas.delete(trabalho);
        throw erro;
      });
      criadas.set(trabalho, criando);
    }
    return criando;
  };

  return {
    nome: "pg-boss",
    async agendar(trabalho, dados, { quando, chave } = {}) {
      await garantirFila(trabalho);
      const id = await boss.send(trabalho, dados, {
        startAfter: quando,
        // A `exclusive` indexa a chave ausente como '': sem uma chave
        // Ãºnica, todo trabalho sem chave colidiria com o primeiro.
        singletonKey: chave ?? randomUUID(),
      });
      return id !== null;
    },
    async trabalhar<T extends object>(trabalho: string, tratador: Tratador<T>) {
      await garantirFila(trabalho);
      // Um trabalho por vez (`batchSize` padrÃ£o = 1). Se o tratador
      // lanÃ§a, o pg-boss marca pra repetir â€” quem trata tem que poder
      // rodar de novo sem efeito duplicado.
      await boss.work<T>(
        trabalho,
        { pollingIntervalSeconds: segundosEntreBuscas },
        async ([job]) => {
          if (job) await tratador(job.data);
        }
      );
    },
  };
}

// O que o `buildApp` usa quando ninguÃ©m passa uma fila. SÃ³ existe pros
// testes: fora deles, uma API com a fila de memÃ³ria aceitaria o
// agendamento e nunca mandaria o lembrete â€” e ninguÃ©m perceberia atÃ© o
// cliente faltar. Por isso recusa subir, como o canal de log em produÃ§Ã£o.
export function filaPadrao(env: Record<string, string | undefined> = process.env): Fila {
  if (env.NODE_ENV === "test") return filaDeMemoria();
  throw new Error(
    "Sem fila de trabalhos: fora dos testes a fila do pg-boss Ã© montada no " +
      "server.ts e passada pro buildApp."
  );
}

// O Prisma aceita `?schema=public` na URL; o driver `pg`, que o pg-boss
// usa, nÃ£o conhece esse parÃ¢metro. Os outros (sslmode etc.) ficam.
export function urlDoPg(url: string): string {
  const [base, consulta] = url.split("?", 2);
  if (consulta === undefined) return url;
  const parametros = new URLSearchParams(consulta);
  parametros.delete("schema");
  const resto = parametros.toString();
  return resto ? `${base}?${resto}` : base!;
}
