# API — Cadastros do barbeiro (fase 3): plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar as rotas de cadastro do barbeiro — perfil, barbearia, horário de funcionamento, serviços e clientes — todas escopadas pelo token, mais o perfil público da barbearia.

**Architecture:** Cada grupo de rota vira um arquivo em `src/rotas/`, registrado ou dentro do escopo protegido do `app.ts` (que já carrega o hook `autenticar`) ou fora dele, quando for público. Nenhuma rota protegida aceita `barbeariaId`: ele sai de `request.user`, e entra no mesmo `where` da escrita — é isso que faz um recurso de outra barbearia devolver `404`. Preço e horário saem do banco como `Decimal`/`Date` e só viram `"45.00"`/`"09:00"` em `lib/serializar.ts`.

**Tech Stack:** Fastify 5.12.1, @fastify/jwt 9.1.0, Prisma 5.22, vitest 4.1.11, tsup 8.5.1, TypeScript 5.x estrito, Node 24.13.1.

**Spec:** `docs/superpowers/specs/2026-08-30-api-crud-agendamentos-design.md`

Este plano cobre a **fase 3** da seção "Ordem de implementação" da spec.
As fases 1 e 2 estão prontas (PR #1, merge `cb9120c`) e têm plano próprio
em `docs/superpowers/plans/2026-08-30-api-fundacao-e-autenticacao.md`. As
fases 4 (criação de agendamento) e 5 (disponibilidade) ganham planos
próprios depois desta.

## Global Constraints

- Node 24.13.1, pnpm 11.24.0. Monorepo pnpm + Turborepo, `node-linker=hoisted` no `.npmrc`.
- TypeScript estrito, herdado de `@barchop/config/tsconfig/base.json`. `noEmit: true` no `apps/api/tsconfig.json`.
- A API builda com `tsup` (CJS, target node22), não com `tsc`. Não mexer nisso.
- Comentários, mensagens de erro e documentação em português, com acentuação correta. Mensagens de commit em inglês, Conventional Commits.
- **Todo horário no contrato HTTP é string `"HH:mm"`; toda data é `"YYYY-MM-DD"`.**
- **Nenhum `Date` destinado ao banco é construído a partir de string local.** Só via `lib/horas.ts`, sempre `Date.UTC`.
- **`senhaHash` nunca aparece em resposta de rota alguma.** Montar resposta com lista explícita de campos, ou pelos serializadores de `lib/serializar.ts` — nunca spread do registro do Prisma.
- **Rota protegida nunca aceita `barbeariaId` no corpo nem na URL** — sai de `request.user.barbeariaId`. Rota pública escopa pelo `:slug`.
- **`Servico.preco` sai como string de duas casas** (`"45.00"`), nunca number: o `Decimal` do Prisma vira `{}` no `JSON.stringify`, e float perde centavo.
- **Todo `:id` de rota é validado com pattern de UUID no schema.** Sem isso, um id fora do formato chega no Prisma e vira `P2023` — um 500, quando a resposta certa é 400.
- **`buildApp()` desliga o `removeAdditional` do AJV** (`ajv: { customOptions: { removeAdditional: false } }`, feito na Task 4). Sem isso o Fastify apaga campo fora do schema em silêncio e responde 200 — e todo teste deste plano que espera 400 pra campo extra falha. Descoberto na execução, não previsto no plano original.
- **O AJV do Fastify roda com `coerceTypes` ligado** (padrão mantido: é o que faz params e query string chegarem tipados). Efeito colateral: `preco: 45` vira `"45"` e passa no pattern de string. O valor final está certo — o teste da Task 8 fixa o comportamento real em vez de exigir 400. Descoberto na execução.
- Os pacotes internos (`@barchop/*`) publicam TypeScript cru: `main` aponta pro `src/index.ts`, sem passo de build.
- Rodar `pnpm --filter @barchop/api test` e `pnpm --filter @barchop/api type-check` antes de cada commit.

## Desvios conscientes da spec

Três, todos decididos antes de escrever este plano:

**1. `Cliente` passa a pertencer a uma barbearia.** A spec e o
`schema.prisma` tratam `Cliente` como identidade global da plataforma,
com `telefone` único em toda a base. A tela "Clientes — lista com busca"
(`docs/screens.md`) não fecha assim: sem coluna de vínculo, um cliente
cadastrado à mão pelo barbeiro só apareceria na lista depois do primeiro
agendamento, e o telefone de um cliente de outra barbearia bloquearia o
cadastro aqui. A Task 3 adiciona `barbearia_id` em `cliente` e troca os
uniques de `telefone` e `email` por compostos com a barbearia. O
casamento por telefone do fluxo público (fase 4) passa a ser **dentro da
barbearia**, que é o que a decisão 4 da spec quer dizer na prática.

**2. `GET /barbearias/:slug` entra aqui.** A spec lista essa rota na
tabela de públicas, mas não a nomeia em nenhuma das cinco fases. Ela
devolve os horários de funcionamento, então depende da Task 6 — e cairia
no vão entre este plano e o da fase 5. Fica na Task 7.

**3. `DELETE /servicos/:id` responde 200 com o serviço, não 204.** A tela
de Serviços precisa refletir o estado novo (`ativo: false`) sem uma
segunda requisição, e o soft delete é reversível pelo `PATCH`.

## Follow-ups da fase 2

Quatro ficaram abertos no fim da fase 2. Onde cada um foi parar:

- **Tradutor de erros rotulando todo sub-500 não-401 como
  `requisicao_invalida`** — é a **Task 1** deste plano. Não deu pra
  fechar antes porque nenhuma rota lançava 404 ou 409 próprio; é a fase 3
  que introduz os dois.
- **Nada carregava `.env` no processo da API** — **já resolvido** fora
  deste plano: o script `dev` virou
  `tsx watch --env-file-if-exists=.env src/server.ts`. O `-if-exists`
  mantém funcionando quem exporta no shell, e variável já presente no
  ambiente continua ganhando do arquivo. O `start` (bundle de produção)
  segue sem carregar `.env`, de propósito.
- **`docs/roadmap.md` desatualizado** — **já resolvido** fora deste
  plano: os passos 2 e 3 foram fundidos e as cinco fases da spec estão
  listadas com o estado de cada uma.
- **`POST /auth/signup` revela se um email já existe, via 409** — **não
  fechado**, de propósito. Deixar o código de erro mais genérico não
  adianta: quem sonda escolhe um slug livre, então o `409` só pode ter
  vindo do email. Fechar de verdade exige verificação de email ou rate
  limiting, os dois fora do escopo da spec. Ficou registrado em "Dívidas
  conhecidas" no `docs/roadmap.md`.

## Pré-requisitos

- Banco de teste `barchop_test` já criado e com a migration inicial
  aplicada (feito na fase 1). A migration da Task 3 é aplicada nele
  automaticamente pelo `tests/global-setup.ts`, que roda
  `prisma migrate deploy` antes da suíte.
- Para aplicar a mesma migration no banco de **desenvolvimento**,
  `packages/database/.env` precisa existir com o `DATABASE_URL` de dev
  (modelo em `packages/database/.env.example`). Sem ele o banco de dev
  fica pra trás — os testes continuam passando, o `pnpm dev` é que
  quebra.
- **Nenhuma migration precisa de `psql`.** O SQL da Task 3 é escrito à
  mão no repositório e aplicado por `prisma migrate deploy`, que lê o
  `DATABASE_URL` — sem prompt de senha interativo.

---

## Task 1: Erros com código próprio por status

Hoje `plugins/erros.ts` rotula **qualquer** erro sub-500 que não seja 401
como `requisicao_invalida`. Enquanto só existia validação de schema
(400), isso estava certo por acidente. Esta fase lança 404 (recurso de
outra barbearia) e 409 (telefone repetido), e os dois sairiam com o
código errado no corpo e o status certo no cabeçalho. As 23 telas
ramificam no campo `erro`.

**Files:**
- Create: `apps/api/src/lib/erro-http.ts`
- Modify: `apps/api/src/lib/erro-negocio.ts`
- Modify: `apps/api/src/plugins/erros.ts`
- Test: `apps/api/tests/erros.test.ts` (arquivo existente, casos novos)
- Modify: `apps/api/README.md` (tabela de erros)

**Interfaces:**
- Consumes: nada.
- Produces: `class ErroHttp extends Error` com `status: number` e `codigo: string`; `naoEncontrado(mensagem?: string): ErroHttp` (404, `nao_encontrado`); `conflito(mensagem: string): ErroHttp` (409, `conflito`) — todos em `src/lib/erro-http.ts`. `ErroDeNegocio` continua exportado de `src/lib/erro-negocio.ts` e passa a estender `ErroHttp` com status 422.

- [ ] **Step 1: Escrever os testes que falham**

Trocar o bloco de imports do topo de `apps/api/tests/erros.test.ts` por:

```ts
import { describe, expect, it } from "vitest";
import { prisma } from "@barchop/database";
import { buildApp } from "../src/app";
import { ErroDeNegocio } from "../src/lib/erro-negocio";
import { conflito, naoEncontrado } from "../src/lib/erro-http";
```

E acrescentar estes casos ao final do `describe` existente, antes do
`});` que fecha o bloco:

```ts
  it("traduz ErroHttp de 404 com o código nao_encontrado", async () => {
    const app = buildApp();
    app.get("/teste-404", async () => {
      throw naoEncontrado("serviço não encontrado");
    });

    const resposta = await app.inject({ method: "GET", url: "/teste-404" });

    expect(resposta.statusCode).toBe(404);
    // O bug que este caso fecha: com o status certo no cabeçalho, o
    // corpo saía como `requisicao_invalida` — e as telas ramificam no
    // corpo, não no status.
    expect(resposta.json().erro).toBe("nao_encontrado");

    await app.close();
  });

  it("traduz ErroHttp de 409 com o código conflito", async () => {
    const app = buildApp();
    app.get("/teste-409", async () => {
      throw conflito("telefone já cadastrado nesta barbearia");
    });

    const resposta = await app.inject({ method: "GET", url: "/teste-409" });

    expect(resposta.statusCode).toBe(409);
    expect(resposta.json()).toEqual({
      erro: "conflito",
      mensagem: "telefone já cadastrado nesta barbearia",
    });

    await app.close();
  });

  it("dá código próprio a erro cru de 403 e de 409", async () => {
    const app = buildApp();
    app.get("/teste-403-cru", async () => {
      // Erro de biblioteca: tem statusCode, não tem código nosso. Antes,
      // qualquer coisa assim virava `requisicao_invalida`.
      throw Object.assign(new Error("proibido"), { statusCode: 403 });
    });
    app.get("/teste-409-cru", async () => {
      throw Object.assign(new Error("conflitou"), { statusCode: 409 });
    });

    const proibido = await app.inject({ method: "GET", url: "/teste-403-cru" });
    expect(proibido.statusCode).toBe(403);
    expect(proibido.json().erro).toBe("acesso_negado");

    const conflitou = await app.inject({ method: "GET", url: "/teste-409-cru" });
    expect(conflitou.statusCode).toBe(409);
    expect(conflitou.json().erro).toBe("conflito");

    await app.close();
  });

  it("traduz P2023 do Prisma (id fora do formato UUID) pra 400", async () => {
    const app = buildApp();
    app.get("/teste-uuid-torto", async () => {
      // O Postgres recusa "nao-e-uuid" numa coluna uuid e o Prisma lança
      // P2023. Sem tratamento isso vira 500 — bug nosso — quando quem
      // errou foi o chamador.
      return prisma.servico.findUniqueOrThrow({ where: { id: "nao-e-uuid" } });
    });

    const resposta = await app.inject({
      method: "GET",
      url: "/teste-uuid-torto",
    });

    expect(resposta.statusCode).toBe(400);
    expect(resposta.json().erro).toBe("requisicao_invalida");
    // A mensagem crua do Prisma traz nome de coluna e SQL; nada disso
    // pode sair no contrato.
    expect(resposta.body).not.toContain("Inconsistent column data");

    await app.close();
  });
```

- [ ] **Step 2: Rodar os testes e ver os quatro falharem**

```bash
pnpm --filter @barchop/api test
```

Esperado: FAIL. Os três primeiros com
`Cannot find module '../src/lib/erro-http'`; o quarto com
`expected 500 to be 400`.

- [ ] **Step 3: Criar `lib/erro-http.ts`**

```ts
// Erro que já sabe qual resposta HTTP quer. O tratador central lê
// `status` e `codigo` daqui em vez de deduzir o código a partir do
// status — dedução que dava certo enquanto o único sub-500 nosso era o
// 400 da validação de schema, e passa a errar assim que existe 404 ou
// 409 de domínio.
export class ErroHttp extends Error {
  readonly status: number;
  readonly codigo: string;

  constructor(status: number, codigo: string, mensagem: string) {
    super(mensagem);
    this.name = "ErroHttp";
    this.status = status;
    this.codigo = codigo;
  }
}

// Recurso que não existe — ou que existe, mas é de outra barbearia. Os
// dois casos respondem igual de propósito: um 403 confirmaria que o id
// existe em algum lugar da plataforma.
export function naoEncontrado(mensagem = "recurso não encontrado"): ErroHttp {
  return new ErroHttp(404, "nao_encontrado", mensagem);
}

// Estado do banco impede a escrita: telefone repetido na barbearia,
// slug já usado, horário já ocupado.
export function conflito(mensagem: string): ErroHttp {
  return new ErroHttp(409, "conflito", mensagem);
}
```

- [ ] **Step 4: Fazer `ErroDeNegocio` estender `ErroHttp`**

Substituir o conteúdo de `apps/api/src/lib/erro-negocio.ts` por:

```ts
import { ErroHttp } from "./erro-http";

// Regra de negócio violada — requisição bem formada, mas que o domínio
// recusa. Sempre 422, nunca 400 (que é validação de schema) nem 500
// (que é bug nosso). Estende ErroHttp pra o tratador central ter um
// branch só: quem lança escolhe status e código, o plugin só repassa.
export class ErroDeNegocio extends ErroHttp {
  constructor(mensagem: string, codigo = "regra_de_negocio") {
    super(422, codigo, mensagem);
    this.name = "ErroDeNegocio";
  }
}
```

- [ ] **Step 5: Reescrever o tratador**

Substituir o conteúdo de `apps/api/src/plugins/erros.ts` por:

```ts
import type { FastifyError } from "fastify";
import { Prisma } from "@barchop/database";
import { ErroHttp } from "../lib/erro-http";
import type { App } from "../tipos";

// Erro sub-500 que chega sem código nosso: em vez de rotular tudo como
// `requisicao_invalida`, cada status ganha o código que descreve o que
// houve. Status fora desta tabela cai no padrão — é sempre alguma forma
// de "a requisição está errada".
const CODIGO_POR_STATUS: Record<number, string> = {
  400: "requisicao_invalida",
  403: "acesso_negado",
  404: "nao_encontrado",
  409: "conflito",
  413: "requisicao_invalida",
  415: "requisicao_invalida",
  422: "regra_de_negocio",
};

// Um lugar só traduzindo erro de domínio e de banco pra HTTP. Sem isso,
// cada rota repetiria try/catch e o formato da resposta divergiria.
export function registrarTratamentoDeErros(app: App): void {
  app.setErrorHandler<FastifyError>((erro, request, reply) => {
    // ErroDeNegocio (422) também cai aqui: ele estende ErroHttp.
    if (erro instanceof ErroHttp) {
      return reply
        .code(erro.status)
        .send({ erro: erro.codigo, mensagem: erro.message });
    }

    if (erro instanceof Prisma.PrismaClientKnownRequestError) {
      // P2025: findUniqueOrThrow/findFirstOrThrow/update não achou o
      // registro. Nas rotas desta fase o `where` sempre carrega o
      // barbeariaId do token, então "não achou" inclui "é de outra
      // barbearia" — e a resposta é a mesma, de propósito.
      if (erro.code === "P2025") {
        return reply.code(404).send({ erro: "nao_encontrado" });
      }
      // P2002: violação de unique (slug, email, telefone do cliente).
      if (erro.code === "P2002") {
        return reply.code(409).send({ erro: "conflito" });
      }
      // P2023: valor inconsistente pra coluna — na prática, um id que
      // não é UUID. Erro de quem chamou, não bug nosso: 400. A mensagem
      // crua traz nome de coluna e SQL, então não é repassada.
      if (erro.code === "P2023") {
        return reply.code(400).send({ erro: "requisicao_invalida" });
      }
    }

    // Validação de schema do Fastify e erros de JWT já vêm com
    // statusCode — é isso que os branches abaixo consultam.
    const status = erro.statusCode ?? 500;

    // O @fastify/jwt lança com códigos próprios (FST_JWT_*). Repassar
    // esses nomes colocaria o nome interno de um plugin dentro do
    // contrato da API. Pra quem consome, toda falha de token é a mesma
    // coisa — inclusive as duas que o plugin classifica como 400
    // (cabeçalho Authorization malformado, cookie ilegível): quem manda
    // um cabeçalho torto não está autenticado.
    if (status === 401 || erro.code?.startsWith("FST_JWT")) {
      return reply.code(401).send({ erro: "nao_autenticado" });
    }

    if (status < 500) {
      // O `erro` é sempre nosso: repassar o `erro.code` colocaria o
      // FST_ERR_VALIDATION do Fastify no contrato, o mesmo vazamento já
      // fechado acima pros FST_JWT_*. A `mensagem` do AJV continua
      // saindo porque diz ao cliente qual campo está errado — é o
      // código que precisa ser estável e livre de nome de framework.
      const codigo = CODIGO_POR_STATUS[status] ?? "requisicao_invalida";
      return reply.code(status).send({ erro: codigo, mensagem: erro.message });
    }

    // Qualquer outra coisa é bug nosso: registra inteiro no log e
    // devolve genérico, pra não vazar detalhe interno.
    request.log.error(erro);
    return reply.code(500).send({ erro: "erro_interno" });
  });
}
```

- [ ] **Step 6: Rodar a suíte inteira e o type-check**

```bash
pnpm --filter @barchop/api test
pnpm --filter @barchop/api type-check
```

Esperado: PASS em tudo, inclusive nos casos antigos — o
`traduz ErroDeNegocio pra 422` continua valendo porque `ErroDeNegocio`
entra agora pelo branch do `ErroHttp`, com o mesmo status e o mesmo
código de antes.

- [ ] **Step 7: Atualizar a tabela de erros do README**

Em `apps/api/README.md`, seção `## Erros`, substituir a tabela por:

```markdown
| Situação | HTTP | `erro` |
|---|---|---|
| Body ou parâmetro fora do schema, id fora do formato UUID | 400 | `requisicao_invalida` |
| Token ausente, inválido, expirado ou de barbeiro inativo | 401 | `nao_autenticado` |
| Credenciais erradas no login | 401 | `credenciais_invalidas` |
| Acesso negado | 403 | `acesso_negado` |
| Rota, registro inexistente ou recurso de outra barbearia | 404 | `nao_encontrado` |
| Unique violada | 409 | `conflito` |
| Regra de negócio | 422 | código do domínio |
| Bug nosso | 500 | `erro_interno` |

Quem lança escolhe o par status/código com `ErroHttp`
(`src/lib/erro-http.ts`) ou com `ErroDeNegocio` (`src/lib/erro-negocio.ts`,
sempre 422).
```

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/lib/erro-http.ts apps/api/src/lib/erro-negocio.ts apps/api/src/plugins/erros.ts apps/api/tests/erros.test.ts apps/api/README.md
git commit -m "fix(api): give sub-500 errors a code that matches the status"
```

---

## Task 2: `lib/serializar.ts`

O `Decimal` do Prisma vira `{}` no `JSON.stringify` — o preço sumiria da
resposta sem erro nenhum. E coluna `@db.Time` chega como `Date`, que
serializa como `"1970-01-01T09:00:00.000Z"` em vez de `"09:00"`. As duas
armadilhas aparecem em cinco rotas desta fase; o lugar de resolver é um
só, antes da primeira delas.

**Files:**
- Create: `apps/api/src/lib/serializar.ts`
- Test: `apps/api/tests/lib/serializar.test.ts`

**Interfaces:**
- Consumes: `dateParaData(d: Date): string` e `dateParaHora(d: Date): string` de `src/lib/horas.ts`.
- Produces, todos em `src/lib/serializar.ts`:
  - `serializarBarbearia(b): BarbeariaSerializada` — `{ id, nome, slug, telefone, endereco, logoUrl }`
  - `serializarHorario(h): HorarioSerializado` — `{ diaSemana, horaAbertura, horaFechamento, fechado }`, horas como `"HH:mm"` ou `null`
  - `serializarServico(s): ServicoSerializado` — `{ id, nome, duracaoMinutos, preco, ativo }`, `preco` string de duas casas
  - `serializarCliente(c): ClienteSerializado` — `{ id, nome, telefone, email, temConta }`. A Task 10 troca esta interface local por um alias do `ClientePublico` de `@barchop/types`, quando o tipo compartilhado passar a ter os mesmos campos.
  - `serializarAgendamento(a): AgendamentoSerializado` — `{ id, data, horaInicio, horaFim, status, origem, observacoes, servicos }`

- [ ] **Step 1: Escrever o teste que falha**

Criar `apps/api/tests/lib/serializar.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { Prisma } from "@barchop/database";
import { horaParaDate, dataParaDate } from "../../src/lib/horas";
import {
  serializarAgendamento,
  serializarBarbearia,
  serializarCliente,
  serializarHorario,
  serializarServico,
} from "../../src/lib/serializar";

describe("serializarServico", () => {
  it("devolve o preço como string de duas casas", () => {
    const servico = serializarServico({
      id: "s1",
      nome: "Corte",
      duracaoMinutos: 45,
      preco: new Prisma.Decimal("45"),
      ativo: true,
    });

    // O motivo de existir deste módulo: `new Prisma.Decimal("45")` sai
    // como `{}` no JSON.stringify, e o preço sumiria da resposta sem
    // erro nenhum.
    expect(servico.preco).toBe("45.00");
    expect(JSON.parse(JSON.stringify(servico)).preco).toBe("45.00");
  });

  it("completa a segunda casa decimal", () => {
    expect(
      serializarServico({
        id: "s1",
        nome: "Barba",
        duracaoMinutos: 20,
        preco: new Prisma.Decimal("30.5"),
        ativo: true,
      }).preco
    ).toBe("30.50");
  });

  it("mantém ativo, que a listagem do barbeiro precisa ver", () => {
    expect(
      serializarServico({
        id: "s1",
        nome: "Antigo",
        duracaoMinutos: 30,
        preco: new Prisma.Decimal("10"),
        ativo: false,
      }).ativo
    ).toBe(false);
  });
});

describe("serializarHorario", () => {
  it("converte as colunas @db.Time pra HH:mm", () => {
    const horario = serializarHorario({
      diaSemana: 1,
      horaAbertura: horaParaDate("09:00"),
      horaFechamento: horaParaDate("18:30"),
      fechado: false,
    });

    expect(horario).toEqual({
      diaSemana: 1,
      horaAbertura: "09:00",
      horaFechamento: "18:30",
      fechado: false,
    });
  });

  it("mantém null quando o dia está fechado", () => {
    expect(
      serializarHorario({
        diaSemana: 0,
        horaAbertura: null,
        horaFechamento: null,
        fechado: true,
      })
    ).toEqual({
      diaSemana: 0,
      horaAbertura: null,
      horaFechamento: null,
      fechado: true,
    });
  });
});

describe("serializarCliente", () => {
  it("troca senhaHash por temConta e nunca deixa o hash sair", () => {
    const cliente = serializarCliente({
      id: "c1",
      nome: "João",
      telefone: "11999998888",
      email: null,
      senhaHash: "scrypt$abc$def",
    });

    expect(cliente).toEqual({
      id: "c1",
      nome: "João",
      telefone: "11999998888",
      email: null,
      temConta: true,
    });
    expect(JSON.stringify(cliente)).not.toContain("scrypt$");
  });

  it("marca temConta como false quando o cliente não tem senha", () => {
    expect(
      serializarCliente({
        id: "c1",
        nome: "Maria",
        telefone: "11888887777",
        email: "maria@exemplo.com",
        senhaHash: null,
      }).temConta
    ).toBe(false);
  });
});

describe("serializarBarbearia", () => {
  it("devolve só os campos públicos", () => {
    expect(
      serializarBarbearia({
        id: "b1",
        nome: "Barbearia do Gu",
        slug: "barbearia-do-gu",
        telefone: null,
        endereco: null,
        logoUrl: null,
      })
    ).toEqual({
      id: "b1",
      nome: "Barbearia do Gu",
      slug: "barbearia-do-gu",
      telefone: null,
      endereco: null,
      logoUrl: null,
    });
  });
});

describe("serializarAgendamento", () => {
  it("converte data, horas e preços dos serviços", () => {
    const agendamento = serializarAgendamento({
      id: "a1",
      data: dataParaDate("2026-09-10"),
      horaInicio: horaParaDate("10:00"),
      horaFim: horaParaDate("10:45"),
      status: "confirmado",
      origem: "cliente",
      observacoes: null,
      servicos: [
        {
          servicoId: "s1",
          precoNoMomento: new Prisma.Decimal("45"),
          duracaoNoMomento: 45,
          servico: { nome: "Corte" },
        },
      ],
    });

    expect(agendamento).toEqual({
      id: "a1",
      data: "2026-09-10",
      horaInicio: "10:00",
      horaFim: "10:45",
      status: "confirmado",
      origem: "cliente",
      observacoes: null,
      servicos: [
        {
          servicoId: "s1",
          nome: "Corte",
          precoNoMomento: "45.00",
          duracaoNoMomento: 45,
        },
      ],
    });
  });
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

```bash
pnpm --filter @barchop/api test tests/lib/serializar.test.ts
```

Esperado: FAIL com `Cannot find module '../../src/lib/serializar'`.

- [ ] **Step 3: Escrever `lib/serializar.ts`**

```ts
import type { Prisma } from "@barchop/database";
import { dateParaData, dateParaHora } from "./horas";

// O que sai pelo HTTP não é o registro do Prisma. Dois motivos, os dois
// silenciosos se ninguém cuidar: `Decimal` vira `{}` no JSON.stringify
// (o preço sumiria da resposta), e coluna @db.Time chega como Date, que
// serializa como "1970-01-01T09:00:00.000Z" em vez de "09:00". De
// quebra, montar a resposta campo a campo é o que garante que
// `senhaHash` nunca escape por um spread distraído.

export interface BarbeariaSerializada {
  id: string;
  nome: string;
  slug: string;
  telefone: string | null;
  endereco: string | null;
  logoUrl: string | null;
}

export function serializarBarbearia(barbearia: {
  id: string;
  nome: string;
  slug: string;
  telefone: string | null;
  endereco: string | null;
  logoUrl: string | null;
}): BarbeariaSerializada {
  return {
    id: barbearia.id,
    nome: barbearia.nome,
    slug: barbearia.slug,
    telefone: barbearia.telefone,
    endereco: barbearia.endereco,
    logoUrl: barbearia.logoUrl,
  };
}

export interface HorarioSerializado {
  diaSemana: number;
  horaAbertura: string | null;
  horaFechamento: string | null;
  fechado: boolean;
}

export function serializarHorario(horario: {
  diaSemana: number;
  horaAbertura: Date | null;
  horaFechamento: Date | null;
  fechado: boolean;
}): HorarioSerializado {
  return {
    diaSemana: horario.diaSemana,
    horaAbertura: horario.horaAbertura ? dateParaHora(horario.horaAbertura) : null,
    horaFechamento: horario.horaFechamento
      ? dateParaHora(horario.horaFechamento)
      : null,
    fechado: horario.fechado,
  };
}

export interface ServicoSerializado {
  id: string;
  nome: string;
  duracaoMinutos: number;
  preco: string;
  ativo: boolean;
}

export function serializarServico(servico: {
  id: string;
  nome: string;
  duracaoMinutos: number;
  preco: Prisma.Decimal;
  ativo: boolean;
}): ServicoSerializado {
  return {
    id: servico.id,
    nome: servico.nome,
    duracaoMinutos: servico.duracaoMinutos,
    // toFixed(2) do decimal.js, não do Number: arredonda em decimal e
    // não passa por float em momento nenhum.
    preco: servico.preco.toFixed(2),
    ativo: servico.ativo,
  };
}

export interface ClienteSerializado {
  id: string;
  nome: string;
  telefone: string;
  email: string | null;
  temConta: boolean;
}

export function serializarCliente(cliente: {
  id: string;
  nome: string;
  telefone: string;
  email: string | null;
  senhaHash: string | null;
}): ClienteSerializado {
  return {
    id: cliente.id,
    nome: cliente.nome,
    telefone: cliente.telefone,
    email: cliente.email,
    // Único lugar da API que olha pro senhaHash do cliente, e olha só
    // pra saber se ele existe. O valor nunca entra na resposta.
    temConta: cliente.senhaHash !== null,
  };
}

export interface AgendamentoServicoSerializado {
  servicoId: string;
  nome: string;
  precoNoMomento: string;
  duracaoNoMomento: number;
}

export interface AgendamentoSerializado {
  id: string;
  data: string;
  horaInicio: string;
  horaFim: string;
  status: string;
  origem: string;
  observacoes: string | null;
  servicos: AgendamentoServicoSerializado[];
}

export function serializarAgendamento(agendamento: {
  id: string;
  data: Date;
  horaInicio: Date;
  horaFim: Date;
  status: string;
  origem: string;
  observacoes: string | null;
  servicos: {
    servicoId: string;
    precoNoMomento: Prisma.Decimal;
    duracaoNoMomento: number;
    servico: { nome: string };
  }[];
}): AgendamentoSerializado {
  return {
    id: agendamento.id,
    data: dateParaData(agendamento.data),
    horaInicio: dateParaHora(agendamento.horaInicio),
    horaFim: dateParaHora(agendamento.horaFim),
    status: agendamento.status,
    origem: agendamento.origem,
    observacoes: agendamento.observacoes,
    // `precoNoMomento` e `duracaoNoMomento` são o preço e a duração
    // congelados no dia do agendamento — nunca os do serviço hoje. Só o
    // nome vem do serviço atual, pra tela ter o que exibir.
    servicos: agendamento.servicos.map((s) => ({
      servicoId: s.servicoId,
      nome: s.servico.nome,
      precoNoMomento: s.precoNoMomento.toFixed(2),
      duracaoNoMomento: s.duracaoNoMomento,
    })),
  };
}
```

- [ ] **Step 4: Rodar o teste e ver passar**

```bash
pnpm --filter @barchop/api test tests/lib/serializar.test.ts
pnpm --filter @barchop/api type-check
```

Esperado: PASS, 9 casos.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/serializar.ts apps/api/tests/lib/serializar.test.ts
git commit -m "feat(api): serialize decimals and time columns for the wire"
```

---

## Task 3: `Cliente` passa a pertencer a uma barbearia

Ver "Desvios conscientes da spec", item 1. É a única migration da fase 3
— todas as outras colunas já existem desde a migration inicial.

**Files:**
- Create: `packages/database/prisma/migrations/20260902120000_cliente_por_barbearia/migration.sql`
- Modify: `packages/database/prisma/schema.prisma`
- Modify: `packages/database/schema.sql` (referência legível, não roda)
- Test: `apps/api/tests/cliente-por-barbearia.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `prisma.cliente` com `barbeariaId: string` obrigatório; unique composto `barbeariaId_telefone` (usável como `where: { barbeariaId_telefone: { barbeariaId, telefone } }`) e `barbeariaId_email`; relação `barbearia.clientes`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `apps/api/tests/cliente-por-barbearia.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { prisma } from "@barchop/database";

async function criarBarbearia(slug: string) {
  return prisma.barbearia.create({ data: { nome: `Barbearia ${slug}`, slug } });
}

describe("cliente por barbearia", () => {
  it("aceita o mesmo telefone em barbearias diferentes", async () => {
    const uma = await criarBarbearia("uma");
    const outra = await criarBarbearia("outra");

    await prisma.cliente.create({
      data: { barbeariaId: uma.id, nome: "João", telefone: "11999998888" },
    });

    // Com o telefone único na plataforma inteira, este create falharia —
    // e o barbeiro da segunda barbearia não conseguiria cadastrar um
    // cliente que já é cliente de outra.
    const segundo = await prisma.cliente.create({
      data: { barbeariaId: outra.id, nome: "João", telefone: "11999998888" },
    });

    expect(segundo.barbeariaId).toBe(outra.id);
    expect(await prisma.cliente.count()).toBe(2);
  });

  it("recusa telefone repetido dentro da mesma barbearia", async () => {
    const barbearia = await criarBarbearia("unica");

    await prisma.cliente.create({
      data: { barbeariaId: barbearia.id, nome: "João", telefone: "11999998888" },
    });

    await expect(
      prisma.cliente.create({
        data: {
          barbeariaId: barbearia.id,
          nome: "João de novo",
          telefone: "11999998888",
        },
      })
      // `code` é propriedade própria do PrismaClientKnownRequestError —
      // o toMatchObject enxerga, e o teste fixa o código exato que o
      // tratador de erros traduz pra 409.
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("permite buscar cliente pelo par barbearia + telefone", async () => {
    const barbearia = await criarBarbearia("busca");
    await prisma.cliente.create({
      data: { barbeariaId: barbearia.id, nome: "João", telefone: "11999998888" },
    });

    // Esta é a forma que o upsert por telefone da fase 4 vai usar.
    const achado = await prisma.cliente.findUnique({
      where: {
        barbeariaId_telefone: {
          barbeariaId: barbearia.id,
          telefone: "11999998888",
        },
      },
    });

    expect(achado?.nome).toBe("João");
  });

  it("apaga os clientes junto com a barbearia", async () => {
    const barbearia = await criarBarbearia("cascata");
    await prisma.cliente.create({
      data: { barbeariaId: barbearia.id, nome: "João", telefone: "11999998888" },
    });

    await prisma.barbearia.delete({ where: { id: barbearia.id } });

    expect(await prisma.cliente.count()).toBe(0);
  });
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

```bash
pnpm --filter @barchop/api test tests/cliente-por-barbearia.test.ts
```

Esperado: FAIL na compilação — `barbeariaId` não existe em
`ClienteCreateInput`, `barbeariaId_telefone` não existe em
`ClienteWhereUniqueInput`.

- [ ] **Step 3: Escrever a migration à mão**

Criar
`packages/database/prisma/migrations/20260902120000_cliente_por_barbearia/migration.sql`:

```sql
-- Cliente deixa de ser identidade global da plataforma e passa a
-- pertencer a uma barbearia. Sem isso a tela "Clientes" não fecha: um
-- cliente cadastrado à mão pelo barbeiro só apareceria na lista depois
-- do primeiro agendamento, e um telefone já usado em outra barbearia
-- bloquearia o cadastro aqui.

ALTER TABLE "cliente" ADD COLUMN "barbearia_id" UUID;

-- Backfill: quem já tem agendamento herda a barbearia do primeiro deles.
UPDATE "cliente" AS c
SET "barbearia_id" = (
  SELECT a."barbearia_id"
  FROM "agendamento" AS a
  WHERE a."cliente_id" = c."id"
  ORDER BY a."criado_em" ASC
  LIMIT 1
);

-- Cliente sem agendamento nenhum não tem dono dedutível. O SET NOT NULL
-- abaixo falha alto se sobrar algum, e é o comportamento desejado:
-- melhor a migration parar do que atribuir cadastro à barbearia errada.
ALTER TABLE "cliente" ALTER COLUMN "barbearia_id" SET NOT NULL;

ALTER TABLE "cliente" ADD CONSTRAINT "cliente_barbearia_id_fkey"
  FOREIGN KEY ("barbearia_id") REFERENCES "barbearia"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Os uniques globais saem; os compostos com a barbearia entram. Os
-- nomes são os que o Prisma gera pra @@unique([barbeariaId, telefone])
-- e @@unique([barbeariaId, email]) — nome divergente faria o
-- `migrate status` acusar drift.
DROP INDEX "cliente_telefone_key";
DROP INDEX "cliente_email_key";

CREATE UNIQUE INDEX "cliente_barbearia_id_telefone_key" ON "cliente"("barbearia_id", "telefone");
CREATE UNIQUE INDEX "cliente_barbearia_id_email_key" ON "cliente"("barbearia_id", "email");
CREATE INDEX "cliente_barbearia_id_idx" ON "cliente"("barbearia_id");
```

- [ ] **Step 4: Atualizar o `schema.prisma`**

Em `packages/database/prisma/schema.prisma`, substituir o `model Cliente`
inteiro por:

```prisma
model Cliente {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  barbeariaId String   @map("barbearia_id") @db.Uuid
  nome        String   @db.VarChar(120)
  telefone    String   @db.VarChar(20)
  email       String?  @db.VarChar(160)
  senhaHash   String?  @map("senha_hash")
  criadoEm    DateTime @default(now()) @map("criado_em") @db.Timestamptz

  barbearia    Barbearia     @relation(fields: [barbeariaId], references: [id], onDelete: Cascade)
  agendamentos Agendamento[]

  // Telefone é único dentro da barbearia, não na plataforma: o mesmo
  // cliente pode ser cliente de duas barbearias, com um cadastro em
  // cada uma. É esse par que o upsert por telefone da fase 4 usa.
  @@unique([barbeariaId, telefone])
  @@unique([barbeariaId, email])
  @@index([barbeariaId])
  @@map("cliente")
}
```

E acrescentar `clientes` à lista de relações do `model Barbearia`, logo
depois de `barbeiros`:

```prisma
  barbeiros             Barbeiro[]
  clientes              Cliente[]
  servicos              Servico[]
  horariosFuncionamento HorarioFuncionamento[]
  agendamentos          Agendamento[]
```

- [ ] **Step 5: Regenerar o client e rodar o teste**

```bash
pnpm --filter @barchop/database generate
pnpm --filter @barchop/api test tests/cliente-por-barbearia.test.ts
```

O `tests/global-setup.ts` roda `prisma migrate deploy` antes da suíte,
então o banco de teste recebe a migration sozinho. Esperado: PASS, 4
casos.

Se o `migrate deploy` parar em
`column "barbearia_id" of relation "cliente" contains null values`, é o
caso previsto no comentário do SQL: existe cliente sem agendamento
nenhum no banco. No banco de **teste** isso não acontece (cada caso
trunca tudo); num banco de dev com dado de brincadeira, apagar os
clientes órfãos e rodar de novo é aceitável — não há dado de produção.

- [ ] **Step 6: Aplicar no banco de desenvolvimento**

```bash
pnpm --filter @barchop/database migrate:deploy
```

Precisa de `packages/database/.env` com o `DATABASE_URL` de dev. Se o
arquivo não existir, criar a partir do `.env.example` antes.

- [ ] **Step 7: Atualizar a referência legível**

Em `packages/database/schema.sql` (que não roda — é documentação),
trocar a linha de cabeçalho

```sql
-- Modelo multi-tenant: Barbearia é o tenant raiz. Cliente é
-- global na plataforma (pode agendar em barbearias diferentes).
```

por

```sql
-- Modelo multi-tenant: Barbearia é o tenant raiz. Cliente pertence
-- a uma barbearia — o mesmo telefone em duas barbearias são dois
-- cadastros, e a busca por telefone é sempre dentro da barbearia.
```

E, no `CREATE TABLE cliente`, acrescentar a coluna e trocar os uniques:

```sql
CREATE TABLE cliente (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barbearia_id  UUID NOT NULL REFERENCES barbearia(id) ON DELETE CASCADE,
  nome          VARCHAR(120) NOT NULL,
  telefone      VARCHAR(20)  NOT NULL,
  email         VARCHAR(160),
  senha_hash    TEXT,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (barbearia_id, telefone),
  UNIQUE (barbearia_id, email)
);
```

- [ ] **Step 8: Rodar a suíte inteira e commitar**

```bash
pnpm --filter @barchop/api test
pnpm --filter @barchop/api type-check
```

```bash
git add packages/database/prisma packages/database/schema.sql apps/api/tests/cliente-por-barbearia.test.ts
git commit -m "feat(database): scope clients to a single barbershop"
```

---

## Task 4: Patterns compartilhados, helper de teste e `PATCH /me`

Primeira rota de escrita protegida da fase. Ela carrega junto as duas
peças que todas as outras vão consumir: os patterns de JSON Schema e o
helper que cria barbearia com token nos testes.

**Files:**
- Create: `apps/api/src/lib/padroes.ts`
- Create: `apps/api/tests/helpers/barbearia.ts`
- Modify: `apps/api/src/rotas/me.ts`
- Test: `apps/api/tests/rotas/me-patch.test.ts`
- Modify: `apps/api/README.md` (tabela de rotas protegidas)

**Interfaces:**
- Consumes: `prisma` de `@barchop/database`; `request.user.barbeiroId` (populado pelo hook `autenticar`).
- Produces:
  - `src/lib/padroes.ts`: `PADRAO_UUID`, `PADRAO_TELEFONE`, `PADRAO_HORA`, `PADRAO_PRECO` — strings de pattern de JSON Schema.
  - `tests/helpers/barbearia.ts`: `criarBarbeariaComToken(app: App, sufixo?: string): Promise<BarbeariaDeTeste>` onde `BarbeariaDeTeste = { token: string; barbeariaId: string; barbeiroId: string; slug: string }`; e `auth(token: string): { authorization: string }`.
  - `PATCH /me`, respondendo o mesmo formato do `GET /me`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `apps/api/tests/rotas/me-patch.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { prisma } from "@barchop/database";
import { buildApp } from "../../src/app";
import { auth, criarBarbeariaComToken } from "../helpers/barbearia";

describe("PATCH /me", () => {
  it("atualiza nome e telefone do barbeiro do token", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");

    const resposta = await app.inject({
      method: "PATCH",
      url: "/me",
      headers: auth(um.token),
      payload: { nome: "Gustavo Falci", telefone: "11999998888" },
    });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().nome).toBe("Gustavo Falci");
    expect(resposta.json().telefone).toBe("11999998888");

    const noBanco = await prisma.barbeiro.findUniqueOrThrow({
      where: { id: um.barbeiroId },
    });
    expect(noBanco.nome).toBe("Gustavo Falci");

    await app.close();
  });

  it("aceita atualizar um campo só", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");

    const resposta = await app.inject({
      method: "PATCH",
      url: "/me",
      headers: auth(um.token),
      payload: { telefone: "11777776666" },
    });

    expect(resposta.statusCode).toBe(200);
    // O nome veio do signup e não pode ter sido zerado pelo PATCH
    // parcial.
    expect(resposta.json().nome).toBe("Barbeiro um");

    await app.close();
  });

  it("aceita null pra limpar o telefone", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");

    await app.inject({
      method: "PATCH",
      url: "/me",
      headers: auth(um.token),
      payload: { telefone: "11999998888" },
    });

    const resposta = await app.inject({
      method: "PATCH",
      url: "/me",
      headers: auth(um.token),
      payload: { telefone: null },
    });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().telefone).toBeNull();

    await app.close();
  });

  it("recusa corpo vazio com 400", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");

    const resposta = await app.inject({
      method: "PATCH",
      url: "/me",
      headers: auth(um.token),
      payload: {},
    });

    expect(resposta.statusCode).toBe(400);
    expect(resposta.json().erro).toBe("requisicao_invalida");

    await app.close();
  });

  it("recusa campo fora da lista de editáveis com 400", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");

    // Trocar email, senha ou barbeariaId está fora do escopo da tela de
    // Configurações — e barbeariaId por aqui seria trocar de barbearia.
    const resposta = await app.inject({
      method: "PATCH",
      url: "/me",
      headers: auth(um.token),
      payload: { nome: "Gustavo", email: "outro@exemplo.com" },
    });

    expect(resposta.statusCode).toBe(400);

    await app.close();
  });

  it("recusa nome curto demais com 400", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");

    const resposta = await app.inject({
      method: "PATCH",
      url: "/me",
      headers: auth(um.token),
      payload: { nome: "G" },
    });

    expect(resposta.statusCode).toBe(400);

    await app.close();
  });

  it("recusa requisição sem token com 401", async () => {
    const app = buildApp();

    const resposta = await app.inject({
      method: "PATCH",
      url: "/me",
      payload: { nome: "Sem Token" },
    });

    expect(resposta.statusCode).toBe(401);
    expect(resposta.json()).toEqual({ erro: "nao_autenticado" });

    await app.close();
  });

  it("nunca devolve senhaHash", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");

    const resposta = await app.inject({
      method: "PATCH",
      url: "/me",
      headers: auth(um.token),
      payload: { nome: "Gustavo" },
    });

    expect(resposta.body).not.toContain("scrypt$");
    expect(resposta.json()).not.toHaveProperty("senhaHash");

    await app.close();
  });

  it("só mexe no barbeiro do token", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");
    const outra = await criarBarbeariaComToken(app, "outra");

    await app.inject({
      method: "PATCH",
      url: "/me",
      headers: auth(um.token),
      payload: { nome: "Mudou" },
    });

    const intacto = await prisma.barbeiro.findUniqueOrThrow({
      where: { id: outra.barbeiroId },
    });
    expect(intacto.nome).toBe("Barbeiro outra");

    await app.close();
  });
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

```bash
pnpm --filter @barchop/api test tests/rotas/me-patch.test.ts
```

Esperado: FAIL com `Cannot find module '../helpers/barbearia'`.

- [ ] **Step 3: Criar `src/lib/padroes.ts`**

```ts
// Patterns de JSON Schema usados por mais de uma rota. `format: "uuid"`
// dependeria do ajv-formats estar ligado no Fastify; pattern não depende
// de configuração nenhuma — mesmo motivo do PADRAO_EMAIL que já existe
// em rotas/auth.ts.

// Sem isto, um `:id` fora do formato chega no Prisma, o Postgres recusa
// o valor na coluna uuid e vira P2023 — que o tratador traduz pra 400,
// mas depois de uma ida ao banco e com mensagem genérica. Barrar no
// schema é mais barato e diz qual parâmetro está errado.
export const PADRAO_UUID =
  "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$";

// Telefone brasileiro escrito de todo jeito: "11999998888",
// "(11) 99999-8888", "+55 11 99999-8888". A API guarda o que veio; quem
// formata é a tela.
export const PADRAO_TELEFONE = "^[0-9()+\\-\\s]{8,20}$";

// "HH:mm" em 24 horas. Mesmo formato que lib/horas.ts exige.
export const PADRAO_HORA = "^([01]\\d|2[0-3]):([0-5]\\d)$";

// Preço como string decimal, no máximo duas casas — o mesmo formato que
// sai na resposta. Number aqui perderia centavo no caminho.
export const PADRAO_PRECO = "^\\d{1,8}(\\.\\d{1,2})?$";
```

- [ ] **Step 4: Criar o helper de teste**

Criar `apps/api/tests/helpers/barbearia.ts`:

```ts
import type { App } from "../../src/tipos";

export interface BarbeariaDeTeste {
  token: string;
  barbeariaId: string;
  barbeiroId: string;
  slug: string;
}

// Cria uma barbearia com barbeiro e devolve o token pronto. Quase todo
// teste desta fase precisa de duas: a que faz a requisição e uma
// segunda, que existe só pra provar que o recurso dela não é alcançável
// — o 404 cruzado entre barbearias é o ponto da fase inteira.
//
// O `sufixo` entra no slug e no email, então tem que casar com o pattern
// do signup: minúsculas, dígitos e hífen.
export async function criarBarbeariaComToken(
  app: App,
  sufixo = "um"
): Promise<BarbeariaDeTeste> {
  const resposta = await app.inject({
    method: "POST",
    url: "/auth/signup",
    payload: {
      barbearia: { nome: `Barbearia ${sufixo}`, slug: `barbearia-${sufixo}` },
      barbeiro: {
        nome: `Barbeiro ${sufixo}`,
        email: `${sufixo}@exemplo.com`,
        senha: "senha-forte-123",
      },
    },
  });

  // Sem esta guarda, um signup quebrado apareceria como "token
  // undefined" lá adiante, num 401 confuso a três arquivos de distância.
  if (resposta.statusCode !== 201) {
    throw new Error(
      `signup falhou no helper: ${resposta.statusCode} ${resposta.body}`
    );
  }

  const corpo = resposta.json();
  return {
    token: corpo.token,
    barbeariaId: corpo.barbearia.id,
    barbeiroId: corpo.barbeiro.id,
    slug: corpo.barbearia.slug,
  };
}

export function auth(token: string): { authorization: string } {
  return { authorization: `Bearer ${token}` };
}
```

- [ ] **Step 5: Escrever o `PATCH /me`**

Substituir o conteúdo de `apps/api/src/rotas/me.ts` por:

```ts
import { prisma } from "@barchop/database";
import { PADRAO_TELEFONE } from "../lib/padroes";
import type { App } from "../tipos";

// Formato de resposta das duas rotas. Campos listados um a um, nunca
// spread do registro: é o que garante que senhaHash não escape.
function respostaBarbeiro(barbeiro: {
  id: string;
  nome: string;
  email: string | null;
  telefone: string | null;
  barbeariaId: string;
}) {
  return {
    id: barbeiro.id,
    nome: barbeiro.nome,
    email: barbeiro.email,
    telefone: barbeiro.telefone,
    barbeariaId: barbeiro.barbeariaId,
  };
}

// A tela de Configurações edita nome e telefone. Email, senha e
// barbearia ficam fora: trocar email mexe na chave de login, e
// barbeariaId por aqui seria trocar de barbearia no meio do caminho.
// `additionalProperties: false` é o que transforma "fora da lista" em
// 400 em vez de silêncio.
const corpoPatchMe = {
  type: "object",
  additionalProperties: false,
  // Corpo vazio seria um UPDATE sem efeito respondendo 200 — melhor
  // dizer que a requisição não faz sentido.
  minProperties: 1,
  properties: {
    nome: { type: "string", minLength: 2, maxLength: 120 },
    telefone: {
      type: ["string", "null"],
      pattern: PADRAO_TELEFONE,
      maxLength: 20,
    },
  },
} as const;

// Sem `onRequest` aqui: quem autentica é o escopo das rotas protegidas,
// no app.ts. Ver o comentário lá.
export function registrarRotasMe(app: App): void {
  app.get("/me", async (request) => {
    // O id vem do token, nunca da URL ou do corpo — é o que impede um
    // barbeiro de ler o perfil de outro.
    const barbeiro = await prisma.barbeiro.findUniqueOrThrow({
      where: { id: request.user.barbeiroId },
    });

    return respostaBarbeiro(barbeiro);
  });

  app.patch("/me", { schema: { body: corpoPatchMe } }, async (request) => {
    // `request.body` já passou pelo schema com additionalProperties:
    // false, então só carrega os campos editáveis — repassá-lo direto
    // pro `data` não abre caminho pra campo inesperado.
    const barbeiro = await prisma.barbeiro.update({
      where: { id: request.user.barbeiroId },
      data: request.body,
    });

    return respostaBarbeiro(barbeiro);
  });
}
```

- [ ] **Step 6: Rodar o teste e ver passar**

```bash
pnpm --filter @barchop/api test tests/rotas/me-patch.test.ts
pnpm --filter @barchop/api type-check
```

Esperado: PASS, 9 casos.

Se o type-check reclamar do `data: request.body` (o provider de tipo
transforma `type: ["string", "null"]` em `string | null`, que o Prisma
aceita como `NullableStringFieldUpdateOperationsInput`), montar o objeto
campo a campo em vez de repassar:

```ts
    const { nome, telefone } = request.body;
    const barbeiro = await prisma.barbeiro.update({
      where: { id: request.user.barbeiroId },
      data: {
        ...(nome !== undefined ? { nome } : {}),
        ...(telefone !== undefined ? { telefone } : {}),
      },
    });
```

- [ ] **Step 7: Atualizar a tabela de rotas protegidas do README**

Em `apps/api/README.md`, na tabela de rotas protegidas, acrescentar a
linha:

```markdown
| `PATCH` | `/me` | edita nome e telefone do barbeiro do token |
```

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/lib/padroes.ts apps/api/src/rotas/me.ts apps/api/tests/helpers/barbearia.ts apps/api/tests/rotas/me-patch.test.ts apps/api/README.md
git commit -m "feat(api): let a barber edit their own profile"
```

---

## Task 5: `PATCH /barbearias/me`

**Files:**
- Create: `apps/api/src/rotas/barbearias.ts`
- Modify: `apps/api/src/app.ts` (registrar no escopo protegido)
- Test: `apps/api/tests/rotas/barbearias-patch.test.ts`
- Modify: `apps/api/README.md`

**Interfaces:**
- Consumes: `serializarBarbearia` de `src/lib/serializar.ts`; `PADRAO_TELEFONE` de `src/lib/padroes.ts`; `criarBarbeariaComToken`/`auth` de `tests/helpers/barbearia.ts`; `request.user.barbeariaId`.
- Produces: `registrarRotasBarbeariasProtegidas(app: App): void` em `src/rotas/barbearias.ts`. A Task 7 acrescenta `registrarRotasBarbeariasPublicas` no mesmo arquivo.

- [ ] **Step 1: Escrever o teste que falha**

Criar `apps/api/tests/rotas/barbearias-patch.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { prisma } from "@barchop/database";
import { buildApp } from "../../src/app";
import { auth, criarBarbeariaComToken } from "../helpers/barbearia";

describe("PATCH /barbearias/me", () => {
  it("atualiza os dados da barbearia do token", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");

    const resposta = await app.inject({
      method: "PATCH",
      url: "/barbearias/me",
      headers: auth(um.token),
      payload: {
        nome: "Barbearia do Gu",
        telefone: "1133334444",
        endereco: "Rua das Tesouras, 100",
        logoUrl: "https://exemplo.com/logo.png",
      },
    });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual({
      id: um.barbeariaId,
      nome: "Barbearia do Gu",
      slug: "barbearia-um",
      telefone: "1133334444",
      endereco: "Rua das Tesouras, 100",
      logoUrl: "https://exemplo.com/logo.png",
    });

    await app.close();
  });

  it("recusa trocar o slug com 400", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");

    // O slug forma o link público que o barbeiro já mandou no WhatsApp.
    // Trocar está fora do escopo desta fase — e tem que ser 400
    // explícito, não silêncio.
    const resposta = await app.inject({
      method: "PATCH",
      url: "/barbearias/me",
      headers: auth(um.token),
      payload: { slug: "outro-slug" },
    });

    expect(resposta.statusCode).toBe(400);

    await app.close();
  });

  it("recusa barbeariaId no corpo com 400", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");
    const outra = await criarBarbeariaComToken(app, "outra");

    // A regra invariante da spec: rota protegida nunca aceita
    // barbeariaId. Se aceitasse, este corpo editaria a barbearia alheia.
    const resposta = await app.inject({
      method: "PATCH",
      url: "/barbearias/me",
      headers: auth(um.token),
      payload: { nome: "Invadida", barbeariaId: outra.barbeariaId },
    });

    expect(resposta.statusCode).toBe(400);

    const intacta = await prisma.barbearia.findUniqueOrThrow({
      where: { id: outra.barbeariaId },
    });
    expect(intacta.nome).toBe("Barbearia outra");

    await app.close();
  });

  it("recusa corpo vazio com 400", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");

    const resposta = await app.inject({
      method: "PATCH",
      url: "/barbearias/me",
      headers: auth(um.token),
      payload: {},
    });

    expect(resposta.statusCode).toBe(400);

    await app.close();
  });

  it("recusa logoUrl que não é http(s) com 400", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");

    const resposta = await app.inject({
      method: "PATCH",
      url: "/barbearias/me",
      headers: auth(um.token),
      payload: { logoUrl: "javascript:alert(1)" },
    });

    expect(resposta.statusCode).toBe(400);

    await app.close();
  });

  it("recusa requisição sem token com 401", async () => {
    const app = buildApp();

    const resposta = await app.inject({
      method: "PATCH",
      url: "/barbearias/me",
      payload: { nome: "Sem Token" },
    });

    expect(resposta.statusCode).toBe(401);

    await app.close();
  });

  it("não toca na barbearia de outro token", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");
    const outra = await criarBarbeariaComToken(app, "outra");

    await app.inject({
      method: "PATCH",
      url: "/barbearias/me",
      headers: auth(um.token),
      payload: { nome: "Só a minha" },
    });

    const intacta = await prisma.barbearia.findUniqueOrThrow({
      where: { id: outra.barbeariaId },
    });
    expect(intacta.nome).toBe("Barbearia outra");

    await app.close();
  });
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

```bash
pnpm --filter @barchop/api test tests/rotas/barbearias-patch.test.ts
```

Esperado: FAIL — as respostas vêm 404 (`nao_encontrado`), porque a rota
ainda não existe.

- [ ] **Step 3: Criar `src/rotas/barbearias.ts`**

```ts
import { prisma } from "@barchop/database";
import { PADRAO_TELEFONE } from "../lib/padroes";
import { serializarBarbearia } from "../lib/serializar";
import type { App } from "../tipos";

// A tela de Configurações edita estes quatro campos. `slug` fica fora:
// ele forma o link público que o barbeiro já mandou no WhatsApp, e
// trocar quebraria o link — está fora do escopo desta fase. `id` e
// `barbeariaId` também ficam fora, e o additionalProperties: false é o
// que faz um corpo com barbeariaId virar 400 em vez de ser ignorado em
// silêncio.
const corpoPatchBarbearia = {
  type: "object",
  additionalProperties: false,
  minProperties: 1,
  properties: {
    nome: { type: "string", minLength: 2, maxLength: 120 },
    telefone: {
      type: ["string", "null"],
      pattern: PADRAO_TELEFONE,
      maxLength: 20,
    },
    endereco: { type: ["string", "null"], maxLength: 255 },
    // Só http(s): o campo vai direto pro `src` de uma imagem nas telas,
    // e um "javascript:" ali seria XSS servido pela nossa API.
    logoUrl: {
      type: ["string", "null"],
      pattern: "^https?://",
      maxLength: 500,
    },
  },
} as const;

export function registrarRotasBarbeariasProtegidas(app: App): void {
  app.patch(
    "/barbearias/me",
    { schema: { body: corpoPatchBarbearia } },
    async (request) => {
      // O id sai do token. Não existe rota `/barbearias/:id` de escrita:
      // sem id na URL não há o que escopar errado.
      const barbearia = await prisma.barbearia.update({
        where: { id: request.user.barbeariaId },
        data: request.body,
      });

      return serializarBarbearia(barbearia);
    }
  );
}
```

- [ ] **Step 4: Registrar no escopo protegido**

Em `apps/api/src/app.ts`, acrescentar o import

```ts
import { registrarRotasBarbeariasProtegidas } from "./rotas/barbearias";
```

e a chamada dentro do escopo protegido, logo abaixo de
`registrarRotasMe(protegidas);`:

```ts
  app.register(async (protegidas: App) => {
    protegidas.addHook("onRequest", autenticar);
    registrarRotasMe(protegidas);
    registrarRotasBarbeariasProtegidas(protegidas);
  });
```

- [ ] **Step 5: Rodar o teste e ver passar**

```bash
pnpm --filter @barchop/api test tests/rotas/barbearias-patch.test.ts
pnpm --filter @barchop/api type-check
```

Esperado: PASS, 7 casos.

- [ ] **Step 6: Atualizar o README e commitar**

Acrescentar à tabela de rotas protegidas:

```markdown
| `PATCH` | `/barbearias/me` | edita nome, telefone, endereço e logo da barbearia do token |
```

```bash
git add apps/api/src/rotas/barbearias.ts apps/api/src/app.ts apps/api/tests/rotas/barbearias-patch.test.ts apps/api/README.md
git commit -m "feat(api): let a barber edit their own barbershop"
```

---

## Task 6: `GET` e `PUT /barbearias/me/horarios`

Primeira rota que escreve coluna `@db.Time`. É onde a camada de tempo
sai do teste unitário e encosta no banco de verdade — por isso um dos
casos lê a coluna com `$queryRaw` e confere que o Postgres guardou
`09:00`, e não `12:00`.

**Files:**
- Create: `apps/api/src/rotas/horarios.ts`
- Modify: `apps/api/src/app.ts`
- Test: `apps/api/tests/rotas/horarios.test.ts`
- Modify: `apps/api/README.md`

**Interfaces:**
- Consumes: `horaParaDate` de `src/lib/horas.ts`; `serializarHorario` e `HorarioSerializado` de `src/lib/serializar.ts`; `PADRAO_HORA` de `src/lib/padroes.ts`; `ErroDeNegocio` de `src/lib/erro-negocio.ts`; `criarBarbeariaComToken`/`auth` dos helpers.
- Produces: `registrarRotasHorarios(app: App): void` e `completarSemana(linhas): HorarioSerializado[]` — esta última exportada porque a Task 7 precisa dos mesmos 7 dias no perfil público.

- [ ] **Step 1: Escrever o teste que falha**

Criar `apps/api/tests/rotas/horarios.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { prisma } from "@barchop/database";
import { buildApp } from "../../src/app";
import { auth, criarBarbeariaComToken } from "../helpers/barbearia";

const SEMANA_UTIL = {
  horarios: [
    { diaSemana: 1, horaAbertura: "09:00", horaFechamento: "18:00" },
    { diaSemana: 2, horaAbertura: "09:00", horaFechamento: "18:00" },
    { diaSemana: 3, horaAbertura: "09:00", horaFechamento: "18:00" },
    { diaSemana: 4, horaAbertura: "09:00", horaFechamento: "18:00" },
    { diaSemana: 5, horaAbertura: "09:00", horaFechamento: "20:00" },
    { diaSemana: 6, horaAbertura: "08:00", horaFechamento: "14:00" },
  ],
};

describe("PUT /barbearias/me/horarios", () => {
  it("grava os sete dias e devolve todos", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");

    const resposta = await app.inject({
      method: "PUT",
      url: "/barbearias/me/horarios",
      headers: auth(um.token),
      payload: SEMANA_UTIL,
    });

    expect(resposta.statusCode).toBe(200);

    const { horarios } = resposta.json();
    expect(horarios).toHaveLength(7);
    // Ordem fixa 0..6: a tela de Configurações desenha a semana em
    // sequência e não deveria ter que ordenar.
    expect(horarios.map((h: { diaSemana: number }) => h.diaSemana)).toEqual([
      0, 1, 2, 3, 4, 5, 6,
    ]);
    expect(horarios[1]).toEqual({
      diaSemana: 1,
      horaAbertura: "09:00",
      horaFechamento: "18:00",
      fechado: false,
    });

    await app.close();
  });

  it("trata dia ausente do corpo como fechado", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");

    const resposta = await app.inject({
      method: "PUT",
      url: "/barbearias/me/horarios",
      headers: auth(um.token),
      payload: SEMANA_UTIL,
    });

    // Domingo (0) não veio no corpo. Sem essa regra, "não tem linha pra
    // domingo" e "domingo está fechado" seriam estados diferentes, e o
    // cálculo de disponibilidade teria que adivinhar qual é qual.
    expect(resposta.json().horarios[0]).toEqual({
      diaSemana: 0,
      horaAbertura: null,
      horaFechamento: null,
      fechado: true,
    });

    await app.close();
  });

  it("fechado: true ganha das horas mandadas junto", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");

    const resposta = await app.inject({
      method: "PUT",
      url: "/barbearias/me/horarios",
      headers: auth(um.token),
      payload: {
        horarios: [
          {
            diaSemana: 1,
            horaAbertura: "09:00",
            horaFechamento: "18:00",
            fechado: true,
          },
        ],
      },
    });

    // Corpo contraditório: a tela manda o dia marcado como fechado mas
    // deixa no formulário as horas que estavam lá antes. `fechado` é a
    // intenção explícita, então ele decide — e as horas viram null, em
    // vez de ficarem gravadas num dia que ninguém vai atender.
    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().horarios[1]).toEqual({
      diaSemana: 1,
      horaAbertura: null,
      horaFechamento: null,
      fechado: true,
    });

    await app.close();
  });

  it("guarda a hora no fuso certo na coluna @db.Time", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");

    await app.inject({
      method: "PUT",
      url: "/barbearias/me/horarios",
      headers: auth(um.token),
      payload: SEMANA_UTIL,
    });

    // O Prisma grava a porção UTC da Date. Numa máquina em
    // America/Sao_Paulo, um `new Date("1970-01-01T09:00:00")` viraria
    // 12:00 na coluna, sem erro nenhum — e corromperia junto a coluna
    // `periodo` do agendamento, de onde sai a trava de conflito. Ler a
    // coluna crua é a única forma de provar que isso não acontece.
    const linhas = await prisma.$queryRaw<{ abertura: string }[]>`
      SELECT to_char(hora_abertura, 'HH24:MI') AS abertura
      FROM horario_funcionamento
      WHERE barbearia_id = ${um.barbeariaId}::uuid AND dia_semana = 1
    `;

    expect(linhas[0].abertura).toBe("09:00");

    await app.close();
  });

  it("é idempotente: o mesmo PUT duas vezes não duplica linha", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");

    await app.inject({
      method: "PUT",
      url: "/barbearias/me/horarios",
      headers: auth(um.token),
      payload: SEMANA_UTIL,
    });
    const segunda = await app.inject({
      method: "PUT",
      url: "/barbearias/me/horarios",
      headers: auth(um.token),
      payload: SEMANA_UTIL,
    });

    expect(segunda.statusCode).toBe(200);
    expect(
      await prisma.horarioFuncionamento.count({
        where: { barbeariaId: um.barbeariaId },
      })
    ).toBe(7);

    await app.close();
  });

  it("recusa dia aberto sem horas com 422", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");

    const resposta = await app.inject({
      method: "PUT",
      url: "/barbearias/me/horarios",
      headers: auth(um.token),
      payload: { horarios: [{ diaSemana: 1, fechado: false }] },
    });

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json().erro).toBe("horario_incompleto");

    await app.close();
  });

  it("recusa abertura depois do fechamento com 422", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");

    const resposta = await app.inject({
      method: "PUT",
      url: "/barbearias/me/horarios",
      headers: auth(um.token),
      payload: {
        horarios: [
          { diaSemana: 1, horaAbertura: "18:00", horaFechamento: "09:00" },
        ],
      },
    });

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json().erro).toBe("intervalo_invalido");

    await app.close();
  });

  it("recusa o mesmo dia duas vezes com 422", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");

    const resposta = await app.inject({
      method: "PUT",
      url: "/barbearias/me/horarios",
      headers: auth(um.token),
      payload: {
        horarios: [
          { diaSemana: 1, horaAbertura: "09:00", horaFechamento: "18:00" },
          { diaSemana: 1, horaAbertura: "10:00", horaFechamento: "19:00" },
        ],
      },
    });

    // Sem esta checagem o upsert rodaria duas vezes no mesmo dia e a
    // última linha ganharia em silêncio — o barbeiro veria um horário
    // que não escolheu.
    expect(resposta.statusCode).toBe(422);
    expect(resposta.json().erro).toBe("dia_semana_duplicado");

    await app.close();
  });

  it("recusa hora fora do formato HH:mm com 400", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");

    const resposta = await app.inject({
      method: "PUT",
      url: "/barbearias/me/horarios",
      headers: auth(um.token),
      payload: {
        horarios: [
          { diaSemana: 1, horaAbertura: "9h", horaFechamento: "18:00" },
        ],
      },
    });

    expect(resposta.statusCode).toBe(400);

    await app.close();
  });

  it("não grava nada quando um dos dias é inválido", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");

    await app.inject({
      method: "PUT",
      url: "/barbearias/me/horarios",
      headers: auth(um.token),
      payload: {
        horarios: [
          { diaSemana: 1, horaAbertura: "09:00", horaFechamento: "18:00" },
          { diaSemana: 2, horaAbertura: "18:00", horaFechamento: "09:00" },
        ],
      },
    });

    // Meia semana gravada é pior que requisição recusada: o cálculo de
    // disponibilidade leria um estado que o barbeiro nunca pediu.
    expect(
      await prisma.horarioFuncionamento.count({
        where: { barbeariaId: um.barbeariaId },
      })
    ).toBe(0);

    await app.close();
  });

  it("recusa requisição sem token com 401", async () => {
    const app = buildApp();

    const resposta = await app.inject({
      method: "PUT",
      url: "/barbearias/me/horarios",
      payload: SEMANA_UTIL,
    });

    expect(resposta.statusCode).toBe(401);

    await app.close();
  });

  it("não mexe nos horários de outra barbearia", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");
    const outra = await criarBarbeariaComToken(app, "outra");

    await app.inject({
      method: "PUT",
      url: "/barbearias/me/horarios",
      headers: auth(um.token),
      payload: SEMANA_UTIL,
    });

    expect(
      await prisma.horarioFuncionamento.count({
        where: { barbeariaId: outra.barbeariaId },
      })
    ).toBe(0);

    await app.close();
  });
});

describe("GET /barbearias/me/horarios", () => {
  it("devolve os sete dias mesmo sem nada gravado", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");

    const resposta = await app.inject({
      method: "GET",
      url: "/barbearias/me/horarios",
      headers: auth(um.token),
    });

    expect(resposta.statusCode).toBe(200);

    const { horarios } = resposta.json();
    expect(horarios).toHaveLength(7);
    expect(horarios.every((h: { fechado: boolean }) => h.fechado)).toBe(true);

    await app.close();
  });

  it("devolve o que o PUT gravou", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");

    await app.inject({
      method: "PUT",
      url: "/barbearias/me/horarios",
      headers: auth(um.token),
      payload: SEMANA_UTIL,
    });

    const resposta = await app.inject({
      method: "GET",
      url: "/barbearias/me/horarios",
      headers: auth(um.token),
    });

    expect(resposta.json().horarios[5]).toEqual({
      diaSemana: 5,
      horaAbertura: "09:00",
      horaFechamento: "20:00",
      fechado: false,
    });

    await app.close();
  });

  it("não enxerga os horários de outra barbearia", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");
    const outra = await criarBarbeariaComToken(app, "outra");

    await app.inject({
      method: "PUT",
      url: "/barbearias/me/horarios",
      headers: auth(um.token),
      payload: SEMANA_UTIL,
    });

    const resposta = await app.inject({
      method: "GET",
      url: "/barbearias/me/horarios",
      headers: auth(outra.token),
    });

    expect(
      resposta.json().horarios.every((h: { fechado: boolean }) => h.fechado)
    ).toBe(true);

    await app.close();
  });

  it("recusa requisição sem token com 401", async () => {
    const app = buildApp();

    const resposta = await app.inject({
      method: "GET",
      url: "/barbearias/me/horarios",
    });

    expect(resposta.statusCode).toBe(401);

    await app.close();
  });
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

```bash
pnpm --filter @barchop/api test tests/rotas/horarios.test.ts
```

Esperado: FAIL — 404 em todas as rotas, que ainda não existem.

- [ ] **Step 3: Criar `src/rotas/horarios.ts`**

```ts
import { prisma } from "@barchop/database";
import { ErroDeNegocio } from "../lib/erro-negocio";
import { horaParaDate } from "../lib/horas";
import { PADRAO_HORA } from "../lib/padroes";
import { serializarHorario, type HorarioSerializado } from "../lib/serializar";
import type { App } from "../tipos";

// Domingo a sábado, na mesma ordem que a tela desenha.
const DIAS_DA_SEMANA = [0, 1, 2, 3, 4, 5, 6];

// O PUT grava sempre os 7 dias: dia ausente do corpo vira fechado. Sem
// isso, "não existe linha pra terça" e "terça está fechada" seriam
// estados diferentes no banco, e o cálculo de disponibilidade teria que
// escolher um significado — o tipo de ambiguidade que vira bug meses
// depois.
const corpoPutHorarios = {
  type: "object",
  additionalProperties: false,
  required: ["horarios"],
  properties: {
    horarios: {
      type: "array",
      maxItems: 7,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["diaSemana"],
        properties: {
          diaSemana: { type: "integer", minimum: 0, maximum: 6 },
          horaAbertura: { type: ["string", "null"], pattern: PADRAO_HORA },
          horaFechamento: { type: ["string", "null"], pattern: PADRAO_HORA },
          fechado: { type: "boolean" },
        },
      },
    },
  },
} as const;

// Completa o que o banco não tem: barbearia recém-criada não tem linha
// nenhuma, e a tela ainda precisa dos 7 dias pra desenhar a semana. A
// Task 7 usa a mesma função no perfil público.
export function completarSemana(
  linhas: {
    diaSemana: number;
    horaAbertura: Date | null;
    horaFechamento: Date | null;
    fechado: boolean;
  }[]
): HorarioSerializado[] {
  const porDia = new Map(linhas.map((linha) => [linha.diaSemana, linha]));

  return DIAS_DA_SEMANA.map((diaSemana) => {
    const linha = porDia.get(diaSemana);
    return linha
      ? serializarHorario(linha)
      : { diaSemana, horaAbertura: null, horaFechamento: null, fechado: true };
  });
}

export function registrarRotasHorarios(app: App): void {
  app.get("/barbearias/me/horarios", async (request) => {
    const linhas = await prisma.horarioFuncionamento.findMany({
      where: { barbeariaId: request.user.barbeariaId },
    });

    return { horarios: completarSemana(linhas) };
  });

  app.put(
    "/barbearias/me/horarios",
    { schema: { body: corpoPutHorarios } },
    async (request) => {
      const barbeariaId = request.user.barbeariaId;

      const enviados = new Map<number, (typeof request.body.horarios)[number]>();
      for (const horario of request.body.horarios) {
        // Sem esta checagem o upsert rodaria duas vezes no mesmo dia e a
        // última linha ganharia em silêncio.
        if (enviados.has(horario.diaSemana)) {
          throw new ErroDeNegocio(
            `o dia ${horario.diaSemana} aparece mais de uma vez`,
            "dia_semana_duplicado"
          );
        }
        enviados.set(horario.diaSemana, horario);
      }

      // A validação inteira acontece antes de qualquer escrita: um dia
      // inválido no meio da lista não pode deixar meia semana gravada.
      const linhas = DIAS_DA_SEMANA.map((diaSemana) => {
        const enviado = enviados.get(diaSemana);

        // Duas entradas caem aqui: dia ausente do corpo, e dia marcado
        // como fechado. `fechado: true` ganha das horas mandadas junto —
        // é a intenção explícita, e a tela costuma mandar as horas
        // antigas no formulário mesmo depois de marcar o dia como
        // fechado. As horas viram null em vez de ficarem gravadas num
        // dia que ninguém vai atender.
        if (!enviado || enviado.fechado) {
          return {
            diaSemana,
            horaAbertura: null,
            horaFechamento: null,
            fechado: true,
          };
        }

        const { horaAbertura, horaFechamento } = enviado;

        if (!horaAbertura || !horaFechamento) {
          throw new ErroDeNegocio(
            `o dia ${diaSemana} está aberto sem hora de abertura e de fechamento`,
            "horario_incompleto"
          );
        }

        // "HH:mm" com zero à esquerda compara lexicograficamente na
        // mesma ordem que cronologicamente — "09:00" < "18:00".
        if (horaAbertura >= horaFechamento) {
          throw new ErroDeNegocio(
            `no dia ${diaSemana} a abertura precisa ser antes do fechamento`,
            "intervalo_invalido"
          );
        }

        return {
          diaSemana,
          // horaParaDate e nada de `new Date(...)`: é o que impede o
          // fuso da máquina de entrar na coluna.
          horaAbertura: horaParaDate(horaAbertura),
          horaFechamento: horaParaDate(horaFechamento),
          fechado: false,
        };
      });

      // Transação: grava os sete ou nenhum.
      const gravados = await prisma.$transaction(
        linhas.map((linha) =>
          prisma.horarioFuncionamento.upsert({
            where: {
              barbeariaId_diaSemana: { barbeariaId, diaSemana: linha.diaSemana },
            },
            create: { barbeariaId, ...linha },
            update: {
              horaAbertura: linha.horaAbertura,
              horaFechamento: linha.horaFechamento,
              fechado: linha.fechado,
            },
          })
        )
      );

      return { horarios: completarSemana(gravados) };
    }
  );
}
```

- [ ] **Step 4: Registrar no escopo protegido**

Em `apps/api/src/app.ts`, acrescentar o import

```ts
import { registrarRotasHorarios } from "./rotas/horarios";
```

e a chamada dentro do escopo protegido:

```ts
  app.register(async (protegidas: App) => {
    protegidas.addHook("onRequest", autenticar);
    registrarRotasMe(protegidas);
    registrarRotasBarbeariasProtegidas(protegidas);
    registrarRotasHorarios(protegidas);
  });
```

- [ ] **Step 5: Rodar o teste e ver passar**

```bash
pnpm --filter @barchop/api test tests/rotas/horarios.test.ts
pnpm --filter @barchop/api type-check
```

Esperado: PASS, 16 casos (12 no `describe` do `PUT`, 4 no do `GET`).

- [ ] **Step 6: Atualizar o README e commitar**

Acrescentar à tabela de rotas protegidas:

```markdown
| `GET` | `/barbearias/me/horarios` | os 7 dias da semana, mesmo os não gravados |
| `PUT` | `/barbearias/me/horarios` | grava a semana inteira; dia ausente vira fechado |
```

```bash
git add apps/api/src/rotas/horarios.ts apps/api/src/app.ts apps/api/tests/rotas/horarios.test.ts apps/api/README.md
git commit -m "feat(api): store the weekly opening hours in one shot"
```

---

## Task 7: `GET /barbearias/:slug` (perfil público)

Ponto de entrada do link que o barbeiro manda no WhatsApp — a landing
pública, primeira das 7 telas do fluxo do cliente. Rota **pública**: fica
fora do escopo protegido do `app.ts`, e escopa pelo `:slug`.

**Files:**
- Modify: `apps/api/src/rotas/barbearias.ts`
- Modify: `apps/api/src/app.ts`
- Test: `apps/api/tests/rotas/barbearias-publica.test.ts`
- Modify: `apps/api/README.md`

**Interfaces:**
- Consumes: `serializarBarbearia` de `src/lib/serializar.ts`; `completarSemana` de `src/rotas/horarios.ts`.
- Produces: `registrarRotasBarbeariasPublicas(app: App): void` em `src/rotas/barbearias.ts`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `apps/api/tests/rotas/barbearias-publica.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildApp } from "../../src/app";
import { auth, criarBarbeariaComToken } from "../helpers/barbearia";

describe("GET /barbearias/:slug", () => {
  it("devolve o perfil e os sete dias de horário, sem token", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");

    await app.inject({
      method: "PATCH",
      url: "/barbearias/me",
      headers: auth(um.token),
      payload: { telefone: "1133334444", endereco: "Rua das Tesouras, 100" },
    });
    await app.inject({
      method: "PUT",
      url: "/barbearias/me/horarios",
      headers: auth(um.token),
      payload: {
        horarios: [
          { diaSemana: 1, horaAbertura: "09:00", horaFechamento: "18:00" },
        ],
      },
    });

    // Sem cabeçalho de autorização: é o cliente chegando pelo link do
    // WhatsApp, sem conta nenhuma.
    const resposta = await app.inject({
      method: "GET",
      url: "/barbearias/barbearia-um",
    });

    expect(resposta.statusCode).toBe(200);

    const corpo = resposta.json();
    expect(corpo.nome).toBe("Barbearia um");
    expect(corpo.slug).toBe("barbearia-um");
    expect(corpo.telefone).toBe("1133334444");
    expect(corpo.endereco).toBe("Rua das Tesouras, 100");
    expect(corpo.horarios).toHaveLength(7);
    expect(corpo.horarios[1]).toEqual({
      diaSemana: 1,
      horaAbertura: "09:00",
      horaFechamento: "18:00",
      fechado: false,
    });
    expect(corpo.horarios[0].fechado).toBe(true);

    await app.close();
  });

  it("devolve 404 pra slug que não existe", async () => {
    const app = buildApp();

    const resposta = await app.inject({
      method: "GET",
      url: "/barbearias/nao-existe",
    });

    expect(resposta.statusCode).toBe(404);
    expect(resposta.json().erro).toBe("nao_encontrado");

    await app.close();
  });

  it("recusa slug fora do formato com 400", async () => {
    const app = buildApp();

    const resposta = await app.inject({
      method: "GET",
      url: "/barbearias/SLUG_INVALIDO",
    });

    expect(resposta.statusCode).toBe(400);

    await app.close();
  });

  it("não vaza barbeiro, email nem senhaHash", async () => {
    const app = buildApp();
    await criarBarbeariaComToken(app, "um");

    const resposta = await app.inject({
      method: "GET",
      url: "/barbearias/barbearia-um",
    });

    // A landing é pública: qualquer um com o link lê. O que sai aqui é
    // só o que o barbeiro quer mostrar pro cliente.
    expect(resposta.body).not.toContain("scrypt$");
    expect(resposta.body).not.toContain("um@exemplo.com");
    expect(resposta.json()).not.toHaveProperty("barbeiros");

    await app.close();
  });
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

```bash
pnpm --filter @barchop/api test tests/rotas/barbearias-publica.test.ts
```

Esperado: FAIL — o primeiro caso responde 404, porque só existe
`/barbearias/me`.

- [ ] **Step 3: Acrescentar a rota pública**

Em `apps/api/src/rotas/barbearias.ts`, acrescentar ao topo o import

```ts
import { completarSemana } from "./horarios";
```

e, no fim do arquivo, a função de registro:

```ts
// Mesmo pattern do slug no signup: é ele que forma o link público, e um
// slug fora do formato não chega nem a consultar o banco.
const paramsSlug = {
  type: "object",
  required: ["slug"],
  additionalProperties: false,
  properties: { slug: { type: "string", pattern: "^[a-z0-9-]{3,80}$" } },
} as const;

// Pública de propósito: é a landing que o cliente abre pelo link do
// WhatsApp, sem conta nenhuma. Fica fora do escopo protegido do app.ts.
export function registrarRotasBarbeariasPublicas(app: App): void {
  app.get(
    "/barbearias/:slug",
    { schema: { params: paramsSlug } },
    async (request) => {
      // findUniqueOrThrow: slug inexistente vira P2025, que o tratador
      // central traduz pra 404.
      const barbearia = await prisma.barbearia.findUniqueOrThrow({
        where: { slug: request.params.slug },
        include: { horariosFuncionamento: true },
      });

      // Campos escolhidos pelo serializador: um spread traria os
      // barbeiros e o senhaHash junto.
      return {
        ...serializarBarbearia(barbearia),
        horarios: completarSemana(barbearia.horariosFuncionamento),
      };
    }
  );
}
```

- [ ] **Step 4: Registrar fora do escopo protegido**

Em `apps/api/src/app.ts`, trocar o import de `./rotas/barbearias` por

```ts
import {
  registrarRotasBarbeariasProtegidas,
  registrarRotasBarbeariasPublicas,
} from "./rotas/barbearias";
```

e chamar a pública **antes** do bloco `app.register(async (protegidas...`,
junto das outras rotas abertas:

```ts
  registrarAuth(app);
  registrarRotasAuth(app);
  registrarRotasBarbeariasPublicas(app);
```

A ordem importa menos que o lugar: dentro do escopo protegido ela
herdaria o hook `autenticar` e passaria a exigir token — e o cliente que
abre o link do WhatsApp não tem nenhum.

- [ ] **Step 5: Rodar o teste e ver passar**

```bash
pnpm --filter @barchop/api test tests/rotas/barbearias-publica.test.ts
pnpm --filter @barchop/api type-check
```

Esperado: PASS, 4 casos.

- [ ] **Step 6: Atualizar o README e commitar**

Acrescentar à tabela de rotas públicas:

```markdown
| `GET` | `/barbearias/:slug` | perfil público + horários de funcionamento |
```

```bash
git add apps/api/src/rotas/barbearias.ts apps/api/src/app.ts apps/api/tests/rotas/barbearias-publica.test.ts apps/api/README.md
git commit -m "feat(api): serve the public barbershop profile"
```

---

## Task 8: `GET` e `POST /servicos`, e a listagem pública mudando de casa

A listagem pública `GET /barbearias/:slug/servicos` está hoje inline no
`app.ts`, devolvendo o registro cru do Prisma — ou seja, com o preço
saindo como `{}`. Ela vem junto nesta task porque compartilha o
serializador com a listagem do barbeiro, e porque o `app.ts` deve ficar
só com montagem.

**Contrato que muda:** a listagem pública passa a devolver
`{ servicos: [...] }` em vez de um array cru, alinhada com as outras
rotas de lista. Nenhuma tela consome ainda — `apps/web` e `apps/mobile`
são scaffolds.

**Files:**
- Create: `apps/api/src/rotas/servicos.ts`
- Modify: `apps/api/src/app.ts` (tirar a rota inline, registrar as duas novas)
- Test: `apps/api/tests/rotas/servicos.test.ts`
- Modify: `apps/api/README.md`

**Interfaces:**
- Consumes: `serializarServico` de `src/lib/serializar.ts`; `PADRAO_PRECO` de `src/lib/padroes.ts`; helpers de teste.
- Produces: `registrarRotasServicos(app: App): void` (protegidas) e `registrarRotasServicosPublicas(app: App): void`, ambas em `src/rotas/servicos.ts`. A Task 9 acrescenta `PATCH` e `DELETE` na primeira.

- [ ] **Step 1: Escrever o teste que falha**

Criar `apps/api/tests/rotas/servicos.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildApp } from "../../src/app";
import { auth, criarBarbeariaComToken } from "../helpers/barbearia";

const CORTE = { nome: "Corte", duracaoMinutos: 45, preco: "45.00" };

describe("POST /servicos", () => {
  it("cria o serviço na barbearia do token", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");

    const resposta = await app.inject({
      method: "POST",
      url: "/servicos",
      headers: auth(um.token),
      payload: CORTE,
    });

    expect(resposta.statusCode).toBe(201);

    const corpo = resposta.json();
    expect(corpo.nome).toBe("Corte");
    expect(corpo.duracaoMinutos).toBe(45);
    // String, não number: o Decimal do Prisma viraria `{}` no JSON, e
    // float perderia centavo.
    expect(corpo.preco).toBe("45.00");
    expect(corpo.ativo).toBe(true);
    expect(typeof corpo.id).toBe("string");

    await app.close();
  });

  it("completa a segunda casa do preço", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");

    const resposta = await app.inject({
      method: "POST",
      url: "/servicos",
      headers: auth(um.token),
      payload: { nome: "Barba", duracaoMinutos: 20, preco: "30.5" },
    });

    expect(resposta.json().preco).toBe("30.50");

    await app.close();
  });

  it("recusa preço como número com 400", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");

    const resposta = await app.inject({
      method: "POST",
      url: "/servicos",
      headers: auth(um.token),
      payload: { ...CORTE, preco: 45 },
    });

    expect(resposta.statusCode).toBe(400);

    await app.close();
  });

  it("recusa duração fora da faixa com 400", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");

    const zerada = await app.inject({
      method: "POST",
      url: "/servicos",
      headers: auth(um.token),
      payload: { ...CORTE, duracaoMinutos: 0 },
    });
    expect(zerada.statusCode).toBe(400);

    // Duração que passa o dia inteiro corromperia o hora_fim do
    // agendamento na fase 4.
    const gigante = await app.inject({
      method: "POST",
      url: "/servicos",
      headers: auth(um.token),
      payload: { ...CORTE, duracaoMinutos: 2000 },
    });
    expect(gigante.statusCode).toBe(400);

    await app.close();
  });

  it("recusa barbeariaId no corpo com 400", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");
    const outra = await criarBarbeariaComToken(app, "outra");

    const resposta = await app.inject({
      method: "POST",
      url: "/servicos",
      headers: auth(um.token),
      payload: { ...CORTE, barbeariaId: outra.barbeariaId },
    });

    expect(resposta.statusCode).toBe(400);

    await app.close();
  });

  it("recusa requisição sem token com 401", async () => {
    const app = buildApp();

    const resposta = await app.inject({
      method: "POST",
      url: "/servicos",
      payload: CORTE,
    });

    expect(resposta.statusCode).toBe(401);

    await app.close();
  });
});

describe("GET /servicos", () => {
  it("lista só os serviços da barbearia do token", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");
    const outra = await criarBarbeariaComToken(app, "outra");

    await app.inject({
      method: "POST",
      url: "/servicos",
      headers: auth(um.token),
      payload: CORTE,
    });
    await app.inject({
      method: "POST",
      url: "/servicos",
      headers: auth(outra.token),
      payload: { nome: "Serviço da outra", duracaoMinutos: 30, preco: "20.00" },
    });

    const resposta = await app.inject({
      method: "GET",
      url: "/servicos",
      headers: auth(um.token),
    });

    expect(resposta.statusCode).toBe(200);

    const { servicos } = resposta.json();
    expect(servicos).toHaveLength(1);
    expect(servicos[0].nome).toBe("Corte");

    await app.close();
  });

  it("devolve lista vazia pra barbearia sem serviço", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");

    const resposta = await app.inject({
      method: "GET",
      url: "/servicos",
      headers: auth(um.token),
    });

    expect(resposta.json()).toEqual({ servicos: [] });

    await app.close();
  });

  it("recusa requisição sem token com 401", async () => {
    const app = buildApp();

    const resposta = await app.inject({ method: "GET", url: "/servicos" });

    expect(resposta.statusCode).toBe(401);

    await app.close();
  });
});

describe("GET /barbearias/:slug/servicos", () => {
  it("lista os ativos da barbearia do slug, com o preço serializado", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");

    await app.inject({
      method: "POST",
      url: "/servicos",
      headers: auth(um.token),
      payload: CORTE,
    });

    // Sem token: é o cliente escolhendo os serviços pelo link público.
    const resposta = await app.inject({
      method: "GET",
      url: "/barbearias/barbearia-um/servicos",
    });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().servicos[0]).toMatchObject({
      nome: "Corte",
      duracaoMinutos: 45,
      preco: "45.00",
    });

    await app.close();
  });

  it("devolve 404 pra slug que não existe", async () => {
    const app = buildApp();

    const resposta = await app.inject({
      method: "GET",
      url: "/barbearias/nao-existe/servicos",
    });

    expect(resposta.statusCode).toBe(404);
    expect(resposta.json().erro).toBe("nao_encontrado");

    await app.close();
  });
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

```bash
pnpm --filter @barchop/api test tests/rotas/servicos.test.ts
```

Esperado: FAIL — 404 nas rotas `/servicos`, e a listagem pública
devolvendo array cru em vez de `{ servicos }`.

- [ ] **Step 3: Criar `src/rotas/servicos.ts`**

```ts
import { prisma } from "@barchop/database";
import { PADRAO_PRECO } from "../lib/padroes";
import { serializarServico } from "../lib/serializar";
import type { App } from "../tipos";

// Preço entra como string pelo mesmo motivo que sai como string: number
// aqui passaria por float e perderia centavo. O Prisma aceita string
// direto numa coluna Decimal.
//
// A duração tem teto: um serviço de 2000 minutos faria o hora_fim do
// agendamento passar da meia-noite na fase 4, e `somarMinutos` recusa —
// mas aí já seria erro 500 no meio de um POST de agendamento. Melhor
// barrar no cadastro. O `multipleOf: 5` mantém o cadastro alinhado com a
// grade de horários sugeridos.
const corpoNovoServico = {
  type: "object",
  additionalProperties: false,
  required: ["nome", "duracaoMinutos", "preco"],
  properties: {
    nome: { type: "string", minLength: 2, maxLength: 120 },
    duracaoMinutos: {
      type: "integer",
      minimum: 5,
      maximum: 480,
      multipleOf: 5,
    },
    preco: { type: "string", pattern: PADRAO_PRECO },
  },
} as const;

const paramsSlug = {
  type: "object",
  required: ["slug"],
  additionalProperties: false,
  properties: { slug: { type: "string", pattern: "^[a-z0-9-]{3,80}$" } },
} as const;

export function registrarRotasServicos(app: App): void {
  app.get("/servicos", async (request) => {
    // A lista do barbeiro inclui os inativos: é dela que sai a tela de
    // Serviços, onde ele reativa o que desativou. A pública não.
    const servicos = await prisma.servico.findMany({
      where: { barbeariaId: request.user.barbeariaId },
      orderBy: [{ ativo: "desc" }, { nome: "asc" }],
    });

    return { servicos: servicos.map(serializarServico) };
  });

  app.post(
    "/servicos",
    { schema: { body: corpoNovoServico } },
    async (request, reply) => {
      const servico = await prisma.servico.create({
        // barbeariaId do token, sempre. O corpo não tem como mandar o
        // dele: additionalProperties: false recusa antes.
        data: { barbeariaId: request.user.barbeariaId, ...request.body },
      });

      return reply.code(201).send(serializarServico(servico));
    }
  );
}

// Primeira tela do fluxo do cliente depois da landing: a escolha dos
// serviços, com a soma de duração em tempo real. Sem token.
export function registrarRotasServicosPublicas(app: App): void {
  app.get(
    "/barbearias/:slug/servicos",
    { schema: { params: paramsSlug } },
    async (request) => {
      const barbearia = await prisma.barbearia.findUniqueOrThrow({
        where: { slug: request.params.slug },
      });

      const servicos = await prisma.servico.findMany({
        where: { barbeariaId: barbearia.id, ativo: true },
        orderBy: { nome: "asc" },
      });

      return { servicos: servicos.map(serializarServico) };
    }
  );
}
```

- [ ] **Step 4: Tirar a rota inline do `app.ts` e registrar as novas**

Em `apps/api/src/app.ts`:

1. Apagar o bloco inteiro da rota `app.get("/barbearias/:slug/servicos", ...)`
   e o comentário `// Exemplo real usando o Prisma — ...` acima dela.
2. Acrescentar o import:

```ts
import {
  registrarRotasServicos,
  registrarRotasServicosPublicas,
} from "./rotas/servicos";
```

3. Chamar a pública junto das outras abertas e a protegida dentro do
   escopo:

```ts
  registrarAuth(app);
  registrarRotasAuth(app);
  registrarRotasBarbeariasPublicas(app);
  registrarRotasServicosPublicas(app);

  app.register(async (protegidas: App) => {
    protegidas.addHook("onRequest", autenticar);
    registrarRotasMe(protegidas);
    registrarRotasBarbeariasProtegidas(protegidas);
    registrarRotasHorarios(protegidas);
    registrarRotasServicos(protegidas);
  });
```

4. Se o import de `prisma` no `app.ts` ficar sem uso depois de tirar a
   rota, remover o import — o `type-check` acusa.

- [ ] **Step 5: Rodar a suíte inteira**

```bash
pnpm --filter @barchop/api test
pnpm --filter @barchop/api type-check
```

Esperado: PASS. O caso `traduz P2025 do Prisma pra 404` em
`tests/erros.test.ts` continua valendo — ele chama
`/barbearias/nao-existe/servicos`, que agora mora em `rotas/servicos.ts`
e continua usando `findUniqueOrThrow`.

- [ ] **Step 6: Atualizar o README e commitar**

Na tabela de rotas públicas, trocar a linha de
`/barbearias/:slug/servicos` por:

```markdown
| `GET` | `/barbearias/:slug/servicos` | serviços ativos da barbearia, `{ servicos: [...] }` |
```

E acrescentar às protegidas:

```markdown
| `GET` | `/servicos` | serviços da barbearia do token, inclusive os inativos |
| `POST` | `/servicos` | cria serviço; `preco` é string (`"45.00"`) |
```

```bash
git add apps/api/src/rotas/servicos.ts apps/api/src/app.ts apps/api/tests/rotas/servicos.test.ts apps/api/README.md
git commit -m "feat(api): add service listing and creation for a barbershop"
```

---

## Task 9: `PATCH` e `DELETE /servicos/:id`

As duas primeiras rotas com id na URL — e é aqui que o escopo por token
para de ser detalhe. O `barbeariaId` entra no **mesmo `where`** da
escrita: o Prisma aceita campo não-único junto do `id` no `where` de
`update` (extended where unique, GA desde o Prisma 5.0), e quando ele não
casa o resultado é `P2025`, que o tratador traduz pra `404`. Checar a
posse numa consulta separada antes do update deixaria uma janela entre a
checagem e a escrita.

**Files:**
- Modify: `apps/api/src/rotas/servicos.ts`
- Test: `apps/api/tests/rotas/servicos-id.test.ts`
- Modify: `apps/api/README.md`

**Interfaces:**
- Consumes: `PADRAO_UUID` e `PADRAO_PRECO` de `src/lib/padroes.ts`; `serializarServico`; helpers de teste.
- Produces: `PATCH /servicos/:id` e `DELETE /servicos/:id`, os dois respondendo 200 com o serviço serializado.

- [ ] **Step 1: Escrever o teste que falha**

Criar `apps/api/tests/rotas/servicos-id.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { prisma } from "@barchop/database";
import { buildApp } from "../../src/app";
import { auth, criarBarbeariaComToken } from "../helpers/barbearia";
import type { App } from "../../src/tipos";

const CORTE = { nome: "Corte", duracaoMinutos: 45, preco: "45.00" };

async function criarServico(app: App, token: string, dados = CORTE) {
  const resposta = await app.inject({
    method: "POST",
    url: "/servicos",
    headers: auth(token),
    payload: dados,
  });
  return resposta.json();
}

describe("PATCH /servicos/:id", () => {
  it("edita nome, duração e preço", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");
    const servico = await criarServico(app, um.token);

    const resposta = await app.inject({
      method: "PATCH",
      url: `/servicos/${servico.id}`,
      headers: auth(um.token),
      payload: { nome: "Corte + barba", duracaoMinutos: 60, preco: "70.00" },
    });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toMatchObject({
      id: servico.id,
      nome: "Corte + barba",
      duracaoMinutos: 60,
      preco: "70.00",
      ativo: true,
    });

    await app.close();
  });

  it("reativa um serviço desativado", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");
    const servico = await criarServico(app, um.token);

    await app.inject({
      method: "DELETE",
      url: `/servicos/${servico.id}`,
      headers: auth(um.token),
    });

    const resposta = await app.inject({
      method: "PATCH",
      url: `/servicos/${servico.id}`,
      headers: auth(um.token),
      payload: { ativo: true },
    });

    expect(resposta.json().ativo).toBe(true);

    await app.close();
  });

  it("devolve 404 pra serviço de outra barbearia, sem tocar nele", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");
    const outra = await criarBarbeariaComToken(app, "outra");
    const alheio = await criarServico(app, outra.token);

    const resposta = await app.inject({
      method: "PATCH",
      url: `/servicos/${alheio.id}`,
      headers: auth(um.token),
      payload: { preco: "1.00" },
    });

    // 404 e não 403: um 403 confirmaria que o id existe em algum lugar
    // da plataforma.
    expect(resposta.statusCode).toBe(404);
    expect(resposta.json().erro).toBe("nao_encontrado");

    const intacto = await prisma.servico.findUniqueOrThrow({
      where: { id: alheio.id },
    });
    expect(intacto.preco.toFixed(2)).toBe("45.00");

    await app.close();
  });

  it("devolve 404 pra id que não existe", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");

    const resposta = await app.inject({
      method: "PATCH",
      url: "/servicos/11111111-1111-4111-8111-111111111111",
      headers: auth(um.token),
      payload: { nome: "Fantasma" },
    });

    expect(resposta.statusCode).toBe(404);

    await app.close();
  });

  it("recusa id fora do formato UUID com 400", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");

    const resposta = await app.inject({
      method: "PATCH",
      url: "/servicos/nao-e-uuid",
      headers: auth(um.token),
      payload: { nome: "Qualquer" },
    });

    // Sem o pattern no schema isto viraria P2023 do Postgres — mesma
    // resposta, mas depois de uma ida ao banco.
    expect(resposta.statusCode).toBe(400);

    await app.close();
  });

  it("recusa corpo vazio com 400", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");
    const servico = await criarServico(app, um.token);

    const resposta = await app.inject({
      method: "PATCH",
      url: `/servicos/${servico.id}`,
      headers: auth(um.token),
      payload: {},
    });

    expect(resposta.statusCode).toBe(400);

    await app.close();
  });

  it("recusa requisição sem token com 401", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");
    const servico = await criarServico(app, um.token);

    const resposta = await app.inject({
      method: "PATCH",
      url: `/servicos/${servico.id}`,
      payload: { nome: "Sem token" },
    });

    expect(resposta.statusCode).toBe(401);

    await app.close();
  });
});

describe("DELETE /servicos/:id", () => {
  it("desativa sem apagar o registro", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");
    const servico = await criarServico(app, um.token);

    const resposta = await app.inject({
      method: "DELETE",
      url: `/servicos/${servico.id}`,
      headers: auth(um.token),
    });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().ativo).toBe(false);

    // Soft delete porque AgendamentoServico tem FK ON DELETE RESTRICT
    // pro serviço: apagar de verdade quebraria o histórico.
    const noBanco = await prisma.servico.findUnique({
      where: { id: servico.id },
    });
    expect(noBanco?.ativo).toBe(false);

    await app.close();
  });

  it("some da listagem pública mas continua na do barbeiro", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");
    const servico = await criarServico(app, um.token);

    await app.inject({
      method: "DELETE",
      url: `/servicos/${servico.id}`,
      headers: auth(um.token),
    });

    const publica = await app.inject({
      method: "GET",
      url: "/barbearias/barbearia-um/servicos",
    });
    expect(publica.json().servicos).toHaveLength(0);

    const doBarbeiro = await app.inject({
      method: "GET",
      url: "/servicos",
      headers: auth(um.token),
    });
    expect(doBarbeiro.json().servicos).toHaveLength(1);
    expect(doBarbeiro.json().servicos[0].ativo).toBe(false);

    await app.close();
  });

  it("é idempotente", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");
    const servico = await criarServico(app, um.token);

    await app.inject({
      method: "DELETE",
      url: `/servicos/${servico.id}`,
      headers: auth(um.token),
    });
    const segunda = await app.inject({
      method: "DELETE",
      url: `/servicos/${servico.id}`,
      headers: auth(um.token),
    });

    expect(segunda.statusCode).toBe(200);
    expect(segunda.json().ativo).toBe(false);

    await app.close();
  });

  it("devolve 404 pra serviço de outra barbearia, sem desativar", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");
    const outra = await criarBarbeariaComToken(app, "outra");
    const alheio = await criarServico(app, outra.token);

    const resposta = await app.inject({
      method: "DELETE",
      url: `/servicos/${alheio.id}`,
      headers: auth(um.token),
    });

    expect(resposta.statusCode).toBe(404);

    const intacto = await prisma.servico.findUniqueOrThrow({
      where: { id: alheio.id },
    });
    expect(intacto.ativo).toBe(true);

    await app.close();
  });

  it("recusa requisição sem token com 401", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");
    const servico = await criarServico(app, um.token);

    const resposta = await app.inject({
      method: "DELETE",
      url: `/servicos/${servico.id}`,
    });

    expect(resposta.statusCode).toBe(401);

    await app.close();
  });
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

```bash
pnpm --filter @barchop/api test tests/rotas/servicos-id.test.ts
```

Esperado: FAIL — 404 em tudo, as rotas não existem.

- [ ] **Step 3: Acrescentar as duas rotas**

Em `apps/api/src/rotas/servicos.ts`, acrescentar `PADRAO_UUID` ao import
de padrões:

```ts
import { PADRAO_PRECO, PADRAO_UUID } from "../lib/padroes";
```

Acrescentar os dois schemas, ao lado dos que já existem:

```ts
const paramsComId = {
  type: "object",
  required: ["id"],
  additionalProperties: false,
  properties: { id: { type: "string", pattern: PADRAO_UUID } },
} as const;

// `ativo` entra aqui porque é como o barbeiro reativa o que desativou —
// o DELETE é reversível de propósito.
const corpoPatchServico = {
  type: "object",
  additionalProperties: false,
  minProperties: 1,
  properties: {
    nome: { type: "string", minLength: 2, maxLength: 120 },
    duracaoMinutos: {
      type: "integer",
      minimum: 5,
      maximum: 480,
      multipleOf: 5,
    },
    preco: { type: "string", pattern: PADRAO_PRECO },
    ativo: { type: "boolean" },
  },
} as const;
```

E, dentro de `registrarRotasServicos`, depois do `POST`:

```ts
  app.patch(
    "/servicos/:id",
    { schema: { params: paramsComId, body: corpoPatchServico } },
    async (request) => {
      const servico = await prisma.servico.update({
        // O barbeariaId vai no MESMO where da escrita. Conferir a posse
        // numa consulta separada antes deixaria uma janela entre a
        // checagem e o update; aqui, se a barbearia não casa, o Prisma
        // lança P2025 e o tratador central devolve 404.
        where: { id: request.params.id, barbeariaId: request.user.barbeariaId },
        data: request.body,
      });

      return serializarServico(servico);
    }
  );

  app.delete(
    "/servicos/:id",
    { schema: { params: paramsComId } },
    async (request) => {
      // Soft delete: AgendamentoServico tem FK ON DELETE RESTRICT pro
      // serviço — apagar de verdade quebraria o histórico de quem já foi
      // atendido. Some da listagem pública, continua na do barbeiro.
      const servico = await prisma.servico.update({
        where: { id: request.params.id, barbeariaId: request.user.barbeariaId },
        data: { ativo: false },
      });

      return serializarServico(servico);
    }
  );
```

- [ ] **Step 4: Rodar o teste e ver passar**

```bash
pnpm --filter @barchop/api test tests/rotas/servicos-id.test.ts
pnpm --filter @barchop/api type-check
```

Esperado: PASS, 12 casos.

Se o type-check recusar `barbeariaId` dentro do `where` do `update`
(seria o caso num Prisma anterior ao 5.0, sem extended where unique),
trocar por `updateMany` seguido de leitura — mas conferindo o retorno, e
importando `naoEncontrado` de `../lib/erro-http`:

```ts
      const { count } = await prisma.servico.updateMany({
        where: { id: request.params.id, barbeariaId: request.user.barbeariaId },
        data: request.body,
      });
      if (count === 0) throw naoEncontrado("serviço não encontrado");
      const servico = await prisma.servico.findUniqueOrThrow({
        where: { id: request.params.id },
      });
```

O projeto está no Prisma 5.22 e a primeira forma compila — esta é só a
saída de emergência, e continua com o filtro de barbearia na mesma
instrução da escrita.

- [ ] **Step 5: Atualizar o README e commitar**

Acrescentar às rotas protegidas:

```markdown
| `PATCH` | `/servicos/:id` | edita nome, duração, preço, e reativa |
| `DELETE` | `/servicos/:id` | soft delete: `ativo = false`, 200 com o serviço |
```

```bash
git add apps/api/src/rotas/servicos.ts apps/api/tests/rotas/servicos-id.test.ts apps/api/README.md
git commit -m "feat(api): edit and soft-delete a service, scoped by token"
```

---

## Task 10: `GET` e `POST /clientes`

A agenda de clientes do barbeiro — a tela "Clientes: lista com busca". A
Task 3 já deu ao `Cliente` o `barbeariaId`; aqui ele finalmente é usado.

**Files:**
- Create: `apps/api/src/rotas/clientes.ts`
- Modify: `apps/api/src/lib/padroes.ts` (ganha `PADRAO_EMAIL`)
- Modify: `apps/api/src/rotas/auth.ts` (passa a importar o pattern em vez de declarar o seu)
- Modify: `apps/api/src/app.ts`
- Modify: `packages/types/src/index.ts` (`ClientePublico` ganha `email`)
- Modify: `apps/api/src/lib/serializar.ts` (`ClienteSerializado` vira alias de `ClientePublico`)
- Test: `apps/api/tests/rotas/clientes.test.ts`
- Modify: `apps/api/README.md`

**Interfaces:**
- Consumes: `serializarCliente` de `src/lib/serializar.ts`; `PADRAO_TELEFONE` e `PADRAO_EMAIL` de `src/lib/padroes.ts`; helpers de teste.
- Produces: `registrarRotasClientes(app: App): void` em `src/rotas/clientes.ts`; `PADRAO_EMAIL` exportado de `src/lib/padroes.ts`. A Task 11 acrescenta as rotas com `:id` no mesmo arquivo.

- [ ] **Step 1: Escrever o teste que falha**

Criar `apps/api/tests/rotas/clientes.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildApp } from "../../src/app";
import { auth, criarBarbeariaComToken } from "../helpers/barbearia";

const JOAO = { nome: "João da Silva", telefone: "11999998888" };

describe("POST /clientes", () => {
  it("cadastra o cliente na barbearia do token", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");

    const resposta = await app.inject({
      method: "POST",
      url: "/clientes",
      headers: auth(um.token),
      payload: JOAO,
    });

    expect(resposta.statusCode).toBe(201);
    expect(resposta.json()).toMatchObject({
      nome: "João da Silva",
      telefone: "11999998888",
      email: null,
      // Cliente cadastrado pelo barbeiro não tem conta: o fluxo público
      // não pede senha, e o app com login é passo posterior.
      temConta: false,
    });

    await app.close();
  });

  it("aparece na listagem na hora, sem depender de agendamento", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");

    await app.inject({
      method: "POST",
      url: "/clientes",
      headers: auth(um.token),
      payload: JOAO,
    });

    // É o motivo de o Cliente ter ganhado barbeariaId na Task 3: com o
    // vínculo saindo só do agendamento, este cadastro sumiria da tela
    // até o primeiro atendimento.
    const lista = await app.inject({
      method: "GET",
      url: "/clientes",
      headers: auth(um.token),
    });

    expect(lista.json().clientes).toHaveLength(1);

    await app.close();
  });

  it("normaliza o email pra caixa baixa", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");

    const resposta = await app.inject({
      method: "POST",
      url: "/clientes",
      headers: auth(um.token),
      payload: { ...JOAO, email: "Joao@Exemplo.com" },
    });

    // Mesma razão do login: a coluna é VARCHAR com índice único, que
    // compara caixa a caixa. Sem normalizar, o mesmo email vira dois
    // cadastros.
    expect(resposta.json().email).toBe("joao@exemplo.com");

    await app.close();
  });

  it("recusa telefone repetido na mesma barbearia com 409", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");

    await app.inject({
      method: "POST",
      url: "/clientes",
      headers: auth(um.token),
      payload: JOAO,
    });

    const segunda = await app.inject({
      method: "POST",
      url: "/clientes",
      headers: auth(um.token),
      payload: { nome: "João de novo", telefone: "11999998888" },
    });

    expect(segunda.statusCode).toBe(409);
    expect(segunda.json().erro).toBe("conflito");

    await app.close();
  });

  it("aceita o mesmo telefone em barbearias diferentes", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");
    const outra = await criarBarbeariaComToken(app, "outra");

    await app.inject({
      method: "POST",
      url: "/clientes",
      headers: auth(um.token),
      payload: JOAO,
    });

    const naOutra = await app.inject({
      method: "POST",
      url: "/clientes",
      headers: auth(outra.token),
      payload: JOAO,
    });

    // O mesmo cliente pode ser cliente das duas barbearias. Um 409 aqui
    // impediria a segunda barbearia de cadastrar quem já é cliente da
    // primeira.
    expect(naOutra.statusCode).toBe(201);

    await app.close();
  });

  it("recusa telefone fora do formato com 400", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");

    const resposta = await app.inject({
      method: "POST",
      url: "/clientes",
      headers: auth(um.token),
      payload: { nome: "João", telefone: "telefone" },
    });

    expect(resposta.statusCode).toBe(400);

    await app.close();
  });

  it("recusa barbeariaId no corpo com 400", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");
    const outra = await criarBarbeariaComToken(app, "outra");

    const resposta = await app.inject({
      method: "POST",
      url: "/clientes",
      headers: auth(um.token),
      payload: { ...JOAO, barbeariaId: outra.barbeariaId },
    });

    expect(resposta.statusCode).toBe(400);

    await app.close();
  });

  it("recusa requisição sem token com 401", async () => {
    const app = buildApp();

    const resposta = await app.inject({
      method: "POST",
      url: "/clientes",
      payload: JOAO,
    });

    expect(resposta.statusCode).toBe(401);

    await app.close();
  });
});

describe("GET /clientes", () => {
  it("lista só os clientes da barbearia do token, em ordem de nome", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");
    const outra = await criarBarbeariaComToken(app, "outra");

    for (const cliente of [
      { nome: "Zeca", telefone: "11911111111" },
      { nome: "Ana", telefone: "11922222222" },
    ]) {
      await app.inject({
        method: "POST",
        url: "/clientes",
        headers: auth(um.token),
        payload: cliente,
      });
    }
    await app.inject({
      method: "POST",
      url: "/clientes",
      headers: auth(outra.token),
      payload: { nome: "Cliente da outra", telefone: "11933333333" },
    });

    const resposta = await app.inject({
      method: "GET",
      url: "/clientes",
      headers: auth(um.token),
    });

    expect(resposta.statusCode).toBe(200);
    expect(
      resposta.json().clientes.map((c: { nome: string }) => c.nome)
    ).toEqual(["Ana", "Zeca"]);

    await app.close();
  });

  it("filtra por parte do nome, sem diferenciar caixa", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");

    await app.inject({
      method: "POST",
      url: "/clientes",
      headers: auth(um.token),
      payload: JOAO,
    });
    await app.inject({
      method: "POST",
      url: "/clientes",
      headers: auth(um.token),
      payload: { nome: "Maria", telefone: "11922222222" },
    });

    const resposta = await app.inject({
      method: "GET",
      url: "/clientes?busca=jo",
      headers: auth(um.token),
    });

    expect(resposta.json().clientes).toHaveLength(1);
    expect(resposta.json().clientes[0].nome).toBe("João da Silva");

    await app.close();
  });

  it("filtra por parte do telefone", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");

    await app.inject({
      method: "POST",
      url: "/clientes",
      headers: auth(um.token),
      payload: JOAO,
    });

    const resposta = await app.inject({
      method: "GET",
      url: "/clientes?busca=99999",
      headers: auth(um.token),
    });

    expect(resposta.json().clientes).toHaveLength(1);

    await app.close();
  });

  it("nunca devolve senhaHash", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");

    await app.inject({
      method: "POST",
      url: "/clientes",
      headers: auth(um.token),
      payload: JOAO,
    });

    const resposta = await app.inject({
      method: "GET",
      url: "/clientes",
      headers: auth(um.token),
    });

    expect(resposta.body).not.toContain("senhaHash");

    await app.close();
  });

  it("recusa requisição sem token com 401", async () => {
    const app = buildApp();

    const resposta = await app.inject({ method: "GET", url: "/clientes" });

    expect(resposta.statusCode).toBe(401);

    await app.close();
  });
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

```bash
pnpm --filter @barchop/api test tests/rotas/clientes.test.ts
```

Esperado: FAIL — 404 nas rotas `/clientes`.

- [ ] **Step 3: Mover `PADRAO_EMAIL` pros padrões compartilhados**

Acrescentar ao final de `apps/api/src/lib/padroes.ts`:

```ts
// `format: "email"` dependeria do ajv-formats estar ligado no Fastify;
// um pattern explícito não depende de configuração nenhuma.
export const PADRAO_EMAIL = "^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$";
```

Em `apps/api/src/rotas/auth.ts`, apagar a declaração local do
`PADRAO_EMAIL` (e o comentário acima dela) e importar do módulo novo:

```ts
import { PADRAO_EMAIL } from "../lib/padroes";
```

- [ ] **Step 4: Criar `src/rotas/clientes.ts`**

```ts
import { prisma } from "@barchop/database";
import { PADRAO_EMAIL, PADRAO_TELEFONE } from "../lib/padroes";
import { serializarCliente } from "../lib/serializar";
import type { App } from "../tipos";

const corpoNovoCliente = {
  type: "object",
  additionalProperties: false,
  required: ["nome", "telefone"],
  properties: {
    nome: { type: "string", minLength: 2, maxLength: 120 },
    telefone: { type: "string", pattern: PADRAO_TELEFONE, maxLength: 20 },
    email: { type: ["string", "null"], pattern: PADRAO_EMAIL, maxLength: 160 },
  },
} as const;

const buscaClientes = {
  type: "object",
  additionalProperties: false,
  properties: { busca: { type: "string", minLength: 1, maxLength: 120 } },
} as const;

// Mesma normalização do login: a coluna é VARCHAR com índice único, que
// compara caixa a caixa. Sem isto, "Joao@Exemplo.com" e
// "joao@exemplo.com" viram dois cadastros do mesmo cliente.
function normalizarEmail(email: string | null | undefined): string | null {
  return email ? email.trim().toLowerCase() : null;
}

export function registrarRotasClientes(app: App): void {
  app.get(
    "/clientes",
    { schema: { querystring: buscaClientes } },
    async (request) => {
      const busca = request.query.busca?.trim();

      const clientes = await prisma.cliente.findMany({
        where: {
          // Sempre o barbeariaId do token. É o filtro que faz a agenda de
          // clientes de uma barbearia ser invisível pras outras.
          barbeariaId: request.user.barbeariaId,
          ...(busca
            ? {
                OR: [
                  // `mode: "insensitive"` só existe no conector do
                  // Postgres — é o que faz "jo" achar "João".
                  { nome: { contains: busca, mode: "insensitive" as const } },
                  { telefone: { contains: busca } },
                ],
              }
            : {}),
        },
        orderBy: { nome: "asc" },
        // Teto de segurança: a tela é uma lista com busca, não um dump.
        take: 200,
      });

      return { clientes: clientes.map(serializarCliente) };
    }
  );

  app.post(
    "/clientes",
    { schema: { body: corpoNovoCliente } },
    async (request, reply) => {
      const { nome, telefone, email } = request.body;

      // Telefone repetido na mesma barbearia bate no unique
      // [barbeariaId, telefone] e vira P2002 -> 409 pelo tratador
      // central. Em barbearias diferentes passa, de propósito.
      const cliente = await prisma.cliente.create({
        data: {
          barbeariaId: request.user.barbeariaId,
          nome,
          telefone,
          email: normalizarEmail(email),
        },
      });

      return reply.code(201).send(serializarCliente(cliente));
    }
  );
}
```

- [ ] **Step 5: Registrar no escopo protegido**

Em `apps/api/src/app.ts`, acrescentar o import e a chamada:

```ts
import { registrarRotasClientes } from "./rotas/clientes";
```

```ts
    registrarRotasServicos(protegidas);
    registrarRotasClientes(protegidas);
```

- [ ] **Step 6: Rodar o teste e ver passar**

```bash
pnpm --filter @barchop/api test tests/rotas/clientes.test.ts
pnpm --filter @barchop/api type-check
```

Esperado: PASS, 13 casos.

- [ ] **Step 7: Alinhar o `ClientePublico` de `@barchop/types`**

`packages/types/src/index.ts` declara `ClientePublico` sem o `email`, e o
README da API manda o pessoal do web e do mobile importar os tipos de
lá. Como está, quem importar recebe um tipo que não bate com o que a
rota devolve — e nada acusa, porque hoje ninguém importa
(`grep -rn "ClientePublico" apps packages --include=*.ts*` só acha a
declaração). Fechar agora, enquanto o custo é uma linha.

Em `packages/types/src/index.ts`, substituir a interface por:

```ts
// Versão pública do Cliente — nunca inclui senhaHash. É o formato que
// `serializarCliente` (apps/api/src/lib/serializar.ts) produz: o
// serializador importa este tipo, então divergir os dois quebra o
// type-check em vez de quebrar uma tela.
export interface ClientePublico {
  id: string;
  nome: string;
  telefone: string;
  email: string | null;
  temConta: boolean;
}
```

E em `apps/api/src/lib/serializar.ts`, trocar a declaração local de
`ClienteSerializado` por um alias do tipo compartilhado:

```ts
import type { ClientePublico } from "@barchop/types";

// Um nome só, um formato só: a resposta da API e o tipo que web e
// mobile importam não têm como divergir em silêncio.
export type ClienteSerializado = ClientePublico;
```

(o `export interface ClienteSerializado { ... }` sai; `serializarCliente`
continua igual, com o mesmo tipo de retorno).

Rodar `pnpm --filter @barchop/api type-check` — o alias tem que
compilar sem nenhuma mudança em `serializarCliente`.

- [ ] **Step 8: Atualizar o README e commitar**

Acrescentar às rotas protegidas:

```markdown
| `GET` | `/clientes` | clientes da barbearia do token; `?busca=` casa nome ou telefone |
| `POST` | `/clientes` | cadastra cliente; telefone é único dentro da barbearia |
```

```bash
git add apps/api/src/rotas/clientes.ts apps/api/src/lib/padroes.ts apps/api/src/lib/serializar.ts apps/api/src/rotas/auth.ts apps/api/src/app.ts apps/api/tests/rotas/clientes.test.ts apps/api/README.md packages/types/src/index.ts
git commit -m "feat(api): add the barbershop client book"
```

---

## Task 11: `GET` e `PATCH /clientes/:id`

O `GET` é a tela "Cadastro de cliente: dados + histórico de
agendamentos". Como a fase 4 ainda não existe, o teste semeia o
agendamento direto pelo Prisma — é o que permite provar a serialização
do histórico agora, sem esperar o `POST /agendamentos`.

**Files:**
- Modify: `apps/api/src/rotas/clientes.ts`
- Test: `apps/api/tests/rotas/clientes-id.test.ts`
- Modify: `apps/api/README.md`

**Interfaces:**
- Consumes: `PADRAO_UUID` de `src/lib/padroes.ts`; `serializarCliente` e `serializarAgendamento` de `src/lib/serializar.ts`; `dataParaDate`/`horaParaDate` de `src/lib/horas.ts` (só no teste).
- Produces: `GET /clientes/:id` respondendo `{ ...cliente, agendamentos: [...] }` e `PATCH /clientes/:id` respondendo o cliente serializado.

- [ ] **Step 1: Escrever o teste que falha**

Criar `apps/api/tests/rotas/clientes-id.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { prisma } from "@barchop/database";
import { buildApp } from "../../src/app";
import { dataParaDate, horaParaDate } from "../../src/lib/horas";
import { auth, criarBarbeariaComToken } from "../helpers/barbearia";
import type { App } from "../../src/tipos";

const JOAO = { nome: "João da Silva", telefone: "11999998888" };

async function criarCliente(app: App, token: string, dados = JOAO) {
  const resposta = await app.inject({
    method: "POST",
    url: "/clientes",
    headers: auth(token),
    payload: dados,
  });
  return resposta.json();
}

// A fase 4 é quem cria agendamento por HTTP. Aqui o registro é semeado
// direto no banco, com as datas passando por lib/horas.ts — o mesmo
// caminho que a rota vai usar.
async function semearAgendamento(params: {
  barbeariaId: string;
  barbeiroId: string;
  clienteId: string;
}) {
  const servico = await prisma.servico.create({
    data: {
      barbeariaId: params.barbeariaId,
      nome: "Corte",
      duracaoMinutos: 45,
      preco: "45.00",
    },
  });

  return prisma.agendamento.create({
    data: {
      barbeariaId: params.barbeariaId,
      barbeiroId: params.barbeiroId,
      clienteId: params.clienteId,
      data: dataParaDate("2026-09-10"),
      horaInicio: horaParaDate("10:00"),
      horaFim: horaParaDate("10:45"),
      servicos: {
        create: [
          {
            servicoId: servico.id,
            precoNoMomento: "45.00",
            duracaoNoMomento: 45,
          },
        ],
      },
    },
  });
}

describe("GET /clientes/:id", () => {
  it("devolve o cliente com o histórico de agendamentos", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");
    const cliente = await criarCliente(app, um.token);
    await semearAgendamento({
      barbeariaId: um.barbeariaId,
      barbeiroId: um.barbeiroId,
      clienteId: cliente.id,
    });

    const resposta = await app.inject({
      method: "GET",
      url: `/clientes/${cliente.id}`,
      headers: auth(um.token),
    });

    expect(resposta.statusCode).toBe(200);

    const corpo = resposta.json();
    expect(corpo.nome).toBe("João da Silva");
    expect(corpo.agendamentos).toHaveLength(1);
    expect(corpo.agendamentos[0]).toMatchObject({
      data: "2026-09-10",
      horaInicio: "10:00",
      horaFim: "10:45",
      status: "confirmado",
    });
    expect(corpo.agendamentos[0].servicos[0]).toEqual({
      servicoId: expect.any(String),
      nome: "Corte",
      precoNoMomento: "45.00",
      duracaoNoMomento: 45,
    });

    await app.close();
  });

  it("devolve histórico vazio pra cliente novo", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");
    const cliente = await criarCliente(app, um.token);

    const resposta = await app.inject({
      method: "GET",
      url: `/clientes/${cliente.id}`,
      headers: auth(um.token),
    });

    expect(resposta.json().agendamentos).toEqual([]);

    await app.close();
  });

  it("devolve 404 pra cliente de outra barbearia", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");
    const outra = await criarBarbeariaComToken(app, "outra");
    const alheio = await criarCliente(app, outra.token);

    const resposta = await app.inject({
      method: "GET",
      url: `/clientes/${alheio.id}`,
      headers: auth(um.token),
    });

    // O histórico de um cliente é justamente o que a decisão 4 da spec
    // não quer expor fora da barbearia dele.
    expect(resposta.statusCode).toBe(404);
    expect(resposta.json().erro).toBe("nao_encontrado");

    await app.close();
  });

  it("recusa id fora do formato UUID com 400", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");

    const resposta = await app.inject({
      method: "GET",
      url: "/clientes/nao-e-uuid",
      headers: auth(um.token),
    });

    expect(resposta.statusCode).toBe(400);

    await app.close();
  });

  it("recusa requisição sem token com 401", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");
    const cliente = await criarCliente(app, um.token);

    const resposta = await app.inject({
      method: "GET",
      url: `/clientes/${cliente.id}`,
    });

    expect(resposta.statusCode).toBe(401);

    await app.close();
  });
});

describe("PATCH /clientes/:id", () => {
  it("edita nome, telefone e email", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");
    const cliente = await criarCliente(app, um.token);

    const resposta = await app.inject({
      method: "PATCH",
      url: `/clientes/${cliente.id}`,
      headers: auth(um.token),
      payload: {
        nome: "João Silva",
        telefone: "11977776666",
        email: "Joao@Exemplo.com",
      },
    });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toMatchObject({
      nome: "João Silva",
      telefone: "11977776666",
      email: "joao@exemplo.com",
    });

    await app.close();
  });

  it("recusa telefone já usado por outro cliente da barbearia, com 409", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");
    const joao = await criarCliente(app, um.token);
    await criarCliente(app, um.token, {
      nome: "Maria",
      telefone: "11922222222",
    });

    const resposta = await app.inject({
      method: "PATCH",
      url: `/clientes/${joao.id}`,
      headers: auth(um.token),
      payload: { telefone: "11922222222" },
    });

    expect(resposta.statusCode).toBe(409);

    await app.close();
  });

  it("devolve 404 pra cliente de outra barbearia, sem editar", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");
    const outra = await criarBarbeariaComToken(app, "outra");
    const alheio = await criarCliente(app, outra.token);

    const resposta = await app.inject({
      method: "PATCH",
      url: `/clientes/${alheio.id}`,
      headers: auth(um.token),
      payload: { nome: "Invadido" },
    });

    expect(resposta.statusCode).toBe(404);

    const intacto = await prisma.cliente.findUniqueOrThrow({
      where: { id: alheio.id },
    });
    expect(intacto.nome).toBe("João da Silva");

    await app.close();
  });

  it("recusa corpo vazio com 400", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");
    const cliente = await criarCliente(app, um.token);

    const resposta = await app.inject({
      method: "PATCH",
      url: `/clientes/${cliente.id}`,
      headers: auth(um.token),
      payload: {},
    });

    expect(resposta.statusCode).toBe(400);

    await app.close();
  });

  it("recusa requisição sem token com 401", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");
    const cliente = await criarCliente(app, um.token);

    const resposta = await app.inject({
      method: "PATCH",
      url: `/clientes/${cliente.id}`,
      payload: { nome: "Sem token" },
    });

    expect(resposta.statusCode).toBe(401);

    await app.close();
  });
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

```bash
pnpm --filter @barchop/api test tests/rotas/clientes-id.test.ts
```

Esperado: FAIL — 404 nas rotas com `:id`.

- [ ] **Step 3: Acrescentar as duas rotas**

Em `apps/api/src/rotas/clientes.ts`, completar o import de padrões e o de
serializadores:

```ts
import { PADRAO_EMAIL, PADRAO_TELEFONE, PADRAO_UUID } from "../lib/padroes";
import { serializarAgendamento, serializarCliente } from "../lib/serializar";
```

Acrescentar os schemas:

```ts
const paramsComId = {
  type: "object",
  required: ["id"],
  additionalProperties: false,
  properties: { id: { type: "string", pattern: PADRAO_UUID } },
} as const;

const corpoPatchCliente = {
  type: "object",
  additionalProperties: false,
  minProperties: 1,
  properties: {
    nome: { type: "string", minLength: 2, maxLength: 120 },
    telefone: { type: "string", pattern: PADRAO_TELEFONE, maxLength: 20 },
    email: { type: ["string", "null"], pattern: PADRAO_EMAIL, maxLength: 160 },
  },
} as const;
```

E, dentro de `registrarRotasClientes`, depois do `POST`:

```ts
  app.get(
    "/clientes/:id",
    { schema: { params: paramsComId } },
    async (request) => {
      const barbeariaId = request.user.barbeariaId;

      // findFirstOrThrow e não findUnique: o filtro por barbearia entra
      // na mesma consulta, e "cliente de outra barbearia" cai no mesmo
      // P2025 que "cliente que não existe" — 404 nos dois casos, de
      // propósito.
      const cliente = await prisma.cliente.findFirstOrThrow({
        where: { id: request.params.id, barbeariaId },
        include: {
          agendamentos: {
            // Redundante hoje, já que o cliente pertence a uma barbearia
            // só. Fica porque é barato e porque o dia em que um cliente
            // circular entre barbearias, o histórico não vaza junto.
            where: { barbeariaId },
            orderBy: [{ data: "desc" }, { horaInicio: "desc" }],
            take: 50,
            include: {
              servicos: { include: { servico: { select: { nome: true } } } },
            },
          },
        },
      });

      return {
        ...serializarCliente(cliente),
        agendamentos: cliente.agendamentos.map(serializarAgendamento),
      };
    }
  );

  app.patch(
    "/clientes/:id",
    { schema: { params: paramsComId, body: corpoPatchCliente } },
    async (request) => {
      const { nome, telefone, email } = request.body;

      const cliente = await prisma.cliente.update({
        // barbeariaId no mesmo where da escrita: cliente de outra
        // barbearia vira P2025 -> 404, nunca uma edição silenciosa.
        where: { id: request.params.id, barbeariaId: request.user.barbeariaId },
        data: {
          ...(nome !== undefined ? { nome } : {}),
          ...(telefone !== undefined ? { telefone } : {}),
          // `email` tem tratamento próprio porque passa pela
          // normalização — e porque `null` aqui significa "limpar", não
          // "não mexer".
          ...(email !== undefined ? { email: normalizarEmail(email) } : {}),
        },
      });

      return serializarCliente(cliente);
    }
  );
```

- [ ] **Step 4: Rodar o teste e ver passar**

```bash
pnpm --filter @barchop/api test tests/rotas/clientes-id.test.ts
pnpm --filter @barchop/api type-check
```

Esperado: PASS, 10 casos.

- [ ] **Step 5: Atualizar o README e commitar**

Acrescentar às rotas protegidas:

```markdown
| `GET` | `/clientes/:id` | cliente + histórico de agendamentos na barbearia |
| `PATCH` | `/clientes/:id` | edita nome, telefone e email |
```

```bash
git add apps/api/src/rotas/clientes.ts apps/api/tests/rotas/clientes-id.test.ts apps/api/README.md
git commit -m "feat(api): show and edit a single client with their history"
```

---

## Definição de pronto

A fase 3 fecha quando, na raiz do monorepo:

```bash
pnpm --filter @barchop/api test
pnpm --filter @barchop/api type-check
pnpm --filter @barchop/api build
```

passam limpos, e:

- [ ] As 11 tasks estão commitadas, cada uma com sua suíte verde.
- [ ] `apps/api/README.md` lista todas as rotas novas e a tabela de erros
      atualizada.
- [ ] `app.ts` não tem mais rota inline nenhuma além do `/health` e do
      `POST /disponibilidade` (que sai na fase 5).
- [ ] Nenhuma rota protegida aceita `barbeariaId` — conferir com
      `grep -rn "barbeariaId" apps/api/src/rotas` e checar que toda
      ocorrência vem de `request.user`.
- [ ] Nenhuma resposta contém `senhaHash` — os testes já cobrem `/me`,
      `/clientes` e o perfil público.
- [ ] `ClientePublico` (`packages/types`) bate com o que a API devolve —
      depois da Task 10 o serializador usa esse tipo, então o
      `type-check` acusa se divergirem.

Cobertura da spec, item por item da tabela de endpoints da fase 3:

| Rota | Task |
|---|---|
| `PATCH /me` | 4 |
| `PATCH /barbearias/me` | 5 |
| `GET`/`PUT /barbearias/me/horarios` | 6 |
| `GET /barbearias/:slug` | 7 |
| `GET`/`POST /servicos`, `GET /barbearias/:slug/servicos` | 8 |
| `PATCH`/`DELETE /servicos/:id` | 9 |
| `GET`/`POST /clientes` | 10 |
| `GET`/`PATCH /clientes/:id` | 11 |

## O que fica pra fase 4

- `POST /agendamentos` (walk-in, `origem: "barbeiro"`) e
  `POST /barbearias/:slug/agendamentos` (público, `origem: "cliente"`),
  compartilhando um serviço `criarAgendamento`.
- A divisão do `NovoAgendamentoInput` de `@barchop/types` em
  `NovoAgendamentoBarbeiroInput` e `NovoAgendamentoPublicoInput` — hoje o
  tipo ainda carrega `barbeariaId`, `clienteId` e `origem` no corpo, os
  três forjáveis depois da autenticação.
- O `upsert` do cliente por telefone no fluxo público. Depois da Task 3,
  a chave é `barbeariaId_telefone`, e o nome divergente **não**
  sobrescreve o cadastrado.
- Descobrir por teste de integração como o Prisma 5.22 expõe o SQLSTATE
  `23P01` da `sem_conflito_horario`, e traduzir pra `409` no
  `plugins/erros.ts` — o `ErroHttp` da Task 1 já dá onde encaixar.
- `GET /agendamentos` (com `?data=` ou o par `?de=&ate=`) e
  `GET`/`PATCH /agendamentos/:id`.
- Os cinco testes de banco real da spec: conflito, borda `[)`, cancelado
  libera, corrida com `Promise.all`, e fuso lido com `$queryRaw`.
