# API — Identidade do cliente (fase 6): plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar conta ao cliente — telefone e senha, com as rotas de `/clientes/me` que a tela "Meus agendamentos" precisa — e fechar a lacuna que deixa o fluxo público inalcançável hoje.

**Architecture:** Um segredo de JWT só, com `tipo` no payload; os dois hooks (`autenticar` e `autenticarCliente`) leem a união pelo retorno do `jwtVerify` e recusam o tipo que não é o seu antes de tocar no banco. As rotas do cliente ficam num terceiro escopo `app.register`, irmão do escopo protegido do barbeiro. Remarcar é uma transação só que cancela o antigo antes de criar o novo, para o próprio horário não bloquear a remarcação.

**Tech Stack:** Fastify 5.x, `@fastify/jwt` 9.x, Prisma 5.22, vitest 4.1.11, PostgreSQL, TypeScript estrito, Node 24.13.1, pnpm 9.0.0.

**Spec:** `docs/superpowers/specs/2026-09-04-api-identidade-cliente-design.md`

As cinco fases anteriores estão na `main` (PRs #1 a #5), cada uma com
plano próprio em `docs/superpowers/plans/`. Esta é a sexta, e o passo 3
do roadmap — as 23 telas — depende dela.

## Global Constraints

- Node 24.13.1, pnpm 9.0.0. Monorepo pnpm + Turborepo.
- TypeScript estrito. A API builda com `tsup`, não com `tsc`.
- Comentários, mensagens de erro e documentação em português, com acentuação correta. Mensagens de commit em inglês, Conventional Commits.
- **Todo horário no contrato HTTP é string `"HH:mm"`; toda data é `"YYYY-MM-DD"`.**
- **Nenhum `Date` destinado ao banco é construído a partir de string local.** Só via `lib/horas.ts`, sempre `Date.UTC`.
- Rota pública escopa pelo `:slug`; rota protegida nunca aceita `barbeariaId` no corpo.
- **Todo `:id` e todo id de query é validado com pattern** (`PADRAO_UUID`).
- `buildApp()` roda com `removeAdditional: false`, então campo fora do schema é 400.
- **Nenhum serializador usa spread do registro do banco.** Campos listados um a um — é o que impede `senhaHash` de escapar.
- Rodar `pnpm --filter @barchop/api test` e `pnpm --filter @barchop/api type-check` antes de cada commit.

## O que já existe e não precisa ser construído

Três coisas foram deixadas prontas por fases anteriores. Quem executar
este plano precisa saber disso antes de escrever código redundante:

- **`Cliente.email` e `Cliente.senhaHash` já existem no schema**
  (`packages/database/prisma/schema.prisma:86-87`), nuláveis. **Não há
  migration nesta fase.**
- **`serializarCliente` já existe** (`apps/api/src/lib/serializar.ts:94`)
  e já devolve `temConta: cliente.senhaHash !== null`. O tipo
  `ClientePublico` em `packages/types` já tem o campo. Nada a criar.
- **`gerarHashSenha` e `conferirSenha`** (`apps/api/src/lib/senha.ts`)
  são os mesmos do barbeiro, scrypt do `node:crypto`.

## Desvio consciente da spec

**A spec cita `tests/rotas/auth-escopo-cruzado.test.ts` como um arquivo
só; o plano o constrói em dois momentos.** A Task 1 cria o arquivo com o
lado do barbeiro (token de cliente recusado em rota de barbeiro), porque
é o único lado testável antes de existir rota de cliente. A Task 5 volta
nele e acrescenta o inverso. Um arquivo, duas passagens — e a Task 5 não
pode ser dada como pronta sem o caso que ela acrescenta.

## Pré-requisitos

Nenhum. Sem migration, sem dependência nova. O banco de teste
(`apps/api/.env.test`) e o de dev já estão migrados.

---

## Task 1: `tipo` no payload e o hook do barbeiro

O token do barbeiro passa a carregar `tipo: "barbeiro"`, e `autenticar`
passa a recusar qualquer outro tipo. Nada de cliente ainda — esta task
existe para o resto da fase poder assumir que todo token diz o que é.

**Files:**
- Modify: `apps/api/src/plugins/auth.ts`
- Modify: `apps/api/src/rotas/auth.ts` (as duas chamadas de `app.jwt.sign`)
- Test: `apps/api/tests/rotas/auth-escopo-cruzado.test.ts` (criar)

**Interfaces:**
- Consumes: nada.
- Produces: `PayloadBarbeiro` e `PayloadCliente` exportados de
  `src/plugins/auth.ts`; `autenticar` inalterado na assinatura
  (`(request: FastifyRequest) => Promise<void>`).

- [ ] **Step 1: Escrever o teste que falha**

Criar `apps/api/tests/rotas/auth-escopo-cruzado.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildApp } from "../../src/app";
import { auth, criarBarbeariaComToken } from "../helpers/barbearia";
import { decodificarPayload } from "../helpers/decodificar-token";

describe("tipo do token", () => {
  it("o token do signup carrega tipo barbeiro", async () => {
    const app = buildApp();
    const { token } = await criarBarbeariaComToken(app);

    expect(decodificarPayload(token).tipo).toBe("barbeiro");
  });

  it("recusa um token de tipo cliente numa rota de barbeiro", async () => {
    const app = buildApp();
    const { barbeariaId } = await criarBarbeariaComToken(app);

    // app.jwt só existe depois do ready: quem registra o plugin é o
    // buildApp, e o registro do Fastify é assíncrono.
    await app.ready();

    const tokenDeCliente = app.jwt.sign({
      tipo: "cliente",
      clienteId: "00000000-0000-4000-8000-000000000000",
      barbeariaId,
    });

    const resposta = await app.inject({
      method: "GET",
      url: "/me",
      headers: auth(tokenDeCliente),
    });

    expect(resposta.statusCode).toBe(401);
    expect(resposta.json()).toEqual({ erro: "nao_autenticado" });
  });

  it("recusa um token antigo, emitido sem tipo", async () => {
    const app = buildApp();
    const { barbeariaId, barbeiroId } = await criarBarbeariaComToken(app);
    await app.ready();

    // O `as never` é o ponto do teste: este payload não é mais válido
    // pelo tipo, e o que se mede é o que acontece com um token que já
    // estava na mão de alguém quando a fase subiu.
    const tokenAntigo = app.jwt.sign({ barbeiroId, barbeariaId } as never);

    const resposta = await app.inject({
      method: "GET",
      url: "/me",
      headers: auth(tokenAntigo),
    });

    expect(resposta.statusCode).toBe(401);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `pnpm --filter @barchop/api test auth-escopo-cruzado`
Expected: FAIL — o primeiro caso vê `tipo` como `undefined`, e os dois
seguintes recebem 200 em vez de 401.

- [ ] **Step 3: Tipar o payload e apertar o hook**

Em `apps/api/src/plugins/auth.ts`, trocar o bloco `declare module` e a
função `autenticar`:

```ts
// As duas identidades da plataforma. O `tipo` é o que separa uma da
// outra dentro de um token: sem ele, um token de cliente e um de
// barbeiro só se distinguiriam pelos campos presentes, e um payload
// forjado com os dois passaria pelos dois hooks.
export interface PayloadBarbeiro {
  tipo: "barbeiro";
  barbeiroId: string;
  barbeariaId: string;
}

export interface PayloadCliente {
  tipo: "cliente";
  clienteId: string;
  barbeariaId: string;
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    // O que se assina pode ser qualquer uma das duas...
    payload: PayloadBarbeiro | PayloadCliente;
    // ...mas `request.user` é lido só dentro do escopo protegido do
    // barbeiro, onde o hook abaixo já garantiu qual é. Declarar a união
    // aqui obrigaria narrowing em seis arquivos de rota que hoje leem
    // `request.user.barbeariaId` direto, sem ganhar segurança nenhuma:
    // quem garante não é o tipo, é o hook.
    user: PayloadBarbeiro;
  }
}

export async function autenticar(request: FastifyRequest): Promise<void> {
  // O retorno do jwtVerify, e não o request.user: `user` está declarado
  // como PayloadBarbeiro, então `request.user.tipo` teria o tipo
  // literal "barbeiro" e o compilador trataria a comparação abaixo como
  // sempre falsa — a checagem funcionaria em runtime e pareceria código
  // morto pra quem refatorasse depois.
  const payload = await request.jwtVerify<PayloadBarbeiro | PayloadCliente>();

  if (payload.tipo !== "barbeiro") {
    throw Object.assign(new Error("token não é de barbeiro"), {
      statusCode: 401,
    });
  }

  // Verificar a assinatura não basta: desativar um barbeiro não tiraria
  // o acesso de quem já tem token na mão. Uma query por requisição
  // protegida é o preço de a desativação ser real.
  const barbeiro = await prisma.barbeiro.findUnique({
    where: { id: payload.barbeiroId },
    select: { ativo: true },
  });

  if (!barbeiro?.ativo) {
    throw Object.assign(new Error("barbeiro inativo ou inexistente"), {
      statusCode: 401,
    });
  }
}
```

Em `apps/api/src/rotas/auth.ts`, as duas emissões de token ganham o
campo. No signup:

```ts
      const token = app.jwt.sign({
        tipo: "barbeiro",
        barbeiroId: criado.barbeiro.id,
        barbeariaId: criado.barbearia.id,
      });
```

E a do login, do mesmo jeito — `tipo: "barbeiro"` como primeiro campo,
mantendo `barbeiroId` e `barbeariaId` como já estão.

- [ ] **Step 4: Rodar os testes**

Run: `pnpm --filter @barchop/api test`
Expected: PASS, inclusive os testes de auth que já existiam
(`auth-login`, `auth-signup`) — eles não olham o payload, então o campo
novo não os afeta.

Run: `pnpm --filter @barchop/api type-check`
Expected: sem erro.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/plugins/auth.ts apps/api/src/rotas/auth.ts apps/api/tests/rotas/auth-escopo-cruzado.test.ts
git commit -m "feat(api): stamp the identity type on every token"
```

---

## Task 2: `GET /barbearias/:slug` devolve os barbeiros

A lacuna que trava o fluxo público inteiro: `/disponibilidade`,
`/disponibilidade/mes` e o POST público de agendamento exigem
`barbeiroId`, e nenhuma rota pública o entrega.

**Files:**
- Modify: `apps/api/src/rotas/barbearias.ts:64-81`
- Test: `apps/api/tests/rotas/barbearias-publica.test.ts` (acrescentar caso)

**Interfaces:**
- Consumes: nada da Task 1.
- Produces: o corpo de `GET /barbearias/:slug` passa a ter
  `barbeiros: { id: string; nome: string }[]`.

- [ ] **Step 1: Escrever o teste que falha**

Acrescentar em `apps/api/tests/rotas/barbearias-publica.test.ts`, dentro
do `describe` que já existe:

```ts
  it("devolve os barbeiros ativos, que é o que o fluxo do cliente precisa", async () => {
    const app = buildApp();
    const { slug, barbeiroId } = await criarBarbeariaComToken(app);

    const resposta = await app.inject({
      method: "GET",
      url: `/barbearias/${slug}`,
    });

    expect(resposta.statusCode).toBe(200);
    // Sem este id o cliente não consegue chamar /disponibilidade nem
    // criar agendamento: as duas rotas exigem barbeiroId.
    expect(resposta.json().barbeiros).toEqual([
      { id: barbeiroId, nome: "Barbeiro um" },
    ]);
  });

  it("não devolve barbeiro desativado", async () => {
    const app = buildApp();
    const { slug, barbeiroId } = await criarBarbeariaComToken(app);

    await prisma.barbeiro.update({
      where: { id: barbeiroId },
      data: { ativo: false },
    });

    const resposta = await app.inject({
      method: "GET",
      url: `/barbearias/${slug}`,
    });

    expect(resposta.json().barbeiros).toEqual([]);
  });
```

Se `prisma` ainda não estiver importado nesse arquivo, acrescentar
`import { prisma } from "@barchop/database";` no topo.

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `pnpm --filter @barchop/api test barbearias-publica`
Expected: FAIL — `resposta.json().barbeiros` é `undefined`.

- [ ] **Step 3: Incluir os barbeiros na resposta**

Em `apps/api/src/rotas/barbearias.ts`, dentro de
`registrarRotasBarbeariasPublicas`:

```ts
      const barbearia = await prisma.barbearia.findUniqueOrThrow({
        where: { slug: request.params.slug },
        include: {
          horariosFuncionamento: true,
          // Só id e nome, e só os ativos. O select explícito é o que
          // impede o senhaHash do barbeiro de sair numa rota pública —
          // é exatamente o que o comentário do serializador alertava.
          barbeiros: {
            where: { ativo: true },
            select: { id: true, nome: true },
            orderBy: { nome: "asc" },
          },
        },
      });

      // Campos escolhidos pelo serializador: um spread traria o
      // senhaHash junto.
      return {
        ...serializarBarbearia(barbearia),
        horarios: completarSemana(barbearia.horariosFuncionamento),
        // O cliente precisa deste id pra chamar /disponibilidade e pra
        // criar o agendamento; sem ele o fluxo público não fecha.
        barbeiros: barbearia.barbeiros,
      };
```

- [ ] **Step 4: Rodar os testes**

Run: `pnpm --filter @barchop/api test barbearias-publica`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/rotas/barbearias.ts apps/api/tests/rotas/barbearias-publica.test.ts
git commit -m "feat(api): expose the active barbers on the public shop route"
```

---

## Task 3: `POST /barbearias/:slug/auth/cliente/signup`

Cliente ganha conta. Telefone novo cria o cadastro; telefone que já
existe sem senha ganha a senha; telefone que já tem senha é recusado.

**Files:**
- Create: `apps/api/src/rotas/auth-cliente.ts`
- Modify: `apps/api/src/app.ts` (registrar as rotas públicas)
- Test: `apps/api/tests/rotas/auth-cliente-signup.test.ts`

**Interfaces:**
- Consumes: `PayloadCliente` da Task 1; `gerarHashSenha` de `lib/senha.ts`;
  `serializarCliente` de `lib/serializar.ts`.
- Produces: `registrarRotasAuthCliente(app: App): void`, exportada de
  `src/rotas/auth-cliente.ts`. Resposta do signup:
  `201 { token: string; cliente: ClienteSerializado }`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `apps/api/tests/rotas/auth-cliente-signup.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { prisma } from "@barchop/database";
import { buildApp } from "../../src/app";
import { criarBarbeariaComToken } from "../helpers/barbearia";
import { decodificarPayload } from "../helpers/decodificar-token";

const SENHA = "senha-forte-123";

describe("POST /barbearias/:slug/auth/cliente/signup", () => {
  it("cria o cadastro quando o telefone é novo", async () => {
    const app = buildApp();
    const { slug, barbeariaId } = await criarBarbeariaComToken(app);

    const resposta = await app.inject({
      method: "POST",
      url: `/barbearias/${slug}/auth/cliente/signup`,
      payload: { nome: "João da Silva", telefone: "11999998888", senha: SENHA },
    });

    expect(resposta.statusCode).toBe(201);
    expect(resposta.json().cliente).toMatchObject({
      nome: "João da Silva",
      telefone: "11999998888",
      temConta: true,
    });

    const payload = decodificarPayload(resposta.json().token);
    expect(payload.tipo).toBe("cliente");
    expect(payload.barbeariaId).toBe(barbeariaId);
  });

  it("define a senha de um cadastro que já existe sem senha", async () => {
    const app = buildApp();
    const { slug, barbeariaId } = await criarBarbeariaComToken(app);

    // É o cadastro que o upsert do agendamento público cria: sem senha,
    // e com o nome que o barbeiro registrou.
    const existente = await prisma.cliente.create({
      data: { barbeariaId, nome: "João Silva", telefone: "11999998888" },
    });

    const resposta = await app.inject({
      method: "POST",
      url: `/barbearias/${slug}/auth/cliente/signup`,
      payload: { nome: "Jo", telefone: "11999998888", senha: SENHA },
    });

    expect(resposta.statusCode).toBe(201);
    expect(resposta.json().cliente.id).toBe(existente.id);
    // O nome do signup NÃO sobrescreve: mesma regra do `update: {}` do
    // upsert público, pra quem digita abreviado no celular não renomear
    // o cadastro que o barbeiro ajustou.
    expect(resposta.json().cliente.nome).toBe("João Silva");
  });

  it("recusa quando o cadastro já tem senha", async () => {
    const app = buildApp();
    const { slug } = await criarBarbeariaComToken(app);
    const payload = {
      nome: "João da Silva",
      telefone: "11999998888",
      senha: SENHA,
    };

    await app.inject({
      method: "POST",
      url: `/barbearias/${slug}/auth/cliente/signup`,
      payload,
    });

    const segunda = await app.inject({
      method: "POST",
      url: `/barbearias/${slug}/auth/cliente/signup`,
      payload,
    });

    expect(segunda.statusCode).toBe(409);
    expect(segunda.json().erro).toBe("conflito");
  });

  it("nunca devolve o senhaHash", async () => {
    const app = buildApp();
    const { slug } = await criarBarbeariaComToken(app);

    const resposta = await app.inject({
      method: "POST",
      url: `/barbearias/${slug}/auth/cliente/signup`,
      payload: { nome: "João da Silva", telefone: "11999998888", senha: SENHA },
    });

    expect(resposta.body).not.toContain("scrypt");
    expect(resposta.json().cliente.senhaHash).toBeUndefined();
  });

  it("404 em slug que não existe", async () => {
    const app = buildApp();

    const resposta = await app.inject({
      method: "POST",
      url: "/barbearias/nao-existe/auth/cliente/signup",
      payload: { nome: "João da Silva", telefone: "11999998888", senha: SENHA },
    });

    expect(resposta.statusCode).toBe(404);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `pnpm --filter @barchop/api test auth-cliente-signup`
Expected: FAIL com 404 em todos os casos — a rota não existe.

- [ ] **Step 3: Escrever a rota**

Criar `apps/api/src/rotas/auth-cliente.ts`:

```ts
import { prisma } from "@barchop/database";
import { conflito } from "../lib/erro-http";
import { PADRAO_TELEFONE } from "../lib/padroes";
import { gerarHashSenha } from "../lib/senha";
import { serializarCliente } from "../lib/serializar";
import type { App } from "../tipos";

const paramsSlug = {
  type: "object",
  required: ["slug"],
  additionalProperties: false,
  properties: { slug: { type: "string", pattern: "^[a-z0-9-]{3,80}$" } },
} as const;

const corpoSignup = {
  type: "object",
  required: ["nome", "telefone", "senha"],
  additionalProperties: false,
  properties: {
    nome: { type: "string", minLength: 2, maxLength: 120 },
    telefone: { type: "string", pattern: PADRAO_TELEFONE, maxLength: 20 },
    senha: { type: "string", minLength: 8, maxLength: 200 },
  },
} as const;

// Públicas: são as telas de criar conta e entrar, abertas pelo link do
// WhatsApp. Ficam fora dos dois escopos protegidos do app.ts.
export function registrarRotasAuthCliente(app: App): void {
  app.post(
    "/barbearias/:slug/auth/cliente/signup",
    { schema: { params: paramsSlug, body: corpoSignup } },
    async (request, reply) => {
      const { nome, telefone, senha } = request.body;

      // findUniqueOrThrow: slug inexistente vira P2025 -> 404.
      const barbearia = await prisma.barbearia.findUniqueOrThrow({
        where: { slug: request.params.slug },
        select: { id: true },
      });

      const existente = await prisma.cliente.findUnique({
        where: {
          barbeariaId_telefone: { barbeariaId: barbearia.id, telefone },
        },
      });

      // Definir senha só é permitido enquanto não existe uma. Sem posse
      // verificada do telefone (OTP), esta é a única barreira contra
      // alguém assumir o cadastro de outra pessoa — quem chegar
      // primeiro fica com ele, e é uma dívida registrada na spec e no
      // roadmap, não um esquecimento.
      if (existente?.senhaHash) {
        throw conflito("esse telefone já tem conta nesta barbearia");
      }

      const senhaHash = await gerarHashSenha(senha);

      // `nome` só entra na criação. Num cadastro que já existe, o nome
      // do signup é ignorado de propósito: mesma regra do `update: {}`
      // vazio do upsert público — quem digita o nome abreviado no
      // celular não renomeia o cadastro que o barbeiro ajustou.
      const cliente = existente
        ? await prisma.cliente.update({
            where: { id: existente.id },
            data: { senhaHash },
          })
        : await prisma.cliente.create({
            data: { barbeariaId: barbearia.id, nome, telefone, senhaHash },
          });

      const token = app.jwt.sign({
        tipo: "cliente",
        clienteId: cliente.id,
        barbeariaId: barbearia.id,
      });

      return reply.code(201).send({ token, cliente: serializarCliente(cliente) });
    }
  );
}
```

Em `apps/api/src/app.ts`, importar e registrar junto das outras públicas:

```ts
import { registrarRotasAuthCliente } from "./rotas/auth-cliente";
```

e, na sequência das públicas (depois de `registrarRotasAuth(app);`):

```ts
  registrarRotasAuthCliente(app);
```

- [ ] **Step 4: Rodar os testes**

Run: `pnpm --filter @barchop/api test auth-cliente-signup`
Expected: PASS, os cinco casos.

Run: `pnpm --filter @barchop/api type-check`
Expected: sem erro.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/rotas/auth-cliente.ts apps/api/src/app.ts apps/api/tests/rotas/auth-cliente-signup.test.ts
git commit -m "feat(api): let a client claim an account with a password"
```

---

## Task 4: `POST /barbearias/:slug/auth/cliente/login`

**Files:**
- Modify: `apps/api/src/rotas/auth-cliente.ts`
- Test: `apps/api/tests/rotas/auth-cliente-login.test.ts`

**Interfaces:**
- Consumes: `registrarRotasAuthCliente` da Task 3; `conferirSenha` de
  `lib/senha.ts`.
- Produces: `200 { token, cliente }` no login.

- [ ] **Step 1: Escrever o teste que falha**

Criar `apps/api/tests/rotas/auth-cliente-login.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { prisma } from "@barchop/database";
import { buildApp } from "../../src/app";
import { criarBarbeariaComToken } from "../helpers/barbearia";
import { decodificarPayload } from "../helpers/decodificar-token";
import type { App } from "../../src/tipos";

const SENHA = "senha-forte-123";
const TELEFONE = "11999998888";

async function criarConta(app: App, slug: string) {
  return app.inject({
    method: "POST",
    url: `/barbearias/${slug}/auth/cliente/signup`,
    payload: { nome: "João da Silva", telefone: TELEFONE, senha: SENHA },
  });
}

describe("POST /barbearias/:slug/auth/cliente/login", () => {
  it("devolve token de cliente com a senha certa", async () => {
    const app = buildApp();
    const { slug } = await criarBarbeariaComToken(app);
    await criarConta(app, slug);

    const resposta = await app.inject({
      method: "POST",
      url: `/barbearias/${slug}/auth/cliente/login`,
      payload: { telefone: TELEFONE, senha: SENHA },
    });

    expect(resposta.statusCode).toBe(200);
    expect(decodificarPayload(resposta.json().token).tipo).toBe("cliente");
  });

  it("responde igual para senha errada e para telefone inexistente", async () => {
    const app = buildApp();
    const { slug } = await criarBarbeariaComToken(app);
    await criarConta(app, slug);

    const senhaErrada = await app.inject({
      method: "POST",
      url: `/barbearias/${slug}/auth/cliente/login`,
      payload: { telefone: TELEFONE, senha: "outra-senha-123" },
    });

    const telefoneInexistente = await app.inject({
      method: "POST",
      url: `/barbearias/${slug}/auth/cliente/login`,
      payload: { telefone: "11888887777", senha: SENHA },
    });

    // Corpo idêntico: distinguir os dois entregaria quais telefones são
    // clientes desta barbearia.
    expect(senhaErrada.statusCode).toBe(401);
    expect(telefoneInexistente.statusCode).toBe(401);
    expect(senhaErrada.json()).toEqual(telefoneInexistente.json());
  });

  it("recusa cadastro que ainda não tem senha", async () => {
    const app = buildApp();
    const { slug, barbeariaId } = await criarBarbeariaComToken(app);

    // Cadastro criado pelo barbeiro no walk-in: sem senhaHash.
    await prisma.cliente.create({
      data: { barbeariaId, nome: "João da Silva", telefone: TELEFONE },
    });

    const resposta = await app.inject({
      method: "POST",
      url: `/barbearias/${slug}/auth/cliente/login`,
      payload: { telefone: TELEFONE, senha: SENHA },
    });

    expect(resposta.statusCode).toBe(401);
  });

  it("não alcança cliente de outra barbearia com o mesmo telefone", async () => {
    const app = buildApp();
    const primeira = await criarBarbeariaComToken(app, "um");
    const segunda = await criarBarbeariaComToken(app, "dois");
    await criarConta(app, primeira.slug);

    const resposta = await app.inject({
      method: "POST",
      url: `/barbearias/${segunda.slug}/auth/cliente/login`,
      payload: { telefone: TELEFONE, senha: SENHA },
    });

    // Cliente é por barbearia (@@unique([barbeariaId, telefone])): a
    // conta da primeira não vale na segunda.
    expect(resposta.statusCode).toBe(401);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `pnpm --filter @barchop/api test auth-cliente-login`
Expected: FAIL com 404 — a rota não existe.

- [ ] **Step 3: Escrever a rota**

Acrescentar em `apps/api/src/rotas/auth-cliente.ts`, dentro de
`registrarRotasAuthCliente`, e o import de `conferirSenha` no topo
(`import { conferirSenha, gerarHashSenha } from "../lib/senha";`):

No escopo do módulo, junto dos schemas que já estão lá:

```ts
const corpoLogin = {
  type: "object",
  required: ["telefone", "senha"],
  additionalProperties: false,
  properties: {
    telefone: { type: "string", pattern: PADRAO_TELEFONE, maxLength: 20 },
    senha: { type: "string", minLength: 1, maxLength: 200 },
  },
} as const;

// Nada de `const HASH = await gerarHashSenha(...)` no topo do módulo: a
// API compila pra CJS via tsup, onde top-level await não existe. O hash
// é calculado na primeira recusa e reaproveitado — o custo que interessa
// é o do conferirSenha, que roda sempre.
let hashDescartavel: string | null = null;

async function custoDeSenhaInvalida(senha: string): Promise<false> {
  hashDescartavel ??= await gerarHashSenha("senha-que-nao-existe");
  await conferirSenha(senha, hashDescartavel);
  return false;
}
```

E a rota:

```ts
  app.post(
    "/barbearias/:slug/auth/cliente/login",
    { schema: { params: paramsSlug, body: corpoLogin } },
    async (request, reply) => {
      const { telefone, senha } = request.body;

      const barbearia = await prisma.barbearia.findUniqueOrThrow({
        where: { slug: request.params.slug },
        select: { id: true },
      });

      const cliente = await prisma.cliente.findUnique({
        where: {
          barbeariaId_telefone: { barbeariaId: barbearia.id, telefone },
        },
      });

      // Telefone inexistente, cadastro sem senha e senha errada dão
      // exatamente a mesma resposta — e custam o mesmo. Pular o
      // conferirSenha quando não há cliente faria essa resposta voltar
      // muito mais rápido, porque o scrypt é lento de propósito: o
      // relógio entregaria o que o corpo esconde. Mesmo raciocínio do
      // login do barbeiro, em rotas/auth.ts.
      const autorizado = cliente?.senhaHash
        ? await conferirSenha(senha, cliente.senhaHash)
        : await custoDeSenhaInvalida(senha);

      if (!autorizado || !cliente) {
        return reply.code(401).send({ erro: "nao_autenticado" });
      }

      const token = app.jwt.sign({
        tipo: "cliente",
        clienteId: cliente.id,
        barbeariaId: barbearia.id,
      });

      return reply.send({ token, cliente: serializarCliente(cliente) });
    }
  );
```

- [ ] **Step 4: Rodar os testes**

Run: `pnpm --filter @barchop/api test auth-cliente-login`
Expected: PASS, os quatro casos.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/rotas/auth-cliente.ts apps/api/tests/rotas/auth-cliente-login.test.ts
git commit -m "feat(api): log a client in by phone and password"
```

---

## Task 5: O escopo do cliente, `GET /clientes/me` e `PATCH /clientes/me`

Primeira rota protegida do cliente: entra o hook, o escopo e o helper
que lê o token.

**Files:**
- Modify: `apps/api/src/plugins/auth.ts` (hook `autenticarCliente`, helper `clienteDoToken`)
- Create: `apps/api/src/rotas/clientes-me.ts`
- Modify: `apps/api/src/app.ts` (terceiro escopo)
- Create: `apps/api/tests/helpers/cliente.ts`
- Test: `apps/api/tests/rotas/clientes-me.test.ts`
- Test: `apps/api/tests/rotas/auth-escopo-cruzado.test.ts` (acrescentar o inverso)

**Interfaces:**
- Consumes: `PayloadCliente` (Task 1), o signup (Task 3).
- Produces:
  - `autenticarCliente(request: FastifyRequest): Promise<void>`
  - `clienteDoToken(request: FastifyRequest): PayloadCliente`
  - `registrarRotasClientesMe(app: App): void`
  - helper de teste `criarClienteComToken(app, slug): Promise<{ token, clienteId }>`
    e `auth(token)` (este último já existe em `tests/helpers/barbearia.ts`).

- [ ] **Step 1: Escrever o helper de teste e os testes que falham**

Criar `apps/api/tests/helpers/cliente.ts`:

```ts
import type { App } from "../../src/tipos";

export interface ClienteDeTeste {
  token: string;
  clienteId: string;
}

// Cria uma conta de cliente na barbearia do slug e devolve o token
// pronto. O telefone entra por parâmetro porque vários testes precisam
// de dois clientes na mesma barbearia — o segundo existe pra provar que
// o agendamento de um não é alcançável pelo outro.
export async function criarClienteComToken(
  app: App,
  slug: string,
  telefone = "11999998888"
): Promise<ClienteDeTeste> {
  const resposta = await app.inject({
    method: "POST",
    url: `/barbearias/${slug}/auth/cliente/signup`,
    payload: { nome: "João da Silva", telefone, senha: "senha-forte-123" },
  });

  // Sem esta guarda, um signup quebrado apareceria como "token
  // undefined" lá adiante, num 401 confuso a três arquivos de distância.
  if (resposta.statusCode !== 201) {
    throw new Error(
      `signup de cliente falhou no helper: ${resposta.statusCode} ${resposta.body}`
    );
  }

  const corpo = resposta.json();
  return { token: corpo.token, clienteId: corpo.cliente.id };
}
```

Criar `apps/api/tests/rotas/clientes-me.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { prisma } from "@barchop/database";
import { buildApp } from "../../src/app";
import { auth, criarBarbeariaComToken } from "../helpers/barbearia";
import { criarClienteComToken } from "../helpers/cliente";

describe("GET /clientes/me", () => {
  it("devolve o cliente do token", async () => {
    const app = buildApp();
    const { slug } = await criarBarbeariaComToken(app);
    const { token, clienteId } = await criarClienteComToken(app, slug);

    const resposta = await app.inject({
      method: "GET",
      url: "/clientes/me",
      headers: auth(token),
    });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().cliente).toMatchObject({
      id: clienteId,
      nome: "João da Silva",
      temConta: true,
    });
    expect(resposta.body).not.toContain("scrypt");
  });

  it("401 sem token", async () => {
    const app = buildApp();

    const resposta = await app.inject({ method: "GET", url: "/clientes/me" });

    expect(resposta.statusCode).toBe(401);
    expect(resposta.json()).toEqual({ erro: "nao_autenticado" });
  });

  it("401 depois de o cadastro ser apagado", async () => {
    const app = buildApp();
    const { slug } = await criarBarbeariaComToken(app);
    const { token, clienteId } = await criarClienteComToken(app, slug);

    await prisma.cliente.delete({ where: { id: clienteId } });

    // O token continua com assinatura válida por 7 dias: quem invalida
    // na hora é a consulta que o hook faz.
    const resposta = await app.inject({
      method: "GET",
      url: "/clientes/me",
      headers: auth(token),
    });

    expect(resposta.statusCode).toBe(401);
  });
});

describe("PATCH /clientes/me", () => {
  it("edita nome e email", async () => {
    const app = buildApp();
    const { slug } = await criarBarbeariaComToken(app);
    const { token } = await criarClienteComToken(app, slug);

    const resposta = await app.inject({
      method: "PATCH",
      url: "/clientes/me",
      headers: auth(token),
      payload: { nome: "João S.", email: "joao@exemplo.com" },
    });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().cliente).toMatchObject({
      nome: "João S.",
      email: "joao@exemplo.com",
    });
  });

  it("400 em corpo vazio", async () => {
    const app = buildApp();
    const { slug } = await criarBarbeariaComToken(app);
    const { token } = await criarClienteComToken(app, slug);

    const resposta = await app.inject({
      method: "PATCH",
      url: "/clientes/me",
      headers: auth(token),
      payload: {},
    });

    expect(resposta.statusCode).toBe(400);
  });

  it("400 ao tentar trocar o telefone, que é a chave do login", async () => {
    const app = buildApp();
    const { slug } = await criarBarbeariaComToken(app);
    const { token } = await criarClienteComToken(app, slug);

    const resposta = await app.inject({
      method: "PATCH",
      url: "/clientes/me",
      headers: auth(token),
      payload: { telefone: "11888887777" },
    });

    expect(resposta.statusCode).toBe(400);
  });
});
```

E acrescentar em `apps/api/tests/rotas/auth-escopo-cruzado.test.ts` o
lado que faltava:

```ts
  it("recusa um token de barbeiro numa rota de cliente", async () => {
    const app = buildApp();
    const { token } = await criarBarbeariaComToken(app);

    const resposta = await app.inject({
      method: "GET",
      url: "/clientes/me",
      headers: auth(token),
    });

    // É este caso, mais o inverso lá em cima, que sustenta a escolha de
    // um segredo de JWT só: sem os dois, a separação entre as duas
    // identidades seria confiança, não prova.
    expect(resposta.statusCode).toBe(401);
    expect(resposta.json()).toEqual({ erro: "nao_autenticado" });
  });
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `pnpm --filter @barchop/api test clientes-me auth-escopo-cruzado`
Expected: FAIL — 404 nas rotas de `/clientes/me`, e o caso novo do
escopo cruzado passa por acidente (404 não é 401), o que o Step 4
corrige de verdade.

- [ ] **Step 3: Hook, helper, rotas e escopo**

Em `apps/api/src/plugins/auth.ts`, acrescentar depois de `autenticar`:

```ts
// Hook onRequest do escopo do cliente. Espelho do `autenticar`: recusa
// o tipo que não é o seu antes de tocar no banco, e consulta o cadastro
// pra que apagar um cliente invalide o token na hora, não em sete dias.
export async function autenticarCliente(request: FastifyRequest): Promise<void> {
  const payload = await request.jwtVerify<PayloadBarbeiro | PayloadCliente>();

  if (payload.tipo !== "cliente") {
    throw Object.assign(new Error("token não é de cliente"), {
      statusCode: 401,
    });
  }

  const cliente = await prisma.cliente.findUnique({
    where: { id: payload.clienteId },
    select: { id: true },
  });

  if (!cliente) {
    throw Object.assign(new Error("cliente inexistente"), { statusCode: 401 });
  }

  request.cliente = payload;
}

// Lê o cliente que o hook decorou. `request.cliente` é opcional na
// declaração — a alternativa seria um `!` em cada uma das seis rotas do
// escopo, e isso dependeria de ninguém esquecer. Aqui o esquecimento
// vira 401, não `undefined` vazando pro Prisma.
export function clienteDoToken(request: FastifyRequest): PayloadCliente {
  if (!request.cliente) {
    throw Object.assign(new Error("rota de cliente fora do escopo autenticado"), {
      statusCode: 401,
    });
  }

  return request.cliente;
}
```

E, junto do `declare module "@fastify/jwt"` que a Task 1 escreveu:

```ts
declare module "fastify" {
  interface FastifyRequest {
    // Preenchido só pelo autenticarCliente. Opcional porque o tipo vale
    // pra toda requisição da aplicação, inclusive as do barbeiro.
    cliente?: PayloadCliente;
  }
}
```

Criar `apps/api/src/rotas/clientes-me.ts`:

```ts
import { prisma } from "@barchop/database";
import { clienteDoToken } from "../plugins/auth";
import { PADRAO_EMAIL } from "../lib/padroes";
import { serializarCliente } from "../lib/serializar";
import type { App } from "../tipos";

// Telefone fica de fora: é a chave do login e do upsert do agendamento
// público. Trocar por aqui separaria a conta do histórico sem aviso.
// `additionalProperties: false` é o que transforma "fora da lista" em
// 400 em vez de silêncio.
const corpoPatch = {
  type: "object",
  additionalProperties: false,
  // Corpo vazio seria um UPDATE sem efeito respondendo 200.
  minProperties: 1,
  properties: {
    nome: { type: "string", minLength: 2, maxLength: 120 },
    email: { type: ["string", "null"], pattern: PADRAO_EMAIL, maxLength: 160 },
  },
} as const;

// Sem `onRequest` aqui: quem autentica é o escopo do cliente, no app.ts.
export function registrarRotasClientesMe(app: App): void {
  app.get("/clientes/me", async (request) => {
    const { clienteId } = clienteDoToken(request);

    // O id vem do token, nunca da URL — é o que impede um cliente de
    // ler o cadastro de outro.
    const cliente = await prisma.cliente.findUniqueOrThrow({
      where: { id: clienteId },
    });

    return { cliente: serializarCliente(cliente) };
  });

  app.patch("/clientes/me", { schema: { body: corpoPatch } }, async (request) => {
    const { clienteId } = clienteDoToken(request);

    // `request.body` já passou pelo schema com additionalProperties:
    // false, então só carrega os campos editáveis.
    const cliente = await prisma.cliente.update({
      where: { id: clienteId },
      data: request.body,
    });

    return { cliente: serializarCliente(cliente) };
  });
}
```

Em `apps/api/src/app.ts`, acrescentar o terceiro escopo depois do escopo
protegido do barbeiro:

```ts
import { autenticar, autenticarCliente, registrarAuth } from "./plugins/auth";
import { registrarRotasClientesMe } from "./rotas/clientes-me";
```

```ts
  // Escopo do cliente, irmão do de cima e pelo mesmo motivo: o hook vale
  // pra tudo que for registrado aqui dentro. São identidades diferentes,
  // então são escopos diferentes — o hook de um recusa o token do outro.
  app.register(async (doCliente: App) => {
    doCliente.addHook("onRequest", autenticarCliente);
    registrarRotasClientesMe(doCliente);
  });
```

- [ ] **Step 4: Rodar os testes**

Run: `pnpm --filter @barchop/api test`
Expected: PASS — a suíte inteira, incluindo os quatro casos do escopo
cruzado.

Run: `pnpm --filter @barchop/api type-check`
Expected: sem erro.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/plugins/auth.ts apps/api/src/rotas/clientes-me.ts apps/api/src/app.ts apps/api/tests/helpers/cliente.ts apps/api/tests/rotas/clientes-me.test.ts apps/api/tests/rotas/auth-escopo-cruzado.test.ts
git commit -m "feat(api): give the client a scope and a profile route"
```

---

## Task 6: `GET /clientes/me/agendamentos`

**Files:**
- Modify: `apps/api/src/rotas/clientes-me.ts`
- Test: `apps/api/tests/rotas/clientes-me-agendamentos.test.ts`

**Interfaces:**
- Consumes: `clienteDoToken`, `registrarRotasClientesMe` (Task 5);
  `serializarAgendamento` e `INCLUDE_AGENDAMENTO` (`lib/serializar.ts`,
  `lib/agendamento.ts`).
- Produces: `{ agendamentos: AgendamentoSerializado[] }`, mais recente
  primeiro.

- [ ] **Step 1: Escrever o teste que falha**

Criar `apps/api/tests/rotas/clientes-me-agendamentos.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { prisma } from "@barchop/database";
import { buildApp } from "../../src/app";
import { dataParaDate, horaParaDate } from "../../src/lib/horas";
import { auth, criarBarbeariaComToken } from "../helpers/barbearia";
import { criarClienteComToken } from "../helpers/cliente";

// A fase 4 é quem cria agendamento por HTTP. Aqui o registro é semeado
// direto no banco, com as datas passando por lib/horas.ts — o mesmo
// caminho que a rota usa.
async function semear(params: {
  barbeariaId: string;
  barbeiroId: string;
  clienteId: string;
  data: string;
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
      data: dataParaDate(params.data),
      horaInicio: horaParaDate("10:00"),
      horaFim: horaParaDate("10:45"),
      servicos: {
        create: [
          { servicoId: servico.id, precoNoMomento: "45.00", duracaoNoMomento: 45 },
        ],
      },
    },
  });
}

describe("GET /clientes/me/agendamentos", () => {
  it("devolve os agendamentos do cliente, com os serviços", async () => {
    const app = buildApp();
    const { slug, barbeariaId, barbeiroId } = await criarBarbeariaComToken(app);
    const { token, clienteId } = await criarClienteComToken(app, slug);
    await semear({ barbeariaId, barbeiroId, clienteId, data: "2026-09-10" });

    const resposta = await app.inject({
      method: "GET",
      url: "/clientes/me/agendamentos",
      headers: auth(token),
    });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().agendamentos).toHaveLength(1);
    expect(resposta.json().agendamentos[0]).toMatchObject({
      data: "2026-09-10",
      horaInicio: "10:00",
      horaFim: "10:45",
      status: "confirmado",
    });
    expect(resposta.json().agendamentos[0].servicos[0]).toMatchObject({
      nome: "Corte",
      precoNoMomento: "45.00",
    });
  });

  it("não devolve agendamento de outro cliente", async () => {
    const app = buildApp();
    const { slug, barbeariaId, barbeiroId } = await criarBarbeariaComToken(app);
    const meu = await criarClienteComToken(app, slug, "11999998888");
    const outro = await criarClienteComToken(app, slug, "11888887777");
    await semear({
      barbeariaId,
      barbeiroId,
      clienteId: outro.clienteId,
      data: "2026-09-10",
    });

    const resposta = await app.inject({
      method: "GET",
      url: "/clientes/me/agendamentos",
      headers: auth(meu.token),
    });

    expect(resposta.json().agendamentos).toEqual([]);
  });

  it("filtra por intervalo com de e ate", async () => {
    const app = buildApp();
    const { slug, barbeariaId, barbeiroId } = await criarBarbeariaComToken(app);
    const { token, clienteId } = await criarClienteComToken(app, slug);
    await semear({ barbeariaId, barbeiroId, clienteId, data: "2026-09-10" });
    await semear({ barbeariaId, barbeiroId, clienteId, data: "2026-10-20" });

    const resposta = await app.inject({
      method: "GET",
      url: "/clientes/me/agendamentos?de=2026-10-01&ate=2026-10-31",
      headers: auth(token),
    });

    expect(resposta.json().agendamentos).toHaveLength(1);
    expect(resposta.json().agendamentos[0].data).toBe("2026-10-20");
  });

  it("400 em data com forma errada", async () => {
    const app = buildApp();
    const { slug } = await criarBarbeariaComToken(app);
    const { token } = await criarClienteComToken(app, slug);

    const resposta = await app.inject({
      method: "GET",
      url: "/clientes/me/agendamentos?de=10-2026",
      headers: auth(token),
    });

    expect(resposta.statusCode).toBe(400);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `pnpm --filter @barchop/api test clientes-me-agendamentos`
Expected: FAIL com 404 — a rota não existe.

- [ ] **Step 3: Escrever a rota**

Em `apps/api/src/rotas/clientes-me.ts`, acrescentar os imports
(`import { INCLUDE_AGENDAMENTO } from "../lib/agendamento";`,
`import { dataParaDate } from "../lib/horas";`,
`import { ErroDeNegocio } from "../lib/erro-negocio";`,
`import { PADRAO_DATA } from "../lib/padroes";` e
`serializarAgendamento` junto do `serializarCliente`), o schema e a
rota:

```ts
const filtroAgendamentos = {
  type: "object",
  additionalProperties: false,
  properties: {
    de: { type: "string", pattern: PADRAO_DATA },
    ate: { type: "string", pattern: PADRAO_DATA },
  },
} as const;

// O pattern garante a forma "YYYY-MM-DD", não que a data exista:
// "2026-02-31" passa por ele e explode no dataParaDate. Sem este
// wrapper seria um RangeError não tratado, ou seja, 500 por culpa de
// quem chamou.
function dataDoFiltro(valor: string): Date {
  try {
    return dataParaDate(valor);
  } catch {
    throw new ErroDeNegocio(`a data ${valor} não existe`, "data_invalida");
  }
}
```

```ts
  app.get(
    "/clientes/me/agendamentos",
    { schema: { querystring: filtroAgendamentos } },
    async (request) => {
      const { clienteId } = clienteDoToken(request);
      const { de, ate } = request.query;

      const agendamentos = await prisma.agendamento.findMany({
        where: {
          // O clienteId sai do token, nunca da query: é o que faz o
          // histórico de outra pessoa ser inalcançável, e não só
          // escondido.
          clienteId,
          ...(de || ate
            ? {
                data: {
                  ...(de ? { gte: dataDoFiltro(de) } : {}),
                  ...(ate ? { lte: dataDoFiltro(ate) } : {}),
                },
              }
            : {}),
        },
        include: INCLUDE_AGENDAMENTO,
        // Mais recente primeiro: a tela "Meus agendamentos" abre no que
        // está por vir, não no corte do ano passado.
        orderBy: [{ data: "desc" }, { horaInicio: "desc" }],
      });

      return { agendamentos: agendamentos.map(serializarAgendamento) };
    }
  );
```

- [ ] **Step 4: Rodar os testes**

Run: `pnpm --filter @barchop/api test clientes-me-agendamentos`
Expected: PASS, os quatro casos.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/rotas/clientes-me.ts apps/api/tests/rotas/clientes-me-agendamentos.test.ts
git commit -m "feat(api): serve the client their own appointment history"
```

---

## Task 7: "Agora" na barbearia e o cancelar do cliente

**Files:**
- Modify: `apps/api/src/lib/horas.ts`
- Create: `apps/api/src/lib/agendamento-alteravel.ts`
- Modify: `apps/api/src/rotas/clientes-me.ts`
- Test: `apps/api/tests/lib/horas.test.ts` (acrescentar)
- Test: `apps/api/tests/rotas/clientes-me-cancelar.test.ts`

**Interfaces:**
- Consumes: `clienteDoToken` (Task 5), `dateParaData` e `dateParaHora`
  (`lib/horas.ts`).
- Produces:
  - `agoraNaBarbearia(): { data: string; hora: string }` em `lib/horas.ts`
  - `garantirAlteravel(agendamento: { data: Date; horaInicio: Date; status: string }): void`
    em `lib/agendamento-alteravel.ts`
  - `POST /clientes/me/agendamentos/:id/cancelar` → `{ agendamento }`

- [ ] **Step 1: Escrever os testes que falham**

Acrescentar em `apps/api/tests/lib/horas.test.ts`:

```ts
describe("agoraNaBarbearia", () => {
  it("devolve data e hora no formato do contrato", () => {
    const agora = agoraNaBarbearia();

    expect(agora.data).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(agora.hora).toMatch(/^([01]\d|2[0-3]):[0-5]\d$/);
  });

  it("lê o fuso da barbearia, não o da máquina", () => {
    // 2026-09-04T02:30:00Z é 23:30 do dia 3 em São Paulo (UTC-3). Se a
    // função usasse UTC ou o fuso do processo, a data sairia como dia 4.
    // O instante entra por parâmetro justamente pra este caso não
    // precisar de fake timers — ver o comentário na implementação.
    const instante = new Date("2026-09-04T02:30:00Z");

    expect(agoraNaBarbearia(instante)).toEqual({
      data: "2026-09-03",
      hora: "23:30",
    });
  });
});
```

Acrescentar `agoraNaBarbearia` ao import de `../../src/lib/horas` nesse
arquivo. **Não** use `vi.useFakeTimers` nem `vi.setSystemTime` em lugar
nenhum desta fase: a suíte roda contra um Postgres real e nenhum dos 28
arquivos de teste existentes mexe no relógio do processo.

Criar `apps/api/tests/rotas/clientes-me-cancelar.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { prisma } from "@barchop/database";
import { buildApp } from "../../src/app";
import { dataParaDate, horaParaDate } from "../../src/lib/horas";
import { auth, criarBarbeariaComToken } from "../helpers/barbearia";
import { criarClienteComToken } from "../helpers/cliente";

// Datas relativas ao dia de hoje, nunca fixas: "passado" e "futuro"
// precisam continuar significando isso daqui a um ano, e a alternativa
// (fixar o relógio com vi.setSystemTime) mexeria nos timeouts do pool
// do Postgres, que esta suíte usa de verdade.
//
// A margem de 30 dias é o que faz a diferença de fuso entre este UTC e o
// America/Sao_Paulo da API não importar: nenhuma das duas pontas chega
// perto de virar o dia.
function diaRelativo(dias: number): string {
  const dia = new Date();
  dia.setUTCDate(dia.getUTCDate() + dias);
  return dia.toISOString().slice(0, 10);
}

const FUTURO = diaRelativo(30);
const PASSADO = diaRelativo(-30);

async function semear(params: {
  barbeariaId: string;
  barbeiroId: string;
  clienteId: string;
  data: string;
  status?: "confirmado" | "concluido" | "cancelado";
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
      data: dataParaDate(params.data),
      horaInicio: horaParaDate("10:00"),
      horaFim: horaParaDate("10:45"),
      status: params.status ?? "confirmado",
      servicos: {
        create: [
          { servicoId: servico.id, precoNoMomento: "45.00", duracaoNoMomento: 45 },
        ],
      },
    },
  });
}

describe("POST /clientes/me/agendamentos/:id/cancelar", () => {
  it("cancela um agendamento futuro", async () => {
    const app = buildApp();
    const { slug, barbeariaId, barbeiroId } = await criarBarbeariaComToken(app);
    const { token, clienteId } = await criarClienteComToken(app, slug);
    const agendamento = await semear({
      barbeariaId,
      barbeiroId,
      clienteId,
      data: FUTURO,
    });

    const resposta = await app.inject({
      method: "POST",
      url: `/clientes/me/agendamentos/${agendamento.id}/cancelar`,
      headers: auth(token),
    });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().agendamento.status).toBe("cancelado");
  });

  it("422 num agendamento que já passou", async () => {
    const app = buildApp();
    const { slug, barbeariaId, barbeiroId } = await criarBarbeariaComToken(app);
    const { token, clienteId } = await criarClienteComToken(app, slug);
    const agendamento = await semear({
      barbeariaId,
      barbeiroId,
      clienteId,
      data: PASSADO,
    });

    const resposta = await app.inject({
      method: "POST",
      url: `/clientes/me/agendamentos/${agendamento.id}/cancelar`,
      headers: auth(token),
    });

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json().erro).toBe("agendamento_passado");
  });

  it("422 num agendamento já concluído", async () => {
    const app = buildApp();
    const { slug, barbeariaId, barbeiroId } = await criarBarbeariaComToken(app);
    const { token, clienteId } = await criarClienteComToken(app, slug);
    const agendamento = await semear({
      barbeariaId,
      barbeiroId,
      clienteId,
      data: FUTURO,
      status: "concluido",
    });

    const resposta = await app.inject({
      method: "POST",
      url: `/clientes/me/agendamentos/${agendamento.id}/cancelar`,
      headers: auth(token),
    });

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json().erro).toBe("status_nao_permite");
  });

  it("404 no agendamento de outro cliente", async () => {
    const app = buildApp();
    const { slug, barbeariaId, barbeiroId } = await criarBarbeariaComToken(app);
    const meu = await criarClienteComToken(app, slug, "11999998888");
    const outro = await criarClienteComToken(app, slug, "11888887777");
    const agendamento = await semear({
      barbeariaId,
      barbeiroId,
      clienteId: outro.clienteId,
      data: FUTURO,
    });

    const resposta = await app.inject({
      method: "POST",
      url: `/clientes/me/agendamentos/${agendamento.id}/cancelar`,
      headers: auth(meu.token),
    });

    // 404 e não 403: um 403 confirmaria que o id existe em algum lugar
    // da plataforma.
    expect(resposta.statusCode).toBe(404);
  });
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `pnpm --filter @barchop/api test horas clientes-me-cancelar`
Expected: FAIL — `agoraNaBarbearia` não existe e a rota devolve 404.

- [ ] **Step 3: Implementar**

Acrescentar em `apps/api/src/lib/horas.ts`:

```ts
// A barbearia do MVP fica em São Paulo, e barbearias em fusos
// diferentes estão fora de escopo. As colunas do agendamento não têm
// fuso (`@db.Date` e `@db.Time`), então "já passou" só faz sentido
// contra um fuso escolhido — e escolher é melhor que herdar o da
// máquina onde a API estiver rodando.
export const FUSO_DA_BARBEARIA = "America/Sao_Paulo";

// Devolve o instante já nos formatos do contrato HTTP, para poder
// comparar com string: "YYYY-MM-DD" e "HH:mm" ordenam
// lexicograficamente na mesma ordem que cronologicamente.
//
// O instante entra por parâmetro, com `new Date()` como padrão, e é o
// que torna a conversão de fuso testável sem fake timers: a suíte roda
// contra um Postgres real, e mockar o relógio do processo mexeria nos
// timeouts do pool de conexão junto.
export function agoraNaBarbearia(instante: Date = new Date()): {
  data: string;
  hora: string;
} {
  // Locale "sv-SE" porque o sueco formata data e hora em ISO
  // ("2026-09-04 23:30"), o que evita montar a string peça por peça a
  // partir de formatToParts.
  const formatado = new Intl.DateTimeFormat("sv-SE", {
    timeZone: FUSO_DA_BARBEARIA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(instante);

  const [data, hora] = formatado.split(" ");
  return { data, hora };
}
```

Criar `apps/api/src/lib/agendamento-alteravel.ts`:

```ts
import { ErroDeNegocio } from "./erro-negocio";
import { agoraNaBarbearia, dateParaData, dateParaHora } from "./horas";

// Cancelar e remarcar têm exatamente a mesma porta de entrada, e ela
// mora aqui em vez de em cada rota: as duas regras têm que concordar,
// senão o cliente cancelaria um agendamento que não consegue remarcar,
// ou o contrário.
export function garantirAlteravel(agendamento: {
  data: Date;
  horaInicio: Date;
  status: string;
}): void {
  // `concluido` e `no_show` são fatos passados; `cancelado` já está no
  // destino. Nenhum dos três é alterável pelo cliente.
  if (agendamento.status !== "pendente" && agendamento.status !== "confirmado") {
    throw new ErroDeNegocio(
      `agendamento ${agendamento.status} não pode ser alterado`,
      "status_nao_permite"
    );
  }

  const agora = agoraNaBarbearia();
  const data = dateParaData(agendamento.data);
  const hora = dateParaHora(agendamento.horaInicio);

  // Comparação de string, e não de Date: os dois lados estão no formato
  // do contrato, que ordena igual à linha do tempo. Construir um Date a
  // partir daqui reintroduziria o fuso da máquina, que é justamente o
  // que o agoraNaBarbearia existe pra evitar.
  if (data < agora.data || (data === agora.data && hora <= agora.hora)) {
    throw new ErroDeNegocio("esse agendamento já passou", "agendamento_passado");
  }
}
```

E a rota, em `apps/api/src/rotas/clientes-me.ts`. `INCLUDE_AGENDAMENTO`
e `serializarAgendamento` já foram importados na Task 6; entram agora
`garantirAlteravel` (`../lib/agendamento-alteravel`) e `PADRAO_UUID`:

```ts
const paramsComId = {
  type: "object",
  required: ["id"],
  additionalProperties: false,
  properties: { id: { type: "string", pattern: PADRAO_UUID } },
} as const;
```

```ts
  app.post(
    "/clientes/me/agendamentos/:id/cancelar",
    { schema: { params: paramsComId } },
    async (request) => {
      const { clienteId } = clienteDoToken(request);

      // O clienteId no where é o que faz o agendamento de outra pessoa
      // responder 404 (P2025) em vez de 403.
      const agendamento = await prisma.agendamento.findFirstOrThrow({
        where: { id: request.params.id, clienteId },
      });

      garantirAlteravel(agendamento);

      const cancelado = await prisma.agendamento.update({
        where: { id: agendamento.id },
        data: { status: "cancelado" },
        include: INCLUDE_AGENDAMENTO,
      });

      return { agendamento: serializarAgendamento(cancelado) };
    }
  );
```

- [ ] **Step 4: Rodar os testes**

Run: `pnpm --filter @barchop/api test horas clientes-me-cancelar`
Expected: PASS, os seis casos.

Run: `pnpm --filter @barchop/api type-check`
Expected: sem erro.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/horas.ts apps/api/src/lib/agendamento-alteravel.ts apps/api/src/rotas/clientes-me.ts apps/api/tests/lib/horas.test.ts apps/api/tests/rotas/clientes-me-cancelar.test.ts
git commit -m "feat(api): let a client cancel a future appointment"
```

---

## Task 8: `POST /clientes/me/agendamentos/:id/remarcar`

A task mais delicada da fase. A ordem dentro da transação é o que faz
ela funcionar, e o rollback é o que a torna segura.

**Files:**
- Modify: `apps/api/src/rotas/clientes-me.ts`
- Test: `apps/api/tests/rotas/clientes-me-remarcar.test.ts`

**Interfaces:**
- Consumes: `garantirAlteravel` (Task 7), `criarAgendamento` e
  `INCLUDE_AGENDAMENTO` (`lib/agendamento.ts`), `comRetryDeDeadlock`
  (`lib/transacao.ts`).
- Produces: `201 { agendamento }` com o agendamento novo.

- [ ] **Step 1: Escrever o teste que falha**

Criar `apps/api/tests/rotas/clientes-me-remarcar.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { prisma } from "@barchop/database";
import { buildApp } from "../../src/app";
import { auth, criarBarbeariaComToken } from "../helpers/barbearia";
import { criarClienteComToken } from "../helpers/cliente";
import type { App } from "../../src/tipos";

// Trinta dias à frente, calculado a cada rodada: uma data fixa começaria
// a falhar sozinha quando ficasse no passado, e fixar o relógio com
// vi.setSystemTime mexeria nos timeouts do pool do Postgres — que esta
// suíte usa de verdade. O `abrirTodoDia` abaixo abre os sete dias, então
// o dia da semana que calhar não muda o resultado.
function diaRelativo(dias: number): string {
  const dia = new Date();
  dia.setUTCDate(dia.getUTCDate() + dias);
  return dia.toISOString().slice(0, 10);
}

const DIA = diaRelativo(30);

// A barbearia precisa de horário de funcionamento gravado, senão o
// motor de disponibilidade trata todo dia como fechado e nenhum
// horário é oferecido.
async function abrirTodoDia(app: App, token: string) {
  const dias = [0, 1, 2, 3, 4, 5, 6].map((diaSemana) => ({
    diaSemana,
    horaAbertura: "09:00",
    horaFechamento: "18:00",
    fechado: false,
  }));

  const resposta = await app.inject({
    method: "PUT",
    url: "/barbearias/me/horarios",
    headers: auth(token),
    payload: { horarios: dias },
  });

  if (resposta.statusCode !== 200) {
    throw new Error(`PUT de horários falhou: ${resposta.statusCode} ${resposta.body}`);
  }
}

async function criarServico(app: App, token: string) {
  const resposta = await app.inject({
    method: "POST",
    url: "/servicos",
    headers: auth(token),
    payload: { nome: "Corte", duracaoMinutos: 45, preco: "45.00" },
  });

  return resposta.json().id as string;
}

// O telefone é o que amarra o agendamento à conta: o POST público faz
// upsert do Cliente por `barbeariaId_telefone`, e o signup do cliente
// depois define a senha nesse mesmo cadastro. Por isso o padrão daqui e
// o de `criarClienteComToken` são o mesmo número — agendar primeiro e
// criar a conta depois faz o cliente dono do agendamento. Um telefone
// diferente é o que constrói o caso do "agendamento de outra pessoa".
async function agendar(params: {
  app: App;
  slug: string;
  barbeiroId: string;
  servicoId: string;
  horaInicio: string;
  telefone?: string;
}) {
  const resposta = await params.app.inject({
    method: "POST",
    url: `/barbearias/${params.slug}/agendamentos`,
    payload: {
      barbeiroId: params.barbeiroId,
      servicoIds: [params.servicoId],
      data: DIA,
      horaInicio: params.horaInicio,
      cliente: {
        nome: "João da Silva",
        telefone: params.telefone ?? "11999998888",
      },
    },
  });

  if (resposta.statusCode !== 201) {
    throw new Error(`agendamento falhou: ${resposta.statusCode} ${resposta.body}`);
  }

  return resposta.json().id as string;
}

describe("POST /clientes/me/agendamentos/:id/remarcar", () => {
  it("move o agendamento e cancela o antigo", async () => {
    const app = buildApp();
    const barbearia = await criarBarbeariaComToken(app);
    await abrirTodoDia(app, barbearia.token);
    const servicoId = await criarServico(app, barbearia.token);
    const antigoId = await agendar({
      app,
      slug: barbearia.slug,
      barbeiroId: barbearia.barbeiroId,
      servicoId,
      horaInicio: "10:00",
    });
    const { token } = await criarClienteComToken(app, barbearia.slug);

    const resposta = await app.inject({
      method: "POST",
      url: `/clientes/me/agendamentos/${antigoId}/remarcar`,
      headers: auth(token),
      payload: { data: DIA, horaInicio: "14:00" },
    });

    expect(resposta.statusCode).toBe(201);
    expect(resposta.json().agendamento).toMatchObject({
      data: DIA,
      horaInicio: "14:00",
      horaFim: "14:45",
      status: "confirmado",
    });
    // Os serviços vieram do agendamento antigo, sem o corpo pedir.
    expect(resposta.json().agendamento.servicos[0].nome).toBe("Corte");

    const antigo = await prisma.agendamento.findUniqueOrThrow({
      where: { id: antigoId },
    });
    expect(antigo.status).toBe("cancelado");
  });

  it("aceita deslocar 15 minutos no mesmo dia, sobrepondo o próprio horário", async () => {
    const app = buildApp();
    const barbearia = await criarBarbeariaComToken(app);
    await abrirTodoDia(app, barbearia.token);
    const servicoId = await criarServico(app, barbearia.token);
    const antigoId = await agendar({
      app,
      slug: barbearia.slug,
      barbeiroId: barbearia.barbeiroId,
      servicoId,
      horaInicio: "10:00",
    });
    const { token } = await criarClienteComToken(app, barbearia.slug);

    // 10:15–11:00 sobrepõe 10:00–10:45. Só passa porque o cancelamento
    // do antigo acontece ANTES da criação, dentro da mesma transação.
    const resposta = await app.inject({
      method: "POST",
      url: `/clientes/me/agendamentos/${antigoId}/remarcar`,
      headers: auth(token),
      payload: { data: DIA, horaInicio: "10:15" },
    });

    expect(resposta.statusCode).toBe(201);
    expect(resposta.json().agendamento.horaInicio).toBe("10:15");
  });

  it("horário tomado devolve 409 e deixa o antigo em pé", async () => {
    const app = buildApp();
    const barbearia = await criarBarbeariaComToken(app);
    await abrirTodoDia(app, barbearia.token);
    const servicoId = await criarServico(app, barbearia.token);
    const meuId = await agendar({
      app,
      slug: barbearia.slug,
      barbeiroId: barbearia.barbeiroId,
      servicoId,
      horaInicio: "10:00",
    });
    // Outra pessoa já ocupa as 14:00.
    await agendar({
      app,
      slug: barbearia.slug,
      barbeiroId: barbearia.barbeiroId,
      servicoId,
      horaInicio: "14:00",
      telefone: "11888887777",
    });
    const { token } = await criarClienteComToken(app, barbearia.slug);

    const resposta = await app.inject({
      method: "POST",
      url: `/clientes/me/agendamentos/${meuId}/remarcar`,
      headers: auth(token),
      payload: { data: DIA, horaInicio: "14:00" },
    });

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json().erro).toBe("horario_indisponivel");

    // O ponto da transação: falhar a criação desfaz o cancelamento. O
    // cliente nunca fica sem agendamento nenhum.
    const meu = await prisma.agendamento.findUniqueOrThrow({
      where: { id: meuId },
    });
    expect(meu.status).toBe("confirmado");
  });

  it("422 quando o serviço herdado foi desativado", async () => {
    const app = buildApp();
    const barbearia = await criarBarbeariaComToken(app);
    await abrirTodoDia(app, barbearia.token);
    const servicoId = await criarServico(app, barbearia.token);
    const antigoId = await agendar({
      app,
      slug: barbearia.slug,
      barbeiroId: barbearia.barbeiroId,
      servicoId,
      horaInicio: "10:00",
    });
    const { token } = await criarClienteComToken(app, barbearia.slug);

    await app.inject({
      method: "DELETE",
      url: `/servicos/${servicoId}`,
      headers: auth(barbearia.token),
    });

    const resposta = await app.inject({
      method: "POST",
      url: `/clientes/me/agendamentos/${antigoId}/remarcar`,
      headers: auth(token),
      payload: { data: DIA, horaInicio: "14:00" },
    });

    // Soft delete: o serviço continua no histórico, mas não pode ser
    // reagendado. A tela tem que pedir os serviços de novo.
    expect(resposta.statusCode).toBe(422);
    expect(resposta.json().erro).toBe("servico_inativo");
  });

  it("404 no agendamento de outro cliente", async () => {
    const app = buildApp();
    const barbearia = await criarBarbeariaComToken(app);
    await abrirTodoDia(app, barbearia.token);
    const servicoId = await criarServico(app, barbearia.token);
    const alheioId = await agendar({
      app,
      slug: barbearia.slug,
      barbeiroId: barbearia.barbeiroId,
      servicoId,
      horaInicio: "10:00",
      telefone: "11888887777",
    });
    const { token } = await criarClienteComToken(app, barbearia.slug, "11999998888");

    const resposta = await app.inject({
      method: "POST",
      url: `/clientes/me/agendamentos/${alheioId}/remarcar`,
      headers: auth(token),
      payload: { data: DIA, horaInicio: "14:00" },
    });

    expect(resposta.statusCode).toBe(404);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `pnpm --filter @barchop/api test clientes-me-remarcar`
Expected: FAIL com 404 — a rota não existe.

- [ ] **Step 3: Escrever a rota**

Em `apps/api/src/rotas/clientes-me.ts`, mais os imports de
`criarAgendamento` (`../lib/agendamento`), `comRetryDeDeadlock`
(`../lib/transacao`) e `PADRAO_HORA`:

```ts
const corpoRemarcar = {
  type: "object",
  required: ["data", "horaInicio"],
  additionalProperties: false,
  properties: {
    data: { type: "string", pattern: PADRAO_DATA },
    horaInicio: { type: "string", pattern: PADRAO_HORA },
    // Opcional: sem ele, o remarcar herda os serviços do agendamento
    // antigo. Com ele, o cliente troca de serviço e a duração muda
    // junto — que é o caminho quando o serviço antigo foi desativado.
    servicoIds: {
      type: "array",
      minItems: 1,
      maxItems: 10,
      items: { type: "string", pattern: PADRAO_UUID },
    },
  },
} as const;
```

```ts
  app.post(
    "/clientes/me/agendamentos/:id/remarcar",
    { schema: { params: paramsComId, body: corpoRemarcar } },
    async (request, reply) => {
      const { clienteId } = clienteDoToken(request);
      const { data, horaInicio, servicoIds } = request.body;

      // Mesmo motivo das rotas de criação: impasse concorrente não pode
      // sair como 500.
      const agendamento = await comRetryDeDeadlock(() =>
        prisma.$transaction(async (tx) => {
          const antigo = await tx.agendamento.findFirstOrThrow({
            where: { id: request.params.id, clienteId },
            include: { servicos: { select: { servicoId: true } } },
          });

          garantirAlteravel(antigo);

          // O cancelamento vem ANTES da criação, e é o que permite
          // remarcar pra um horário que sobrepõe o próprio agendamento
          // (10:00 -> 10:15). Sem ele, o agendamento antigo bloquearia a
          // si mesmo duas vezes: no cálculo de disponibilidade, que só
          // ignora cancelado, e na EXCLUDE constraint, que é parcial no
          // mesmo predicado.
          //
          // E é a transação que torna isso seguro: se a criação falhar,
          // este update desfaz junto e o cliente continua com o
          // agendamento que tinha.
          await tx.agendamento.update({
            where: { id: antigo.id },
            data: { status: "cancelado" },
          });

          return criarAgendamento(tx, {
            barbeariaId: antigo.barbeariaId,
            // Herdado: trocar de barbeiro é agendar outro, e a
            // barbearia do MVP tem um só.
            barbeiroId: antigo.barbeiroId,
            clienteId,
            servicoIds:
              servicoIds ?? antigo.servicos.map((servico) => servico.servicoId),
            data,
            horaInicio,
            origem: "cliente",
          });
        })
      );

      return reply.code(201).send({
        agendamento: serializarAgendamento(agendamento),
      });
    }
  );
```

- [ ] **Step 4: Rodar os testes**

Run: `pnpm --filter @barchop/api test clientes-me-remarcar`
Expected: PASS, os cinco casos.

Run: `pnpm --filter @barchop/api test`
Expected: a suíte inteira verde.

Run: `pnpm --filter @barchop/api type-check`
Expected: sem erro.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/rotas/clientes-me.ts apps/api/tests/rotas/clientes-me-remarcar.test.ts
git commit -m "feat(api): reschedule a client appointment in one transaction"
```

---

## Task 9: Registrar a dívida no roadmap

A fase cria uma dívida de segurança conhecida, e ela tem que estar
escrita onde as outras estão — não só na spec.

**Files:**
- Modify: `barchop/docs/roadmap.md`

**Interfaces:**
- Consumes: nada.
- Produces: nada de código.

- [ ] **Step 1: Acrescentar as duas dívidas**

Em `docs/roadmap.md`, na seção "Dívidas conhecidas", depois do item que
já existe sobre o `POST /auth/signup`:

```markdown
- **Quem definir a senha primeiro assume o cadastro de um telefone.**
  Os cadastros de `Cliente` são criados por outra pessoa — pelo upsert
  do agendamento público, ou pelo barbeiro no walk-in. Sem verificar
  posse do número, a API não distingue o dono do telefone de quem só o
  conhece, e quem chegar primeiro passa a ver o histórico daquela
  pessoa naquela barbearia. Mitigado, não resolvido: definir senha só é
  permitido em cadastro que ainda não tem uma. Fecha junto com o canal
  de mensagem do passo 4, que traz o código de verificação.
- **O `409` do signup de cliente diz que aquele telefone já tem conta**,
  exatamente como o do barbeiro diz do email. Mesma dívida, mesmo
  fechamento.
```

E, no passo 2 (Rotas da API), acrescentar ao fim do primeiro parágrafo:

```markdown
   A fase 6 (identidade do cliente) fechou as duas lacunas que sobraram:
   o `barbeiroId` que nenhuma rota pública devolvia, e a conta do
   cliente que a tela "Meus agendamentos" precisa. Spec em
   `docs/superpowers/specs/2026-09-04-api-identidade-cliente-design.md`.
```

- [ ] **Step 2: Commit**

```bash
git add docs/roadmap.md
git commit -m "docs: record the debts the client identity phase creates"
```

---

## Verificação final da fase

- [ ] `pnpm --filter @barchop/api test` — suíte inteira verde
- [ ] `pnpm --filter @barchop/api type-check` — sem erro
- [ ] `pnpm --filter @barchop/api lint` — sem erro
- [ ] Conferir na mão que `grep -rn "senhaHash" apps/api/src/rotas/` não
      devolve nenhuma linha que ponha o valor numa resposta
