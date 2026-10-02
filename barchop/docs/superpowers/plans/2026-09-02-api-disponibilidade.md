# API — Disponibilidade (fase 5): plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar as duas rotas de leitura de disponibilidade — os horários livres de um dia e quais dias do mês têm vaga — e remover o `POST /disponibilidade` antigo, fechando a spec da API.

**Architecture:** O miolo do cálculo sai de `lib/agendamento.ts` para `lib/disponibilidade.ts` e passa a ser usado pelos três chamadores (as duas rotas novas e o `criarAgendamento`), sempre a partir da linha crua do banco — quem converte `Date` para `"HH:mm"` e quem decide que dia sem linha é dia fechado é uma função só. A rota do mês faz **duas** consultas no total, não uma por dia.

**Tech Stack:** Fastify 5.12.1, Prisma 5.22, vitest 4.1.11, PostgreSQL 18, TypeScript 5.x estrito, Node 24.13.1.

**Spec:** `docs/superpowers/specs/2026-08-30-api-crud-agendamentos-design.md`

Última fase. As quatro anteriores estão na `main`: fases 1 e 2 (PR #1,
`cb9120c`), fase 3 (PR #2, `132425e`) e fase 4 (PR #3, `dfc0555`), cada
uma com plano próprio em `docs/superpowers/plans/`.

## Global Constraints

- Node 24.13.1, pnpm 11.24.0. Monorepo pnpm + Turborepo.
- TypeScript estrito. A API builda com `tsup` (CJS, target node22), não com `tsc`.
- Comentários, mensagens de erro e documentação em português, com acentuação correta. Mensagens de commit em inglês, Conventional Commits.
- **Todo horário no contrato HTTP é string `"HH:mm"`; toda data é `"YYYY-MM-DD"`.**
- **Nenhum `Date` destinado ao banco é construído a partir de string local.** Só via `lib/horas.ts`, sempre `Date.UTC`.
- Rota pública escopa pelo `:slug`; rota protegida nunca aceita `barbeariaId`.
- **Todo `:id` e todo id de query são validados com pattern** (`PADRAO_UUID`).
- `buildApp()` roda com `ajv: { customOptions: { removeAdditional: false } }`, então campo fora do schema é 400.
- Rodar `pnpm --filter @barchop/api test` e `pnpm --filter @barchop/api type-check` antes de cada commit.

## O que a sonda já respondeu

`servicoIds` repetido na query string, como a spec pede. **Medido em
2026-09-02** contra o `buildApp()` atual, com um schema
`{ type: "array", items: { type: "string" } }`:

- `?servicoIds=aaa&servicoIds=bbb` chega como `["aaa", "bbb"]`.
- `?servicoIds=aaa`, um valor só, chega como `["aaa"]` — o `coerceTypes`
  do AJV embrulha o escalar sozinho.

Ou seja: a forma da spec funciona sem tocar na configuração do Fastify, e
o caso de um serviço só não precisa de tratamento à parte.

**Segunda sonda, mesma data:** `vi.spyOn(prisma.agendamento, "findMany")`
funciona. O delegate do Prisma é o mesmo objeto a cada acesso
(`prisma.agendamento === prisma.agendamento`), e uma chamada feita por
outra referência ao client entra na contagem do espião. É o que sustenta
o teste de "uma consulta só" da Task 3 — sem isso ele passaria sem medir
nada.

## Desvios conscientes da spec

**1. As rotas não têm noção de "agora".** `GET /disponibilidade/mes`
devolve `true` para um dia que já passou, se aquele dia da semana estava
aberto e sem agendamento. É deliberado, e a consequência tem que ser
dita: **a tela de Escolha da data é quem desabilita o passado**, do mesmo
jeito que já desabilita dia sem vaga.

O motivo: `calcularHorariosDisponiveis` (`packages/scheduling`) também
não tem relógio, e é o mesmo motor que valida a criação do agendamento.
Botar `Date.now()` numa das pontas faria a rota discordar do validador em
casos de borda (o dia vira enquanto a requisição roda), e obrigaria todo
teste destas rotas a fixar o relógio com `vi.setSystemTime` — o que troca
um teste determinístico por um que depende do dia em que roda.

Se a tela precisar disso no servidor depois, o lugar certo é um filtro
explícito (`?desde=`), não um `now()` implícito.

**2. As três leituras compartilhadas saem de `lib/agendamento.ts`.** A
spec não pede refatoração, mas as duas rotas novas repetem exatamente os
passos 1 a 4 do caminho de escrita: validar o barbeiro, carregar os
serviços e somar a duração, montar a janela do dia e chamar o motor. Sem
extrair, a regra "dia sem linha é dia fechado" passaria a existir em três
lugares e poderia divergir em dois deles sem nenhum teste reclamar.

## Pré-requisitos

Nenhum. Sem migration, sem dependência nova.

---

## Task 1: Extrair o cálculo compartilhado para `lib/disponibilidade.ts`

Refatoração pura: nenhuma rota nova, nenhum comportamento novo. Os 15
casos de `tests/lib/agendamento.test.ts` são a rede — eles têm que
continuar verdes sem alteração nenhuma.

**Files:**
- Create: `apps/api/src/lib/disponibilidade.ts`
- Modify: `apps/api/src/lib/agendamento.ts`
- Test: `apps/api/tests/lib/disponibilidade.test.ts`

**Interfaces:**
- Consumes: `calcularHorariosDisponiveis` de `@barchop/scheduling`; `dateParaHora` de `./horas`; `ErroDeNegocio` de `./erro-negocio`.
- Produces, em `src/lib/disponibilidade.ts`:
  - `type ClientePrisma = Prisma.TransactionClient` — aceita tanto o `prisma` quanto o `tx`.
  - `garantirBarbeiro(db, barbeariaId, barbeiroId): Promise<void>` — 422 `barbeiro_invalido`.
  - `carregarServicos(db, barbeariaId, servicoIds): Promise<{ servicos, duracaoTotalMinutos }>` — 422 `servico_invalido` / `servico_inativo`.
  - `horariosLivres({ janela, ocupados, duracaoTotalMinutos }): string[]` — recebe a **linha crua** do `horario_funcionamento` (ou `null`) e os agendamentos como vieram do banco.

- [ ] **Step 1: Escrever o teste da função nova**

Criar `apps/api/tests/lib/disponibilidade.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { horariosLivres } from "../../src/lib/disponibilidade";
import { horaParaDate } from "../../src/lib/horas";

function janela(abertura: string, fechamento: string) {
  return {
    horaAbertura: horaParaDate(abertura),
    horaFechamento: horaParaDate(fechamento),
    fechado: false,
  };
}

describe("horariosLivres", () => {
  it("devolve a grade inteira quando o dia está vazio", () => {
    const horarios = horariosLivres({
      janela: janela("09:00", "11:00"),
      ocupados: [],
      duracaoTotalMinutos: 60,
    });

    expect(horarios).toEqual(["09:00", "09:15", "09:30", "09:45", "10:00"]);
  });

  it("tira os horários que colidem com o que já existe", () => {
    const horarios = horariosLivres({
      janela: janela("09:00", "12:00"),
      ocupados: [
        { horaInicio: horaParaDate("10:00"), horaFim: horaParaDate("10:45") },
      ],
      duracaoTotalMinutos: 45,
    });

    expect(horarios).toContain("09:00");
    // 09:15 + 45min invadiria as 10:00.
    expect(horarios).not.toContain("09:30");
    // Borda meio-aberta: começar às 10:45 encosta e é válido.
    expect(horarios).toContain("10:45");
  });

  it("devolve vazio quando o dia está fechado", () => {
    expect(
      horariosLivres({
        janela: { horaAbertura: null, horaFechamento: null, fechado: true },
        ocupados: [],
        duracaoTotalMinutos: 30,
      })
    ).toEqual([]);
  });

  it("trata dia sem linha nenhuma como fechado", () => {
    // A regra vive aqui, e não em cada chamador: é o mesmo significado
    // que o PUT de horários grava (dia ausente vira fechado).
    expect(
      horariosLivres({
        janela: null,
        ocupados: [],
        duracaoTotalMinutos: 30,
      })
    ).toEqual([]);
  });

  it("devolve vazio quando a duração não cabe no expediente", () => {
    expect(
      horariosLivres({
        janela: janela("09:00", "09:30"),
        ocupados: [],
        duracaoTotalMinutos: 45,
      })
    ).toEqual([]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
pnpm --filter @barchop/api test tests/lib/disponibilidade.test.ts
```

Esperado: FAIL com `Cannot find module '../../src/lib/disponibilidade'`.

- [ ] **Step 3: Criar `lib/disponibilidade.ts`**

```ts
import type { Prisma } from "@barchop/database";
import { calcularHorariosDisponiveis } from "@barchop/scheduling";
import { ErroDeNegocio } from "./erro-negocio";
import { dateParaHora } from "./horas";

// Aceita tanto o `prisma` quanto o `tx` de dentro de uma transação: as
// rotas de leitura chamam direto, o criarAgendamento chama de dentro da
// transação dele.
export type ClientePrisma = Prisma.TransactionClient;

// Linha crua do horario_funcionamento, ou a ausência dela. Recebe a
// linha do banco de propósito, e não o formato já convertido: assim a
// conversão de Date pra "HH:mm" e a regra "dia sem linha é dia fechado"
// existem num lugar só, em vez de uma cópia por chamador.
export interface LinhaDeHorario {
  horaAbertura: Date | null;
  horaFechamento: Date | null;
  fechado: boolean;
}

export interface IntervaloOcupado {
  horaInicio: Date;
  horaFim: Date;
}

export function horariosLivres(params: {
  janela: LinhaDeHorario | null;
  ocupados: IntervaloOcupado[];
  duracaoTotalMinutos: number;
}): string[] {
  const { janela, ocupados, duracaoTotalMinutos } = params;

  return calcularHorariosDisponiveis({
    horarioFuncionamento: {
      horaAbertura: janela?.horaAbertura
        ? dateParaHora(janela.horaAbertura)
        : null,
      horaFechamento: janela?.horaFechamento
        ? dateParaHora(janela.horaFechamento)
        : null,
      // Dia sem linha nenhuma é dia fechado — mesma regra que o PUT de
      // horários grava.
      fechado: janela?.fechado ?? true,
    },
    agendamentosExistentes: ocupados.map((ocupado) => ({
      horaInicio: dateParaHora(ocupado.horaInicio),
      horaFim: dateParaHora(ocupado.horaFim),
    })),
    duracaoTotalMinutos,
  });
}

// O barbeiroId vem do corpo ou da query nos três chamadores — no fluxo
// público, sem token nenhum. Sem esta checagem dava pra ler (e encher) a
// agenda de um barbeiro de outra barbearia.
export async function garantirBarbeiro(
  db: ClientePrisma,
  barbeariaId: string,
  barbeiroId: string
): Promise<void> {
  const barbeiro = await db.barbeiro.findFirst({
    where: { id: barbeiroId, barbeariaId, ativo: true },
    select: { id: true },
  });

  if (!barbeiro) {
    throw new ErroDeNegocio(
      "barbeiro não encontrado nesta barbearia",
      "barbeiro_invalido"
    );
  }
}

// Serviços lidos do banco, e não do corpo: é daqui que saem preço e
// duração. Confiar no que veio na requisição deixaria o cliente escolher
// quanto paga e quanto tempo ocupa.
export async function carregarServicos(
  db: ClientePrisma,
  barbeariaId: string,
  servicoIds: string[]
) {
  // Set porque a mesma lista com id repetido só conta uma vez — o
  // findMany devolveria uma linha só e a contagem não bateria.
  const idsUnicos = [...new Set(servicoIds)];
  const servicos = await db.servico.findMany({
    where: { id: { in: idsUnicos }, barbeariaId },
  });

  if (servicos.length !== idsUnicos.length) {
    throw new ErroDeNegocio(
      "serviço não encontrado nesta barbearia",
      "servico_invalido"
    );
  }

  const inativo = servicos.find((servico) => !servico.ativo);
  if (inativo) {
    throw new ErroDeNegocio(
      `o serviço "${inativo.nome}" não está mais disponível`,
      "servico_inativo"
    );
  }

  return {
    servicos,
    duracaoTotalMinutos: servicos.reduce(
      (soma, servico) => soma + servico.duracaoMinutos,
      0
    ),
  };
}
```

- [ ] **Step 4: Fazer o `criarAgendamento` usar as três**

Em `apps/api/src/lib/agendamento.ts`, trocar os imports por:

```ts
import type { Prisma } from "@barchop/database";
import { ErroDeNegocio } from "./erro-negocio";
import { dataParaDate, horaParaDate, somarMinutos } from "./horas";
import {
  carregarServicos,
  garantirBarbeiro,
  horariosLivres,
} from "./disponibilidade";
```

(`calcularHorariosDisponiveis` e `dateParaHora` saem: quem usa os dois
agora é o `disponibilidade.ts`.)

Substituir o bloco que vai da checagem do barbeiro até o `if
(!horarios.includes(horaInicio))` por:

```ts
  await garantirBarbeiro(tx, barbeariaId, barbeiroId);

  const { servicos, duracaoTotalMinutos } = await carregarServicos(
    tx,
    barbeariaId,
    servicoIds
  );

  let horaFim: string;
  try {
    horaFim = somarMinutos(horaInicio, duracaoTotalMinutos);
  } catch {
    // somarMinutos lança quando a soma passa da meia-noite. Isso é
    // pedido inválido, não bug: 422 em vez de 500.
    throw new ErroDeNegocio(
      "os serviços escolhidos passam da meia-noite",
      "duracao_invalida"
    );
  }

  // O pattern do schema garante a forma "YYYY-MM-DD", não que a data
  // exista: "2026-02-31" passa por ele e o dataParaDate lança.
  let dataDate: Date;
  try {
    dataDate = dataParaDate(data);
  } catch {
    throw new ErroDeNegocio(`a data ${data} não existe`, "data_invalida");
  }

  // getUTCDay e não getDay: a Date foi construída em UTC por
  // dataParaDate, e o dia da semana tem que ser lido no mesmo fuso em
  // que foi escrito.
  const janela = await tx.horarioFuncionamento.findUnique({
    where: {
      barbeariaId_diaSemana: { barbeariaId, diaSemana: dataDate.getUTCDay() },
    },
  });

  // Só o que a trava do banco também considera: cancelado não ocupa
  // horário, o resto ocupa. As duas regras têm que concordar, senão o
  // cálculo oferece um horário que o banco recusa.
  const ocupados = await tx.agendamento.findMany({
    where: { barbeiroId, data: dataDate, status: { not: "cancelado" } },
    select: { horaInicio: true, horaFim: true },
  });

  // Esta checagem e a EXCLUDE constraint do banco são redundantes de
  // propósito, e as duas ficam. Esta dá a mensagem que a tela mostra e
  // cobre o que o banco não sabe — dia fechado, fora do expediente, fora
  // da grade. A do banco é a única garantia real contra dois clientes
  // confirmando ao mesmo tempo, porque entre esta leitura e o insert
  // existe uma janela.
  if (
    !horariosLivres({ janela, ocupados, duracaoTotalMinutos }).includes(
      horaInicio
    )
  ) {
    throw new ErroDeNegocio(
      "esse horário não está disponível",
      "horario_indisponivel"
    );
  }
```

O `create` no fim da função não muda, mas passa a ler
`duracaoTotalMinutos` no lugar de `duracaoTotal` — conferir que o nome
bate.

- [ ] **Step 5: Provar que nada mudou de comportamento**

```bash
pnpm --filter @barchop/api test tests/lib/agendamento.test.ts
pnpm --filter @barchop/api test tests/lib/disponibilidade.test.ts
pnpm --filter @barchop/api test
pnpm --filter @barchop/api type-check
```

Esperado: 15 casos em `agendamento.test.ts` (**sem nenhuma alteração no
arquivo de teste** — se precisou mexer, a refatoração mudou
comportamento), 5 em `disponibilidade.test.ts`, e a suíte inteira verde.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/lib/disponibilidade.ts apps/api/src/lib/agendamento.ts apps/api/tests/lib/disponibilidade.test.ts
git commit -m "refactor(api): extract the availability core from the write path"
```

---

## Task 2: `GET /barbearias/:slug/disponibilidade`

Os horários livres de um dia — a tela de Escolha do horário, no fluxo
público.

**Files:**
- Create: `apps/api/src/rotas/disponibilidade.ts`
- Modify: `apps/api/src/lib/padroes.ts` (ganha `PADRAO_MES`)
- Modify: `apps/api/src/app.ts`
- Test: `apps/api/tests/rotas/disponibilidade-dia.test.ts`
- Modify: `apps/api/README.md`

**Interfaces:**
- Consumes: `garantirBarbeiro`, `carregarServicos`, `horariosLivres` de `src/lib/disponibilidade.ts`; `dataParaDate` de `src/lib/horas.ts`; `PADRAO_DATA`, `PADRAO_UUID` de `src/lib/padroes.ts`.
- Produces: `registrarRotasDisponibilidade(app: App): void` em `src/rotas/disponibilidade.ts`; `PADRAO_MES` em `src/lib/padroes.ts`. A Task 3 acrescenta a rota do mês no mesmo arquivo.

- [ ] **Step 1: Escrever o teste que falha**

Criar `apps/api/tests/rotas/disponibilidade-dia.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildApp } from "../../src/app";
import { auth, criarBarbeariaComToken } from "../helpers/barbearia";
import type { App } from "../../src/tipos";

// Aberta de segunda a sábado, 09:00–18:00, um serviço de 45 minutos.
// 2026-09-10 é uma quinta; 2026-09-13, um domingo.
async function prepararAgenda(app: App, sufixo = "um") {
  const barbearia = await criarBarbeariaComToken(app, sufixo);

  await app.inject({
    method: "PUT",
    url: "/barbearias/me/horarios",
    headers: auth(barbearia.token),
    payload: {
      horarios: [1, 2, 3, 4, 5, 6].map((diaSemana) => ({
        diaSemana,
        horaAbertura: "09:00",
        horaFechamento: "18:00",
      })),
    },
  });

  const servico = (
    await app.inject({
      method: "POST",
      url: "/servicos",
      headers: auth(barbearia.token),
      payload: { nome: "Corte", duracaoMinutos: 45, preco: "45.00" },
    })
  ).json();

  return { ...barbearia, servico };
}

function url(
  agenda: Awaited<ReturnType<typeof prepararAgenda>>,
  extra: Record<string, string> = {}
) {
  const params = new URLSearchParams({
    barbeiroId: agenda.barbeiroId,
    data: "2026-09-10",
    ...extra,
  });
  // servicoIds vai repetido, como a spec pede.
  params.append("servicoIds", agenda.servico.id);
  return `/barbearias/${agenda.slug}/disponibilidade?${params}`;
}

describe("GET /barbearias/:slug/disponibilidade", () => {
  it("devolve a grade do dia, sem token", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    const resposta = await app.inject({ method: "GET", url: url(agenda) });

    expect(resposta.statusCode).toBe(200);

    const { horarios } = resposta.json();
    expect(horarios[0]).toBe("09:00");
    // 17:15 + 45min bate exatamente nas 18:00; 17:30 já passaria.
    expect(horarios[horarios.length - 1]).toBe("17:15");

    await app.close();
  });

  it("tira do resultado o horário já agendado", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    await app.inject({
      method: "POST",
      url: `/barbearias/${agenda.slug}/agendamentos`,
      payload: {
        barbeiroId: agenda.barbeiroId,
        servicoIds: [agenda.servico.id],
        data: "2026-09-10",
        horaInicio: "10:00",
        cliente: { nome: "João", telefone: "11999998888" },
      },
    });

    const { horarios } = (
      await app.inject({ method: "GET", url: url(agenda) })
    ).json();

    expect(horarios).not.toContain("10:00");
    // 09:30 + 45min invadiria as 10:00.
    expect(horarios).not.toContain("09:30");
    // Borda meio-aberta: 10:45 encosta no fim do anterior e vale.
    expect(horarios).toContain("10:45");

    await app.close();
  });

  it("devolve lista vazia em dia fechado", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    const resposta = await app.inject({
      method: "GET",
      url: url(agenda, { data: "2026-09-13" }),
    });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().horarios).toEqual([]);

    await app.close();
  });

  it("soma a duração de vários serviços", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    const barba = (
      await app.inject({
        method: "POST",
        url: "/servicos",
        headers: auth(agenda.token),
        payload: { nome: "Barba", duracaoMinutos: 30, preco: "30.00" },
      })
    ).json();

    const params = new URLSearchParams({
      barbeiroId: agenda.barbeiroId,
      data: "2026-09-10",
    });
    params.append("servicoIds", agenda.servico.id);
    params.append("servicoIds", barba.id);

    const { horarios } = (
      await app.inject({
        method: "GET",
        url: `/barbearias/${agenda.slug}/disponibilidade?${params}`,
      })
    ).json();

    // 75 minutos: o último começo possível é 16:45.
    expect(horarios[horarios.length - 1]).toBe("16:45");

    await app.close();
  });

  it("devolve 404 pra slug que não existe", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    const resposta = await app.inject({
      method: "GET",
      url: url(agenda).replace(agenda.slug, "nao-existe"),
    });

    expect(resposta.statusCode).toBe(404);

    await app.close();
  });

  it("devolve 422 pra barbeiro de outra barbearia", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app, "um");
    const outra = await prepararAgenda(app, "outra");

    const resposta = await app.inject({
      method: "GET",
      url: url(agenda, { barbeiroId: outra.barbeiroId }),
    });

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json().erro).toBe("barbeiro_invalido");

    await app.close();
  });

  it("devolve 422 pra serviço de outra barbearia", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app, "um");
    const outra = await prepararAgenda(app, "outra");

    const params = new URLSearchParams({
      barbeiroId: agenda.barbeiroId,
      data: "2026-09-10",
    });
    params.append("servicoIds", outra.servico.id);

    const resposta = await app.inject({
      method: "GET",
      url: `/barbearias/${agenda.slug}/disponibilidade?${params}`,
    });

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json().erro).toBe("servico_invalido");

    await app.close();
  });

  it("devolve 422 pra data que não existe no calendário", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    const resposta = await app.inject({
      method: "GET",
      url: url(agenda, { data: "2026-02-31" }),
    });

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json().erro).toBe("data_invalida");

    await app.close();
  });

  it("recusa query sem servicoIds com 400", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    const resposta = await app.inject({
      method: "GET",
      url: `/barbearias/${agenda.slug}/disponibilidade?barbeiroId=${agenda.barbeiroId}&data=2026-09-10`,
    });

    expect(resposta.statusCode).toBe(400);

    await app.close();
  });

  it("recusa barbeiroId fora do formato UUID com 400", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    const resposta = await app.inject({
      method: "GET",
      url: url(agenda, { barbeiroId: "nao-e-uuid" }),
    });

    expect(resposta.statusCode).toBe(400);

    await app.close();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
pnpm --filter @barchop/api test tests/rotas/disponibilidade-dia.test.ts
```

Esperado: FAIL — 404 na rota, que ainda não existe.

- [ ] **Step 3: Acrescentar `PADRAO_MES` aos padrões**

No final de `apps/api/src/lib/padroes.ts`:

```ts
// "YYYY-MM". O mês vai de 01 a 12 no próprio pattern — assim
// "2026-13" morre no schema, e não numa data inválida lá adiante.
export const PADRAO_MES = "^[0-9]{4}-(0[1-9]|1[0-2])$";
```

- [ ] **Step 4: Criar `src/rotas/disponibilidade.ts`**

```ts
import { prisma } from "@barchop/database";
import {
  carregarServicos,
  garantirBarbeiro,
  horariosLivres,
} from "../lib/disponibilidade";
import { ErroDeNegocio } from "../lib/erro-negocio";
import { dataParaDate } from "../lib/horas";
import { PADRAO_DATA, PADRAO_UUID } from "../lib/padroes";
import type { App } from "../tipos";

const paramsSlug = {
  type: "object",
  required: ["slug"],
  additionalProperties: false,
  properties: { slug: { type: "string", pattern: "^[a-z0-9-]{3,80}$" } },
} as const;

// `servicoIds` vem repetido na query (`?servicoIds=a&servicoIds=b`). Um
// valor só também chega como array: o coerceTypes do AJV embrulha o
// escalar sozinho — medido, ver o plano da fase 5.
const filtroDia = {
  type: "object",
  additionalProperties: false,
  required: ["barbeiroId", "data", "servicoIds"],
  properties: {
    barbeiroId: { type: "string", pattern: PADRAO_UUID },
    data: { type: "string", pattern: PADRAO_DATA },
    servicoIds: {
      type: "array",
      minItems: 1,
      maxItems: 10,
      items: { type: "string", pattern: PADRAO_UUID },
    },
  },
} as const;

// O pattern garante a forma "YYYY-MM-DD", não que a data exista:
// "2026-02-31" passa por ele e explode no dataParaDate. Sem este
// wrapper seria um RangeError não tratado, ou seja, 500 por culpa de
// quem chamou.
function dataDaQuery(valor: string): Date {
  try {
    return dataParaDate(valor);
  } catch {
    throw new ErroDeNegocio(`a data ${valor} não existe`, "data_invalida");
  }
}

// Públicas: são as telas de escolha de data e de horário, abertas pelo
// link do WhatsApp. Ficam fora do escopo protegido do app.ts.
export function registrarRotasDisponibilidade(app: App): void {
  app.get(
    "/barbearias/:slug/disponibilidade",
    { schema: { params: paramsSlug, querystring: filtroDia } },
    async (request) => {
      const { barbeiroId, data, servicoIds } = request.query;

      // findUniqueOrThrow: slug inexistente vira P2025 -> 404.
      const barbearia = await prisma.barbearia.findUniqueOrThrow({
        where: { slug: request.params.slug },
        select: { id: true },
      });

      await garantirBarbeiro(prisma, barbearia.id, barbeiroId);

      const { duracaoTotalMinutos } = await carregarServicos(
        prisma,
        barbearia.id,
        servicoIds
      );

      const dataDate = dataDaQuery(data);

      const janela = await prisma.horarioFuncionamento.findUnique({
        where: {
          barbeariaId_diaSemana: {
            barbeariaId: barbearia.id,
            diaSemana: dataDate.getUTCDay(),
          },
        },
      });

      // Mesmo filtro que a trava do banco usa: cancelado não ocupa.
      const ocupados = await prisma.agendamento.findMany({
        where: { barbeiroId, data: dataDate, status: { not: "cancelado" } },
        select: { horaInicio: true, horaFim: true },
      });

      return {
        horarios: horariosLivres({ janela, ocupados, duracaoTotalMinutos }),
      };
    }
  );
}
```

- [ ] **Step 5: Registrar fora do escopo protegido**

Em `apps/api/src/app.ts`, acrescentar o import e a chamada junto das
outras rotas abertas:

```ts
import { registrarRotasDisponibilidade } from "./rotas/disponibilidade";
```

```ts
  registrarRotasAgendamentosPublicas(app);
  registrarRotasDisponibilidade(app);
```

- [ ] **Step 6: Rodar e ver passar**

```bash
pnpm --filter @barchop/api test tests/rotas/disponibilidade-dia.test.ts
pnpm --filter @barchop/api type-check
```

Esperado: PASS, 10 casos.

- [ ] **Step 7: Atualizar o README e commitar**

Acrescentar à tabela de rotas públicas:

```markdown
| `GET` | `/barbearias/:slug/disponibilidade` | horários livres de um dia (`barbeiroId`, `data`, `servicoIds` repetido) |
```

```bash
git add apps/api/src/rotas/disponibilidade.ts apps/api/src/lib/padroes.ts apps/api/src/app.ts apps/api/tests/rotas/disponibilidade-dia.test.ts apps/api/README.md
git commit -m "feat(api): serve the free slots of a day"
```

---

## Task 3: `GET /barbearias/:slug/disponibilidade/mes`

Quais dias do mês têm pelo menos um horário livre — o calendário da tela
de Escolha da data. **Duas consultas no total**, não uma por dia.

**Files:**
- Modify: `apps/api/src/rotas/disponibilidade.ts`
- Test: `apps/api/tests/rotas/disponibilidade-mes.test.ts`
- Modify: `apps/api/README.md`

**Interfaces:**
- Consumes: as mesmas da Task 2, mais `dateParaData` de `src/lib/horas.ts` e `PADRAO_MES`.
- Produces: `GET /barbearias/:slug/disponibilidade/mes`, respondendo `{ dias: { "2026-09-01": boolean, ... } }` com uma chave por dia do mês.

- [ ] **Step 1: Escrever o teste que falha**

Criar `apps/api/tests/rotas/disponibilidade-mes.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { prisma } from "@barchop/database";
import { buildApp } from "../../src/app";
import { auth, criarBarbeariaComToken } from "../helpers/barbearia";
import type { App } from "../../src/tipos";

// Aberta de segunda a sábado, 09:00–18:00, um serviço de 45 minutos.
// Setembro de 2026 tem 30 dias; 2026-09-06 é um domingo.
async function prepararAgenda(app: App, sufixo = "um") {
  const barbearia = await criarBarbeariaComToken(app, sufixo);

  await app.inject({
    method: "PUT",
    url: "/barbearias/me/horarios",
    headers: auth(barbearia.token),
    payload: {
      horarios: [1, 2, 3, 4, 5, 6].map((diaSemana) => ({
        diaSemana,
        horaAbertura: "09:00",
        horaFechamento: "18:00",
      })),
    },
  });

  const servico = (
    await app.inject({
      method: "POST",
      url: "/servicos",
      headers: auth(barbearia.token),
      payload: { nome: "Corte", duracaoMinutos: 45, preco: "45.00" },
    })
  ).json();

  return { ...barbearia, servico };
}

function url(
  agenda: Awaited<ReturnType<typeof prepararAgenda>>,
  extra: Record<string, string> = {}
) {
  const params = new URLSearchParams({
    barbeiroId: agenda.barbeiroId,
    mes: "2026-09",
    ...extra,
  });
  params.append("servicoIds", agenda.servico.id);
  return `/barbearias/${agenda.slug}/disponibilidade/mes?${params}`;
}

// Enche um dia inteiro (09:00–18:00) com agendamentos de 45 minutos
// gravados direto no banco — o que interessa aqui é o estado, não o
// caminho de criação, que tem testes próprios na fase 4.
async function lotarDia(
  agenda: Awaited<ReturnType<typeof prepararAgenda>>,
  data: string
) {
  const cliente = await prisma.cliente.create({
    data: {
      barbeariaId: agenda.barbeariaId,
      nome: "João",
      telefone: `1198888${data.slice(-4).replace("-", "")}`,
    },
  });

  const [ano, mes, dia] = data.split("-").map(Number);

  await prisma.agendamento.createMany({
    data: Array.from({ length: 12 }, (_, i) => ({
      barbeariaId: agenda.barbeariaId,
      barbeiroId: agenda.barbeiroId,
      clienteId: cliente.id,
      data: new Date(Date.UTC(ano, mes - 1, dia)),
      horaInicio: new Date(Date.UTC(1970, 0, 1, 9 + Math.floor(i * 45 / 60), (i * 45) % 60)),
      horaFim: new Date(Date.UTC(1970, 0, 1, 9 + Math.floor((i * 45 + 45) / 60), (i * 45 + 45) % 60)),
    })),
  });
}

describe("GET /barbearias/:slug/disponibilidade/mes", () => {
  it("devolve uma chave por dia do mês, sem token", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    const resposta = await app.inject({ method: "GET", url: url(agenda) });

    expect(resposta.statusCode).toBe(200);

    const { dias } = resposta.json();
    expect(Object.keys(dias)).toHaveLength(30);
    expect(dias["2026-09-01"]).toBe(true);
    expect(dias["2026-09-30"]).toBe(true);

    await app.close();
  });

  it("marca domingo como indisponível", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    const { dias } = (
      await app.inject({ method: "GET", url: url(agenda) })
    ).json();

    // 2026-09-06 é domingo, e a barbearia só abre de segunda a sábado.
    expect(dias["2026-09-06"]).toBe(false);
    expect(dias["2026-09-07"]).toBe(true);

    await app.close();
  });

  it("marca como indisponível o dia sem vaga, sem afetar os outros", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    await lotarDia(agenda, "2026-09-10");

    const { dias } = (
      await app.inject({ method: "GET", url: url(agenda) })
    ).json();

    // Prova o agrupamento em memória: os agendamentos de um dia não
    // podem vazar pros outros.
    expect(dias["2026-09-10"]).toBe(false);
    expect(dias["2026-09-09"]).toBe(true);
    expect(dias["2026-09-11"]).toBe(true);

    await app.close();
  });

  it("agrupa por dia quando há agendamento em dias diferentes", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    await lotarDia(agenda, "2026-09-10");
    await lotarDia(agenda, "2026-09-15");

    const { dias } = (
      await app.inject({ method: "GET", url: url(agenda) })
    ).json();

    expect(dias["2026-09-10"]).toBe(false);
    expect(dias["2026-09-15"]).toBe(false);
    expect(dias["2026-09-14"]).toBe(true);

    await app.close();
  });

  it("faz uma consulta só de agendamentos pro mês inteiro", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    // O requisito da spec, e o que se perde primeiro numa refatoração
    // distraída: um findMany por dia dá 30 idas ao banco pra desenhar um
    // calendário.
    const espiao = vi.spyOn(prisma.agendamento, "findMany");

    await app.inject({ method: "GET", url: url(agenda) });

    expect(espiao).toHaveBeenCalledTimes(1);

    espiao.mockRestore();
    await app.close();
  });

  it("respeita a quantidade de dias do mês", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    const fevereiro = (
      await app.inject({ method: "GET", url: url(agenda, { mes: "2026-02" }) })
    ).json();

    expect(Object.keys(fevereiro.dias)).toHaveLength(28);
    expect(fevereiro.dias["2026-02-28"]).toBe(true);
    expect(fevereiro.dias["2026-02-29"]).toBeUndefined();

    await app.close();
  });

  it("devolve 404 pra slug que não existe", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    const resposta = await app.inject({
      method: "GET",
      url: url(agenda).replace(agenda.slug, "nao-existe"),
    });

    expect(resposta.statusCode).toBe(404);

    await app.close();
  });

  it("devolve 422 pra barbeiro de outra barbearia", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app, "um");
    const outra = await prepararAgenda(app, "outra");

    const resposta = await app.inject({
      method: "GET",
      url: url(agenda, { barbeiroId: outra.barbeiroId }),
    });

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json().erro).toBe("barbeiro_invalido");

    await app.close();
  });

  it("recusa mês fora do formato com 400", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    for (const mes of ["2026-13", "2026", "09-2026"]) {
      const resposta = await app.inject({
        method: "GET",
        url: url(agenda, { mes }),
      });

      expect(resposta.statusCode).toBe(400);
    }

    await app.close();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
pnpm --filter @barchop/api test tests/rotas/disponibilidade-mes.test.ts
```

Esperado: FAIL — 404 na rota.

- [ ] **Step 3: Acrescentar a rota do mês**

Em `apps/api/src/rotas/disponibilidade.ts`, completar os imports:

```ts
import { dataParaDate, dateParaData } from "../lib/horas";
import { PADRAO_DATA, PADRAO_MES, PADRAO_UUID } from "../lib/padroes";
```

Acrescentar o schema, ao lado do `filtroDia`:

```ts
const filtroMes = {
  type: "object",
  additionalProperties: false,
  required: ["barbeiroId", "mes", "servicoIds"],
  properties: {
    barbeiroId: { type: "string", pattern: PADRAO_UUID },
    mes: { type: "string", pattern: PADRAO_MES },
    servicoIds: {
      type: "array",
      minItems: 1,
      maxItems: 10,
      items: { type: "string", pattern: PADRAO_UUID },
    },
  },
} as const;
```

E a rota, dentro de `registrarRotasDisponibilidade`:

```ts
  app.get(
    "/barbearias/:slug/disponibilidade/mes",
    { schema: { params: paramsSlug, querystring: filtroMes } },
    async (request) => {
      const { barbeiroId, mes, servicoIds } = request.query;

      const barbearia = await prisma.barbearia.findUniqueOrThrow({
        where: { slug: request.params.slug },
        select: { id: true },
      });

      await garantirBarbeiro(prisma, barbearia.id, barbeiroId);

      const { duracaoTotalMinutos } = await carregarServicos(
        prisma,
        barbearia.id,
        servicoIds
      );

      const [ano, numeroDoMes] = mes.split("-").map(Number);
      const primeiroDia = new Date(Date.UTC(ano, numeroDoMes - 1, 1));
      // Dia 0 do mês seguinte é o último dia deste — o jeito de não
      // manter uma tabela de 28/30/31 e de acertar ano bissexto.
      const ultimoDia = new Date(Date.UTC(ano, numeroDoMes, 0));

      // Uma consulta pro mês inteiro, agrupada em memória logo abaixo.
      // Trinta consultas (uma por dia) desenhariam o mesmo calendário
      // com trinta idas ao banco.
      const agendamentos = await prisma.agendamento.findMany({
        where: {
          barbeiroId,
          data: { gte: primeiroDia, lte: ultimoDia },
          status: { not: "cancelado" },
        },
        select: { data: true, horaInicio: true, horaFim: true },
      });

      const ocupadosPorDia = new Map<
        string,
        { horaInicio: Date; horaFim: Date }[]
      >();
      for (const agendamento of agendamentos) {
        const chave = dateParaData(agendamento.data);
        const doDia = ocupadosPorDia.get(chave) ?? [];
        doDia.push({
          horaInicio: agendamento.horaInicio,
          horaFim: agendamento.horaFim,
        });
        ocupadosPorDia.set(chave, doDia);
      }

      // A segunda e última consulta: as sete linhas da semana.
      const janelas = await prisma.horarioFuncionamento.findMany({
        where: { barbeariaId: barbearia.id },
      });
      const janelaPorDiaSemana = new Map(
        janelas.map((janela) => [janela.diaSemana, janela])
      );

      const dias: Record<string, boolean> = {};
      for (let dia = 1; dia <= ultimoDia.getUTCDate(); dia += 1) {
        const data = new Date(Date.UTC(ano, numeroDoMes - 1, dia));
        const chave = dateParaData(data);

        // Um dia é `true` se tem pelo menos um horário livre. A rota não
        // sabe que dia é hoje, de propósito: ver "Desvios conscientes"
        // no plano da fase 5 — quem desabilita o passado é a tela.
        dias[chave] =
          horariosLivres({
            janela: janelaPorDiaSemana.get(data.getUTCDay()) ?? null,
            ocupados: ocupadosPorDia.get(chave) ?? [],
            duracaoTotalMinutos,
          }).length > 0;
      }

      return { dias };
    }
  );
```

- [ ] **Step 4: Rodar e ver passar**

```bash
pnpm --filter @barchop/api test tests/rotas/disponibilidade-mes.test.ts
pnpm --filter @barchop/api type-check
```

Esperado: PASS, 9 casos — inclusive o que conta as chamadas de
`prisma.agendamento.findMany` e exige exatamente **uma**.

- [ ] **Step 5: Atualizar o README e commitar**

Acrescentar à tabela de rotas públicas:

```markdown
| `GET` | `/barbearias/:slug/disponibilidade/mes` | quais dias do mês têm vaga (`barbeiroId`, `mes`, `servicoIds`) |
```

```bash
git add apps/api/src/rotas/disponibilidade.ts apps/api/tests/rotas/disponibilidade-mes.test.ts apps/api/README.md
git commit -m "feat(api): tell which days of the month have room"
```

---

## Task 4: Remover o `POST /disponibilidade`

A calculadora sem estado: o chamador tinha que mandar o horário de
funcionamento e os agendamentos existentes. Nenhuma tela tem esses dados,
e se tivesse poderia mentir. As duas rotas das Tasks 2 e 3 leem do banco
e a substituem.

**Files:**
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/tests/erros.test.ts`
- Modify: `apps/api/README.md`
- Modify: `docs/roadmap.md`

**Interfaces:**
- Consumes: nada.
- Produces: `app.ts` sem rota inline nenhuma além do `/health`.

- [ ] **Step 1: Repontar o teste que usa a rota**

`tests/erros.test.ts` tem um caso — `mantém o 400 da validação de schema
do Fastify` — que injeta em `POST /disponibilidade` com um corpo
incompleto. Ele quebra junto com a remoção, e o que ele testa (o corpo do
400 não vazar `FST_ERR_VALIDATION`) continua valendo. Trocar o corpo do
caso por:

```ts
  it("mantém o 400 da validação de schema do Fastify", async () => {
    const app = buildApp();
    const resposta = await app.inject({
      method: "POST",
      url: "/auth/login",
      // Falta a senha: o schema recusa antes de a rota rodar.
      payload: { email: "gu@exemplo.com" },
    });

    expect(resposta.statusCode).toBe(400);
    // Fixar o corpo, não só o status: o FST_ERR_VALIDATION do Fastify
    // saía no campo `erro` e nada aqui reclamava.
    expect(resposta.json().erro).toBe("requisicao_invalida");
    expect(resposta.body).not.toContain("FST_ERR");

    await app.close();
  });
```

- [ ] **Step 2: Rodar e ver o caso passar pela rota nova**

```bash
pnpm --filter @barchop/api test tests/erros.test.ts
```

Esperado: PASS — a rota antiga ainda existe neste ponto, mas o caso já
não depende dela.

- [ ] **Step 3: Apagar a rota do `app.ts`**

Em `apps/api/src/app.ts`, apagar:

- o `const disponibilidadeBodySchema = { ... } as const;` inteiro, com o
  comentário `// Exemplo do padrão "schema da rota é a validação"...`
  acima dele;
- o `app.post("/disponibilidade", ...)` inteiro;
- o import `import { calcularHorariosDisponiveis } from "@barchop/scheduling";`,
  que fica sem uso.

Depois disso o `app.ts` tem só o `/health` como rota inline; todo o resto
é registro de módulo.

- [ ] **Step 4: Provar que a rota sumiu**

Acrescentar ao final do `describe` de `tests/erros.test.ts`:

```ts
  it("não expõe mais a calculadora sem estado", async () => {
    const app = buildApp();

    // Substituída pelas rotas de disponibilidade que leem do banco: esta
    // recebia horário de funcionamento e agendamentos pelo corpo, o que
    // nenhuma tela tem — e quem tivesse poderia mentir.
    const resposta = await app.inject({
      method: "POST",
      url: "/disponibilidade",
      payload: { duracaoTotalMinutos: 45 },
    });

    expect(resposta.statusCode).toBe(404);
    expect(resposta.json()).toEqual({ erro: "nao_encontrado" });

    await app.close();
  });
```

```bash
pnpm --filter @barchop/api test
pnpm --filter @barchop/api type-check
pnpm --filter @barchop/api build
```

Esperado: tudo verde.

- [ ] **Step 5: Atualizar a documentação**

Em `apps/api/README.md`, apagar a linha
`| `POST` | `/disponibilidade` | horários livres, via `@barchop/scheduling` |`
da tabela de rotas públicas.

Em `docs/roadmap.md`, marcar as cinco fases como concluídas: trocar os
quatro bullets de fase por uma linha só dizendo que o passo 2 fechou, com
os PRs, e deixar o passo 3 (telas reais) como o próximo.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/app.ts apps/api/tests/erros.test.ts apps/api/README.md docs/roadmap.md
git commit -m "refactor(api): drop the stateless availability calculator"
```

---

## Definição de pronto

```bash
pnpm --filter @barchop/api test
pnpm --filter @barchop/api type-check
pnpm --filter @barchop/api build
```

passam limpos, e:

- [ ] As 4 tasks estão commitadas.
- [ ] `tests/lib/agendamento.test.ts` não foi alterado em nenhuma delas —
      a refatoração da Task 1 preservou o comportamento.
- [ ] A rota do mês faz exatamente uma consulta de agendamentos, provado
      pelo espião no teste.
- [ ] `grep -n "app.get\|app.post" apps/api/src/app.ts` só acha o
      `/health`.
- [ ] `apps/api/README.md` lista as duas rotas novas e não lista mais o
      `POST /disponibilidade`.

Cobertura da spec, item por item da fase 5:

| Item da spec | Task |
|---|---|
| `GET /barbearias/:slug/disponibilidade` | 2 |
| `GET /barbearias/:slug/disponibilidade/mes`, uma query pro mês | 3 |
| Remoção do `POST /disponibilidade` | 4 |
| Cálculo compartilhado com o caminho de escrita | 1 |

## O que fica pra depois da spec

Com esta fase, a superfície HTTP que as 23 telas consomem está completa.
O que a spec deixou fora, e continua fora:

- Login de cliente com senha (`Cliente.senhaHash` segue nulo).
- Remarcar agendamento — cancela e cria outro.
- Rate limiting no fluxo público, que é também o que fecharia a dívida do
  `POST /auth/signup` revelando email cadastrado (ver "Dívidas
  conhecidas" no `docs/roadmap.md`).
- Lembretes automáticos: passo seguinte do roadmap, canal ainda não
  decidido.
- Múltiplos barbeiros por barbearia, e barbearias em fusos diferentes.
