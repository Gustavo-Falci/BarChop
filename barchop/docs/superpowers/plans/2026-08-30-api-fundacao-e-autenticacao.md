# API — Fundação e Autenticação: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Montar a infraestrutura de teste contra Postgres real, firmar a camada de conversão de horários, e entregar signup/login/`GET /me` funcionando com JWT.

**Architecture:** `buildApp()` sai de `server.ts` pra permitir `app.inject()` nos testes sem abrir porta. Toda conversão entre `"HH:mm"`/`"YYYY-MM-DD"` e `Date` passa por `lib/horas.ts`, sempre construindo em UTC. Autenticação usa `scrypt` do `node:crypto` e `@fastify/jwt`; o payload do token carrega `barbeiroId` e `barbeariaId`, e as rotas leem de `request.user`.

**Tech Stack:** Fastify 5.12.1, @fastify/jwt 9.1.0, Prisma 5.22, vitest 4.1.11, dotenv 17.4.2, tsup 8.5.1, TypeScript 5.x estrito.

**Spec:** `docs/superpowers/specs/2026-08-30-api-crud-agendamentos-design.md`

Este plano cobre as **fases 1 e 2** da seção "Ordem de implementação" da
spec. As fases 3 (cadastros), 4 (agendamento) e 5 (disponibilidade)
ganham planos próprios.

## Global Constraints

- Node 24.13.1, pnpm 11.24.0. Monorepo pnpm + Turborepo, `node-linker=hoisted` no `.npmrc`.
- TypeScript estrito, herdado de `@barchop/config/tsconfig/base.json`. A API já tem `tsconfig.json` com `noEmit: true` e `declaration: false`.
- A API builda com `tsup` (formato CJS, target node22), não com `tsc`. Não mexer nisso.
- Comentários e mensagens de erro em português, com acentuação correta. Mensagens de commit em inglês, Conventional Commits — é a convenção já estabelecida no repo.
- **Todo horário no contrato HTTP é string `"HH:mm"`; toda data é `"YYYY-MM-DD"`.**
- **Nenhum `Date` destinado ao banco é construído a partir de string local.** Só via `lib/horas.ts`, sempre `Date.UTC`.
- **`senhaHash` nunca aparece em resposta de rota alguma.** Montar objetos de resposta com lista explícita de campos, nunca com spread do registro do Prisma.
- **Rota protegida nunca aceita `barbeariaId` do corpo ou da URL** — sai do token.
- Os pacotes internos (`@barchop/*`) publicam TypeScript cru: `main` aponta pro `src/index.ts`, sem passo de build.

## Desvio consciente da spec

A spec diz "decora `request.barbeiro`". Este plano usa `request.user`,
que o `@fastify/jwt` já popula e já tipa via augmentation do módulo.
Mesmo resultado, sem `decorateRequest` e sem cast pra contornar o tipo
não-opcional. Se algum consumidor futuro precisar do nome `barbeiro`,
troca-se num lugar só.

## Pré-requisito manual (uma vez, antes da Task 1)

O Postgres já roda na 5432 desta máquina, mas o banco de teste não
existe. Rodar uma vez, com um usuário que possa criar banco e extensão:

```bash
psql -U postgres -c "CREATE DATABASE barchop_test"
```

As extensões `pgcrypto` e `btree_gist` são criadas pela própria migration
inicial, mas exigem privilégio suficiente. Se o `CREATE EXTENSION` falhar
na Task 1, rodar como superusuário:

```bash
psql -U postgres -d barchop_test -c "CREATE EXTENSION IF NOT EXISTS pgcrypto; CREATE EXTENSION IF NOT EXISTS btree_gist;"
```

---

## Task 1: Infraestrutura de teste contra Postgres real

**Files:**
- Create: `apps/api/vitest.config.mts`
- Create: `apps/api/tests/global-setup.ts`
- Create: `apps/api/tests/setup.ts`
- Create: `apps/api/tests/helpers/limpar-banco.ts`
- Create: `apps/api/.env.test.example`
- Create: `apps/api/.env.test` (não versionado)
- Test: `apps/api/tests/banco.test.ts`
- Modify: `apps/api/package.json`
- Modify: `apps/api/tsconfig.json`
- Modify: `turbo.json`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: nada.
- Produces: `limparBanco(): Promise<void>` em `tests/helpers/limpar-banco.ts`. Script `pnpm --filter @barchop/api test`. Variáveis `DATABASE_URL` e `JWT_SECRET` disponíveis em todo teste.

- [ ] **Step 1: Instalar vitest e dotenv**

```bash
pnpm --filter @barchop/api add -D vitest@^4.1.11 dotenv@^17.4.2
```

- [ ] **Step 2: Criar o `.env.test.example` e o `.env.test`**

`apps/api/.env.test.example` (versionado):

```
# Copie pra .env.test e ajuste as credenciais.
# ATENÇÃO: tem que apontar pro banco de TESTE. Os testes truncam
# todas as tabelas entre cada caso — apontar pro banco de
# desenvolvimento apaga seus dados.
DATABASE_URL="postgresql://usuario:senha@localhost:5432/barchop_test?schema=public"
JWT_SECRET="segredo-de-teste-nao-usar-em-producao"
```

Copiar pra `apps/api/.env.test` e preencher usuário e senha reais do
Postgres local.

- [ ] **Step 3: Ignorar o `.env.test` no git**

Acrescentar ao `.gitignore` na raiz de `barchop/`:

```
.env.test
```

- [ ] **Step 4: Escrever o `vitest.config.mts`**

`apps/api/vitest.config.mts`:

```ts
import { fileURLToPath } from "node:url";
import { config as carregarEnv } from "dotenv";
import { defineConfig } from "vitest/config";

// O .env.test guarda a URL do banco de TESTE. Carregado aqui, antes de
// qualquer teste, porque o PrismaClient lê DATABASE_URL na construção —
// e a construção acontece no import de @barchop/database.
carregarEnv({ path: fileURLToPath(new URL(".env.test", import.meta.url)) });

export default defineConfig({
  test: {
    globalSetup: ["./tests/global-setup.ts"],
    setupFiles: ["./tests/setup.ts"],
    // Um arquivo por vez: todos compartilham o mesmo banco e truncam as
    // tabelas entre si. Em paralelo, um apagaria os dados do outro.
    fileParallelism: false,
    env: {
      DATABASE_URL: process.env.DATABASE_URL ?? "",
      JWT_SECRET: process.env.JWT_SECRET ?? "",
    },
    server: {
      // Os pacotes internos publicam TypeScript cru. Isso força o
      // vitest a transformá-los em vez de tratá-los como JS pronto.
      deps: { inline: [/@barchop\//] },
    },
  },
});
```

- [ ] **Step 5: Escrever o `global-setup.ts`**

`apps/api/tests/global-setup.ts`:

```ts
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Aplica a migration inicial no banco de teste, uma vez, antes de
// qualquer arquivo de teste. `migrate deploy` e não `migrate dev`:
// dev tentaria gerar uma migration nova a partir do schema.prisma, e a
// migration inicial tem SQL escrito à mão (a EXCLUDE constraint) que
// não sai do schema declarativo.
export default function setup(): void {
  const pastaDatabase = fileURLToPath(
    new URL("../../../packages/database", import.meta.url)
  );

  // execSync com uma string só, em vez de execFileSync com array de
  // argumentos: no Windows o pnpm é um .cmd, que o execFile só executa
  // com `shell: true` — e essa combinação (shell mais array) dispara o
  // aviso DEP0190 do Node em toda rodada de teste.
  execSync("pnpm exec prisma migrate deploy", {
    cwd: pastaDatabase,
    env: { ...process.env },
    stdio: "inherit",
  });
}
```

- [ ] **Step 6: Escrever o helper de limpeza e o `setup.ts`**

`apps/api/tests/helpers/limpar-banco.ts`:

```ts
import { prisma } from "@barchop/database";

// TRUNCATE ... CASCADE em vez de deleteMany por tabela: é mais rápido e
// não depende de acertar a ordem das foreign keys.
const TABELAS = [
  "agendamento_servico",
  "agendamento",
  "servico",
  "horario_funcionamento",
  "barbeiro",
  "cliente",
  "barbearia",
];

export async function limparBanco(): Promise<void> {
  const lista = TABELAS.map((t) => `"${t}"`).join(", ");
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${lista} RESTART IDENTITY CASCADE`
  );
}
```

`apps/api/tests/setup.ts`:

```ts
import { beforeEach } from "vitest";
import { limparBanco } from "./helpers/limpar-banco";

// Cada caso de teste começa com o banco vazio.
beforeEach(async () => {
  await limparBanco();
});
```

- [ ] **Step 7: Escrever o teste que prova a infraestrutura**

`apps/api/tests/banco.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { prisma } from "@barchop/database";

import { limparBanco } from "./helpers/limpar-banco";

describe("banco de teste", () => {
  it("conecta e começa vazio", async () => {
    expect(await prisma.barbearia.count()).toBe(0);
  });

  it("aplicou a EXCLUDE constraint escrita à mão na migration", async () => {
    // Essa constraint não sai do schema.prisma — ela existe só no SQL
    // da migration inicial. Se `migrate deploy` não a aplicou, todo o
    // teste de corrida da fase 4 daria falso positivo.
    const linhas = await prisma.$queryRaw<{ conname: string }[]>`
      SELECT conname FROM pg_constraint WHERE conname = 'sem_conflito_horario'
    `;
    expect(linhas).toHaveLength(1);
  });

  it("limpa o banco quando limparBanco roda", async () => {
    await prisma.barbearia.create({
      data: { nome: "Barbearia Teste", slug: "teste-limpeza" },
    });
    expect(await prisma.barbearia.count()).toBe(1);

    // Chama o helper direto, em vez de criar uma linha num caso e
    // conferir no seguinte que ela sumiu. Aquele formato só provaria
    // alguma coisa se os dois casos rodassem nessa ordem — isolado, o
    // segundo passaria de graça.
    await limparBanco();
    expect(await prisma.barbearia.count()).toBe(0);
  });
});
```

- [ ] **Step 8: Adicionar os scripts de teste**

Em `apps/api/package.json`, dentro de `scripts`:

```json
    "test": "vitest run",
    "test:watch": "vitest",
```

Em `turbo.json`, dentro de `tasks`, depois de `"lint"`:

```json
    "test": {
      "dependsOn": ["^build"],
      "cache": false
    },
```

`cache: false` porque o resultado depende do estado de um Postgres
externo, que o turbo não tem como incluir na chave de cache.

- [ ] **Step 9: Incluir os testes no type-check**

`apps/api/tsconfig.json` hoje tem `"include": ["src/**/*.ts"]`, então
`pnpm type-check` ignora a pasta de testes — um erro de tipo num teste
passaria batido. Trocar por:

```json
  "include": ["src/**/*.ts", "tests/**/*.ts", "vitest.config.mts"],
```

- [ ] **Step 10: Rodar e verificar que passa**

Run: `pnpm --filter @barchop/api test`
Expected: 3 testes passando. Se `migrate deploy` falhar em
`CREATE EXTENSION`, rodar o comando de superusuário do "Pré-requisito
manual" acima e tentar de novo.

Run: `pnpm --filter @barchop/api type-check`
Expected: sem saída. O `tsup` continua compilando só a partir de
`src/server.ts`, então os testes entrarem no type-check não muda o
bundle.

- [ ] **Step 11: Commit**

```bash
git add apps/api/vitest.config.mts apps/api/tests apps/api/.env.test.example apps/api/package.json apps/api/tsconfig.json turbo.json .gitignore pnpm-lock.yaml
git commit -m "test: set up vitest against a real Postgres

The exclusion constraint and Prisma's @db.Date/@db.Time mapping cannot
be proven with a mocked client, so tests run against a dedicated
barchop_test database. One test asserts sem_conflito_horario actually
applied — it lives only in hand-written migration SQL, so a silent
failure there would make the later race test a false positive."
```

---

## Task 2: Camada de conversão de horários

O ponto de maior risco do passo inteiro. O Prisma mapeia colunas
`@db.Time` e `@db.Date` pra `Date` do JS e grava **a porção UTC** dela.
Numa máquina em `America/Sao_Paulo`, `new Date("1970-01-01T09:00:00")`
grava `12:00` no banco, sem erro — e corrompe junto a coluna `periodo`,
de onde sai a trava de conflito.

**Files:**
- Create: `apps/api/src/lib/horas.ts`
- Test: `apps/api/tests/lib/horas.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `horaParaDate(hora: string): Date`
  - `dateParaHora(d: Date): string`
  - `dataParaDate(data: string): Date`
  - `dateParaData(d: Date): string`
  - `somarMinutos(hora: string, minutos: number): string`

- [ ] **Step 1: Escrever os testes que falham**

`apps/api/tests/lib/horas.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  dataParaDate,
  dateParaData,
  dateParaHora,
  horaParaDate,
  somarMinutos,
} from "../../src/lib/horas";

describe("horaParaDate", () => {
  it("constrói em UTC, independente do fuso da máquina", () => {
    // Esta é a asserção que pega o bug de fuso: toISOString sempre
    // imprime em UTC, então se a data tivesse sido montada em horário
    // local isso daria 12:00 numa máquina em America/Sao_Paulo.
    expect(horaParaDate("09:00").toISOString()).toBe("1970-01-01T09:00:00.000Z");
  });

  it("aceita a meia-noite e o último minuto do dia", () => {
    expect(horaParaDate("00:00").toISOString()).toBe("1970-01-01T00:00:00.000Z");
    expect(horaParaDate("23:59").toISOString()).toBe("1970-01-01T23:59:00.000Z");
  });

  it("rejeita formato inválido", () => {
    expect(() => horaParaDate("9:00")).toThrow(RangeError);
    expect(() => horaParaDate("24:00")).toThrow(RangeError);
    expect(() => horaParaDate("09:60")).toThrow(RangeError);
    expect(() => horaParaDate("nove")).toThrow(RangeError);
  });
});

describe("dateParaHora", () => {
  it("faz o caminho de volta", () => {
    expect(dateParaHora(horaParaDate("14:30"))).toBe("14:30");
  });

  it("preenche com zero à esquerda", () => {
    expect(dateParaHora(horaParaDate("07:05"))).toBe("07:05");
  });
});

describe("dataParaDate", () => {
  it("constrói em UTC", () => {
    expect(dataParaDate("2026-09-01").toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });

  it("faz o caminho de volta", () => {
    expect(dateParaData(dataParaDate("2026-12-31"))).toBe("2026-12-31");
  });

  it("rejeita data que não existe no calendário", () => {
    // Date.UTC normalizaria 2026-02-31 pra 2026-03-03 em silêncio.
    expect(() => dataParaDate("2026-02-31")).toThrow(RangeError);
    expect(() => dataParaDate("2026-13-01")).toThrow(RangeError);
    expect(() => dataParaDate("01/09/2026")).toThrow(RangeError);
  });
});

describe("somarMinutos", () => {
  it("soma dentro da mesma hora", () => {
    expect(somarMinutos("10:00", 45)).toBe("10:45");
  });

  it("vira a hora", () => {
    expect(somarMinutos("10:30", 45)).toBe("11:15");
  });

  it("rejeita soma que passa da meia-noite", () => {
    // A coluna `periodo` é tsrange((data + hora_inicio), (data + hora_fim)).
    // Se hora_fim virasse o dia, o range ficaria invertido e o Postgres
    // recusaria a linha com um erro bem menos claro que este.
    expect(() => somarMinutos("23:30", 45)).toThrow(RangeError);
  });
});
```

- [ ] **Step 2: Rodar e verificar que falha**

Run: `pnpm --filter @barchop/api test tests/lib/horas.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/lib/horas"`.

- [ ] **Step 3: Escrever a implementação**

`apps/api/src/lib/horas.ts`:

```ts
// O Prisma mapeia colunas @db.Time e @db.Date pra Date do JS e grava a
// porção UTC dela. Construir a Date a partir de string local ("09:00"
// numa máquina em America/Sao_Paulo) gravaria 12:00 no banco, sem erro
// nenhum, e corromperia junto a coluna `periodo` — de onde sai a trava
// de conflito de horário. Por isso todo Date que chega no banco nasce
// aqui, sempre com Date.UTC.

const PADRAO_HORA = /^([01]\d|2[0-3]):([0-5]\d)$/;
const PADRAO_DATA = /^(\d{4})-(\d{2})-(\d{2})$/;

export function horaParaDate(hora: string): Date {
  const partes = PADRAO_HORA.exec(hora);
  if (!partes) throw new RangeError(`hora inválida: ${hora}`);
  return new Date(Date.UTC(1970, 0, 1, Number(partes[1]), Number(partes[2])));
}

export function dateParaHora(d: Date): string {
  const h = String(d.getUTCHours()).padStart(2, "0");
  const m = String(d.getUTCMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

export function dataParaDate(data: string): Date {
  const partes = PADRAO_DATA.exec(data);
  if (!partes) throw new RangeError(`data inválida: ${data}`);

  const d = new Date(
    Date.UTC(Number(partes[1]), Number(partes[2]) - 1, Number(partes[3]))
  );

  // Date.UTC normaliza 2026-02-31 pra 2026-03-03 em silêncio. O caminho
  // de volta não bater é o que denuncia a data inexistente.
  if (dateParaData(d) !== data) throw new RangeError(`data inválida: ${data}`);
  return d;
}

export function dateParaData(d: Date): string {
  const ano = String(d.getUTCFullYear()).padStart(4, "0");
  const mes = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dia = String(d.getUTCDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

export function somarMinutos(hora: string, minutos: number): string {
  const base = horaParaDate(hora);
  const total = base.getUTCHours() * 60 + base.getUTCMinutes() + minutos;

  // Um agendamento que vira o dia inverteria o tsrange da coluna
  // `periodo`. Melhor recusar aqui, com mensagem clara.
  if (total >= 24 * 60) {
    throw new RangeError(`soma passa da meia-noite: ${hora} + ${minutos}min`);
  }

  const h = String(Math.floor(total / 60)).padStart(2, "0");
  const m = String(total % 60).padStart(2, "0");
  return `${h}:${m}`;
}
```

- [ ] **Step 4: Rodar e verificar que passa**

Run: `pnpm --filter @barchop/api test tests/lib/horas.test.ts`
Expected: PASS, 11 testes.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/horas.ts apps/api/tests/lib/horas.test.ts
git commit -m "feat(api): add UTC-anchored time conversion helpers

Prisma writes the UTC portion of a JS Date into @db.Time columns, so a
Date built from a local-time string silently stores the wrong hour and
corrupts the generated `periodo` column along with it. Every Date bound
for the database is built here with Date.UTC instead."
```

---

## Task 3: Testes do `packages/scheduling`

O pacote é a regra de negócio central do produto e hoje não tem nenhum
teste. A fase 4 vai depender dele para decidir se um horário pedido é
válido.

**Files:**
- Create: `packages/scheduling/vitest.config.mts`
- Test: `packages/scheduling/tests/calcular-horarios.test.ts`
- Modify: `packages/scheduling/package.json`

**Interfaces:**
- Consumes: `calcularHorariosDisponiveis(params: CalcularHorariosParams): string[]` de `packages/scheduling/src/index.ts` (já existe).
- Produces: script `pnpm --filter @barchop/scheduling test`.

- [ ] **Step 1: Instalar o vitest no pacote**

```bash
pnpm --filter @barchop/scheduling add -D vitest@^4.1.11
```

- [ ] **Step 2: Criar o `vitest.config.mts`**

`packages/scheduling/vitest.config.mts`:

```ts
import { defineConfig } from "vitest/config";

// Pacote sem dependência de framework nem de banco — nada de setup.
export default defineConfig({});
```

- [ ] **Step 3: Escrever os testes**

`packages/scheduling/tests/calcular-horarios.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { calcularHorariosDisponiveis } from "../src/index";

const ABERTO = {
  horaAbertura: "09:00",
  horaFechamento: "18:00",
  fechado: false,
};

describe("calcularHorariosDisponiveis", () => {
  it("devolve lista vazia quando o dia está fechado", () => {
    expect(
      calcularHorariosDisponiveis({
        horarioFuncionamento: { horaAbertura: null, horaFechamento: null, fechado: true },
        agendamentosExistentes: [],
        duracaoTotalMinutos: 45,
      })
    ).toEqual([]);
  });

  it("devolve lista vazia quando falta hora de abertura", () => {
    expect(
      calcularHorariosDisponiveis({
        horarioFuncionamento: { horaAbertura: null, horaFechamento: "18:00", fechado: false },
        agendamentosExistentes: [],
        duracaoTotalMinutos: 45,
      })
    ).toEqual([]);
  });

  it("preenche o expediente inteiro quando não há agendamento", () => {
    const horarios = calcularHorariosDisponiveis({
      horarioFuncionamento: ABERTO,
      agendamentosExistentes: [],
      duracaoTotalMinutos: 45,
    });

    expect(horarios[0]).toBe("09:00");
    // 18:00 menos 45min de duração: o último início possível é 17:15
    expect(horarios.at(-1)).toBe("17:15");
  });

  it("pula o intervalo ocupado e retoma no fim dele", () => {
    const horarios = calcularHorariosDisponiveis({
      horarioFuncionamento: ABERTO,
      agendamentosExistentes: [{ horaInicio: "10:00", horaFim: "10:45" }],
      duracaoTotalMinutos: 45,
    });

    // 09:00 e 09:15 cabem antes das 10:00; 09:30 não (terminaria 10:15).
    expect(horarios.slice(0, 3)).toEqual(["09:00", "09:15", "10:45"]);
    expect(horarios).not.toContain("09:30");
  });

  it("descarta gap curto demais pra duração pedida", () => {
    const horarios = calcularHorariosDisponiveis({
      horarioFuncionamento: ABERTO,
      agendamentosExistentes: [
        { horaInicio: "09:00", horaFim: "10:00" },
        { horaInicio: "10:30", horaFim: "11:00" },
      ],
      duracaoTotalMinutos: 45,
    });

    // O gap 10:00–10:30 tem 30min e não comporta 45min.
    expect(horarios).not.toContain("10:00");
    expect(horarios[0]).toBe("11:00");
  });

  it("alinha os candidatos ao grid, não ao fim do agendamento anterior", () => {
    const horarios = calcularHorariosDisponiveis({
      horarioFuncionamento: ABERTO,
      agendamentosExistentes: [{ horaInicio: "09:00", horaFim: "09:07" }],
      duracaoTotalMinutos: 30,
    });

    // Sem alinhamento sairia "09:07". O grid de 15min a partir da
    // meia-noite manda sugerir 09:15.
    expect(horarios[0]).toBe("09:15");
  });

  it("respeita intervaloMinutos customizado", () => {
    const horarios = calcularHorariosDisponiveis({
      horarioFuncionamento: ABERTO,
      agendamentosExistentes: [],
      duracaoTotalMinutos: 30,
      intervaloMinutos: 30,
    });

    expect(horarios.slice(0, 3)).toEqual(["09:00", "09:30", "10:00"]);
  });

  it("devolve lista vazia quando a duração não cabe no expediente", () => {
    expect(
      calcularHorariosDisponiveis({
        horarioFuncionamento: { horaAbertura: "09:00", horaFechamento: "09:30", fechado: false },
        agendamentosExistentes: [],
        duracaoTotalMinutos: 45,
      })
    ).toEqual([]);
  });

  it("trata o fim do agendamento como exclusivo, igual à constraint do banco", () => {
    const horarios = calcularHorariosDisponiveis({
      horarioFuncionamento: ABERTO,
      agendamentosExistentes: [{ horaInicio: "10:00", horaFim: "10:45" }],
      duracaoTotalMinutos: 45,
    });

    // A EXCLUDE constraint usa tsrange '[)', então 10:45 encosta mas
    // não colide. As duas regras têm que concordar.
    expect(horarios).toContain("10:45");
  });
});
```

- [ ] **Step 4: Rodar e verificar que passa**

Run: `pnpm --filter @barchop/scheduling test`
Expected: PASS, 9 testes. Se algum falhar, **é a implementação que está
errada, não o teste** — os casos acima descrevem o comportamento
documentado nos comentários de `src/index.ts`. Investigar antes de
ajustar a asserção.

- [ ] **Step 5: Adicionar o script**

Em `packages/scheduling/package.json`, criar a seção `scripts`:

```json
  "scripts": {
    "test": "vitest run"
  },
```

- [ ] **Step 6: Commit**

```bash
git add packages/scheduling/vitest.config.mts packages/scheduling/tests packages/scheduling/package.json pnpm-lock.yaml
git commit -m "test(scheduling): cover the availability calculator

It is the product's central business rule and had no tests. One case
pins the half-open boundary to match the tsrange '[)' in the database
exclusion constraint — the two have to agree or the API accepts slots
the database then rejects."
```

---

## Task 4: Extrair `buildApp()` de `server.ts`

Os testes precisam de uma instância montada que não abre porta, pra usar
`app.inject()`.

**Files:**
- Create: `apps/api/src/tipos.ts`
- Create: `apps/api/src/app.ts`
- Modify: `apps/api/src/server.ts`
- Test: `apps/api/tests/health.test.ts`

**Interfaces:**
- Consumes: nada das tasks anteriores.
- Produces:
  - `type App` em `src/tipos.ts` — a instância do Fastify já com o type provider aplicado. Toda função que registra rota recebe um `App`.
  - `buildApp(opts?: { logger?: boolean }): App` em `src/app.ts`.

- [ ] **Step 1: Escrever o teste que falha**

`apps/api/tests/health.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app";

describe("GET /health", () => {
  it("responde ok sem precisar abrir porta", async () => {
    const app = buildApp();
    const resposta = await app.inject({ method: "GET", url: "/health" });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual({ status: "ok" });

    await app.close();
  });
});
```

- [ ] **Step 2: Rodar e verificar que falha**

Run: `pnpm --filter @barchop/api test tests/health.test.ts`
Expected: FAIL — `Failed to resolve import "../src/app"`.

- [ ] **Step 3: Criar o tipo da instância**

`apps/api/src/tipos.ts`:

```ts
import type { IncomingMessage, ServerResponse } from "node:http";
import type { JsonSchemaToTsProvider } from "@fastify/type-provider-json-schema-to-ts";
import type {
  FastifyBaseLogger,
  FastifyInstance,
  RawServerDefault,
} from "fastify";

// O `withTypeProvider` devolve uma instância com um tipo longo demais
// pra repetir em cada arquivo de rota. Esse alias é esse tipo, e é o
// que as funções de registro de rota recebem — sem ele, elas perderiam
// a inferência do corpo a partir do schema JSON.
export type App = FastifyInstance<
  RawServerDefault,
  IncomingMessage,
  ServerResponse<IncomingMessage>,
  FastifyBaseLogger,
  JsonSchemaToTsProvider
>;
```

- [ ] **Step 4: Escrever o `app.ts`**

`apps/api/src/app.ts` — move o conteúdo atual de `server.ts`, sem o
`listen`:

```ts
import cors from "@fastify/cors";
import Fastify from "fastify";
import type { JsonSchemaToTsProvider } from "@fastify/type-provider-json-schema-to-ts";
import { calcularHorariosDisponiveis } from "@barchop/scheduling";
import { prisma } from "@barchop/database";
import type { App } from "./tipos";

// Monta a instância sem escutar em porta nenhuma. É o que permite os
// testes usarem app.inject(). Quem abre a porta é o server.ts.
export function buildApp(opts: { logger?: boolean } = {}): App {
  const app = Fastify({
    logger: opts.logger ?? false,
  }).withTypeProvider<JsonSchemaToTsProvider>();

  // origin: true por enquanto — trocar por uma lista explícita
  // (domínio do painel web + esquema do app mobile) antes de produção.
  app.register(cors, { origin: true });

  app.get("/health", async () => ({ status: "ok" }));

  app.get(
    "/barbearias/:slug/servicos",
    { schema: { params: { type: "object", properties: { slug: { type: "string" } }, required: ["slug"] } } },
    async (request) => {
      const { slug } = request.params;
      const barbearia = await prisma.barbearia.findUniqueOrThrow({ where: { slug } });
      return prisma.servico.findMany({
        where: { barbeariaId: barbearia.id, ativo: true },
        orderBy: { nome: "asc" },
      });
    }
  );

  const disponibilidadeBodySchema = {
    type: "object",
    required: ["horarioFuncionamento", "agendamentosExistentes", "duracaoTotalMinutos"],
    properties: {
      horarioFuncionamento: {
        type: "object",
        required: ["horaAbertura", "horaFechamento", "fechado"],
        properties: {
          horaAbertura: { type: ["string", "null"] },
          horaFechamento: { type: ["string", "null"] },
          fechado: { type: "boolean" },
        },
      },
      agendamentosExistentes: {
        type: "array",
        items: {
          type: "object",
          required: ["horaInicio", "horaFim"],
          properties: {
            horaInicio: { type: "string" },
            horaFim: { type: "string" },
          },
        },
      },
      duracaoTotalMinutos: { type: "number", minimum: 1 },
      intervaloMinutos: { type: "number", minimum: 5 },
    },
  } as const;

  app.post(
    "/disponibilidade",
    { schema: { body: disponibilidadeBodySchema } },
    async (request) => {
      const horarios = calcularHorariosDisponiveis(request.body);
      return { horarios };
    }
  );

  return app;
}
```

Nota: `/disponibilidade` e `/barbearias/:slug/servicos` continuam aqui
por enquanto. A fase 5 remove a primeira e move a segunda pra
`rotas/servicos.ts`.

- [ ] **Step 5: Reduzir o `server.ts` ao bootstrap**

`apps/api/src/server.ts`, substituindo todo o conteúdo:

```ts
import { buildApp } from "./app";

// Entrypoint do bundle (ver tsup.config.ts). Toda a montagem da
// aplicação está no app.ts, que os testes usam sem abrir porta.
const app = buildApp({ logger: true });

app.listen({ port: 3333, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
```

- [ ] **Step 6: Rodar teste, type-check e build**

Run: `pnpm --filter @barchop/api test tests/health.test.ts`
Expected: PASS.

Run: `pnpm --filter @barchop/api type-check`
Expected: sem saída.

Run: `pnpm --filter @barchop/api build`
Expected: `Build success`, `dist/server.js` gerado.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/app.ts apps/api/src/tipos.ts apps/api/src/server.ts apps/api/tests/health.test.ts
git commit -m "refactor(api): split buildApp from the listen call

Tests drive routes through app.inject(), which needs a built instance
that never binds a port. server.ts keeps only the bootstrap."
```

---

## Task 5: Hash de senha com `scrypt`

**Files:**
- Create: `apps/api/src/lib/senha.ts`
- Test: `apps/api/tests/lib/senha.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `gerarHashSenha(senha: string): Promise<string>` — devolve `scrypt$<salt-b64>$<hash-b64>`
  - `conferirSenha(senha: string, guardado: string): Promise<boolean>`

- [ ] **Step 1: Escrever os testes que falham**

`apps/api/tests/lib/senha.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { conferirSenha, gerarHashSenha } from "../../src/lib/senha";

describe("gerarHashSenha", () => {
  it("produz o formato scrypt$salt$hash", async () => {
    const hash = await gerarHashSenha("senha-do-barbeiro");
    const partes = hash.split("$");

    expect(partes).toHaveLength(3);
    expect(partes[0]).toBe("scrypt");
  });

  it("gera hash diferente pra mesma senha, por causa do salt", async () => {
    const a = await gerarHashSenha("mesma-senha");
    const b = await gerarHashSenha("mesma-senha");

    expect(a).not.toBe(b);
  });
});

describe("conferirSenha", () => {
  it("aceita a senha correta", async () => {
    const hash = await gerarHashSenha("senha-do-barbeiro");
    expect(await conferirSenha("senha-do-barbeiro", hash)).toBe(true);
  });

  it("recusa a senha errada", async () => {
    const hash = await gerarHashSenha("senha-do-barbeiro");
    expect(await conferirSenha("outra-senha", hash)).toBe(false);
  });

  it("recusa hash malformado sem estourar", async () => {
    expect(await conferirSenha("qualquer", "nao-e-um-hash")).toBe(false);
    expect(await conferirSenha("qualquer", "scrypt$soh-duas-partes")).toBe(false);
    expect(await conferirSenha("qualquer", "bcrypt$c2FsdA==$aGFzaA==")).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e verificar que falha**

Run: `pnpm --filter @barchop/api test tests/lib/senha.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/lib/senha"`.

- [ ] **Step 3: Escrever a implementação**

`apps/api/src/lib/senha.ts`:

```ts
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

// scrypt do node:crypto, sem dependência externa e sem node-gyp. O
// formato guardado carrega o salt junto, então trocar de parâmetro no
// futuro é possível sem invalidar as senhas já cadastradas: basta
// olhar o prefixo antes de conferir.
const scryptAsync = promisify(scrypt) as (
  senha: string,
  salt: Buffer,
  tamanho: number
) => Promise<Buffer>;

const TAMANHO_SALT = 16;
const TAMANHO_HASH = 64;

export async function gerarHashSenha(senha: string): Promise<string> {
  const salt = randomBytes(TAMANHO_SALT);
  const hash = await scryptAsync(senha, salt, TAMANHO_HASH);
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function conferirSenha(
  senha: string,
  guardado: string
): Promise<boolean> {
  const partes = guardado.split("$");
  if (partes.length !== 3 || partes[0] !== "scrypt") return false;

  const salt = Buffer.from(partes[1], "base64");
  const esperado = Buffer.from(partes[2], "base64");

  // timingSafeEqual estoura se os tamanhos diferem — conferir antes.
  if (esperado.length !== TAMANHO_HASH) return false;

  const calculado = await scryptAsync(senha, salt, TAMANHO_HASH);
  return timingSafeEqual(calculado, esperado);
}
```

- [ ] **Step 4: Rodar e verificar que passa**

Run: `pnpm --filter @barchop/api test tests/lib/senha.test.ts`
Expected: PASS, 5 testes.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/senha.ts apps/api/tests/lib/senha.test.ts
git commit -m "feat(api): hash passwords with node:crypto scrypt

No native dependency and no node-gyp. The stored format carries its own
salt behind a scrypt\$ prefix, so the parameters can change later
without invalidating existing passwords."
```

---

## Task 6: Tradutor central de erros

**Files:**
- Create: `apps/api/src/lib/erro-negocio.ts`
- Create: `apps/api/src/plugins/erros.ts`
- Modify: `apps/api/src/app.ts`
- Test: `apps/api/tests/erros.test.ts`

**Interfaces:**
- Consumes: `App` de `src/tipos.ts` (Task 4).
- Produces:
  - `class ErroDeNegocio extends Error` com `codigo: string` — lançar isso de qualquer rota vira `422`.
  - `registrarTratamentoDeErros(app: App): void`, chamada dentro de `buildApp`.
  - Formato de resposta de erro: `{ erro: string, mensagem?: string }`.

- [ ] **Step 1: Escrever o teste que falha**

`apps/api/tests/erros.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app";
import { ErroDeNegocio } from "../src/lib/erro-negocio";

describe("tratamento de erros", () => {
  it("traduz ErroDeNegocio pra 422", async () => {
    const app = buildApp();
    app.get("/teste-negocio", async () => {
      throw new ErroDeNegocio("horário indisponível", "horario_indisponivel");
    });

    const resposta = await app.inject({ method: "GET", url: "/teste-negocio" });

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json()).toEqual({
      erro: "horario_indisponivel",
      mensagem: "horário indisponível",
    });

    await app.close();
  });

  it("traduz P2025 do Prisma pra 404", async () => {
    const app = buildApp();
    const resposta = await app.inject({
      method: "GET",
      url: "/barbearias/nao-existe/servicos",
    });

    expect(resposta.statusCode).toBe(404);
    expect(resposta.json()).toEqual({ erro: "nao_encontrado" });

    await app.close();
  });

  it("mantém o 400 da validação de schema do Fastify", async () => {
    const app = buildApp();
    const resposta = await app.inject({
      method: "POST",
      url: "/disponibilidade",
      payload: { duracaoTotalMinutos: 45 },
    });

    expect(resposta.statusCode).toBe(400);

    await app.close();
  });

  it("normaliza qualquer 401 para nao_autenticado", async () => {
    const app = buildApp();
    app.get("/teste-401", async () => {
      // Imita o formato do que o @fastify/jwt lança: statusCode 401 com
      // um code interno do plugin. O contrato da API não deve expor esse
      // nome — as telas ramificariam em cima dele.
      const erro = new Error("token ausente") as Error & {
        statusCode: number;
        code: string;
      };
      erro.statusCode = 401;
      erro.code = "FST_JWT_NO_AUTHORIZATION_IN_HEADER";
      throw erro;
    });

    const resposta = await app.inject({ method: "GET", url: "/teste-401" });

    expect(resposta.statusCode).toBe(401);
    expect(resposta.json()).toEqual({ erro: "nao_autenticado" });
    expect(resposta.body).not.toContain("FST_JWT");

    await app.close();
  });

  it("esconde erro inesperado atrás de 500 genérico", async () => {
    const app = buildApp();
    app.get("/teste-explosao", async () => {
      throw new Error("detalhe interno que não pode vazar");
    });

    const resposta = await app.inject({ method: "GET", url: "/teste-explosao" });

    expect(resposta.statusCode).toBe(500);
    expect(resposta.json()).toEqual({ erro: "erro_interno" });
    expect(resposta.body).not.toContain("detalhe interno");

    await app.close();
  });
});
```

- [ ] **Step 2: Rodar e verificar que falha**

Run: `pnpm --filter @barchop/api test tests/erros.test.ts`
Expected: FAIL — `Failed to resolve import "../src/lib/erro-negocio"`.

- [ ] **Step 3: Criar a classe de erro de negócio**

`apps/api/src/lib/erro-negocio.ts`:

```ts
// Regra de negócio violada — requisição bem formada, mas que o domínio
// recusa. Sempre vira 422, nunca 400 (400 é validação de schema) nem
// 500 (que é bug nosso).
export class ErroDeNegocio extends Error {
  readonly codigo: string;

  constructor(mensagem: string, codigo = "regra_de_negocio") {
    super(mensagem);
    this.name = "ErroDeNegocio";
    this.codigo = codigo;
  }
}
```

- [ ] **Step 4: Escrever o plugin de erros**

`apps/api/src/plugins/erros.ts`:

```ts
import type { FastifyError } from "fastify";

import { Prisma } from "@barchop/database";
import { ErroDeNegocio } from "../lib/erro-negocio";
import type { App } from "../tipos";

// Um lugar só traduzindo erro de domínio e de banco pra HTTP. Sem isso,
// cada rota repetiria try/catch e o formato da resposta divergiria.
export function registrarTratamentoDeErros(app: App): void {
  // O parâmetro de tipo é necessário: sem ele o Fastify 5 tipa o erro
  // como `unknown`, e o ramo final não consegue ler `statusCode`/`code`.
  app.setErrorHandler<FastifyError>((erro, request, reply) => {
    if (erro instanceof ErroDeNegocio) {
      return reply
        .code(422)
        .send({ erro: erro.codigo, mensagem: erro.message });
    }

    if (erro instanceof Prisma.PrismaClientKnownRequestError) {
      // P2025: findUniqueOrThrow/update não achou o registro.
      if (erro.code === "P2025") {
        return reply.code(404).send({ erro: "nao_encontrado" });
      }
      // P2002: violação de unique (slug de barbearia, email, telefone).
      if (erro.code === "P2002") {
        return reply.code(409).send({ erro: "conflito" });
      }
    }

    const status = erro.statusCode ?? 500;

    // O @fastify/jwt lança com códigos próprios (FST_JWT_NO_AUTHORIZATION_IN_HEADER,
    // FST_JWT_AUTHORIZATION_TOKEN_INVALID e outros). Repassar esses nomes
    // crus colocaria o nome interno de um plugin dentro do contrato da
    // API — e as 23 telas passariam a ramificar em cima dele. Pra quem
    // consome, toda falha de token é a mesma coisa.
    if (status === 401) {
      return reply.code(401).send({ erro: "nao_autenticado" });
    }

    // Validação de schema do Fastify já vem com statusCode. Repassar
    // preservando o código.
    if (status < 500) {
      return reply
        .code(status)
        .send({ erro: erro.code ?? "requisicao_invalida", mensagem: erro.message });
    }

    // Qualquer outra coisa é bug nosso: registra inteiro no log e
    // devolve genérico, pra não vazar detalhe interno.
    request.log.error(erro);
    return reply.code(500).send({ erro: "erro_interno" });
  });
}
```

- [ ] **Step 5: Ligar no `buildApp`**

Em `apps/api/src/app.ts`, adicionar o import e a chamada logo depois do
`register(cors, ...)`:

```ts
import { registrarTratamentoDeErros } from "./plugins/erros";
```

```ts
  registrarTratamentoDeErros(app);
```

- [ ] **Step 6: Rodar e verificar que passa**

Run: `pnpm --filter @barchop/api test tests/erros.test.ts`
Expected: PASS, 5 testes.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/lib/erro-negocio.ts apps/api/src/plugins/erros.ts apps/api/src/app.ts apps/api/tests/erros.test.ts
git commit -m "feat(api): translate domain and Prisma errors centrally

422 for a business rule the domain refuses, 404 for P2025, 409 for
P2002, and a bare 500 for anything unexpected so internal detail never
reaches the client."
```

---

## Task 7: `POST /auth/signup`

Primeiro acesso da tela de Login/cadastro: cria `Barbearia` e `Barbeiro`
numa transação, e já devolve o token pra tela entrar logada.

**Files:**
- Create: `apps/api/src/plugins/auth.ts`
- Create: `apps/api/src/rotas/auth.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/plugins/erros.ts`
- Test: `apps/api/tests/rotas/auth-signup.test.ts`
- Test: `apps/api/tests/erros.test.ts`

**Interfaces:**
- Consumes: `gerarHashSenha` (Task 5), `App` (Task 4), `ErroDeNegocio` (Task 6).
- Produces:
  - `registrarAuth(app: App): void` em `plugins/auth.ts` — registra `@fastify/jwt` e declara o tipo do payload.
  - `autenticar(request: FastifyRequest): Promise<void>` em `plugins/auth.ts` — hook `onRequest`, usado na Task 9.
  - `registrarRotasAuth(app: App): void` em `rotas/auth.ts`.
  - Payload do JWT: `{ barbeiroId: string; barbeariaId: string }`, legível em `request.user`.

- [ ] **Step 1: Escrever os testes que falham**

`apps/api/tests/rotas/auth-signup.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { prisma } from "@barchop/database";
import { buildApp } from "../../src/app";

const CORPO_VALIDO = {
  barbearia: { nome: "Barbearia do Gu", slug: "barbearia-do-gu" },
  barbeiro: { nome: "Gustavo", email: "gu@exemplo.com", senha: "senha-forte-123" },
};

describe("POST /auth/signup", () => {
  it("cria barbearia e barbeiro e devolve token", async () => {
    const app = buildApp();
    const resposta = await app.inject({
      method: "POST",
      url: "/auth/signup",
      payload: CORPO_VALIDO,
    });

    expect(resposta.statusCode).toBe(201);

    const corpo = resposta.json();
    expect(typeof corpo.token).toBe("string");
    expect(corpo.barbearia.slug).toBe("barbearia-do-gu");
    expect(corpo.barbeiro.email).toBe("gu@exemplo.com");

    expect(await prisma.barbearia.count()).toBe(1);
    expect(await prisma.barbeiro.count()).toBe(1);

    await app.close();
  });

  it("nunca devolve senhaHash", async () => {
    const app = buildApp();
    const resposta = await app.inject({
      method: "POST",
      url: "/auth/signup",
      payload: CORPO_VALIDO,
    });

    expect(resposta.body).not.toContain("senhaHash");
    expect(resposta.body).not.toContain("scrypt$");

    await app.close();
  });

  it("guarda a senha com hash, nunca em texto puro", async () => {
    const app = buildApp();
    await app.inject({ method: "POST", url: "/auth/signup", payload: CORPO_VALIDO });

    const barbeiro = await prisma.barbeiro.findFirstOrThrow();
    expect(barbeiro.senhaHash).not.toBe("senha-forte-123");
    expect(barbeiro.senhaHash.startsWith("scrypt$")).toBe(true);

    await app.close();
  });

  it("recusa slug fora do formato", async () => {
    const app = buildApp();
    const resposta = await app.inject({
      method: "POST",
      url: "/auth/signup",
      payload: {
        ...CORPO_VALIDO,
        barbearia: { nome: "Teste", slug: "Slug Com Espaço" },
      },
    });

    expect(resposta.statusCode).toBe(400);

    await app.close();
  });

  it("recusa senha curta demais", async () => {
    const app = buildApp();
    const resposta = await app.inject({
      method: "POST",
      url: "/auth/signup",
      payload: {
        ...CORPO_VALIDO,
        barbeiro: { ...CORPO_VALIDO.barbeiro, senha: "curta" },
      },
    });

    expect(resposta.statusCode).toBe(400);

    await app.close();
  });

  it("recusa slug já usado, com 409", async () => {
    const app = buildApp();
    await app.inject({ method: "POST", url: "/auth/signup", payload: CORPO_VALIDO });

    const segunda = await app.inject({
      method: "POST",
      url: "/auth/signup",
      payload: {
        barbearia: { nome: "Outra", slug: "barbearia-do-gu" },
        barbeiro: { nome: "Outro", email: "outro@exemplo.com", senha: "senha-forte-123" },
      },
    });

    expect(segunda.statusCode).toBe(409);

    await app.close();
  });

  it("não deixa barbearia órfã quando o barbeiro falha", async () => {
    const app = buildApp();
    await app.inject({ method: "POST", url: "/auth/signup", payload: CORPO_VALIDO });

    // Mesmo email, slug diferente: a barbearia passa, o barbeiro
    // esbarra no unique de email. A transação tem que desfazer as duas.
    const segunda = await app.inject({
      method: "POST",
      url: "/auth/signup",
      payload: {
        barbearia: { nome: "Outra", slug: "outra-barbearia" },
        barbeiro: { ...CORPO_VALIDO.barbeiro, nome: "Outro" },
      },
    });

    expect(segunda.statusCode).toBe(409);
    expect(await prisma.barbearia.count()).toBe(1);

    await app.close();
  });
});
```

- [ ] **Step 2: Rodar e verificar que falha**

Run: `pnpm --filter @barchop/api test tests/rotas/auth-signup.test.ts`
Expected: FAIL — rota `/auth/signup` responde 404.

- [ ] **Step 3: Escrever o plugin de autenticação**

`apps/api/src/plugins/auth.ts`:

```ts
import fastifyJwt from "@fastify/jwt";
import type { FastifyRequest } from "fastify";
import type { App } from "../tipos";

// Tipa o payload do token. Sem isso, request.user seria `any` e o
// escopo por barbearia dependeria de disciplina em vez do compilador.
declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: { barbeiroId: string; barbeariaId: string };
    user: { barbeiroId: string; barbeariaId: string };
  }
}

export function registrarAuth(app: App): void {
  const segredo = process.env.JWT_SECRET;
  if (!segredo) {
    throw new Error("JWT_SECRET não definido — confira o .env da API");
  }

  app.register(fastifyJwt, { secret: segredo });
}

// Hook onRequest das rotas protegidas. Token ausente ou inválido faz o
// jwtVerify lançar com statusCode 401, que o tratador de erros repassa.
export async function autenticar(request: FastifyRequest): Promise<void> {
  await request.jwtVerify();
}
```

- [ ] **Step 3b: Estender o tratamento de erro pro resto do `@fastify/jwt`**

Esta task é a primeira que registra o `@fastify/jwt`, então é ela que
responde pela superfície de erro dele. A Task 6 já normaliza todo 401,
mas o plugin também lança dois erros com status **400** —
`FST_JWT_BAD_REQUEST` (cabeçalho `Authorization` malformado) e
`FST_JWT_BAD_COOKIE_REQUEST` — que cairiam no repasse genérico e
colocariam o código interno do plugin dentro do campo `erro`. É o mesmo
vazamento de contrato que o ramo de 401 fechou.

Em `apps/api/src/plugins/erros.ts`, trocar a condição do ramo de 401:

```ts
    // Toda falha vinda do @fastify/jwt é falha de autenticação, inclusive
    // as duas que o plugin classifica como 400 (cabeçalho Authorization
    // malformado, cookie ilegível). Tratar as duas como 401 mantém o
    // nome interno do plugin fora do contrato, e descreve melhor o que
    // houve: quem manda um cabeçalho torto não está autenticado.
    if (status === 401 || erro.code?.startsWith("FST_JWT")) {
      return reply.code(401).send({ erro: "nao_autenticado" });
    }
```

E acrescentar este caso em `apps/api/tests/erros.test.ts`:

```ts
  it("trata o 400 do @fastify/jwt como falha de autenticação", async () => {
    const app = buildApp();
    app.get("/teste-jwt-400", async () => {
      // O plugin lança isto quando o cabeçalho Authorization existe mas
      // não está no formato "Bearer <token>".
      const erro = new Error(
        "Format is Authorization: Bearer [token]"
      ) as Error & { statusCode: number; code: string };
      erro.statusCode = 400;
      erro.code = "FST_JWT_BAD_REQUEST";
      throw erro;
    });

    const resposta = await app.inject({ method: "GET", url: "/teste-jwt-400" });

    expect(resposta.statusCode).toBe(401);
    expect(resposta.json()).toEqual({ erro: "nao_autenticado" });
    expect(resposta.body).not.toContain("FST_JWT");

    await app.close();
  });
```

- [ ] **Step 4: Escrever a rota de signup**

`apps/api/src/rotas/auth.ts`:

```ts
import { prisma } from "@barchop/database";
import { gerarHashSenha } from "../lib/senha";
import type { App } from "../tipos";

// `format: "email"` dependeria do ajv-formats estar ligado no Fastify;
// um pattern explícito não depende de configuração nenhuma.
const PADRAO_EMAIL = "^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$";

const corpoSignup = {
  type: "object",
  required: ["barbearia", "barbeiro"],
  additionalProperties: false,
  properties: {
    barbearia: {
      type: "object",
      required: ["nome", "slug"],
      additionalProperties: false,
      properties: {
        nome: { type: "string", minLength: 2, maxLength: 120 },
        // o slug forma o link público que o barbeiro manda no WhatsApp
        slug: { type: "string", pattern: "^[a-z0-9-]{3,80}$" },
      },
    },
    barbeiro: {
      type: "object",
      required: ["nome", "email", "senha"],
      additionalProperties: false,
      properties: {
        nome: { type: "string", minLength: 2, maxLength: 120 },
        email: { type: "string", pattern: PADRAO_EMAIL, maxLength: 160 },
        senha: { type: "string", minLength: 8, maxLength: 200 },
      },
    },
  },
} as const;

export function registrarRotasAuth(app: App): void {
  app.post(
    "/auth/signup",
    { schema: { body: corpoSignup } },
    async (request, reply) => {
      const { barbearia, barbeiro } = request.body;
      const senhaHash = await gerarHashSenha(barbeiro.senha);

      // Transação: uma barbearia sem barbeiro seria inacessível pra
      // sempre, já que o login é por email de barbeiro.
      const criado = await prisma.$transaction(async (tx) => {
        const novaBarbearia = await tx.barbearia.create({
          data: { nome: barbearia.nome, slug: barbearia.slug },
        });

        const novoBarbeiro = await tx.barbeiro.create({
          data: {
            barbeariaId: novaBarbearia.id,
            nome: barbeiro.nome,
            email: barbeiro.email,
            senhaHash,
          },
        });

        return { barbearia: novaBarbearia, barbeiro: novoBarbeiro };
      });

      const token = app.jwt.sign({
        barbeiroId: criado.barbeiro.id,
        barbeariaId: criado.barbearia.id,
      });

      // Campos listados um a um, nunca spread do registro: é o que
      // garante que senhaHash não escape.
      return reply.code(201).send({
        token,
        barbeiro: {
          id: criado.barbeiro.id,
          nome: criado.barbeiro.nome,
          email: criado.barbeiro.email,
        },
        barbearia: {
          id: criado.barbearia.id,
          nome: criado.barbearia.nome,
          slug: criado.barbearia.slug,
        },
      });
    }
  );
}
```

- [ ] **Step 5: Ligar no `buildApp`**

Em `apps/api/src/app.ts`, adicionar os imports e as chamadas depois de
`registrarTratamentoDeErros(app)`:

```ts
import { registrarAuth } from "./plugins/auth";
import { registrarRotasAuth } from "./rotas/auth";
```

```ts
  registrarAuth(app);
  registrarRotasAuth(app);
```

- [ ] **Step 6: Rodar e verificar que passa**

Run: `pnpm --filter @barchop/api test tests/rotas/auth-signup.test.ts`
Expected: PASS, 7 testes.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/plugins/auth.ts apps/api/src/rotas/auth.ts apps/api/src/app.ts apps/api/tests/rotas/auth-signup.test.ts
git commit -m "feat(api): add POST /auth/signup

Creates Barbearia and Barbeiro in one transaction — a barbershop with
no barber would be permanently unreachable, since login is by barber
email — and returns the JWT so the signup screen lands logged in."
```

---

## Task 8: `POST /auth/login`

**Files:**
- Modify: `apps/api/src/rotas/auth.ts`
- Test: `apps/api/tests/rotas/auth-login.test.ts`

**Interfaces:**
- Consumes: `conferirSenha` (Task 5), `registrarRotasAuth` (Task 7).
- Produces: `POST /auth/login` devolvendo `{ token, barbeiro, barbearia }`, mesmo formato do signup.

- [ ] **Step 1: Escrever os testes que falham**

`apps/api/tests/rotas/auth-login.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { prisma } from "@barchop/database";
import { buildApp } from "../../src/app";
import { conferirSenha } from "../../src/lib/senha";
import { obterHashDescartavel } from "../../src/rotas/auth";
import type { App } from "../../src/tipos";

const CADASTRO = {
  barbearia: { nome: "Barbearia do Gu", slug: "barbearia-do-gu" },
  barbeiro: { nome: "Gustavo", email: "gu@exemplo.com", senha: "senha-forte-123" },
};

async function cadastrar(app: App) {
  await app.inject({ method: "POST", url: "/auth/signup", payload: CADASTRO });
}

describe("POST /auth/login", () => {
  it("devolve token com email e senha corretos", async () => {
    const app = buildApp();
    await cadastrar(app);

    const resposta = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "gu@exemplo.com", senha: "senha-forte-123" },
    });

    expect(resposta.statusCode).toBe(200);
    expect(typeof resposta.json().token).toBe("string");

    await app.close();
  });

  it("recusa senha errada com 401", async () => {
    const app = buildApp();
    await cadastrar(app);

    const resposta = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "gu@exemplo.com", senha: "senha-errada-123" },
    });

    expect(resposta.statusCode).toBe(401);
    // Fixar o corpo, não só o status: sem isto o teste passaria mesmo
    // se a rota devolvesse {} ou outro código.
    expect(resposta.json()).toEqual({ erro: "credenciais_invalidas" });

    await app.close();
  });

  it("dá a mesma resposta pra email inexistente e senha errada", async () => {
    const app = buildApp();
    await cadastrar(app);

    const senhaErrada = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "gu@exemplo.com", senha: "senha-errada-123" },
    });

    const emailInexistente = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "ninguem@exemplo.com", senha: "senha-forte-123" },
    });

    // Respostas idênticas: confirmar qual dos dois errou entregaria
    // quais emails existem na plataforma.
    expect(emailInexistente.statusCode).toBe(senhaErrada.statusCode);
    expect(emailInexistente.json()).toEqual(senhaErrada.json());

    await app.close();
  });

  it("nunca devolve senhaHash", async () => {
    const app = buildApp();
    await cadastrar(app);

    const resposta = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "gu@exemplo.com", senha: "senha-forte-123" },
    });

    expect(resposta.body).not.toContain("scrypt$");

    await app.close();
  });

  it("recusa barbeiro desativado com a mesma resposta", async () => {
    const app = buildApp();
    await cadastrar(app);
    await prisma.barbeiro.updateMany({ data: { ativo: false } });

    const resposta = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "gu@exemplo.com", senha: "senha-forte-123" },
    });

    // Senha certa, conta desligada: mesma resposta de credencial
    // inválida, pra não confirmar que a conta existe.
    expect(resposta.statusCode).toBe(401);
    expect(resposta.json()).toEqual({ erro: "credenciais_invalidas" });

    await app.close();
  });

  it("o hash descartável é bem formado, senão o atalho volta", async () => {
    // O hash descartável só fecha o vazamento de tempo se o
    // conferirSenha realmente derivar contra ele. Malformado, ele sairia
    // pelo atalho de validação de formato sem derivar nada — e o login
    // de email inexistente voltaria a responder mais rápido que o de
    // senha errada. Medir tempo daria teste instável; o que dá pra
    // afirmar sem instabilidade é o formato, que é o que sustenta a
    // propriedade.
    const descartavel = await obterHashDescartavel();
    const partes = descartavel.split("$");

    expect(partes).toHaveLength(3);
    expect(partes[0]).toBe("scrypt");
    expect(Buffer.from(partes[2], "base64")).toHaveLength(64);
    expect(await conferirSenha("qualquer-senha", descartavel)).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e verificar que falha**

Run: `pnpm --filter @barchop/api test tests/rotas/auth-login.test.ts`
Expected: FAIL — rota `/auth/login` responde 404.

- [ ] **Step 3: Escrever a rota**

Em `apps/api/src/rotas/auth.ts`, acrescentar os imports:

```ts
import { randomUUID } from "node:crypto";

import { conferirSenha, gerarHashSenha } from "../lib/senha";
```

E, no escopo do módulo (fora de `registrarRotasAuth`), o hash descartável:

```ts
// Hash de uma senha aleatória, no mesmo formato e tamanho de um real.
// Serve só pra dar ao login sem barbeiro o mesmo custo de derivação do
// login com barbeiro — ver o comentário na rota. Tem que ser bem
// formado: um valor malformado sairia pelo atalho do conferirSenha sem
// derivar nada, que é justamente o vazamento que ele existe pra fechar.
//
// Calculado sob demanda e guardado: derivar a cada requisição seria
// desperdício, e no topo do módulo exigiria await de nível superior,
// que o bundle CJS do tsup não tem.
let hashDescartavel: Promise<string> | null = null;

export function obterHashDescartavel(): Promise<string> {
  hashDescartavel ??= gerarHashSenha(randomUUID());
  return hashDescartavel;
}
```

E o schema mais o handler, dentro de `registrarRotasAuth`, depois da
rota de signup:

```ts
  const corpoLogin = {
    type: "object",
    required: ["email", "senha"],
    additionalProperties: false,
    properties: {
      email: { type: "string", pattern: PADRAO_EMAIL, maxLength: 160 },
      senha: { type: "string", minLength: 1, maxLength: 200 },
    },
  } as const;

  app.post(
    "/auth/login",
    { schema: { body: corpoLogin } },
    async (request, reply) => {
      const { email, senha } = request.body;

      const barbeiro = await prisma.barbeiro.findUnique({
        where: { email },
        include: { barbearia: true },
      });

      // Email inexistente e senha errada dão exatamente a mesma
      // resposta — confirmar qual dos dois falhou entregaria quais
      // emails existem na plataforma.
      //
      // Responder igual não basta: se o email não existe e a gente
      // pulasse o conferirSenha, essa resposta voltaria muito mais
      // rápido que a de senha errada, porque o scrypt é lento de
      // propósito. O relógio entregaria o que o corpo esconde. Por
      // isso o caminho sem barbeiro confere contra um hash descartável
      // — o resultado é sempre falso, mas custa o mesmo.
      // Barbeiro desativado é tratado como inexistente: mesma resposta,
      // mesmo custo. `ativo` existe no schema desde a migration inicial;
      // sem esta linha, desativar alguém no futuro não tiraria o acesso
      // dele, e a falha seria silenciosa — ninguém testa o login de uma
      // conta que acabou de ser desligada.
      const autorizado = barbeiro?.ativo ? barbeiro : null;

      const hashParaConferir =
        autorizado?.senhaHash ?? (await obterHashDescartavel());
      const senhaConfere = await conferirSenha(senha, hashParaConferir);

      if (!autorizado || !senhaConfere) {
        return reply.code(401).send({ erro: "credenciais_invalidas" });
      }

      const token = app.jwt.sign({
        barbeiroId: autorizado.id,
        barbeariaId: autorizado.barbeariaId,
      });

      return reply.code(200).send({
        token,
        barbeiro: {
          id: autorizado.id,
          nome: autorizado.nome,
          email: autorizado.email,
        },
        barbearia: {
          id: autorizado.barbearia.id,
          nome: autorizado.barbearia.nome,
          slug: autorizado.barbearia.slug,
        },
      });
    }
  );
```

- [ ] **Step 4: Rodar e verificar que passa**

Run: `pnpm --filter @barchop/api test tests/rotas/auth-login.test.ts`
Expected: PASS, 6 testes.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/rotas/auth.ts apps/api/tests/rotas/auth-login.test.ts
git commit -m "feat(api): add POST /auth/login

A missing email and a wrong password return byte-identical responses;
distinguishing them would leak which emails exist on the platform."
```

---

## Task 9: Hook de autenticação e `GET /me`

Fecha a fase: prova que o token emitido nas tasks 7 e 8 de fato protege
uma rota e carrega o escopo da barbearia.

**Files:**
- Create: `apps/api/src/rotas/me.ts`
- Modify: `apps/api/src/app.ts`
- Test: `apps/api/tests/rotas/me.test.ts`

**Interfaces:**
- Consumes: `autenticar` (Task 7), `App` (Task 4).
- Produces: `registrarRotasMe(app: App): void`. `GET /me` devolve
  `{ id, nome, email, telefone, barbeariaId }`.

- [ ] **Step 1: Escrever os testes que falham**

`apps/api/tests/rotas/me.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildApp } from "../../src/app";
import type { App } from "../../src/tipos";

const CADASTRO = {
  barbearia: { nome: "Barbearia do Gu", slug: "barbearia-do-gu" },
  barbeiro: { nome: "Gustavo", email: "gu@exemplo.com", senha: "senha-forte-123" },
};

async function cadastrarEObterToken(app: App): Promise<string> {
  const resposta = await app.inject({
    method: "POST",
    url: "/auth/signup",
    payload: CADASTRO,
  });
  return resposta.json().token;
}

describe("GET /me", () => {
  it("devolve o barbeiro do token", async () => {
    const app = buildApp();
    const token = await cadastrarEObterToken(app);

    const resposta = await app.inject({
      method: "GET",
      url: "/me",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(resposta.statusCode).toBe(200);

    const corpo = resposta.json();
    expect(corpo.nome).toBe("Gustavo");
    expect(corpo.email).toBe("gu@exemplo.com");
    expect(typeof corpo.barbeariaId).toBe("string");

    await app.close();
  });

  it("nunca devolve senhaHash", async () => {
    const app = buildApp();
    const token = await cadastrarEObterToken(app);

    const resposta = await app.inject({
      method: "GET",
      url: "/me",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(resposta.body).not.toContain("scrypt$");
    expect(resposta.json()).not.toHaveProperty("senhaHash");

    await app.close();
  });

  it("recusa requisição sem token com 401", async () => {
    const app = buildApp();
    const resposta = await app.inject({ method: "GET", url: "/me" });

    expect(resposta.statusCode).toBe(401);
    // Código de domínio, não o nome interno do @fastify/jwt.
    expect(resposta.json()).toEqual({ erro: "nao_autenticado" });

    await app.close();
  });

  it("recusa token malformado com 401", async () => {
    const app = buildApp();
    const resposta = await app.inject({
      method: "GET",
      url: "/me",
      headers: { authorization: "Bearer isso-nao-e-um-token" },
    });

    expect(resposta.statusCode).toBe(401);

    await app.close();
  });

  it("recusa token com assinatura adulterada", async () => {
    const app = buildApp();
    const token = await cadastrarEObterToken(app);

    // Um JWT é `header.payload.assinatura`. Trocar um caractere da
    // assinatura mantém a forma válida mas quebra a verificação — é o
    // que separa "token bem formado" de "token que confiamos".
    const [cabecalho, conteudo, assinatura] = token.split(".");
    const adulterado = [
      cabecalho,
      conteudo,
      assinatura.startsWith("A") ? `B${assinatura.slice(1)}` : `A${assinatura.slice(1)}`,
    ].join(".");

    const resposta = await app.inject({
      method: "GET",
      url: "/me",
      headers: { authorization: `Bearer ${adulterado}` },
    });

    expect(resposta.statusCode).toBe(401);

    await app.close();
  });
});
```

- [ ] **Step 2: Rodar e verificar que falha**

Run: `pnpm --filter @barchop/api test tests/rotas/me.test.ts`
Expected: FAIL — rota `/me` responde 404.

- [ ] **Step 3: Escrever a rota**

`apps/api/src/rotas/me.ts`:

```ts
import { prisma } from "@barchop/database";
import { autenticar } from "../plugins/auth";
import type { App } from "../tipos";

export function registrarRotasMe(app: App): void {
  app.get("/me", { onRequest: [autenticar] }, async (request) => {
    // O id vem do token, nunca da URL ou do corpo — é o que impede um
    // barbeiro de ler o perfil de outro.
    const barbeiro = await prisma.barbeiro.findUniqueOrThrow({
      where: { id: request.user.barbeiroId },
    });

    return {
      id: barbeiro.id,
      nome: barbeiro.nome,
      email: barbeiro.email,
      telefone: barbeiro.telefone,
      barbeariaId: barbeiro.barbeariaId,
    };
  });
}
```

- [ ] **Step 4: Ligar no `buildApp`**

Em `apps/api/src/app.ts`:

```ts
import { registrarRotasMe } from "./rotas/me";
```

```ts
  registrarRotasMe(app);
```

- [ ] **Step 5: Rodar e verificar que passa**

Run: `pnpm --filter @barchop/api test tests/rotas/me.test.ts`
Expected: PASS, 5 testes.

- [ ] **Step 6: Rodar a suíte inteira, o type-check e o build**

Run: `pnpm --filter @barchop/api test`
Expected: todos os arquivos passando.

Run: `pnpm type-check` (na raiz)
Expected: todas as tasks verdes.

Run: `pnpm build` (na raiz)
Expected: todas as tasks verdes.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/rotas/me.ts apps/api/src/app.ts apps/api/tests/rotas/me.test.ts
git commit -m "feat(api): add authenticated GET /me

The barber id comes from the token, never from the URL or body — that
is what keeps one barber from reading another's profile."
```

---

## Definição de pronto

A fase está completa quando:

- `pnpm --filter @barchop/api test` passa inteiro
- `pnpm --filter @barchop/scheduling test` passa inteiro
- `pnpm type-check` na raiz passa
- `pnpm build` na raiz passa
- `apps/api/.env.test` existe localmente e **não** está versionado

## O que fica pra fase 3

Cadastros do barbeiro: `PATCH /me`, `PATCH /barbearias/me`,
`GET/PUT /barbearias/me/horarios`, CRUD de `Servico` e de `Cliente`. O
foco lá é firmar o escopo por token e o `404` cruzado entre barbearias —
um barbeiro nunca enxerga recurso de outra barbearia.
