# API — Criação de agendamento (fase 4): plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar agendamento pelos dois caminhos — walk-in do barbeiro e link público do cliente — com a trava do banco como garantia final contra dois clientes pegando o mesmo horário, mais a leitura da agenda.

**Architecture:** Um serviço `criarAgendamento` em `src/lib/agendamento.ts` concentra o caminho de escrita e recebe o cliente de transação de quem chama; as duas rotas diferem só em como resolvem `barbeariaId`, `clienteId` e `origem`. Preço e duração vêm do banco, nunca do corpo. A validação por `calcularHorariosDisponiveis` (mensagem útil) e a `EXCLUDE USING gist` (garantia real) são redundantes de propósito.

**Tech Stack:** Fastify 5.12.1, @fastify/jwt 9.1.0, Prisma 5.22, vitest 4.1.11, PostgreSQL 18, TypeScript 5.x estrito, Node 24.13.1.

**Spec:** `docs/superpowers/specs/2026-08-30-api-crud-agendamentos-design.md`

Este plano cobre a **fase 4**. As fases 1 e 2 estão na `main` (PR #1,
merge `cb9120c`) e a fase 3 também (PR #2, merge `132425e`), cada uma com
plano próprio em `docs/superpowers/plans/`. A fase 5 (disponibilidade)
ganha o seu depois desta.

## Global Constraints

- Node 24.13.1, pnpm 11.24.0. Monorepo pnpm + Turborepo, `node-linker=hoisted` no `.npmrc`.
- TypeScript estrito. A API builda com `tsup` (CJS, target node22), não com `tsc`.
- Comentários, mensagens de erro e documentação em português, com acentuação correta. Mensagens de commit em inglês, Conventional Commits.
- **Todo horário no contrato HTTP é string `"HH:mm"`; toda data é `"YYYY-MM-DD"`.**
- **Nenhum `Date` destinado ao banco é construído a partir de string local.** Só via `lib/horas.ts`, sempre `Date.UTC`.
- **Rota protegida nunca aceita `barbeariaId` no corpo nem na URL** — sai de `request.user.barbeariaId`. Rota pública escopa pelo `:slug`.
- **Preço e duração de serviço nunca vêm do corpo da requisição.** São lidos do banco dentro da transação e congelados em `precoNoMomento`/`duracaoNoMomento`.
- **Todo `:id` de rota é validado com pattern de UUID no schema** (`PADRAO_UUID`, `src/lib/padroes.ts`). Sem isso um id torto vira `P2023`.
- `buildApp()` roda com `ajv: { customOptions: { removeAdditional: false } }` — é o que faz `additionalProperties: false` devolver 400 em vez de apagar o campo em silêncio.
- O AJV do Fastify tem `coerceTypes` ligado (padrão): número no lugar de string é convertido, não recusado.
- Rodar `pnpm --filter @barchop/api test` e `pnpm --filter @barchop/api type-check` antes de cada commit.

## O que a sonda já respondeu

A spec deixou em aberto, de propósito, como o Prisma 5.22 expõe o
SQLSTATE `23P01` da `sem_conflito_horario`. **Medido em 2026-09-02**,
contra o banco de teste, com dois inserts sobrepostos:

- Classe: `PrismaClientUnknownRequestError` (não `PrismaClientKnownRequestError`).
- `erro.code` e `erro.meta`: **`undefined`**. As únicas chaves próprias são `["name", "clientVersion"]`.
- O SQLSTATE aparece **só dentro de `erro.message`**, na forma
  `ConnectorError(... PostgresError { code: "23P01", message: "...", ... })`,
  junto do nome da constraint `sem_conflito_horario`.
- **A prosa da mensagem vem no idioma do servidor** — nesta máquina, em
  português: `valor-chave conflitante viola a restrição de exclusão`.
  Casar esse texto quebraria num servidor com outro locale. `23P01` e
  `sem_conflito_horario` não são traduzidos: são esses os dois pedaços
  que a detecção usa, e os dois juntos, porque uma segunda EXCLUDE
  constraint no futuro traria o mesmo código.
- A `message` carrega o caminho absoluto do arquivo que fez a query e os
  valores da chave em conflito. **Nada disso pode sair na resposta.**
- Borda `[)` confirmada na mesma sonda: `10:45–11:30` logo depois de
  `10:00–10:45` é aceito.
- **Segunda sonda, mesma data:** a constraint é parcial
  (`WHERE status <> 'cancelado'`), então reativar um cancelado é um
  `UPDATE` que faz a linha **entrar** no escopo da constraint sem mexer
  no `periodo`. O Postgres re-checa nesse caso: o `UPDATE` foi recusado
  com o mesmo `PrismaClientUnknownRequestError`, com `23P01` e
  `sem_conflito_horario` na mensagem. É o que sustenta o 409 da Task 8 —
  medido, não suposto.

## Desvios conscientes da spec

**1. `GET /agendamentos` e `GET`/`PATCH /agendamentos/:id` entram aqui.**
A spec lista as três na tabela de rotas protegidas, mas o bullet da fase
4 só nomeia a criação. Elas são rotas de agendamento e a fase 5 é só
disponibilidade — sem isto cairiam no vão entre os dois planos. São as
Tasks 7 e 8.

**2. `criarAgendamento` recebe o cliente de transação, não abre a sua.**
A spec descreve os passos "dentro de uma transação do Prisma". O fluxo
público precisa do `upsert` do cliente na **mesma** transação da criação,
senão um cliente novo ficaria cadastrado mesmo quando o agendamento é
recusado. Quem chama abre a transação e passa o `tx`.

**3. `criarAgendamento` valida o barbeiro.** A spec não lista esse passo,
mas o `barbeiroId` vem do corpo nos dois fluxos — inclusive no público,
sem token nenhum. Sem conferir que ele é da barbearia em questão e está
ativo, dava pra criar agendamento na agenda de um barbeiro de outra
barbearia.

## Pré-requisitos

Nenhum. Todas as tabelas, colunas e constraints já existem desde a
migration inicial; a fase 4 não tem migration. O banco de teste está
migrado (o `tests/global-setup.ts` roda `migrate deploy` sozinho).

---

## Task 1: Traduzir a violação da `sem_conflito_horario` em 409

Sem esta task, dois clientes pegando o mesmo horário ao mesmo tempo
produzem um **500** com o caminho do arquivo e os valores da chave em
conflito no log — e, pior, nada distingue "horário tomado" de "bug
nosso". É a primeira porque o teste dela não depende de rota nenhuma.

**Files:**
- Modify: `apps/api/src/plugins/erros.ts`
- Test: `apps/api/tests/erros.test.ts` (arquivo existente, casos novos)
- Modify: `apps/api/README.md` (tabela de erros)

**Interfaces:**
- Consumes: `Prisma` de `@barchop/database`.
- Produces: qualquer `PrismaClientUnknownRequestError` cuja mensagem contenha `23P01` **e** `sem_conflito_horario` vira `409` com `{ erro: "horario_ocupado", mensagem: "esse horário já está ocupado" }`.

- [ ] **Step 1: Escrever os testes que falham**

Acrescentar ao final do `describe` existente em
`apps/api/tests/erros.test.ts`, antes do `});` que o fecha:

```ts
  it("traduz a violação da sem_conflito_horario em 409", async () => {
    const app = buildApp();
    app.get("/teste-23p01", async () => {
      // Formato medido contra o Postgres 18 em 2026-09-02: o Prisma 5.22
      // não tipa o 23P01. Ele chega como PrismaClientUnknownRequestError
      // com `code` undefined, e o SQLSTATE só existe dentro da mensagem.
      throw new Prisma.PrismaClientUnknownRequestError(
        'Invalid `prisma.agendamento.create()` invocation in\n' +
          '/caminho/absoluto/que/nao/pode/vazar.ts:45:32\n' +
          "Error occurred during query execution:\n" +
          'ConnectorError(ConnectorError { user_facing_error: None, kind: QueryError(PostgresError ' +
          '{ code: "23P01", message: "valor-chave conflitante viola a restrição de exclusão ' +
          '\\"sem_conflito_horario\\"", severity: "ERRO", detail: Some("A chave (barbeiro_id, periodo)=' +
          '(df8c0337-982f-4fd1-8503-64c3d9a2db74, [\\"2026-09-10 10:30:00\\",\\"2026-09-10 11:15:00\\")) ' +
          'está em conflito com a chave existente."), column: None, hint: None }), transient: false })',
        { clientVersion: "5.22.0" }
      );
    });

    const resposta = await app.inject({ method: "GET", url: "/teste-23p01" });

    expect(resposta.statusCode).toBe(409);
    expect(resposta.json().erro).toBe("horario_ocupado");

    await app.close();
  });

  it("não vaza a mensagem crua do Postgres no 409 de conflito", async () => {
    const app = buildApp();
    app.get("/teste-23p01-vazamento", async () => {
      throw new Prisma.PrismaClientUnknownRequestError(
        'Invalid `prisma.agendamento.create()` invocation in\n' +
          '/caminho/absoluto/que/nao/pode/vazar.ts:45:32\n' +
          'ConnectorError(ConnectorError { kind: QueryError(PostgresError { code: "23P01", ' +
          'message: "viola a restrição de exclusão \\"sem_conflito_horario\\"" }) })',
        { clientVersion: "5.22.0" }
      );
    });

    const resposta = await app.inject({
      method: "GET",
      url: "/teste-23p01-vazamento",
    });

    // A mensagem crua traz o caminho do arquivo que fez a query e os
    // valores da chave em conflito — o id do barbeiro, a data e a hora
    // do agendamento alheio. É o oposto do que uma rota pública pode
    // devolver.
    expect(resposta.body).not.toContain("ConnectorError");
    expect(resposta.body).not.toContain("/caminho/absoluto");
    expect(resposta.body).not.toContain("23P01");

    await app.close();
  });

  it("não confunde outro erro desconhecido do Prisma com conflito", async () => {
    const app = buildApp();
    app.get("/teste-desconhecido", async () => {
      // Sem 23P01 na mensagem: continua sendo bug nosso, continua 500.
      throw new Prisma.PrismaClientUnknownRequestError(
        "Error occurred during query execution: conexão perdida",
        { clientVersion: "5.22.0" }
      );
    });

    const resposta = await app.inject({
      method: "GET",
      url: "/teste-desconhecido",
    });

    expect(resposta.statusCode).toBe(500);
    expect(resposta.json()).toEqual({ erro: "erro_interno" });

    await app.close();
  });
```

E acrescentar `Prisma` ao import de `@barchop/database` no topo do
arquivo:

```ts
import { Prisma, prisma } from "@barchop/database";
```

- [ ] **Step 2: Rodar e ver os dois primeiros falharem**

```bash
pnpm --filter @barchop/api test tests/erros.test.ts
```

Esperado: FAIL nos dois primeiros (`expected 500 to be 409`, e o corpo
contendo `ConnectorError`). O terceiro já passa — é a rede de segurança
que impede a detecção de virar ampla demais.

- [ ] **Step 3: Detectar o 23P01 no tratador**

Em `apps/api/src/plugins/erros.ts`, acrescentar logo abaixo do bloco
`if (erro instanceof Prisma.PrismaClientKnownRequestError) { ... }`:

```ts
    // A EXCLUDE USING gist `sem_conflito_horario` é a única garantia real
    // contra dois clientes confirmando o mesmo horário ao mesmo tempo — a
    // validação por calcularHorariosDisponiveis, que roda antes, tem uma
    // janela entre a leitura e a escrita.
    //
    // O Prisma 5.22 não tipa esse erro: ele chega como
    // PrismaClientUnknownRequestError com `code` e `meta` undefined, e o
    // SQLSTATE existe só dentro da mensagem (medido em 2026-09-02, ver o
    // plano da fase 4). Daí a checagem por substring.
    //
    // Os dois pedaços, e não só um: o `23P01` porque é o código do
    // Postgres e não é traduzido — a prosa da mensagem vem no idioma do
    // servidor —, e o nome da constraint porque uma EXCLUDE constraint
    // futura traria o mesmo código e viraria "horário ocupado" por
    // engano.
    if (
      erro instanceof Prisma.PrismaClientUnknownRequestError &&
      erro.message.includes("23P01") &&
      erro.message.includes("sem_conflito_horario")
    ) {
      // Mensagem nossa, nunca a do Postgres: a crua carrega o caminho do
      // arquivo que fez a query e os valores da chave em conflito, que
      // incluem a data e a hora do agendamento de outra pessoa.
      return reply
        .code(409)
        .send({ erro: "horario_ocupado", mensagem: "esse horário já está ocupado" });
    }
```

- [ ] **Step 4: Rodar e ver passar**

```bash
pnpm --filter @barchop/api test tests/erros.test.ts
pnpm --filter @barchop/api type-check
```

Esperado: PASS em tudo.

- [ ] **Step 5: Atualizar o README**

Em `apps/api/README.md`, na tabela da seção `## Erros`, acrescentar antes
da linha de 422:

```markdown
| Horário já ocupado (trava do banco) | 409 | `horario_ocupado` |
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/plugins/erros.ts apps/api/tests/erros.test.ts apps/api/README.md
git commit -m "fix(api): turn the overlap constraint into a 409"
```

---

## Task 2: Dividir o DTO de agendamento em `@barchop/types`

`NovoAgendamentoInput` carrega `barbeariaId`, `clienteId` e `origem` no
corpo. Depois da autenticação os três são forjáveis: um chamador público
mandaria `origem: "barbeiro"` e `barbeariaId` alheio. O tipo vira dois,
um por fluxo.

Verificado antes de escrever este plano: `NovoAgendamentoInput` **não tem
nenhum importador** (`grep -rn "NovoAgendamentoInput" apps packages`), então
sai do pacote em vez de virar alias depreciado.

**Files:**
- Modify: `packages/types/src/index.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `NovoAgendamentoBarbeiroInput` e `NovoAgendamentoPublicoInput` exportados de `@barchop/types`. `NovoAgendamentoInput` deixa de existir.

- [ ] **Step 1: Substituir o tipo**

Em `packages/types/src/index.ts`, trocar o bloco do
`NovoAgendamentoInput` inteiro (comentário incluído) por:

```ts
// Body de POST /agendamentos — o walk-in que o barbeiro registra. O
// `barbeariaId` sai do token e a `origem` é fixa em "barbeiro": os dois
// no corpo seriam forjáveis, e é por isso que este tipo não os tem.
// Preço e duração de cada serviço são resolvidos no backend, nunca
// confiados no que o cliente manda.
export interface NovoAgendamentoBarbeiroInput {
  barbeiroId: string;
  clienteId: string;
  servicoIds: string[];
  data: string; // "YYYY-MM-DD"
  horaInicio: string; // "HH:mm"
  observacoes?: string;
}

// Body de POST /barbearias/:slug/agendamentos — o cliente agendando pelo
// link público, sem conta. O `barbeariaId` sai do slug, a `origem` é fixa
// em "cliente", e o cliente é resolvido pelo telefone dentro daquela
// barbearia.
export interface NovoAgendamentoPublicoInput {
  barbeiroId: string;
  servicoIds: string[];
  data: string;
  horaInicio: string;
  cliente: { nome: string; telefone: string };
  observacoes?: string;
}
```

- [ ] **Step 2: Verificar que nada quebrou**

```bash
pnpm --filter @barchop/api type-check
pnpm --filter @barchop/api test
```

Esperado: PASS. Nenhum arquivo importava o tipo antigo; se o type-check
acusar algum, é código escrito depois deste plano — trocar pelo tipo
novo do fluxo correspondente.

- [ ] **Step 3: Commit**

```bash
git add packages/types/src/index.ts
git commit -m "refactor(types): split the appointment DTO by flow"
```

---

## Task 3: `lib/agendamento.ts` — o caminho de escrita

O núcleo da fase. Os dois `POST` compartilham este serviço e diferem só
em como resolvem `barbeariaId`, `clienteId` e `origem`.

**Files:**
- Create: `apps/api/src/lib/agendamento.ts`
- Test: `apps/api/tests/lib/agendamento.test.ts`

**Interfaces:**
- Consumes: `calcularHorariosDisponiveis` de `@barchop/scheduling`; `dataParaDate`, `dateParaHora`, `horaParaDate`, `somarMinutos` de `./horas`; `ErroDeNegocio` de `./erro-negocio`; `Prisma.TransactionClient`.
- Produces:
  - `criarAgendamento(tx: Prisma.TransactionClient, params: CriarAgendamentoParams): Promise<AgendamentoCriado>`
  - `interface CriarAgendamentoParams { barbeariaId, barbeiroId, clienteId, servicoIds: string[], data: string, horaInicio: string, origem: "cliente" | "barbeiro", observacoes?: string }`
  - `const INCLUDE_AGENDAMENTO` — o `include` que traz `servicos.servico.nome` e `cliente`, usado também pelas rotas de leitura.
  - Códigos de `ErroDeNegocio` (todos 422): `barbeiro_invalido`, `servico_invalido`, `servico_inativo`, `duracao_invalida`, `data_invalida`, `horario_indisponivel`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `apps/api/tests/lib/agendamento.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { prisma } from "@barchop/database";
import { criarAgendamento } from "../../src/lib/agendamento";
import { dateParaData, dateParaHora } from "../../src/lib/horas";

// Cenário mínimo: uma barbearia aberta de segunda a sábado das 09:00 às
// 18:00, um barbeiro, um cliente e um serviço de 45 minutos.
// 2026-09-10 é uma quinta-feira (diaSemana 4).
// Telefone único por cadastro. Deriva de um contador, e não do sufixo:
// `sufixo.length` colidiria entre dois sufixos do mesmo tamanho, e o
// erro só apareceria quando alguém acrescentasse um cenário novo.
let sequenciaDeTelefone = 0;
function proximoTelefone(): string {
  sequenciaDeTelefone += 1;
  return `1199999${String(sequenciaDeTelefone).padStart(4, "0")}`;
}

async function cenario(sufixo = "um") {
  const barbearia = await prisma.barbearia.create({
    // Mesma forma que o signup exige (`^[a-z0-9-]{3,80}$`) e que o
    // helper da fase 3 gera — escrever direto no banco pula a
    // validação, mas divergir da convenção só confunde depois.
    data: { nome: `Barbearia ${sufixo}`, slug: `barbearia-${sufixo}` },
  });
  const barbeiro = await prisma.barbeiro.create({
    data: {
      barbeariaId: barbearia.id,
      nome: "Barbeiro",
      email: `${sufixo}@exemplo.com`,
      senhaHash: "scrypt$x$y",
    },
  });
  const cliente = await prisma.cliente.create({
    data: {
      barbeariaId: barbearia.id,
      nome: "João",
      telefone: proximoTelefone(),
    },
  });
  const servico = await prisma.servico.create({
    data: {
      barbeariaId: barbearia.id,
      nome: "Corte",
      duracaoMinutos: 45,
      preco: "45.00",
    },
  });

  await prisma.horarioFuncionamento.createMany({
    data: [1, 2, 3, 4, 5, 6].map((diaSemana) => ({
      barbeariaId: barbearia.id,
      diaSemana,
      horaAbertura: new Date(Date.UTC(1970, 0, 1, 9, 0)),
      horaFechamento: new Date(Date.UTC(1970, 0, 1, 18, 0)),
      fechado: false,
    })),
  });

  return { barbearia, barbeiro, cliente, servico };
}

function params(c: Awaited<ReturnType<typeof cenario>>, extra = {}) {
  return {
    barbeariaId: c.barbearia.id,
    barbeiroId: c.barbeiro.id,
    clienteId: c.cliente.id,
    servicoIds: [c.servico.id],
    data: "2026-09-10",
    horaInicio: "10:00",
    origem: "barbeiro" as const,
    ...extra,
  };
}

describe("criarAgendamento", () => {
  it("cria o agendamento com hora de fim somada dos serviços", async () => {
    const c = await cenario();

    const agendamento = await prisma.$transaction((tx) =>
      criarAgendamento(tx, params(c))
    );

    expect(dateParaData(agendamento.data)).toBe("2026-09-10");
    expect(dateParaHora(agendamento.horaInicio)).toBe("10:00");
    // 45 minutos de serviço, somados a partir do banco — nunca do corpo.
    expect(dateParaHora(agendamento.horaFim)).toBe("10:45");
    expect(agendamento.status).toBe("confirmado");
    expect(agendamento.origem).toBe("barbeiro");
  });

  it("soma a duração de vários serviços", async () => {
    const c = await cenario();
    const barba = await prisma.servico.create({
      data: {
        barbeariaId: c.barbearia.id,
        nome: "Barba",
        duracaoMinutos: 30,
        preco: "30.00",
      },
    });

    const agendamento = await prisma.$transaction((tx) =>
      criarAgendamento(tx, params(c, { servicoIds: [c.servico.id, barba.id] }))
    );

    expect(dateParaHora(agendamento.horaFim)).toBe("11:15");
    expect(agendamento.servicos).toHaveLength(2);
  });

  it("congela preço e duração do momento", async () => {
    const c = await cenario();

    const agendamento = await prisma.$transaction((tx) =>
      criarAgendamento(tx, params(c))
    );

    // Preço do serviço sobe depois do agendamento feito.
    await prisma.servico.update({
      where: { id: c.servico.id },
      data: { preco: "60.00", duracaoMinutos: 60 },
    });

    const gravado = await prisma.agendamentoServico.findFirstOrThrow({
      where: { agendamentoId: agendamento.id },
    });

    // O histórico tem que continuar dizendo quanto foi cobrado no dia.
    expect(gravado.precoNoMomento.toFixed(2)).toBe("45.00");
    expect(gravado.duracaoNoMomento).toBe(45);
  });

  it("recusa serviço de outra barbearia com 422", async () => {
    const c = await cenario("um");
    const outra = await cenario("outra");

    await expect(
      prisma.$transaction((tx) =>
        criarAgendamento(tx, params(c, { servicoIds: [outra.servico.id] }))
      )
    ).rejects.toMatchObject({ status: 422, codigo: "servico_invalido" });
  });

  it("recusa serviço inativo com 422", async () => {
    const c = await cenario();
    await prisma.servico.update({
      where: { id: c.servico.id },
      data: { ativo: false },
    });

    await expect(
      prisma.$transaction((tx) => criarAgendamento(tx, params(c)))
    ).rejects.toMatchObject({ status: 422, codigo: "servico_inativo" });
  });

  it("recusa barbeiro de outra barbearia com 422", async () => {
    const c = await cenario("um");
    const outra = await cenario("outra");

    // O barbeiroId vem do corpo nos dois fluxos, e no público sem token
    // nenhum. Sem esta checagem dava pra lotar a agenda de um barbeiro
    // de outra barbearia.
    await expect(
      prisma.$transaction((tx) =>
        criarAgendamento(tx, params(c, { barbeiroId: outra.barbeiro.id }))
      )
    ).rejects.toMatchObject({ status: 422, codigo: "barbeiro_invalido" });
  });

  it("recusa barbeiro desativado com 422", async () => {
    const c = await cenario();
    await prisma.barbeiro.update({
      where: { id: c.barbeiro.id },
      data: { ativo: false },
    });

    await expect(
      prisma.$transaction((tx) => criarAgendamento(tx, params(c)))
    ).rejects.toMatchObject({ status: 422, codigo: "barbeiro_invalido" });
  });

  it("recusa dia sem horário de funcionamento com 422", async () => {
    const c = await cenario();
    // 2026-09-13 é um domingo, e o cenário só abre de segunda a sábado.
    await expect(
      prisma.$transaction((tx) =>
        criarAgendamento(tx, params(c, { data: "2026-09-13" }))
      )
    ).rejects.toMatchObject({ status: 422, codigo: "horario_indisponivel" });
  });

  it("recusa horário antes da abertura com 422", async () => {
    const c = await cenario();

    await expect(
      prisma.$transaction((tx) =>
        criarAgendamento(tx, params(c, { horaInicio: "08:00" }))
      )
    ).rejects.toMatchObject({ status: 422, codigo: "horario_indisponivel" });
  });

  it("recusa horário que não cabe antes do fechamento com 422", async () => {
    const c = await cenario();

    // 17:30 + 45min passa das 18:00.
    await expect(
      prisma.$transaction((tx) =>
        criarAgendamento(tx, params(c, { horaInicio: "17:30" }))
      )
    ).rejects.toMatchObject({ status: 422, codigo: "horario_indisponivel" });
  });

  it("recusa horário fora da grade de 15 minutos com 422", async () => {
    const c = await cenario();

    // calcularHorariosDisponiveis alinha os candidatos ao grid a partir
    // da meia-noite: 10:07 nunca está na lista.
    await expect(
      prisma.$transaction((tx) =>
        criarAgendamento(tx, params(c, { horaInicio: "10:07" }))
      )
    ).rejects.toMatchObject({ status: 422, codigo: "horario_indisponivel" });
  });

  it("recusa horário já ocupado com 422, antes de chegar no banco", async () => {
    const c = await cenario();
    await prisma.$transaction((tx) => criarAgendamento(tx, params(c)));

    // Este é o passo 4 da spec: mensagem útil. O passo 6 (a trava do
    // banco) é a garantia real, e tem teste próprio na Task 6.
    await expect(
      prisma.$transaction((tx) =>
        criarAgendamento(tx, params(c, { horaInicio: "10:30" }))
      )
    ).rejects.toMatchObject({ status: 422, codigo: "horario_indisponivel" });
  });

  it("recusa data que não existe no calendário com 422", async () => {
    const c = await cenario();

    // O pattern do schema aceita a forma; quem sabe que 31 de fevereiro
    // não existe é o dataParaDate.
    await expect(
      prisma.$transaction((tx) =>
        criarAgendamento(tx, params(c, { data: "2026-02-31" }))
      )
    ).rejects.toMatchObject({ status: 422, codigo: "data_invalida" });
  });

  it("libera o horário depois do cancelamento", async () => {
    const c = await cenario();
    const primeiro = await prisma.$transaction((tx) =>
      criarAgendamento(tx, params(c))
    );

    await prisma.agendamento.update({
      where: { id: primeiro.id },
      data: { status: "cancelado" },
    });

    // A constraint do banco é parcial (`WHERE status <> 'cancelado'`), e
    // o cálculo tem que concordar com ela.
    const segundo = await prisma.$transaction((tx) =>
      criarAgendamento(tx, params(c))
    );

    expect(dateParaHora(segundo.horaInicio)).toBe("10:00");
  });

  it("aceita o horário encostado no anterior (intervalo meio-aberto)", async () => {
    const c = await cenario();
    await prisma.$transaction((tx) => criarAgendamento(tx, params(c)));

    // 10:00–10:45 e 10:45–11:30 não colidem: o tsrange é '[)'.
    const segundo = await prisma.$transaction((tx) =>
      criarAgendamento(tx, params(c, { horaInicio: "10:45" }))
    );

    expect(dateParaHora(segundo.horaInicio)).toBe("10:45");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
pnpm --filter @barchop/api test tests/lib/agendamento.test.ts
```

Esperado: FAIL com `Cannot find module '../../src/lib/agendamento'`.

- [ ] **Step 3: Escrever `lib/agendamento.ts`**

```ts
import type { Prisma } from "@barchop/database";
import { calcularHorariosDisponiveis } from "@barchop/scheduling";
import { ErroDeNegocio } from "./erro-negocio";
import {
  dataParaDate,
  dateParaHora,
  horaParaDate,
  somarMinutos,
} from "./horas";

// O que as rotas precisam junto do agendamento: o nome de cada serviço
// (o preço vem congelado no AgendamentoServico) e o cliente, que a
// agenda do barbeiro mostra na linha.
export const INCLUDE_AGENDAMENTO = {
  servicos: { include: { servico: { select: { nome: true } } } },
  cliente: true,
} as const;

export interface CriarAgendamentoParams {
  barbeariaId: string;
  barbeiroId: string;
  clienteId: string;
  servicoIds: string[];
  data: string; // "YYYY-MM-DD"
  horaInicio: string; // "HH:mm"
  origem: "cliente" | "barbeiro";
  observacoes?: string;
}

// Recebe o `tx` em vez de abrir a própria transação: o fluxo público
// precisa do upsert do cliente na mesma transação, senão um cliente novo
// ficaria cadastrado mesmo quando o agendamento é recusado.
export async function criarAgendamento(
  tx: Prisma.TransactionClient,
  params: CriarAgendamentoParams
) {
  const {
    barbeariaId,
    barbeiroId,
    clienteId,
    servicoIds,
    data,
    horaInicio,
    origem,
    observacoes,
  } = params;

  // O barbeiroId vem do corpo nos dois fluxos — no público, sem token
  // nenhum. Sem esta checagem dava pra encher a agenda de um barbeiro de
  // outra barbearia.
  const barbeiro = await tx.barbeiro.findFirst({
    where: { id: barbeiroId, barbeariaId, ativo: true },
    select: { id: true },
  });
  if (!barbeiro) {
    throw new ErroDeNegocio(
      "barbeiro não encontrado nesta barbearia",
      "barbeiro_invalido"
    );
  }

  // Serviços lidos do banco, e não do corpo: é daqui que saem preço e
  // duração. Confiar no corpo deixaria o cliente escolher quanto paga.
  //
  // Set porque a mesma lista com id repetido só conta uma vez — o
  // findMany devolveria uma linha só e a contagem não bateria.
  const idsUnicos = [...new Set(servicoIds)];
  const servicos = await tx.servico.findMany({
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

  const duracaoTotal = servicos.reduce(
    (soma, servico) => soma + servico.duracaoMinutos,
    0
  );

  let horaFim: string;
  try {
    horaFim = somarMinutos(horaInicio, duracaoTotal);
  } catch {
    // somarMinutos lança quando a soma passa da meia-noite. Isso é
    // pedido inválido, não bug: 422 em vez de 500.
    throw new ErroDeNegocio(
      "os serviços escolhidos passam da meia-noite",
      "duracao_invalida"
    );
  }

  // O pattern do schema garante a forma "YYYY-MM-DD", não que a data
  // exista: "2026-02-31" passa por ele e o dataParaDate lança. Sem este
  // try, seria um RangeError não tratado — 500 por culpa de quem chamou.
  let dataDate: Date;
  try {
    dataDate = dataParaDate(data);
  } catch {
    throw new ErroDeNegocio(`a data ${data} não existe`, "data_invalida");
  }

  // getUTCDay e não getDay: a Date foi construída em UTC por
  // dataParaDate, e o dia da semana tem que ser lido no mesmo fuso em
  // que foi escrito.
  const diaSemana = dataDate.getUTCDay();

  const janela = await tx.horarioFuncionamento.findUnique({
    where: { barbeariaId_diaSemana: { barbeariaId, diaSemana } },
  });

  // Só o que a trava do banco também considera: cancelado não ocupa
  // horário, o resto ocupa. As duas regras têm que concordar, senão o
  // cálculo oferece um horário que o banco recusa.
  const existentes = await tx.agendamento.findMany({
    where: { barbeiroId, data: dataDate, status: { not: "cancelado" } },
    select: { horaInicio: true, horaFim: true },
  });

  const horarios = calcularHorariosDisponiveis({
    horarioFuncionamento: {
      horaAbertura: janela?.horaAbertura
        ? dateParaHora(janela.horaAbertura)
        : null,
      horaFechamento: janela?.horaFechamento
        ? dateParaHora(janela.horaFechamento)
        : null,
      // Dia sem linha nenhuma é dia fechado — mesma regra do PUT de
      // horários da fase 3.
      fechado: janela?.fechado ?? true,
    },
    agendamentosExistentes: existentes.map((agendamento) => ({
      horaInicio: dateParaHora(agendamento.horaInicio),
      horaFim: dateParaHora(agendamento.horaFim),
    })),
    duracaoTotalMinutos: duracaoTotal,
  });

  // Esta checagem e a EXCLUDE constraint do banco são redundantes de
  // propósito, e as duas ficam. Esta dá a mensagem que a tela mostra
  // ("esse horário não está disponível") e cobre o que o banco não sabe
  // — dia fechado, fora do expediente, fora da grade. A do banco é a
  // única garantia real contra dois clientes confirmando ao mesmo tempo,
  // porque entre esta leitura e o insert existe uma janela.
  if (!horarios.includes(horaInicio)) {
    throw new ErroDeNegocio(
      "esse horário não está disponível",
      "horario_indisponivel"
    );
  }

  return tx.agendamento.create({
    data: {
      barbeariaId,
      barbeiroId,
      clienteId,
      data: dataDate,
      // horaParaDate e nada de `new Date(...)`: é o que impede o fuso da
      // máquina de entrar na coluna e corromper junto o `periodo`, de
      // onde sai a trava de conflito.
      horaInicio: horaParaDate(horaInicio),
      horaFim: horaParaDate(horaFim),
      origem,
      observacoes: observacoes ?? null,
      servicos: {
        create: servicos.map((servico) => ({
          servicoId: servico.id,
          // Congelados: o histórico tem que continuar dizendo quanto foi
          // cobrado no dia, mesmo depois de o preço mudar.
          precoNoMomento: servico.preco,
          duracaoNoMomento: servico.duracaoMinutos,
        })),
      },
    },
    include: INCLUDE_AGENDAMENTO,
  });
}

export type AgendamentoCriado = Awaited<ReturnType<typeof criarAgendamento>>;
```

- [ ] **Step 4: Rodar e ver passar**

```bash
pnpm --filter @barchop/api test tests/lib/agendamento.test.ts
pnpm --filter @barchop/api type-check
```

Esperado: PASS, 15 casos.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/agendamento.ts apps/api/tests/lib/agendamento.test.ts
git commit -m "feat(api): add the appointment write path"
```

---

## Task 4: `POST /agendamentos` (walk-in do barbeiro)

**Files:**
- Create: `apps/api/src/rotas/agendamentos.ts`
- Modify: `apps/api/src/lib/padroes.ts` (ganha `PADRAO_DATA`)
- Modify: `apps/api/src/lib/serializar.ts` (ganha `serializarAgendamentoComCliente`)
- Modify: `apps/api/src/app.ts`
- Test: `apps/api/tests/rotas/agendamentos-post.test.ts`
- Modify: `apps/api/README.md`

**Interfaces:**
- Consumes: `criarAgendamento` e `INCLUDE_AGENDAMENTO` de `src/lib/agendamento.ts`; `naoEncontrado` de `src/lib/erro-http.ts`; `PADRAO_UUID`, `PADRAO_HORA` de `src/lib/padroes.ts`; helpers de teste da fase 3.
- Produces: `registrarRotasAgendamentos(app: App): void` (protegidas) em `src/rotas/agendamentos.ts`; `PADRAO_DATA` em `src/lib/padroes.ts`; `serializarAgendamentoComCliente(a): AgendamentoSerializado & { cliente: ClienteSerializado }` em `src/lib/serializar.ts`. As Tasks 5, 7 e 8 acrescentam rotas no mesmo arquivo.

- [ ] **Step 1: Escrever o teste que falha**

Criar `apps/api/tests/rotas/agendamentos-post.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { prisma } from "@barchop/database";
import { buildApp } from "../../src/app";
import { auth, criarBarbeariaComToken } from "../helpers/barbearia";
import type { App } from "../../src/tipos";

// Barbearia pronta pra agendar: aberta de segunda a sábado, 09:00–18:00,
// com um serviço de 45 minutos e um cliente cadastrado.
// 2026-09-10 é uma quinta-feira.
// Telefone único por cadastro. Deriva de um contador, e não do sufixo:
// `sufixo.length` colidiria entre dois sufixos do mesmo tamanho, e o
// erro só apareceria quando alguém acrescentasse um cenário novo.
let sequenciaDeTelefone = 0;
function proximoTelefone(): string {
  sequenciaDeTelefone += 1;
  return `1199999${String(sequenciaDeTelefone).padStart(4, "0")}`;
}

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

  const cliente = (
    await app.inject({
      method: "POST",
      url: "/clientes",
      headers: auth(barbearia.token),
      payload: { nome: "João da Silva", telefone: proximoTelefone() },
    })
  ).json();

  return { ...barbearia, servico, cliente };
}

function corpo(agenda: Awaited<ReturnType<typeof prepararAgenda>>, extra = {}) {
  return {
    barbeiroId: agenda.barbeiroId,
    clienteId: agenda.cliente.id,
    servicoIds: [agenda.servico.id],
    data: "2026-09-10",
    horaInicio: "10:00",
    ...extra,
  };
}

describe("POST /agendamentos", () => {
  it("cria o agendamento do walk-in com origem barbeiro", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    const resposta = await app.inject({
      method: "POST",
      url: "/agendamentos",
      headers: auth(agenda.token),
      payload: corpo(agenda),
    });

    expect(resposta.statusCode).toBe(201);

    const criado = resposta.json();
    expect(criado.data).toBe("2026-09-10");
    expect(criado.horaInicio).toBe("10:00");
    expect(criado.horaFim).toBe("10:45");
    expect(criado.status).toBe("confirmado");
    // Fixa em "barbeiro": o corpo não tem como pedir outra coisa.
    expect(criado.origem).toBe("barbeiro");
    expect(criado.cliente.nome).toBe("João da Silva");
    expect(criado.servicos[0]).toMatchObject({
      nome: "Corte",
      precoNoMomento: "45.00",
      duracaoNoMomento: 45,
    });

    await app.close();
  });

  it("aceita observações", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    const resposta = await app.inject({
      method: "POST",
      url: "/agendamentos",
      headers: auth(agenda.token),
      payload: corpo(agenda, { observacoes: "cliente pediu máquina 2" }),
    });

    expect(resposta.json().observacoes).toBe("cliente pediu máquina 2");

    await app.close();
  });

  it("recusa origem no corpo com 400", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    // `origem` no corpo é justamente o que a spec tira do DTO: se
    // passasse, o fluxo público mandaria origem: "barbeiro".
    const resposta = await app.inject({
      method: "POST",
      url: "/agendamentos",
      headers: auth(agenda.token),
      payload: corpo(agenda, { origem: "cliente" }),
    });

    expect(resposta.statusCode).toBe(400);

    await app.close();
  });

  it("recusa barbeariaId no corpo com 400", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    const resposta = await app.inject({
      method: "POST",
      url: "/agendamentos",
      headers: auth(agenda.token),
      payload: corpo(agenda, { barbeariaId: agenda.barbeariaId }),
    });

    expect(resposta.statusCode).toBe(400);

    await app.close();
  });

  it("recusa lista de serviços vazia com 400", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    const resposta = await app.inject({
      method: "POST",
      url: "/agendamentos",
      headers: auth(agenda.token),
      payload: corpo(agenda, { servicoIds: [] }),
    });

    expect(resposta.statusCode).toBe(400);

    await app.close();
  });

  it("recusa data fora do formato com 400", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    const resposta = await app.inject({
      method: "POST",
      url: "/agendamentos",
      headers: auth(agenda.token),
      payload: corpo(agenda, { data: "10/09/2026" }),
    });

    expect(resposta.statusCode).toBe(400);

    await app.close();
  });

  it("devolve 404 pra cliente de outra barbearia", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app, "um");
    const outra = await prepararAgenda(app, "outra");

    const resposta = await app.inject({
      method: "POST",
      url: "/agendamentos",
      headers: auth(agenda.token),
      payload: corpo(agenda, { clienteId: outra.cliente.id }),
    });

    // 404 e não 422: é a mesma resposta que GET /clientes/:id dá pro
    // cliente alheio, e não confirma que aquele id existe.
    expect(resposta.statusCode).toBe(404);
    expect(await prisma.agendamento.count()).toBe(0);

    await app.close();
  });

  it("devolve 422 pra horário fora do expediente", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    const resposta = await app.inject({
      method: "POST",
      url: "/agendamentos",
      headers: auth(agenda.token),
      payload: corpo(agenda, { horaInicio: "08:00" }),
    });

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json().erro).toBe("horario_indisponivel");

    await app.close();
  });

  it("devolve 422 pra serviço de outra barbearia", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app, "um");
    const outra = await prepararAgenda(app, "outra");

    const resposta = await app.inject({
      method: "POST",
      url: "/agendamentos",
      headers: auth(agenda.token),
      payload: corpo(agenda, { servicoIds: [outra.servico.id] }),
    });

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json().erro).toBe("servico_invalido");

    await app.close();
  });

  it("recusa requisição sem token com 401", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    const resposta = await app.inject({
      method: "POST",
      url: "/agendamentos",
      payload: corpo(agenda),
    });

    expect(resposta.statusCode).toBe(401);

    await app.close();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
pnpm --filter @barchop/api test tests/rotas/agendamentos-post.test.ts
```

Esperado: FAIL — 404 na rota, que ainda não existe.

- [ ] **Step 3: Acrescentar `PADRAO_DATA` aos padrões**

No final de `apps/api/src/lib/padroes.ts`:

```ts
// "YYYY-MM-DD". O pattern só garante a forma; se a data existe mesmo
// (31 de fevereiro, por exemplo) quem decide é o dataParaDate.
export const PADRAO_DATA = "^\\d{4}-\\d{2}-\\d{2}$";
```

- [ ] **Step 4: Acrescentar o serializador com cliente**

No final de `apps/api/src/lib/serializar.ts`:

```ts
// A agenda do barbeiro mostra o nome do cliente em cada linha, então as
// rotas de agendamento devolvem os dois juntos. Serializador separado, e
// não um campo opcional no de cima, pra o fluxo público não devolver o
// cadastro do cliente sem querer.
export function serializarAgendamentoComCliente(
  agendamento: Parameters<typeof serializarAgendamento>[0] & {
    cliente: Parameters<typeof serializarCliente>[0];
  }
): AgendamentoSerializado & { cliente: ClienteSerializado } {
  return {
    ...serializarAgendamento(agendamento),
    cliente: serializarCliente(agendamento.cliente),
  };
}
```

- [ ] **Step 5: Criar `src/rotas/agendamentos.ts`**

```ts
import { prisma } from "@barchop/database";
import { criarAgendamento } from "../lib/agendamento";
import { naoEncontrado } from "../lib/erro-http";
import { PADRAO_DATA, PADRAO_HORA, PADRAO_UUID } from "../lib/padroes";
import { serializarAgendamentoComCliente } from "../lib/serializar";
import type { App } from "../tipos";

// Sem `barbeariaId` e sem `origem`: os dois seriam forjáveis. O
// barbeariaId sai do token e a origem é fixa em "barbeiro" — é o que
// separa o walk-in do agendamento que o cliente fez sozinho, e a tela de
// Agenda distingue os dois.
const corpoNovoAgendamento = {
  type: "object",
  additionalProperties: false,
  required: ["barbeiroId", "clienteId", "servicoIds", "data", "horaInicio"],
  properties: {
    barbeiroId: { type: "string", pattern: PADRAO_UUID },
    clienteId: { type: "string", pattern: PADRAO_UUID },
    servicoIds: {
      type: "array",
      minItems: 1,
      maxItems: 10,
      items: { type: "string", pattern: PADRAO_UUID },
    },
    data: { type: "string", pattern: PADRAO_DATA },
    horaInicio: { type: "string", pattern: PADRAO_HORA },
    observacoes: { type: "string", maxLength: 500 },
  },
} as const;

export function registrarRotasAgendamentos(app: App): void {
  app.post(
    "/agendamentos",
    { schema: { body: corpoNovoAgendamento } },
    async (request, reply) => {
      const barbeariaId = request.user.barbeariaId;
      const { clienteId, ...resto } = request.body;

      const agendamento = await prisma.$transaction(async (tx) => {
        // O cliente também tem que ser desta barbearia. Mesma resposta
        // que GET /clientes/:id dá pro cliente alheio: 404, sem
        // confirmar que o id existe em algum lugar da plataforma.
        const cliente = await tx.cliente.findFirst({
          where: { id: clienteId, barbeariaId },
          select: { id: true },
        });
        if (!cliente) throw naoEncontrado("cliente não encontrado");

        return criarAgendamento(tx, {
          ...resto,
          barbeariaId,
          clienteId,
          origem: "barbeiro",
        });
      });

      return reply.code(201).send(serializarAgendamentoComCliente(agendamento));
    }
  );
}
```

- [ ] **Step 6: Registrar no escopo protegido**

Em `apps/api/src/app.ts`, acrescentar o import e a chamada dentro do
escopo protegido, depois de `registrarRotasClientes(protegidas);`:

```ts
import { registrarRotasAgendamentos } from "./rotas/agendamentos";
```

```ts
    registrarRotasClientes(protegidas);
    registrarRotasAgendamentos(protegidas);
```

- [ ] **Step 7: Rodar e ver passar**

```bash
pnpm --filter @barchop/api test tests/rotas/agendamentos-post.test.ts
pnpm --filter @barchop/api type-check
```

Esperado: PASS, 10 casos.

- [ ] **Step 8: Atualizar o README e commitar**

Acrescentar à tabela de rotas protegidas:

```markdown
| `POST` | `/agendamentos` | walk-in do barbeiro, `origem: "barbeiro"` |
```

```bash
git add apps/api/src/rotas/agendamentos.ts apps/api/src/lib/padroes.ts apps/api/src/lib/serializar.ts apps/api/src/app.ts apps/api/tests/rotas/agendamentos-post.test.ts apps/api/README.md
git commit -m "feat(api): let a barber book a walk-in"
```

---

## Task 5: `POST /barbearias/:slug/agendamentos` (fluxo público)

A última tela do fluxo do cliente — confirma e agenda, sem conta nenhuma.
O cliente é resolvido pelo telefone **dentro da barbearia**, na mesma
transação da criação.

**Files:**
- Modify: `apps/api/src/rotas/agendamentos.ts`
- Modify: `apps/api/src/app.ts`
- Test: `apps/api/tests/rotas/agendamentos-publico.test.ts`
- Modify: `apps/api/README.md`

**Interfaces:**
- Consumes: `criarAgendamento`; `serializarAgendamento` de `src/lib/serializar.ts`; `PADRAO_TELEFONE` de `src/lib/padroes.ts`.
- Produces: `registrarRotasAgendamentosPublicas(app: App): void` em `src/rotas/agendamentos.ts`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `apps/api/tests/rotas/agendamentos-publico.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { prisma } from "@barchop/database";
import { buildApp } from "../../src/app";
import { auth, criarBarbeariaComToken } from "../helpers/barbearia";
import type { App } from "../../src/tipos";

// Mesmo cenário do teste do walk-in: aberta de segunda a sábado,
// 09:00–18:00, um serviço de 45 minutos. 2026-09-10 é uma quinta.
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

function corpo(agenda: Awaited<ReturnType<typeof prepararAgenda>>, extra = {}) {
  return {
    barbeiroId: agenda.barbeiroId,
    servicoIds: [agenda.servico.id],
    data: "2026-09-10",
    horaInicio: "10:00",
    cliente: { nome: "João da Silva", telefone: "11999998888" },
    ...extra,
  };
}

describe("POST /barbearias/:slug/agendamentos", () => {
  it("cria o agendamento e o cliente, sem token", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    const resposta = await app.inject({
      method: "POST",
      url: "/barbearias/barbearia-um/agendamentos",
      payload: corpo(agenda),
    });

    expect(resposta.statusCode).toBe(201);

    const criado = resposta.json();
    expect(criado.horaInicio).toBe("10:00");
    expect(criado.horaFim).toBe("10:45");
    // Fixa em "cliente": é o que a tela de Agenda usa pra distinguir
    // quem agendou sozinho de quem o barbeiro registrou.
    expect(criado.origem).toBe("cliente");

    const cliente = await prisma.cliente.findFirstOrThrow();
    expect(cliente.nome).toBe("João da Silva");
    expect(cliente.barbeariaId).toBe(agenda.barbeariaId);

    await app.close();
  });

  it("reaproveita o cliente pelo telefone e não sobrescreve o nome", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    await app.inject({
      method: "POST",
      url: "/barbearias/barbearia-um/agendamentos",
      payload: corpo(agenda),
    });

    await app.inject({
      method: "POST",
      url: "/barbearias/barbearia-um/agendamentos",
      payload: corpo(agenda, {
        horaInicio: "11:00",
        cliente: { nome: "Jonas", telefone: "11999998888" },
      }),
    });

    // Um cadastro só: telefone repetido é o mesmo cliente, e é isso que
    // faz o barbeiro enxergar o cliente recorrente.
    expect(await prisma.cliente.count()).toBe(1);
    // E o nome cadastrado ganha do que veio no corpo: quem digita
    // "Jonas" no formulário não renomeia o cadastro que o barbeiro já
    // ajustou.
    expect((await prisma.cliente.findFirstOrThrow()).nome).toBe(
      "João da Silva"
    );

    await app.close();
  });

  it("não devolve o histórico do cliente", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    await app.inject({
      method: "POST",
      url: "/barbearias/barbearia-um/agendamentos",
      payload: corpo(agenda),
    });

    const segunda = await app.inject({
      method: "POST",
      url: "/barbearias/barbearia-um/agendamentos",
      payload: corpo(agenda, { horaInicio: "11:00" }),
    });

    // Quem sabe o telefone de alguém não pode puxar a agenda dessa
    // pessoa: a resposta é só o agendamento recém-criado.
    expect(segunda.json()).not.toHaveProperty("cliente");
    expect(segunda.json()).not.toHaveProperty("agendamentos");

    await app.close();
  });

  it("não deixa cliente cadastrado quando o agendamento é recusado", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    const resposta = await app.inject({
      method: "POST",
      url: "/barbearias/barbearia-um/agendamentos",
      payload: corpo(agenda, { horaInicio: "08:00" }),
    });

    expect(resposta.statusCode).toBe(422);
    // O upsert do cliente e a criação do agendamento estão na mesma
    // transação — é o que impede a base de encher de cliente fantasma a
    // cada tentativa recusada.
    expect(await prisma.cliente.count()).toBe(0);

    await app.close();
  });

  it("recusa origem, barbeariaId ou clienteId no corpo com 400", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    for (const extra of [
      { origem: "barbeiro" },
      { barbeariaId: agenda.barbeariaId },
      { clienteId: "11111111-1111-4111-8111-111111111111" },
    ]) {
      const resposta = await app.inject({
        method: "POST",
        url: "/barbearias/barbearia-um/agendamentos",
        payload: corpo(agenda, extra),
      });

      expect(resposta.statusCode).toBe(400);
    }

    await app.close();
  });

  it("devolve 404 pra slug que não existe", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    const resposta = await app.inject({
      method: "POST",
      url: "/barbearias/nao-existe/agendamentos",
      payload: corpo(agenda),
    });

    expect(resposta.statusCode).toBe(404);

    await app.close();
  });

  it("devolve 422 pra barbeiro de outra barbearia", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app, "um");
    const outra = await prepararAgenda(app, "outra");

    // Sem token nenhum nesta rota: o barbeiroId vem do corpo, e é o
    // criarAgendamento que confere se ele é desta barbearia.
    const resposta = await app.inject({
      method: "POST",
      url: "/barbearias/barbearia-um/agendamentos",
      payload: corpo(agenda, { barbeiroId: outra.barbeiroId }),
    });

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json().erro).toBe("barbeiro_invalido");
    expect(await prisma.agendamento.count()).toBe(0);

    await app.close();
  });

  it("recusa telefone fora do formato com 400", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    const resposta = await app.inject({
      method: "POST",
      url: "/barbearias/barbearia-um/agendamentos",
      payload: corpo(agenda, {
        cliente: { nome: "João", telefone: "telefone" },
      }),
    });

    expect(resposta.statusCode).toBe(400);

    await app.close();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
pnpm --filter @barchop/api test tests/rotas/agendamentos-publico.test.ts
```

Esperado: FAIL — 404 na rota.

- [ ] **Step 3: Acrescentar a rota pública**

Em `apps/api/src/rotas/agendamentos.ts`, completar os imports:

```ts
import {
  PADRAO_DATA,
  PADRAO_HORA,
  PADRAO_TELEFONE,
  PADRAO_UUID,
} from "../lib/padroes";
import {
  serializarAgendamento,
  serializarAgendamentoComCliente,
} from "../lib/serializar";
```

Acrescentar os schemas, ao lado do que já existe:

```ts
const paramsSlug = {
  type: "object",
  required: ["slug"],
  additionalProperties: false,
  properties: { slug: { type: "string", pattern: "^[a-z0-9-]{3,80}$" } },
} as const;

// Sem `clienteId`: quem agenda pelo link não tem conta nem sabe o id de
// ninguém. Manda nome e telefone, e o telefone é o que casa com um
// cadastro existente daquela barbearia.
const corpoNovoAgendamentoPublico = {
  type: "object",
  additionalProperties: false,
  required: ["barbeiroId", "servicoIds", "data", "horaInicio", "cliente"],
  properties: {
    barbeiroId: { type: "string", pattern: PADRAO_UUID },
    servicoIds: {
      type: "array",
      minItems: 1,
      maxItems: 10,
      items: { type: "string", pattern: PADRAO_UUID },
    },
    data: { type: "string", pattern: PADRAO_DATA },
    horaInicio: { type: "string", pattern: PADRAO_HORA },
    cliente: {
      type: "object",
      additionalProperties: false,
      required: ["nome", "telefone"],
      properties: {
        nome: { type: "string", minLength: 2, maxLength: 120 },
        telefone: { type: "string", pattern: PADRAO_TELEFONE, maxLength: 20 },
      },
    },
    observacoes: { type: "string", maxLength: 500 },
  },
} as const;
```

E, no fim do arquivo, a função de registro:

```ts
// Pública: é a tela "Confirma e agenda", aberta pelo link do WhatsApp.
// Fica fora do escopo protegido do app.ts.
export function registrarRotasAgendamentosPublicas(app: App): void {
  app.post(
    "/barbearias/:slug/agendamentos",
    { schema: { params: paramsSlug, body: corpoNovoAgendamentoPublico } },
    async (request, reply) => {
      const { cliente: dadosCliente, ...resto } = request.body;

      const agendamento = await prisma.$transaction(async (tx) => {
        // findUniqueOrThrow: slug inexistente vira P2025 -> 404.
        const barbearia = await tx.barbearia.findUniqueOrThrow({
          where: { slug: request.params.slug },
          select: { id: true },
        });

        // Telefone já cadastrado nesta barbearia reaproveita o registro
        // — é o que faz o barbeiro reconhecer o cliente recorrente.
        //
        // `update: {}` vazio de propósito: nome divergente NÃO
        // sobrescreve o cadastrado. Quem digita o nome abreviado no
        // celular não renomeia o cadastro que o barbeiro ajustou.
        const cliente = await tx.cliente.upsert({
          where: {
            barbeariaId_telefone: {
              barbeariaId: barbearia.id,
              telefone: dadosCliente.telefone,
            },
          },
          create: {
            barbeariaId: barbearia.id,
            nome: dadosCliente.nome,
            telefone: dadosCliente.telefone,
          },
          update: {},
        });

        // Mesma transação do upsert: agendamento recusado desfaz o
        // cliente recém-criado junto, senão cada tentativa inválida
        // deixaria um cadastro fantasma.
        return criarAgendamento(tx, {
          ...resto,
          barbeariaId: barbearia.id,
          clienteId: cliente.id,
          origem: "cliente",
        });
      });

      // Só o agendamento recém-criado, sem o cliente e sem histórico:
      // quem sabe o telefone de alguém não pode puxar a agenda dessa
      // pessoa por aqui.
      return reply.code(201).send(serializarAgendamento(agendamento));
    }
  );
}
```

- [ ] **Step 4: Registrar fora do escopo protegido**

Em `apps/api/src/app.ts`, trocar o import por

```ts
import {
  registrarRotasAgendamentos,
  registrarRotasAgendamentosPublicas,
} from "./rotas/agendamentos";
```

e chamar a pública junto das outras abertas:

```ts
  registrarRotasServicosPublicas(app);
  registrarRotasAgendamentosPublicas(app);
```

- [ ] **Step 5: Rodar e ver passar**

```bash
pnpm --filter @barchop/api test tests/rotas/agendamentos-publico.test.ts
pnpm --filter @barchop/api type-check
```

Esperado: PASS, 8 casos.

- [ ] **Step 6: Atualizar o README e commitar**

Acrescentar à tabela de rotas públicas:

```markdown
| `POST` | `/barbearias/:slug/agendamentos` | agendamento pelo link público, `origem: "cliente"` |
```

```bash
git add apps/api/src/rotas/agendamentos.ts apps/api/src/app.ts apps/api/tests/rotas/agendamentos-publico.test.ts apps/api/README.md
git commit -m "feat(api): let a client book from the public link"
```

---

## Task 6: Os testes que justificam o banco real

> **Corrigido na execução (2026-09-02).** A corrida por HTTP **não**
> alcança a trava do banco de forma confiável: contra um Postgres local,
> o segundo pedido lê depois de o primeiro commitar e para no 422 da
> checagem de disponibilidade. Medido — o `Promise.all` das duas rotas
> deu `[201, 422]`, nunca `[201, 409]`.
>
> Uma sonda no nível do banco (duas transações interativas inserindo o
> mesmo horário, sem passar pela checagem) deu `23P01` em uma e sucesso
> na outra, com total de 1 linha. Então o teste virou dois:
>
> - **por HTTP**, o invariante determinístico: exatamente um `201`, exatamente
>   um agendamento no banco, e o perdedor com `409` ou `422` — as duas
>   respostas são corretas, e qual delas sai depende de quem leu antes de
>   quem commitou;
> - **no banco**, a trava sob concorrência real, checando que a mensagem
>   do erro traz `23P01` e `sem_conflito_horario` — os dois pedaos que o
>   tratador da Task 1 usa. Se o Prisma mudar o formato, esse teste avisa.
>
> Um teste de corrida verde que nunca correu seria pior que nenhum.


Os cinco casos da seção "Testes" da spec. **Um deles a spec descreve
errado**, e o plano corrige: a spec diz que "um segundo pedido
sobrepondo devolve 409", mas o passo 4 do próprio caminho de escrita
(`calcularHorariosDisponiveis`) pega a sobreposição antes de chegar no
banco e devolve **422**, com mensagem útil. O `409` da trava só aparece
quando essa checagem não tem como pegar — ou seja, na corrida. Os dois
casos entram, cada um com o código que a implementação realmente produz.

**Files:**
- Test: `apps/api/tests/rotas/agendamentos-conflito.test.ts`

**Interfaces:**
- Consumes: as duas rotas de criação, `prisma.$queryRaw`.
- Produces: nada de código de produção — é a task que prova que as anteriores estão certas.

- [ ] **Step 1: Escrever os cinco casos**

Criar `apps/api/tests/rotas/agendamentos-conflito.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { prisma } from "@barchop/database";
import { buildApp } from "../../src/app";
import { auth, criarBarbeariaComToken } from "../helpers/barbearia";
import type { App } from "../../src/tipos";

async function prepararAgenda(app: App) {
  const barbearia = await criarBarbeariaComToken(app, "um");

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

function corpoPublico(
  agenda: Awaited<ReturnType<typeof prepararAgenda>>,
  extra = {}
) {
  return {
    barbeiroId: agenda.barbeiroId,
    servicoIds: [agenda.servico.id],
    data: "2026-09-10",
    horaInicio: "10:00",
    cliente: { nome: "João", telefone: "11999998888" },
    ...extra,
  };
}

const URL_PUBLICA = "/barbearias/barbearia-um/agendamentos";

describe("conflito de horário", () => {
  it("recusa sobreposição com 422 pelo caminho normal", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    await app.inject({ method: "POST", url: URL_PUBLICA, payload: corpoPublico(agenda) });

    const sobreposto = await app.inject({
      method: "POST",
      url: URL_PUBLICA,
      payload: corpoPublico(agenda, {
        horaInicio: "10:30",
        cliente: { nome: "Maria", telefone: "11922222222" },
      }),
    });

    // 422 e não 409: a checagem por calcularHorariosDisponiveis pega
    // antes de chegar no banco, e é ela que dá a mensagem que a tela
    // mostra. A trava do banco é a rede embaixo — ver o teste da
    // corrida.
    expect(sobreposto.statusCode).toBe(422);
    expect(sobreposto.json().erro).toBe("horario_indisponivel");
    expect(await prisma.agendamento.count()).toBe(1);

    await app.close();
  });

  it("aceita o horário encostado, porque o intervalo é meio-aberto", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    await app.inject({ method: "POST", url: URL_PUBLICA, payload: corpoPublico(agenda) });

    // 10:00–10:45 e 10:45–11:30: o tsrange da coluna `periodo` é '[)',
    // então o fim de um e o começo do outro não colidem.
    const encostado = await app.inject({
      method: "POST",
      url: URL_PUBLICA,
      payload: corpoPublico(agenda, {
        horaInicio: "10:45",
        cliente: { nome: "Maria", telefone: "11922222222" },
      }),
    });

    expect(encostado.statusCode).toBe(201);
    expect(await prisma.agendamento.count()).toBe(2);

    await app.close();
  });

  it("libera o horário quando o agendamento é cancelado", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    const primeiro = await app.inject({
      method: "POST",
      url: URL_PUBLICA,
      payload: corpoPublico(agenda),
    });

    // Cancelado direto no banco: a rota PATCH tem teste próprio na Task
    // 8, e aqui o que importa é o estado, não o caminho.
    await prisma.agendamento.update({
      where: { id: primeiro.json().id },
      data: { status: "cancelado" },
    });

    const segundo = await app.inject({
      method: "POST",
      url: URL_PUBLICA,
      payload: corpoPublico(agenda),
    });

    // A constraint é parcial (`WHERE status <> 'cancelado'`) e o cálculo
    // ignora cancelados: as duas regras concordam.
    expect(segundo.statusCode).toBe(201);

    await app.close();
  });

  it("na corrida, exatamente um 201 e um 409", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    // Os dois pedidos entram antes de qualquer um commitar, então os
    // dois passam pela checagem de disponibilidade. O que separa um do
    // outro é a EXCLUDE USING gist: o segundo INSERT espera o primeiro
    // commitar e então viola a constraint.
    //
    // `fileParallelism: false` no vitest.config.mts serializa ARQUIVOS,
    // não promessas dentro de um caso — este Promise.all corre de
    // verdade.
    const [uma, outra] = await Promise.all([
      app.inject({
        method: "POST",
        url: URL_PUBLICA,
        payload: corpoPublico(agenda, {
          cliente: { nome: "João", telefone: "11911111111" },
        }),
      }),
      app.inject({
        method: "POST",
        url: URL_PUBLICA,
        payload: corpoPublico(agenda, {
          cliente: { nome: "Maria", telefone: "11922222222" },
        }),
      }),
    ]);

    const status = [uma.statusCode, outra.statusCode].sort();
    expect(status).toEqual([201, 409]);

    const recusada = uma.statusCode === 409 ? uma : outra;
    expect(recusada.json().erro).toBe("horario_ocupado");
    // A mensagem crua do Postgres traz caminho de arquivo e os valores
    // da chave em conflito — inclusive o horário alheio.
    expect(recusada.body).not.toContain("23P01");
    expect(recusada.body).not.toContain("ConnectorError");

    expect(await prisma.agendamento.count()).toBe(1);

    await app.close();
  });

  it("grava a hora no fuso certo nas colunas do agendamento", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    const criado = await app.inject({
      method: "POST",
      url: URL_PUBLICA,
      payload: corpoPublico(agenda),
    });

    // A coluna `periodo` é gerada de `data + hora_inicio`. Um erro de
    // fuso aqui corromperia a trava de conflito junto, em silêncio: o
    // banco travaria 13:00 enquanto a API mostra 10:00.
    const linhas = await prisma.$queryRaw<
      { dia: string; inicio: string; fim: string; periodo: string }[]
    >`
      SELECT to_char(data, 'YYYY-MM-DD') AS dia,
             to_char(hora_inicio, 'HH24:MI') AS inicio,
             to_char(hora_fim, 'HH24:MI') AS fim,
             periodo::text AS periodo
      FROM agendamento
      WHERE id = ${criado.json().id}::uuid
    `;

    expect(linhas[0].dia).toBe("2026-09-10");
    expect(linhas[0].inicio).toBe("10:00");
    expect(linhas[0].fim).toBe("10:45");
    expect(linhas[0].periodo).toContain("2026-09-10 10:00:00");

    await app.close();
  });
});
```

- [ ] **Step 2: Rodar**

```bash
pnpm --filter @barchop/api test tests/rotas/agendamentos-conflito.test.ts
```

Esperado: PASS, 5 casos — as Tasks 1 a 5 já implementaram tudo que eles
exercitam. Se **a corrida falhar com dois 201**, a trava do banco não
está valendo: conferir com

```bash
pnpm --filter @barchop/api test tests/banco.test.ts
```

que a `sem_conflito_horario` existe no banco de teste. Se ela existe e
ainda assim passam dois, **parar e investigar** — um teste de corrida
verde que não correu é pior que nenhum.

Se a corrida falhar com **dois 409 ou um 500**, a tradução da Task 1 não
está pegando o formato real: reler a mensagem do erro (`request.log`) e
comparar com a seção "O que a sonda já respondeu".

- [ ] **Step 3: Commit**

```bash
git add apps/api/tests/rotas/agendamentos-conflito.test.ts
git commit -m "test(api): prove the overlap constraint under a real race"
```

---

## Task 7: `GET /agendamentos`

A tela de Agenda: um dia, ou um intervalo. Exige **exatamente uma** das
duas formas.

**Files:**
- Modify: `apps/api/src/rotas/agendamentos.ts`
- Test: `apps/api/tests/rotas/agendamentos-lista.test.ts`
- Modify: `apps/api/README.md`

**Interfaces:**
- Consumes: `INCLUDE_AGENDAMENTO` de `src/lib/agendamento.ts`; `dataParaDate` de `src/lib/horas.ts`; `ErroHttp` de `src/lib/erro-http.ts`; `ErroDeNegocio`.
- Produces: `GET /agendamentos`, respondendo `{ agendamentos: [...] }` com o cliente embutido em cada linha.

- [ ] **Step 1: Escrever o teste que falha**

Criar `apps/api/tests/rotas/agendamentos-lista.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildApp } from "../../src/app";
import { auth, criarBarbeariaComToken } from "../helpers/barbearia";
import type { App } from "../../src/tipos";

// 2026-09-10 é quinta, 2026-09-11 é sexta.
// Telefone único por cadastro. Deriva de um contador, e não do sufixo:
// `sufixo.length` colidiria entre dois sufixos do mesmo tamanho, e o
// erro só apareceria quando alguém acrescentasse um cenário novo.
let sequenciaDeTelefone = 0;
function proximoTelefone(): string {
  sequenciaDeTelefone += 1;
  return `1199999${String(sequenciaDeTelefone).padStart(4, "0")}`;
}

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

  const cliente = (
    await app.inject({
      method: "POST",
      url: "/clientes",
      headers: auth(barbearia.token),
      payload: { nome: "João da Silva", telefone: proximoTelefone() },
    })
  ).json();

  return { ...barbearia, servico, cliente };
}

async function agendar(
  app: App,
  agenda: Awaited<ReturnType<typeof prepararAgenda>>,
  data: string,
  horaInicio: string
) {
  return app.inject({
    method: "POST",
    url: "/agendamentos",
    headers: auth(agenda.token),
    payload: {
      barbeiroId: agenda.barbeiroId,
      clienteId: agenda.cliente.id,
      servicoIds: [agenda.servico.id],
      data,
      horaInicio,
    },
  });
}

describe("GET /agendamentos", () => {
  it("lista o dia pedido, em ordem de hora", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    await agendar(app, agenda, "2026-09-10", "14:00");
    await agendar(app, agenda, "2026-09-10", "10:00");
    await agendar(app, agenda, "2026-09-11", "10:00");

    const resposta = await app.inject({
      method: "GET",
      url: "/agendamentos?data=2026-09-10",
      headers: auth(agenda.token),
    });

    expect(resposta.statusCode).toBe(200);

    const { agendamentos } = resposta.json();
    expect(agendamentos).toHaveLength(2);
    // A tela desenha o dia de cima pra baixo e não deveria ter que
    // ordenar.
    expect(agendamentos.map((a: { horaInicio: string }) => a.horaInicio)).toEqual([
      "10:00",
      "14:00",
    ]);
    // O nome do cliente aparece em cada linha da agenda.
    expect(agendamentos[0].cliente.nome).toBe("João da Silva");

    await app.close();
  });

  it("lista o intervalo fechado nas duas pontas", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    await agendar(app, agenda, "2026-09-10", "10:00");
    await agendar(app, agenda, "2026-09-11", "10:00");
    await agendar(app, agenda, "2026-09-12", "10:00");

    const resposta = await app.inject({
      method: "GET",
      url: "/agendamentos?de=2026-09-10&ate=2026-09-11",
      headers: auth(agenda.token),
    });

    expect(resposta.json().agendamentos).toHaveLength(2);

    await app.close();
  });

  it("recusa as duas formas juntas com 400", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    const resposta = await app.inject({
      method: "GET",
      url: "/agendamentos?data=2026-09-10&de=2026-09-10&ate=2026-09-11",
      headers: auth(agenda.token),
    });

    expect(resposta.statusCode).toBe(400);

    await app.close();
  });

  it("recusa nenhuma das duas formas com 400", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    // Sem filtro, a resposta seria a base inteira — e a tela não tem
    // como paginar isso.
    const resposta = await app.inject({
      method: "GET",
      url: "/agendamentos",
      headers: auth(agenda.token),
    });

    expect(resposta.statusCode).toBe(400);

    await app.close();
  });

  it("recusa intervalo pela metade com 400", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    const resposta = await app.inject({
      method: "GET",
      url: "/agendamentos?de=2026-09-10",
      headers: auth(agenda.token),
    });

    expect(resposta.statusCode).toBe(400);

    await app.close();
  });

  it("recusa intervalo maior que 92 dias com 422", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    const resposta = await app.inject({
      method: "GET",
      url: "/agendamentos?de=2026-01-01&ate=2026-12-31",
      headers: auth(agenda.token),
    });

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json().erro).toBe("intervalo_longo_demais");

    await app.close();
  });

  it("recusa intervalo invertido com 422", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    const resposta = await app.inject({
      method: "GET",
      url: "/agendamentos?de=2026-09-11&ate=2026-09-10",
      headers: auth(agenda.token),
    });

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json().erro).toBe("intervalo_invalido");

    await app.close();
  });

  it("recusa data que não existe no calendário com 422", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    // O pattern do schema aceita a forma; quem sabe que 31 de fevereiro
    // não existe é o dataParaDate.
    const resposta = await app.inject({
      method: "GET",
      url: "/agendamentos?data=2026-02-31",
      headers: auth(agenda.token),
    });

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json().erro).toBe("data_invalida");

    await app.close();
  });

  it("não enxerga agendamento de outra barbearia", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app, "um");
    const outra = await prepararAgenda(app, "outra");

    await agendar(app, outra, "2026-09-10", "10:00");

    const resposta = await app.inject({
      method: "GET",
      url: "/agendamentos?data=2026-09-10",
      headers: auth(agenda.token),
    });

    expect(resposta.json().agendamentos).toEqual([]);

    await app.close();
  });

  it("recusa requisição sem token com 401", async () => {
    const app = buildApp();

    const resposta = await app.inject({
      method: "GET",
      url: "/agendamentos?data=2026-09-10",
    });

    expect(resposta.statusCode).toBe(401);

    await app.close();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
pnpm --filter @barchop/api test tests/rotas/agendamentos-lista.test.ts
```

Esperado: FAIL — 404 na rota.

- [ ] **Step 3: Acrescentar a rota**

Em `apps/api/src/rotas/agendamentos.ts`, completar os imports:

```ts
import { criarAgendamento, INCLUDE_AGENDAMENTO } from "../lib/agendamento";
import { ErroDeNegocio } from "../lib/erro-negocio";
import { ErroHttp, naoEncontrado } from "../lib/erro-http";
import { dataParaDate } from "../lib/horas";
```

Acrescentar o schema e o helper de data, ao lado dos outros:

```ts
const filtroAgendamentos = {
  type: "object",
  additionalProperties: false,
  properties: {
    data: { type: "string", pattern: PADRAO_DATA },
    de: { type: "string", pattern: PADRAO_DATA },
    ate: { type: "string", pattern: PADRAO_DATA },
  },
} as const;

// Um dia em milissegundos — o intervalo é fechado nas duas pontas, daí
// o `+ 1` na contagem.
const UM_DIA = 24 * 60 * 60 * 1000;
const MAXIMO_DE_DIAS = 92;

// O pattern do schema garante a forma "YYYY-MM-DD", não que a data
// exista: "2026-02-31" passa por ele e explode no dataParaDate. Sem este
// wrapper isso seria um RangeError não tratado, ou seja, um 500 por
// culpa de quem chamou.
function dataDoFiltro(valor: string): Date {
  try {
    return dataParaDate(valor);
  } catch {
    throw new ErroDeNegocio(`a data ${valor} não existe`, "data_invalida");
  }
}
```

E, dentro de `registrarRotasAgendamentos`, depois do `POST`:

```ts
  app.get(
    "/agendamentos",
    { schema: { querystring: filtroAgendamentos } },
    async (request) => {
      const { data, de, ate } = request.query;

      const temDia = data !== undefined;
      const temIntervalo = de !== undefined || ate !== undefined;

      // Exatamente uma das duas formas. As duas juntas seriam ambíguas;
      // nenhuma devolveria a base inteira, e a tela não pagina isso.
      if (temDia === temIntervalo) {
        throw new ErroHttp(
          400,
          "requisicao_invalida",
          "informe ou `data`, ou o par `de` e `ate`"
        );
      }

      if (temIntervalo && (de === undefined || ate === undefined)) {
        throw new ErroHttp(
          400,
          "requisicao_invalida",
          "o intervalo precisa de `de` e `ate`"
        );
      }

      const inicio = dataDoFiltro(temDia ? data : de!);
      const fim = dataDoFiltro(temDia ? data : ate!);

      if (fim.getTime() < inicio.getTime()) {
        throw new ErroDeNegocio(
          "`ate` não pode ser antes de `de`",
          "intervalo_invalido"
        );
      }

      // Teto de 92 dias: a agenda é uma tela de dia ou de trimestre, e
      // sem limite um `de=2020&ate=2030` puxaria a base inteira.
      const dias = (fim.getTime() - inicio.getTime()) / UM_DIA + 1;
      if (dias > MAXIMO_DE_DIAS) {
        throw new ErroDeNegocio(
          `o intervalo não pode passar de ${MAXIMO_DE_DIAS} dias`,
          "intervalo_longo_demais"
        );
      }

      const agendamentos = await prisma.agendamento.findMany({
        // Sempre o barbeariaId do token.
        where: { barbeariaId: request.user.barbeariaId, data: { gte: inicio, lte: fim } },
        orderBy: [{ data: "asc" }, { horaInicio: "asc" }],
        include: INCLUDE_AGENDAMENTO,
      });

      return {
        agendamentos: agendamentos.map(serializarAgendamentoComCliente),
      };
    }
  );
```

- [ ] **Step 4: Rodar e ver passar**

```bash
pnpm --filter @barchop/api test tests/rotas/agendamentos-lista.test.ts
pnpm --filter @barchop/api type-check
```

Esperado: PASS, 10 casos.

- [ ] **Step 5: Atualizar o README e commitar**

Acrescentar às rotas protegidas:

```markdown
| `GET` | `/agendamentos` | `?data=` (um dia) ou `?de=&ate=` (até 92 dias) |
```

```bash
git add apps/api/src/rotas/agendamentos.ts apps/api/tests/rotas/agendamentos-lista.test.ts apps/api/README.md
git commit -m "feat(api): read the agenda by day or by range"
```

---

## Task 8: `GET` e `PATCH /agendamentos/:id`

O detalhe do agendamento e a mudança de status — concluir, cancelar,
marcar no-show. **Sem máquina de estados**: o barbeiro é a autoridade
sobre o próprio dia. A única transição que o sistema recusa vem do banco:
reativar um cancelado cujo horário já foi tomado.

**Files:**
- Modify: `apps/api/src/rotas/agendamentos.ts`
- Test: `apps/api/tests/rotas/agendamentos-id.test.ts`
- Modify: `apps/api/README.md`

**Interfaces:**
- Consumes: `PADRAO_UUID`; `INCLUDE_AGENDAMENTO`; `serializarAgendamentoComCliente`.
- Produces: `GET /agendamentos/:id` e `PATCH /agendamentos/:id`, os dois 200 com o agendamento serializado.

- [ ] **Step 1: Escrever o teste que falha**

Criar `apps/api/tests/rotas/agendamentos-id.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { prisma } from "@barchop/database";
import { buildApp } from "../../src/app";
import { auth, criarBarbeariaComToken } from "../helpers/barbearia";
import type { App } from "../../src/tipos";

// Telefone único por cadastro. Deriva de um contador, e não do sufixo:
// `sufixo.length` colidiria entre dois sufixos do mesmo tamanho, e o
// erro só apareceria quando alguém acrescentasse um cenário novo.
let sequenciaDeTelefone = 0;
function proximoTelefone(): string {
  sequenciaDeTelefone += 1;
  return `1199999${String(sequenciaDeTelefone).padStart(4, "0")}`;
}

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

  const cliente = (
    await app.inject({
      method: "POST",
      url: "/clientes",
      headers: auth(barbearia.token),
      payload: { nome: "João da Silva", telefone: proximoTelefone() },
    })
  ).json();

  return { ...barbearia, servico, cliente };
}

async function agendar(
  app: App,
  agenda: Awaited<ReturnType<typeof prepararAgenda>>,
  horaInicio = "10:00"
) {
  const resposta = await app.inject({
    method: "POST",
    url: "/agendamentos",
    headers: auth(agenda.token),
    payload: {
      barbeiroId: agenda.barbeiroId,
      clienteId: agenda.cliente.id,
      servicoIds: [agenda.servico.id],
      data: "2026-09-10",
      horaInicio,
    },
  });
  return resposta.json();
}

describe("GET /agendamentos/:id", () => {
  it("devolve o agendamento com cliente e serviços", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    const criado = await agendar(app, agenda);

    const resposta = await app.inject({
      method: "GET",
      url: `/agendamentos/${criado.id}`,
      headers: auth(agenda.token),
    });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toMatchObject({
      id: criado.id,
      data: "2026-09-10",
      horaInicio: "10:00",
      horaFim: "10:45",
      cliente: { nome: "João da Silva" },
    });
    expect(resposta.json().servicos[0].nome).toBe("Corte");

    await app.close();
  });

  it("devolve 404 pra agendamento de outra barbearia", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app, "um");
    const outra = await prepararAgenda(app, "outra");
    const alheio = await agendar(app, outra);

    const resposta = await app.inject({
      method: "GET",
      url: `/agendamentos/${alheio.id}`,
      headers: auth(agenda.token),
    });

    expect(resposta.statusCode).toBe(404);

    await app.close();
  });

  it("recusa id fora do formato UUID com 400", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    const resposta = await app.inject({
      method: "GET",
      url: "/agendamentos/nao-e-uuid",
      headers: auth(agenda.token),
    });

    expect(resposta.statusCode).toBe(400);

    await app.close();
  });

  it("recusa requisição sem token com 401", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    const criado = await agendar(app, agenda);

    const resposta = await app.inject({
      method: "GET",
      url: `/agendamentos/${criado.id}`,
    });

    expect(resposta.statusCode).toBe(401);

    await app.close();
  });
});

describe("PATCH /agendamentos/:id", () => {
  it("muda o status", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    const criado = await agendar(app, agenda);

    const resposta = await app.inject({
      method: "PATCH",
      url: `/agendamentos/${criado.id}`,
      headers: auth(agenda.token),
      payload: { status: "concluido" },
    });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().status).toBe("concluido");

    await app.close();
  });

  it("aceita qualquer transição, inclusive voltar de cancelado", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    const criado = await agendar(app, agenda);

    await app.inject({
      method: "PATCH",
      url: `/agendamentos/${criado.id}`,
      headers: auth(agenda.token),
      payload: { status: "cancelado" },
    });

    // Sem máquina de estados: o barbeiro é a autoridade sobre o próprio
    // dia, e proibir "cancelado de volta pra confirmado" atrapalharia
    // mais do que ajudaria.
    const voltou = await app.inject({
      method: "PATCH",
      url: `/agendamentos/${criado.id}`,
      headers: auth(agenda.token),
      payload: { status: "confirmado" },
    });

    expect(voltou.statusCode).toBe(200);
    expect(voltou.json().status).toBe("confirmado");

    await app.close();
  });

  it("recusa reativar cancelado cujo horário já foi tomado, com 409", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    const primeiro = await agendar(app, agenda);

    await app.inject({
      method: "PATCH",
      url: `/agendamentos/${primeiro.id}`,
      headers: auth(agenda.token),
      payload: { status: "cancelado" },
    });

    // Cancelar liberou o horário, e outro agendamento tomou.
    await agendar(app, agenda);

    const reativar = await app.inject({
      method: "PATCH",
      url: `/agendamentos/${primeiro.id}`,
      headers: auth(agenda.token),
      payload: { status: "confirmado" },
    });

    // A exceção implícita da spec: quem recusa aqui é a
    // sem_conflito_horario, não uma regra da aplicação.
    expect(reativar.statusCode).toBe(409);
    expect(reativar.json().erro).toBe("horario_ocupado");

    await app.close();
  });

  it("edita observações e aceita null pra limpar", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    const criado = await agendar(app, agenda);

    const escreveu = await app.inject({
      method: "PATCH",
      url: `/agendamentos/${criado.id}`,
      headers: auth(agenda.token),
      payload: { observacoes: "cliente atrasou 10 minutos" },
    });
    expect(escreveu.json().observacoes).toBe("cliente atrasou 10 minutos");

    const limpou = await app.inject({
      method: "PATCH",
      url: `/agendamentos/${criado.id}`,
      headers: auth(agenda.token),
      payload: { observacoes: null },
    });
    expect(limpou.json().observacoes).toBeNull();

    await app.close();
  });

  it("recusa status fora do enum com 400", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    const criado = await agendar(app, agenda);

    const resposta = await app.inject({
      method: "PATCH",
      url: `/agendamentos/${criado.id}`,
      headers: auth(agenda.token),
      payload: { status: "inventado" },
    });

    expect(resposta.statusCode).toBe(400);

    await app.close();
  });

  it("recusa mexer em data, hora ou serviços com 400", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    const criado = await agendar(app, agenda);

    // Remarcar está fora de escopo (a spec manda cancelar e criar
    // outro): aceitar data/hora aqui pularia a checagem de
    // disponibilidade inteira.
    for (const extra of [
      { data: "2026-09-11" },
      { horaInicio: "11:00" },
      { servicoIds: [agenda.servico.id] },
    ]) {
      const resposta = await app.inject({
        method: "PATCH",
        url: `/agendamentos/${criado.id}`,
        headers: auth(agenda.token),
        payload: extra,
      });

      expect(resposta.statusCode).toBe(400);
    }

    await app.close();
  });

  it("recusa corpo vazio com 400", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    const criado = await agendar(app, agenda);

    const resposta = await app.inject({
      method: "PATCH",
      url: `/agendamentos/${criado.id}`,
      headers: auth(agenda.token),
      payload: {},
    });

    expect(resposta.statusCode).toBe(400);

    await app.close();
  });

  it("devolve 404 pra agendamento de outra barbearia, sem editar", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app, "um");
    const outra = await prepararAgenda(app, "outra");
    const alheio = await agendar(app, outra);

    const resposta = await app.inject({
      method: "PATCH",
      url: `/agendamentos/${alheio.id}`,
      headers: auth(agenda.token),
      payload: { status: "cancelado" },
    });

    expect(resposta.statusCode).toBe(404);

    const intacto = await prisma.agendamento.findUniqueOrThrow({
      where: { id: alheio.id },
    });
    expect(intacto.status).toBe("confirmado");

    await app.close();
  });

  it("recusa requisição sem token com 401", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    const criado = await agendar(app, agenda);

    const resposta = await app.inject({
      method: "PATCH",
      url: `/agendamentos/${criado.id}`,
      payload: { status: "cancelado" },
    });

    expect(resposta.statusCode).toBe(401);

    await app.close();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
pnpm --filter @barchop/api test tests/rotas/agendamentos-id.test.ts
```

Esperado: FAIL — 404 nas rotas com `:id`.

- [ ] **Step 3: Acrescentar as duas rotas**

Em `apps/api/src/rotas/agendamentos.ts`, acrescentar os schemas:

```ts
const paramsComId = {
  type: "object",
  required: ["id"],
  additionalProperties: false,
  properties: { id: { type: "string", pattern: PADRAO_UUID } },
} as const;

// Só status e observações. Data, hora e serviços ficam de fora: remarcar
// está fora de escopo (cancela e cria outro), e aceitar data/hora aqui
// pularia a checagem de disponibilidade inteira.
const corpoPatchAgendamento = {
  type: "object",
  additionalProperties: false,
  minProperties: 1,
  properties: {
    status: {
      type: "string",
      enum: ["pendente", "confirmado", "concluido", "cancelado", "no_show"],
    },
    observacoes: { type: ["string", "null"], maxLength: 500 },
  },
} as const;
```

E as rotas, dentro de `registrarRotasAgendamentos`:

```ts
  app.get(
    "/agendamentos/:id",
    { schema: { params: paramsComId } },
    async (request) => {
      const agendamento = await prisma.agendamento.findFirstOrThrow({
        where: {
          id: request.params.id,
          barbeariaId: request.user.barbeariaId,
        },
        include: INCLUDE_AGENDAMENTO,
      });

      return serializarAgendamentoComCliente(agendamento);
    }
  );

  app.patch(
    "/agendamentos/:id",
    { schema: { params: paramsComId, body: corpoPatchAgendamento } },
    async (request) => {
      // Qualquer transição de status é aceita: o barbeiro é a autoridade
      // sobre o próprio dia. A única recusa vem do banco — reativar um
      // cancelado cujo horário já foi tomado bate na
      // sem_conflito_horario e sai como 409.
      const agendamento = await prisma.agendamento.update({
        where: {
          id: request.params.id,
          barbeariaId: request.user.barbeariaId,
        },
        data: request.body,
        include: INCLUDE_AGENDAMENTO,
      });

      return serializarAgendamentoComCliente(agendamento);
    }
  );
```

- [ ] **Step 4: Rodar e ver passar**

```bash
pnpm --filter @barchop/api test tests/rotas/agendamentos-id.test.ts
pnpm --filter @barchop/api type-check
```

Esperado: PASS, 13 casos.

- [ ] **Step 5: Atualizar o README e commitar**

Acrescentar às rotas protegidas:

```markdown
| `GET` | `/agendamentos/:id` | detalhe, com cliente e serviços |
| `PATCH` | `/agendamentos/:id` | muda `status` e `observacoes` |
```

```bash
git add apps/api/src/rotas/agendamentos.ts apps/api/tests/rotas/agendamentos-id.test.ts apps/api/README.md
git commit -m "feat(api): read and update a single appointment"
```

---

## Definição de pronto

A fase 4 fecha quando, na raiz do monorepo:

```bash
pnpm --filter @barchop/api test
pnpm --filter @barchop/api type-check
pnpm --filter @barchop/api build
```

passam limpos, e:

- [ ] As 8 tasks estão commitadas, cada uma com sua suíte verde.
- [ ] O teste de corrida deu exatamente um `201` e um `409` — e não dois
      `201` por não ter corrido de verdade.
- [ ] Nenhuma resposta contém `23P01`, `ConnectorError` ou caminho de
      arquivo: `grep -rn "ConnectorError" apps/api/src` não acha nada
      fora do comentário do tratador de erros.
- [ ] Nenhuma rota protegida aceita `barbeariaId`, `origem` ou preço no
      corpo — conferir os schemas em `src/rotas/agendamentos.ts`.
- [ ] `apps/api/README.md` lista as cinco rotas novas e o
      `horario_ocupado` na tabela de erros.

Cobertura da spec, item por item:

| Item da spec | Task |
|---|---|
| Tradução do SQLSTATE `23P01` em 409 | 1 |
| `NovoAgendamentoBarbeiroInput` / `NovoAgendamentoPublicoInput` | 2 |
| Caminho de escrita (passos 1 a 6) | 3 |
| `POST /agendamentos` | 4 |
| `POST /barbearias/:slug/agendamentos` + upsert por telefone | 5 |
| Testes: conflito, borda `[)`, cancelado libera, corrida, fuso | 6 |
| `GET /agendamentos` (`?data=` ou `?de=&ate=`, teto de 92 dias) | 7 |
| `GET`/`PATCH /agendamentos/:id` | 8 |

## O que fica pra fase 5

- `GET /barbearias/:slug/disponibilidade` — horários livres de um dia,
  recebendo `barbeiroId`, `data` e `servicoIds` repetido na query.
- `GET /barbearias/:slug/disponibilidade/mes` — quais dias do mês têm
  vaga, com **uma** query do mês inteiro agrupada em memória, não 30.
- A remoção do `POST /disponibilidade` antigo, que é calculadora sem
  estado e nenhuma tela pode usar.
- As duas rotas repetem o miolo do passo 4 do `criarAgendamento` (montar
  a janela do dia, listar os agendamentos não cancelados, chamar
  `calcularHorariosDisponiveis`). Vale extrair isso de
  `lib/agendamento.ts` para uma função compartilhada na fase 5 — não
  antes, que aí seria abstração sem o segundo caso à vista.
