# @gr-barber/api

Backend — Node.js + PostgreSQL, framework HTTP **Fastify**, ORM **Prisma**.

`src/app.ts` monta a aplicação inteira (rotas, plugins, tratamento de
erros) e devolve a instância sem abrir porta — é o que deixa os testes
usarem `app.inject()`. O `src/server.ts` só chama esse `buildApp()` e
escuta na 3333.

## Variáveis de ambiente

O `dev` carrega `apps/api/.env` sozinho, via
`tsx watch --env-file-if-exists=.env` — copie o `.env.example` e
preencha. Quem prefere exportar no shell continua funcionando: variável
já presente no ambiente ganha do arquivo, e o `-if-exists` faz o arquivo
ausente não abortar a subida. O `start` (bundle de produção) não carrega
`.env` nenhum — lá as variáveis vêm do systemd, do container ou do
painel da OCI. Veja `.env.example` para a lista e o formato:

- `DATABASE_URL` — Postgres de desenvolvimento.
- `JWT_SECRET` — segredo de assinatura do token. Sem ele a API não sobe,
  de propósito: subir sem segredo publicaria as rotas protegidas sem
  proteção.

A suíte de testes é a exceção: ela carrega `apps/api/.env.test`
(modelo em `.env.test.example`), que precisa apontar pro banco de
**teste** — o setup se recusa a rodar fora de um banco `*_test`, porque
cada caso trunca todas as tabelas.

## Rodando

```bash
pnpm --filter @gr-barber/database migrate:dev   # aplica o schema no seu Postgres
pnpm --filter @gr-barber/api dev
pnpm --filter @gr-barber/api test               # vitest contra Postgres de verdade
```

## Rotas

Públicas:

| Método | Rota | O que faz |
|---|---|---|
| `GET` | `/health` | sinal de vida |
| `POST` | `/auth/signup` | cria barbearia + barbeiro numa transação e devolve JWT |
| `POST` | `/auth/login` | `{ email, senha }` → JWT |
| `GET` | `/barbearias/:slug` | perfil público + horários de funcionamento |
| `GET` | `/barbearias/:slug/servicos` | serviços ativos da barbearia, `{ servicos: [...] }` |
| `POST` | `/barbearias/:slug/agendamentos` | agendamento pelo link público, `origem: "cliente"` |
| `GET` | `/barbearias/:slug/disponibilidade` | horários livres de um dia (`barbeiroId`, `data`, `servicoIds` repetido) |
| `GET` | `/barbearias/:slug/disponibilidade/mes` | quais dias do mês têm vaga (`barbeiroId`, `mes`, `servicoIds`) |

Protegidas (JWT no `Authorization: Bearer`), registradas num escopo
encapsulado que carrega o hook `autenticar` — rota nova entra ali dentro
e já nasce protegida:

| Método | Rota | O que faz |
|---|---|---|
| `GET` | `/me` | barbeiro do token |
| `PATCH` | `/me` | edita nome e telefone do barbeiro do token |
| `PATCH` | `/barbearias/me` | edita nome, telefone, endereço e logo da barbearia do token |
| `GET` | `/barbearias/me/horarios` | os 7 dias da semana, mesmo os não gravados |
| `PUT` | `/barbearias/me/horarios` | grava a semana inteira; dia ausente vira fechado |
| `GET` | `/servicos` | serviços da barbearia do token, inclusive os inativos |
| `POST` | `/servicos` | cria serviço; `preco` é string (`"45.00"`) |
| `PATCH` | `/servicos/:id` | edita nome, duração, preço, e reativa |
| `DELETE` | `/servicos/:id` | soft delete: `ativo = false`, 200 com o serviço |
| `GET` | `/clientes` | clientes da barbearia do token; `?busca=` casa nome ou telefone |
| `POST` | `/clientes` | cadastra cliente; telefone é único dentro da barbearia |
| `GET` | `/clientes/:id` | cliente + histórico de agendamentos na barbearia |
| `PATCH` | `/clientes/:id` | edita nome, telefone e email |
| `POST` | `/agendamentos` | walk-in do barbeiro, `origem: "barbeiro"` |
| `GET` | `/agendamentos` | `?data=` (um dia) ou `?de=&ate=` (até 92 dias) |
| `GET` | `/agendamentos/:id` | detalhe, com cliente e serviços |
| `PATCH` | `/agendamentos/:id` | muda `status` e `observacoes` |

O `barbeariaId` e o id do barbeiro saem sempre do token, nunca do corpo
nem da URL. O token vale 7 dias, e o hook confere no banco se o barbeiro
ainda existe e está ativo — desativar alguém tira o acesso na hora.

## Erros

Formato único: `{ erro: "<codigo>", mensagem?: "<detalhe>" }`. O `erro`
é sempre um código nosso — nenhum `FST_*` do Fastify e nenhum código do
Prisma sai no contrato.

| Situação | HTTP | `erro` |
|---|---|---|
| Body ou parâmetro fora do schema, id fora do formato UUID | 400 | `requisicao_invalida` |
| Token ausente, inválido, expirado ou de barbeiro inativo | 401 | `nao_autenticado` |
| Credenciais erradas — nos dois logins, o do barbeiro e o do cliente | 401 | `credenciais_invalidas` |
| Acesso negado | 403 | `acesso_negado` |
| Rota, registro inexistente ou recurso de outra barbearia | 404 | `nao_encontrado` |
| Unique violada | 409 | `conflito` |
| Horário já ocupado (trava do banco) | 409 | `horario_ocupado` |
| Regra de negócio | 422 | código do domínio |
| Login ou signup acima do limite de tentativas | 429 | `tentativas_excedidas` |
| Bug nosso | 500 | `erro_interno` |

Dois pedidos simultâneos no mesmo horário podem terminar em impasse no
Postgres (SQLSTATE `40P01`) em vez de violação da constraint. As rotas de
criação repetem a transação uma vez nesse caso (`src/lib/transacao.ts`):
na segunda tentativa a concorrente já terminou, e a resposta é o `201` ou
o `409` — nunca um `500`.

O `429` vem dos contadores de `src/lib/limites.ts`, nas quatro rotas que
recebem senha: os dois logins e os dois signups. A resposta traz
`Retry-After` em segundos, e a `mensagem` já diz quanto esperar. São dois
contadores por rota — um pela conta (email, ou telefone mais slug) e um
pelo IP —, e a contagem vive na memória do processo: subir uma segunda
instância da API dobra o limite efetivo até que a contagem mude de lugar.

Quem lança escolhe o par status/código com `ErroHttp`
(`src/lib/erro-http.ts`) ou com `ErroDeNegocio` (`src/lib/erro-negocio.ts`,
sempre 422).

## Consumindo os pacotes internos

```ts
import { calcularHorariosDisponiveis } from "@gr-barber/scheduling";
import type { Agendamento, Barbearia } from "@gr-barber/types";
// conexão com o banco definida em @gr-barber/database
```

Esse é o único app que deve ter acesso direto ao banco — mobile e
web sempre passam pela API.
