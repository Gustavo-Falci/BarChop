import { randomUUID } from "node:crypto";
import { PgBoss } from "pg-boss";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  filaDeMemoria,
  filaDoPgBoss,
  filaPadrao,
  urlDoPg,
  type Fila,
} from "../../src/lib/fila";

// O mesmo contrato contra as duas implementações. A de memória é o que
// os testes de rota vão usar no lugar do pg-boss; se ela aceitar o que
// o pg-boss recusa (a chave repetida, o trabalho antes da hora), os
// testes de rota passam e a produção manda dois lembretes.
interface Bancada {
  fila: Fila;
  // Roda o que já venceu e volta só quando terminou. Na memória é
  // síncrono; no pg-boss é esperar o worker drenar a fila.
  processar(trabalho: string): Promise<void>;
}

let boss: PgBoss;

beforeAll(async () => {
  boss = new PgBoss({ connectionString: urlDoPg(process.env.DATABASE_URL ?? ""), max: 2 });
  boss.on("error", () => {});
  await boss.start();
});

afterAll(async () => {
  await boss.stop({ graceful: false });
});

const memoria = (): Bancada => {
  const fila = filaDeMemoria();
  return {
    fila,
    async processar() {
      await fila.rodarVencidos(new Date());
    },
  };
};

const pgBoss = (): Bancada => {
  const fila = filaDoPgBoss(boss, { segundosEntreBuscas: 0.5 });
  return {
    fila,
    async processar(trabalho) {
      // Espera não sobrar nada vencido nem em andamento. O que está no
      // futuro fica de fora: é justamente o que um dos casos confere.
      const limite = Date.now() + 10_000;
      for (;;) {
        const jobs = await boss.findJobs(trabalho);
        const agora = new Date();
        const pendentes = jobs.filter(
          (j) =>
            (["created", "retry"].includes(j.state) && j.startAfter <= agora) ||
            j.state === "active"
        );
        if (pendentes.length === 0) return;
        if (Date.now() > limite) throw new Error(`fila ${trabalho} não drenou`);
        await new Promise((r) => setTimeout(r, 100));
      }
    },
  };
};

describe.each([
  ["memória", memoria],
  ["pg-boss", pgBoss],
])("fila (%s)", (_nome, montar) => {
  // Um nome por caso: workers de um caso não comem os trabalhos do outro.
  const novoTrabalho = () => `teste-${randomUUID()}`;

  it("o trabalho agendado roda com os dados", async () => {
    const { fila, processar } = montar();
    const trabalho = novoTrabalho();
    const recebidos: unknown[] = [];
    await fila.trabalhar<{ id: string }>(trabalho, async (dados) => {
      recebidos.push(dados);
    });

    await fila.agendar(trabalho, { id: "a1" });
    await processar(trabalho);

    expect(recebidos).toEqual([{ id: "a1" }]);
  });

  it("não roda antes da hora marcada", async () => {
    const { fila, processar } = montar();
    const trabalho = novoTrabalho();
    const recebidos: unknown[] = [];
    await fila.trabalhar(trabalho, async (dados) => {
      recebidos.push(dados);
    });

    const daquiAUmaHora = new Date(Date.now() + 60 * 60 * 1000);
    await fila.agendar(trabalho, { id: "a1" }, { quando: daquiAUmaHora });
    await processar(trabalho);

    expect(recebidos).toEqual([]);
  });

  it("a mesma chave não agenda duas vezes enquanto o primeiro espera", async () => {
    // O lembrete de quem remarca pra outro horário e volta pro original
    // seria agendado duas vezes com a mesma chave — e os dois passariam
    // na releitura do agendamento. Quem deduplica é a fila.
    const { fila, processar } = montar();
    const trabalho = novoTrabalho();
    const recebidos: unknown[] = [];
    await fila.trabalhar(trabalho, async (dados) => {
      recebidos.push(dados);
    });

    expect(await fila.agendar(trabalho, { vez: 1 }, { chave: "a1@10:00" })).toBe(true);
    expect(await fila.agendar(trabalho, { vez: 2 }, { chave: "a1@10:00" })).toBe(false);
    await processar(trabalho);

    expect(recebidos).toEqual([{ vez: 1 }]);
  });

  it("chaves diferentes agendam os dois", async () => {
    const { fila, processar } = montar();
    const trabalho = novoTrabalho();
    const recebidos: unknown[] = [];
    await fila.trabalhar<{ vez: number }>(trabalho, async (dados) => {
      recebidos.push(dados.vez);
    });

    expect(await fila.agendar(trabalho, { vez: 1 }, { chave: "a1@10:00" })).toBe(true);
    expect(await fila.agendar(trabalho, { vez: 2 }, { chave: "a1@11:00" })).toBe(true);
    await processar(trabalho);

    expect(recebidos.sort()).toEqual([1, 2]);
  });

  it("os dados chegam como JSON: Date vira string, como sai do banco", async () => {
    // O pg-boss guarda os dados em JSONB. Se a de memória entregasse o
    // objeto original, um tratador que lê `Date` passaria nos testes de
    // rota e quebraria no worker de verdade.
    const { fila, processar } = montar();
    const trabalho = novoTrabalho();
    const recebidos: unknown[] = [];
    await fila.trabalhar(trabalho, async (dados) => {
      recebidos.push(dados);
    });

    await fila.agendar(trabalho, { em: new Date("2026-10-10T13:00:00.000Z") });
    await processar(trabalho);

    expect(recebidos).toEqual([{ em: "2026-10-10T13:00:00.000Z" }]);
  });

  it("sem chave não deduplica: dois agendamentos rodam os dois", async () => {
    // A política que faz a chave valer no pg-boss indexa a chave ausente
    // como '' — sem cuidado, todo trabalho sem chave colidiria com o
    // primeiro e seria descartado em silêncio.
    const { fila, processar } = montar();
    const trabalho = novoTrabalho();
    const recebidos: unknown[] = [];
    await fila.trabalhar<{ vez: number }>(trabalho, async (dados) => {
      recebidos.push(dados.vez);
    });

    expect(await fila.agendar(trabalho, { vez: 1 })).toBe(true);
    expect(await fila.agendar(trabalho, { vez: 2 })).toBe(true);
    await processar(trabalho);

    expect(recebidos.sort()).toEqual([1, 2]);
  });
});

describe("fila do pg-boss", () => {
  it("repete o trabalho que falhou com espera crescente, não na hora", async () => {
    // O padrão do pg-boss é repetir 2 vezes sem espera nenhuma: uma queda
    // de um minuto no provedor de e-mail queimaria as três tentativas em
    // segundos, e o lembrete se perderia.
    const fila = filaDoPgBoss(boss);
    const trabalho = `teste-${randomUUID()}`;
    await fila.agendar(trabalho, {}, { quando: new Date(Date.now() + 60 * 60 * 1000) });

    const config = await boss.getQueue(trabalho);
    expect(config?.retryLimit).toBeGreaterThanOrEqual(8);
    expect(config?.retryDelay).toBeGreaterThanOrEqual(30);
    expect(config?.retryBackoff).toBe(true);
  });
});

describe("filaPadrao", () => {
  it("nos testes, é a de memória", () => {
    expect(filaPadrao({ NODE_ENV: "test" }).nome).toBe("memoria");
  });

  it("fora dos testes se recusa: a fila de verdade é montada no server.ts", () => {
    // Uma API que sobe com a fila de memória aceita o agendamento e
    // nunca manda o lembrete — e ninguém percebe até o cliente faltar.
    expect(() => filaPadrao({ NODE_ENV: "development" })).toThrow(/fila/i);
    expect(() => filaPadrao({ NODE_ENV: "production" })).toThrow(/fila/i);
    expect(() => filaPadrao({})).toThrow(/fila/i);
  });
});

describe("urlDoPg", () => {
  it("tira o ?schema= que só o Prisma entende", () => {
    expect(urlDoPg("postgresql://u:s@localhost:5432/db?schema=public")).toBe(
      "postgresql://u:s@localhost:5432/db"
    );
  });

  it("mantém os outros parâmetros", () => {
    expect(urlDoPg("postgresql://u:s@h:5432/db?schema=public&sslmode=require")).toBe(
      "postgresql://u:s@h:5432/db?sslmode=require"
    );
  });
});
