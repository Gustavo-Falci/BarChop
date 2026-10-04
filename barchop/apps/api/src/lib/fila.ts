import { randomUUID } from "node:crypto";
import type { PgBoss } from "pg-boss";

// Trabalhos que rodam depois, fora da requisição — o primeiro é o
// lembrete do agendamento. Quem agenda e quem trata falam só com esta
// interface; o pg-boss (Postgres, sem infraestrutura nova) fica atrás
// dela, e os testes de rota usam a de memória.
export interface OpcoesDeAgendar {
  // Não roda antes disso. Ausente = assim que houver worker livre.
  quando?: Date;
  // Enquanto houver um trabalho com esta chave esperando ou rodando, um
  // segundo com a mesma chave é descartado. Ausente = nunca deduplica.
  chave?: string;
}

export type Tratador<T> = (dados: T) => Promise<void>;

export interface Fila {
  nome: string;
  // `false` quando a chave já estava na fila e nada foi agendado.
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
  // Roda o que já venceu até `agora`. O relógio é de quem testa: nada
  // roda sozinho, então o teste decide o instante sem fake timers.
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
      // Uma cópia em JSON, que é o que o pg-boss guarda e devolve: `Date`
      // vira string, e o tratador que contasse com `Date` passaria aqui e
      // quebraria no worker de verdade.
      const copia = JSON.parse(JSON.stringify(dados)) as object;
      pendentes.push({ trabalho, dados: copia, quando: quando ?? new Date(0), chave });
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
        // Sai da lista só depois de rodar: enquanto roda, a chave segue
        // ocupada — é o que o pg-boss faz com o trabalho `active`.
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

// A política `exclusive` é a que faz a `singletonKey` valer: no padrão
// (`standard`) o pg-boss grava a chave e não deduplica nada. Ela barra
// a mesma chave enquanto o trabalho espera, é repetido ou roda; depois
// de concluído, a chave fica livre.
const POLITICA = "exclusive";

// O padrão do pg-boss é repetir 2 vezes sem espera: uma queda de um
// minuto no provedor de e-mail queimaria as três tentativas em segundos.
// Com 5 repetições, começando em 1 min e dobrando até 1 h, o trabalho
// atravessa uma queda de mais de uma hora.
const REPETICAO = {
  retryLimit: 5,
  retryDelay: 60,
  retryBackoff: true,
  retryDelayMax: 60 * 60,
} as const;

export function filaDoPgBoss(
  boss: PgBoss,
  { segundosEntreBuscas = 2 }: { segundosEntreBuscas?: number } = {}
): Fila {
  // O `send` numa fila que não existe lança. `createQueue` é idempotente,
  // mas é uma ida ao banco: uma vez por trabalho e por processo basta.
  const criadas = new Map<string, Promise<void>>();
  const garantirFila = (trabalho: string): Promise<void> => {
    let criando = criadas.get(trabalho);
    if (!criando) {
      criando = boss
        .createQueue(trabalho, { policy: POLITICA, ...REPETICAO })
        // O `createQueue` não mexe numa fila que já existe: sem o update,
        // mudar a REPETICAO aqui não chegaria a fila criada antes.
        .then(() => boss.updateQueue(trabalho, REPETICAO))
        .catch((erro: unknown) => {
          // Falhou (banco fora, por exemplo): a próxima chamada tenta de
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
        // única, todo trabalho sem chave colidiria com o primeiro.
        singletonKey: chave ?? randomUUID(),
      });
      return id !== null;
    },
    async trabalhar<T extends object>(trabalho: string, tratador: Tratador<T>) {
      await garantirFila(trabalho);
      // Um trabalho por vez (`batchSize` padrão = 1). Se o tratador
      // lança, o pg-boss marca pra repetir — quem trata tem que poder
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

// O que o `buildApp` usa quando ninguém passa uma fila. Só existe pros
// testes: fora deles, uma API com a fila de memória aceitaria o
// agendamento e nunca mandaria o lembrete — e ninguém perceberia até o
// cliente faltar. Por isso recusa subir, como o canal de log em produção.
export function filaPadrao(env: Record<string, string | undefined> = process.env): Fila {
  if (env.NODE_ENV === "test") return filaDeMemoria();
  throw new Error(
    "Sem fila de trabalhos: fora dos testes a fila do pg-boss é montada no " +
      "server.ts e passada pro buildApp."
  );
}

// O Prisma aceita `?schema=public` na URL; o driver `pg`, que o pg-boss
// usa, não conhece esse parâmetro. Os outros (sslmode etc.) ficam.
export function urlDoPg(url: string): string {
  const [base, consulta] = url.split("?", 2);
  if (consulta === undefined) return url;
  const parametros = new URLSearchParams(consulta);
  parametros.delete("schema");
  const resto = parametros.toString();
  return resto ? `${base}?${resto}` : base!;
}
