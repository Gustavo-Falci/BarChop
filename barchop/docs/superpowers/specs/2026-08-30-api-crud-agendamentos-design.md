# API: CRUD + criação de agendamento — design

Data: 2026-08-30
Passo 2 do `docs/roadmap.md`, fundido com o passo 3 (autenticação).

## Contexto

`apps/api/src/server.ts` tem 81 linhas e três rotas (`/health`,
`/disponibilidade`, `/barbearias/:slug/servicos`). O schema em
`packages/database` já tem sete entidades e a trava de conflito de
horário no banco. Falta a superfície HTTP que as 23 telas de
`docs/screens.md` vão consumir.

## Decisões tomadas antes do design

Quatro perguntas fechadas com o dono do projeto:

1. **Autenticação entra junto, não depois.** O passo 3 do roadmap sobe
   pro passo 2. Quase toda rota de escrita precisa saber qual barbearia
   é a do chamador; sem isso, ou as rotas nascem abertas, ou recebem
   `barbeariaId` no corpo e são reescritas quando o JWT chegar.
2. **Testes de integração contra Postgres real.** Um banco
   `barchop_test` separado. A `EXCLUDE USING gist` e o mapeamento
   `@db.Date`/`@db.Time` do Prisma não têm como ser provados com mock.
3. **Recorte por tela, não por tabela.** Só endpoint que alguma das 23
   telas chama. Barbeiro não ganha CRUD (o MVP tira "múltiplos
   barbeiros por barbearia" de escopo); `HorarioFuncionamento` ganha,
   porque o cálculo de disponibilidade não roda sem ele.
4. **Cliente casa por telefone, sem expor histórico.** Telefone já
   existente reaproveita o `Cliente` — é o que faz o barbeiro enxergar
   o cliente recorrente. A resposta do fluxo público devolve só o
   agendamento recém-criado, nunca a lista. Nome divergente não
   sobrescreve o cadastrado.

E quatro sub-decisões aprovadas na apresentação do design:

- **Hash de senha: `scrypt` do `node:crypto`.** Zero dependência nova,
  sem node-gyp. Suficiente pro perfil de risco de um MVP.
- **Runner de teste: `vitest`.** TypeScript nativo, integra no turbo.
- **`Servico.preco` serializa como string** (`"45.00"`), não number.
  O Prisma devolve um objeto `Decimal` que vira `{}` no
  `JSON.stringify`; string evita perder centavo em float.
- **`PUT /barbearias/me/horarios` grava sempre os 7 dias.** Dia ausente
  no corpo vira `fechado: true`. Elimina a ambiguidade entre "não tem
  linha pra terça" e "terça está fechada".

## A constraint que dita o caminho de escrita

`packages/database/prisma/migrations/20260829120000_init/migration.sql`,
linhas 163–178:

```sql
ALTER TABLE "agendamento" ADD COLUMN "periodo" tsrange GENERATED ALWAYS AS (
  tsrange((data + hora_inicio)::timestamp, (data + hora_fim)::timestamp, '[)')
) STORED;

ALTER TABLE "agendamento" ADD CONSTRAINT "sem_conflito_horario"
  EXCLUDE USING gist ("barbeiro_id" WITH =, "periodo" WITH &&)
  WHERE (status <> 'cancelado');
```

Três consequências que o design tem que respeitar:

- **Intervalo meio-aberto `[)`**: 10:00–10:45 e 10:45–11:30 não colidem.
  Bate com `calcularHorariosDisponiveis`, que também trata o fim como
  exclusivo.
- **Constraint parcial em `status <> 'cancelado'`**: cancelar libera o
  horário. `concluido` e `no_show` continuam travando — correto, são
  fatos passados.
- **`periodo` é gerada de `data + hora_inicio`**: qualquer erro de fuso
  nessas duas colunas corrompe a trava junto, silenciosamente.

## Arquitetura

### Arquivos

```
apps/api/src/
  server.ts              # só buildApp() + listen — é o entrypoint do tsup
  app.ts                 # buildApp(): registra plugins e rotas, não escuta
  plugins/
    auth.ts              # @fastify/jwt, hook autenticar, decora request.barbeiro
    erros.ts             # setErrorHandler: Prisma/Postgres -> HTTP
  rotas/
    auth.ts              # signup, login
    barbearias.ts        # perfil público, PATCH da própria
    horarios.ts          # GET/PUT horário de funcionamento
    servicos.ts          # CRUD + listagem pública
    clientes.ts          # CRUD do barbeiro
    disponibilidade.ts   # dia e mês
    agendamentos.ts      # listagem, detalhe, criação (protegida e pública)
  lib/
    horas.ts             # conversão "HH:mm"/"YYYY-MM-DD" <-> Date UTC
    serializar.ts        # Decimal -> string, Date(Time) -> "HH:mm"
```

`buildApp()` separado do `listen()` é requisito dos testes: `app.inject()`
precisa de uma instância montada que não abre porta.

### Autenticação

O schema já codifica a assimetria do brief: `Barbeiro.senhaHash` é
não-nulo, `Cliente.senhaHash` é nulo. Login obrigatório do barbeiro,
opcional do cliente. Este design não implementa login de cliente — o
fluxo público não tem conta.

- `POST /auth/signup` cria `Barbearia` + `Barbeiro` numa transação.
  É o primeiro acesso da tela de Login/cadastro. Corpo:
  `{ barbearia: { nome, slug }, barbeiro: { nome, email, senha } }`.
  O `slug` é validado contra `^[a-z0-9-]{3,80}$` e é único na
  plataforma — é ele que forma o link público do WhatsApp. Devolve o
  mesmo JWT do login, pra tela já entrar logada.
- `POST /auth/login` recebe `{ email, senha }` e devolve JWT com payload
  `{ barbeiroId, barbeariaId }`. **O email é normalizado com
  `trim().toLowerCase()` na entrada e na gravação** — `VARCHAR` com
  índice único é sensível a caixa, então sem isso `Gu@Exemplo.com` e
  `gu@exemplo.com` viram duas contas distintas e quem cadastrou numa
  não entra pela outra. Email ou senha errados devolvem o mesmo
  `401` com a mesma mensagem — não confirmar qual dos dois errou.
- Plugin `auth.ts` expõe um hook `autenticar` que valida o token **e
  carrega o barbeiro do banco**, devolvendo `401` se ele não existe mais
  ou está com `ativo: false`. Só verificar a assinatura não basta:
  desativar um barbeiro não tiraria o acesso de quem já tem token na
  mão, e a falha seria silenciosa. O custo é uma query por requisição
  protegida — aceitável no MVP, e é o que torna a desativação real.
- **Tempo de vida do token: 7 dias** (`sign: { expiresIn: "7d" }`).
  Com o hook lendo o banco, a revogação já é imediata; a expiração é
  defesa em profundidade contra token roubado. Sem refresh token nesta
  fase — o barbeiro refaz login. Decidir isso agora e não depois é o
  ponto: acrescentar expiração com as 23 telas já construídas em cima
  de token eterno obrigaria a retrofitar tratamento de 401 e novo login
  em cada uma delas.
- **Rota protegida entra num escopo encapsulado que carrega o hook**,
  não recebe `onRequest` uma a uma:

  ```ts
  app.register(async (protegidas) => {
    protegidas.addHook("onRequest", autenticar);
    registrarRotasMe(protegidas);
    // fase 3: servicos, clientes, horarios, barbearias/me
  });
  ```

  Pendurar o hook rota a rota depende de ninguém esquecer. Quem
  esquecesse publicaria a rota sem erro de compilação e sem teste
  falhando — a fase 3 sozinha copia esse padrão umas dez vezes.
- Hash: `scrypt` do `node:crypto`, salt aleatório de 16 bytes por
  senha, armazenado como `scrypt$<salt-b64>$<hash-b64>` em `senhaHash`.
  Comparação com `timingSafeEqual`.

**Regra invariante**: rota protegida nunca aceita `barbeariaId` no corpo
nem na URL — sai do token. Rota pública escopa pelo `:slug`. Isso é o
que impede um chamador de criar serviço na barbearia dos outros.

## Endpoints

### Públicos (fluxo do cliente, sem login)

| Método | Rota | Devolve |
|---|---|---|
| `GET` | `/barbearias/:slug` | Perfil: nome, telefone, endereço, logoUrl, horários |
| `GET` | `/barbearias/:slug/servicos` | Serviços ativos *(já existe)* |
| `GET` | `/barbearias/:slug/disponibilidade` | Horários livres de um dia |
| `GET` | `/barbearias/:slug/disponibilidade/mes` | Quais dias do mês têm vaga |
| `POST` | `/barbearias/:slug/agendamentos` | Cria agendamento, `origem: "cliente"` |

`GET /disponibilidade` recebe `barbeiroId`, `data=YYYY-MM-DD` e
`servicoIds` (repetido na query string). Devolve `{ horarios: string[] }`.

`GET /disponibilidade/mes` recebe `barbeiroId`, `mes=YYYY-MM` e
`servicoIds`. Devolve `{ dias: { "2026-09-01": true, ... } }` — um dia é
`true` se tem pelo menos um horário livre. Implementação: **uma** query
de agendamentos no intervalo do mês inteiro, agrupada em memória por
data, e `calcularHorariosDisponiveis` rodando por dia. Não fazer 30
queries.

### Protegidos (barbeiro, JWT)

| Método | Rota | Nota |
|---|---|---|
| `GET`/`PATCH` | `/me` | Perfil do barbeiro. Nunca devolve `senhaHash` |
| `PATCH` | `/barbearias/me` | Dados da barbearia do token |
| `GET`/`PUT` | `/barbearias/me/horarios` | Lote de 7 dias |
| `GET`/`POST` | `/servicos` | Lista inclui inativos; a pública não |
| `PATCH`/`DELETE` | `/servicos/:id` | `DELETE` é soft: `ativo = false` |
| `GET`/`POST` | `/clientes` | `GET` aceita `?busca=` (nome ou telefone) |
| `GET`/`PATCH` | `/clientes/:id` | `GET` inclui histórico de agendamentos |
| `GET` | `/agendamentos` | `?data=` (dia) ou `?de=&ate=` (intervalo) |
| `GET`/`PATCH` | `/agendamentos/:id` | `PATCH` muda `status` e `observacoes` |
| `POST` | `/agendamentos` | Walk-in, `origem: "barbeiro"` |

`DELETE /servicos/:id` é soft delete porque `AgendamentoServico` tem FK
`ON DELETE RESTRICT` pro serviço — apagar de verdade quebraria o
histórico.

Dois pontos que ficariam ambíguos sem dizer:

- **`GET /agendamentos` exige exatamente uma das duas formas**: ou
  `?data=YYYY-MM-DD`, ou o par `?de=&ate=`. Mandar as duas, ou nenhuma,
  é `400`. O intervalo é limitado a 92 dias, senão `422`.
- **`PATCH /agendamentos/:id` aceita qualquer transição de `status`**,
  sem máquina de estados — o barbeiro é a autoridade sobre o próprio
  dia, e proibir "cancelado de volta pra confirmado" atrapalharia mais
  que ajudaria. A exceção é implícita e vem do banco: reativar um
  cancelado cujo horário já foi tomado por outro agendamento bate na
  `sem_conflito_horario` e devolve `409`.
- **`PATCH /me` e `PATCH /barbearias/me` aceitam só campos editáveis
  pela tela de Configurações**: `nome`, `telefone` do barbeiro;
  `nome`, `telefone`, `endereco`, `logoUrl` da barbearia. Trocar senha,
  email ou `slug` fica fora deste passo.

### Rota que sai

`POST /disponibilidade`, a calculadora sem estado, é **removida**. O
chamador tinha que mandar o horário de funcionamento e os agendamentos
existentes; nenhuma tela tem esses dados, e se tivesse poderia mentir.
As duas rotas de disponibilidade acima leem do banco e a substituem.

## Camada de tempo

O risco mais alto do passo inteiro. O Prisma mapeia `@db.Time` pra
`Date` do JS e grava **a porção UTC** dela. Numa máquina em
`America/Sao_Paulo`, `new Date("1970-01-01T09:00:00")` grava `12:00`.
Isso corromperia todo agendamento e a coluna `periodo` junto, sem erro.

`lib/horas.ts` é o único lugar que constrói essas datas:

```ts
horaParaDate("09:00")       // new Date(Date.UTC(1970, 0, 1, 9, 0))
dateParaHora(d)             // "09:00", lendo getUTCHours/getUTCMinutes
dataParaDate("2026-09-01")  // new Date(Date.UTC(2026, 8, 1))
dateParaData(d)             // "2026-09-01", em UTC
```

Nenhuma rota constrói `Date` a partir de string local. Teste dedicado:
grava `09:00` pela rota, lê a coluna com `$queryRaw`, confere que o
Postgres guardou `09:00:00`.

Todo horário no contrato HTTP é string `"HH:mm"`; toda data é
`"YYYY-MM-DD"`. O fuso da barbearia é implícito — o banco guarda
`time`/`date` sem fuso, e o app trata tudo como hora local da barbearia.
Fora de escopo: barbearias em fusos diferentes.

## DTOs em `@barchop/types`

`NovoAgendamentoInput` hoje tem `barbeariaId`, `clienteId` e `origem` no
corpo. Com autenticação os três viram forjáveis — um chamador público
mandaria `origem: "barbeiro"`. O tipo se divide em dois:

```ts
// POST /agendamentos — barbeariaId do token, origem fixa em "barbeiro"
export interface NovoAgendamentoBarbeiroInput {
  barbeiroId: string;
  clienteId: string;
  servicoIds: string[];
  data: string;        // "YYYY-MM-DD"
  horaInicio: string;  // "HH:mm"
  observacoes?: string;
}

// POST /barbearias/:slug/agendamentos — barbeariaId do slug,
// origem fixa em "cliente", clienteId resolvido pelo telefone
export interface NovoAgendamentoPublicoInput {
  barbeiroId: string;
  servicoIds: string[];
  data: string;
  horaInicio: string;
  cliente: { nome: string; telefone: string };
  observacoes?: string;
}
```

Mudança em pacote compartilhado: `apps/web` e `apps/mobile` importam
daqui.

## Caminho de escrita do agendamento

Os dois `POST` compartilham um serviço `criarAgendamento`, que difere só
em como resolve `barbeariaId`, `clienteId` e `origem`. Dentro de uma
transação do Prisma:

1. Carrega os `Servico` pelos ids **do banco**. Valida que todos existem,
   são da barbearia em questão e estão `ativo`. Senão `422`.
2. Soma `duracaoMinutos` → `horaFim = horaInicio + duração`. Preço e
   duração vêm do banco, nunca do corpo da requisição.
3. Carrega o `HorarioFuncionamento` do dia da semana e os agendamentos
   do barbeiro naquela data com `status <> 'cancelado'`.
4. Roda `calcularHorariosDisponiveis`. A `horaInicio` pedida tem que
   estar na lista devolvida; senão `422` com mensagem explicando.
5. Insere `Agendamento` e os `AgendamentoServico`, gravando
   `precoNoMomento` e `duracaoNoMomento` a partir do que foi lido no
   passo 1.
6. Violação da `sem_conflito_horario` → **`409`**.

No fluxo público, antes do passo 1: `upsert` do `Cliente` por telefone.
Telefone existente reaproveita o registro e **não** sobrescreve o nome
cadastrado.

Os passos 4 e 6 são redundantes de propósito. O 4 dá mensagem de erro
útil ("esse horário não está disponível"); o 6 é a única garantia real
contra dois clientes confirmando o mesmo horário ao mesmo tempo.

## Tratamento de erros

`plugins/erros.ts` centraliza a tradução, com `setErrorHandler`:

| Origem | HTTP |
|---|---|
| Validação de schema do Fastify | `400` com `erro: "requisicao_invalida"` — nunca o `FST_ERR_VALIDATION` cru |
| Rota inexistente | `404` com `erro: "nao_encontrado"`, via `setNotFoundHandler` |
| Token ausente/inválido | `401` |
| Recurso de outra barbearia | `404` (não `403` — não confirma existência) |
| Prisma `P2025` (registro não encontrado) | `404` |
| Prisma `P2002` (unique violada) | `409` |
| Postgres `23P01` (`sem_conflito_horario`) | `409` |
| Regra de negócio (horário indisponível, serviço inativo) | `422` |

Nenhum código interno de framework ou plugin sai no campo `erro`:
nem `FST_ERR_VALIDATION`, nem `FST_JWT_*`, nem código do Prisma. As 23
telas vão ramificar nesse campo, e o dia em que uma dependência renomear
uma constante não pode ser o dia em que a interface quebra. Rota não
encontrada passa longe do `setErrorHandler` por padrão no Fastify — sem
o `setNotFoundHandler` a API responderia com duas formas de erro
incompatíveis entre si.

**A fixar na implementação**: o Prisma v5.22 não tem código tipado pra
`23P01`. A violação cai como `PrismaClientUnknownRequestError` com a
mensagem crua do Postgres. O formato exato — se dá pra ler o SQLSTATE
de um campo ou se é preciso casar a substring `sem_conflito_horario` na
mensagem — se fixa com um teste de integração, não de memória. O teste
vem antes do handler.

## Serialização

`lib/serializar.ts` normaliza o que sai:

- `Decimal` (preços) → string com 2 casas: `"45.00"`
- `Date` de coluna `@db.Time` → `"HH:mm"`
- `Date` de coluna `@db.Date` → `"YYYY-MM-DD"`
- `senhaHash` nunca sai, em nenhuma rota

## Testes

`vitest`, integração contra Postgres real, `app.inject()` do Fastify —
sem abrir porta nem subir servidor.

- Banco `barchop_test`, com a migration inicial aplicada por
  `prisma migrate deploy` (não `migrate dev`, que tentaria gerar
  migration nova).
- Isolamento entre testes: `TRUNCATE ... RESTART IDENTITY CASCADE` nas
  tabelas antes de cada arquivo.
- Cada rota tem, no mínimo: caminho feliz, corpo inválido → `400`, e
  acesso a recurso de outra barbearia → `404`.

Testes que justificam sozinhos a escolha de banco real:

1. **Conflito**: cria agendamento 10:00–10:45; um segundo pedido
   sobrepondo devolve `409`.
2. **Borda `[)`**: 10:45–11:30 logo após 10:00–10:45 é aceito.
3. **Cancelado libera**: cancela o das 10:00, o mesmo horário volta a
   ser aceito.
4. **Corrida**: dois `POST` simultâneos via `Promise.all` no mesmo
   horário — exatamente um `201`, exatamente um `409`.
5. **Fuso**: `09:00` gravado lê `09:00` na coluna via `$queryRaw`.

`packages/scheduling` hoje não tem nenhum teste, apesar de ser a regra
de negócio central. Ganha testes unitários no mesmo passo: dia fechado,
sem agendamento, gap curto demais, alinhamento ao grid de
`intervaloMinutos`.

## Ordem de implementação

Este design é grande — cinco grupos de rota, autenticação e
infraestrutura de teste do zero. A ordem abaixo existe pra que cada
fase termine com a suíte verde, não pra ser seguida à risca:

1. **Fundação**: `vitest` configurado, banco de teste, `buildApp()`
   extraído de `server.ts`, `lib/horas.ts` com seus testes unitários, e
   os testes que faltam em `packages/scheduling`. Nada de rota nova.
2. **Autenticação**: `scrypt`, signup, login, plugin `auth.ts`.
   Desbloqueia todo o resto — sem ela nenhuma rota protegida tem como
   ser testada.
3. **Cadastros do barbeiro**: `/me`, `/barbearias/me`, horários,
   serviços, clientes. São CRUD convencional; o valor está em firmar o
   escopo por token e o `404` cruzado entre barbearias.
4. **Agendamento**: `criarAgendamento`, os dois `POST`, a tradução do
   `23P01`, e os cinco testes de banco real. É o núcleo do passo.
5. **Disponibilidade**: as duas rotas de leitura, e a remoção do
   `POST /disponibilidade` antigo.

A fase 1 é a que mais gente pularia e a que mais custa pular: sem a
camada de tempo firmada e testada, todo agendamento das fases seguintes
grava com fuso errado sem dar erro.

## Pré-requisitos

Bloqueiam o primeiro teste, não o design:

1. Usuário e senha do Postgres local (já rodando na 5432).
2. `packages/database/.env` criado a partir do `.env.example`.
3. Banco `barchop_test` criado, com `prisma migrate deploy` aplicado.
4. As extensões `pgcrypto` e `btree_gist` — a migration inicial já as
   cria, mas exigem privilégio suficiente no Postgres.

## Fora de escopo

- Login de cliente com senha (`Cliente.senhaHash` fica nulo). O app
  opcional com conta é passo posterior.
- Gestão de múltiplos barbeiros numa barbearia — o brief tira do MVP.
- Remarcar agendamento (só cancelar e criar outro).
- Lembretes automáticos: passo 5 do roadmap, canal ainda não decidido.
- Rate limiting no fluxo público.
- Barbearias em fusos diferentes.
- Upload de `logoUrl` (o campo aceita URL; quem hospeda é outro passo).
