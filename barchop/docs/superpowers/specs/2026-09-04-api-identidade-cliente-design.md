# API: identidade do cliente — design

Data: 2026-09-04
Fase 6 da API. Bloqueia o passo 3 do `docs/roadmap.md` (as telas).

## Contexto

As cinco fases de `2026-08-30-api-crud-agendamentos-design.md` estão na
`main`, e o roadmap afirma que "a superfície HTTP que as 23 telas
consomem está completa". Não está — duas lacunas apareceram ao planejar
as telas:

1. **Nenhuma rota pública devolve o `barbeiroId`.**
   `GET /barbearias/:slug` serializa só `id, nome, slug, telefone,
   endereco, logoUrl` (`apps/api/src/lib/serializar.ts:29`), e os
   barbeiros ficam de fora de propósito — o comentário em
   `rotas/barbearias.ts:74` diz que um spread traria o `senhaHash`
   junto. Mas `/barbearias/:slug/disponibilidade`,
   `/disponibilidade/mes` e `POST /barbearias/:slug/agendamentos` todas
   exigem `barbeiroId` (`rotas/agendamentos.ts:105`). O fluxo do
   cliente inteiro trava aí.

2. **A tela "Meus agendamentos" não tem API atrás.**
   `POST /auth/login` é do barbeiro; `GET /clientes/:id` está dentro do
   escopo autenticado do barbeiro; não existe `/clientes/me`. Cliente
   não consegue se autenticar. Isso também mata o "pulado se já logado"
   da tela **Dados do cliente** em `docs/screens.md`.

A primeira é correção pequena. A segunda é uma fase.

## Decisões tomadas antes do design

Quatro perguntas fechadas com o dono do projeto:

1. **A fase de API vem antes das telas.** A alternativa era cortar
   "Meus agendamentos" do escopo e construir 22 telas. Escolhido
   construir a identidade do cliente primeiro, e entregar as 23.
2. **Telefone + senha, não email.** O telefone já é o identificador do
   fluxo público — o upsert de `rotas/agendamentos.ts:292-294` casa por
   `barbeariaId_telefone`. Email é nulo em todo cliente criado pelo
   link do WhatsApp, então login por email não alcançaria nenhuma conta
   existente. O `Cliente` já tem `email` e `senhaHash` nuláveis no
   schema (`packages/database/prisma/schema.prisma:86-87`), esperando
   exatamente isto.
3. **Remarcar é rota nova, transacional.** `PATCH /agendamentos/:id`
   aceita só `status` e `observacoes`, e o comentário em
   `rotas/agendamentos.ts:49-51` diz por quê: aceitar data/hora ali
   pularia a checagem de disponibilidade inteira. Estender aquele
   caminho mexeria na escrita que o barbeiro já usa, com 249 testes em
   volta. A rota nova reusa `criarAgendamento` e `comRetryDeDeadlock`.
4. **Senha só pode ser definida uma vez, e o risco residual é aceito.**
   Ver a seção seguinte.

E uma decisão de arquitetura aprovada na apresentação do design:
**um segredo de JWT só, com o tipo no payload** — detalhada em
"Autenticação".

## O risco que esta fase assume conscientemente

O barbeiro se cadastra com um email que ele controla. O telefone do
cliente, não: os cadastros de `Cliente` são criados **por outra
pessoa** — pelo upsert do agendamento público e pelo barbeiro no
walk-in. Sem verificar posse do número (OTP), a API não tem como
distinguir o dono do telefone de quem apenas o conhece. Quem definir a
senha primeiro assume o cadastro e passa a ver o histórico de
agendamentos daquela pessoa naquela barbearia.

Decisão: **aceitar, limitando a superfície.** Definir senha só é
permitido em cadastro cujo `senhaHash` ainda é nulo; depois disso, só
login. O dado exposto é histórico de cortes de cabelo, o piloto é uma
barbearia só, e fechar de verdade exige o canal de mensagem do passo 4
do roadmap, que ainda não foi arquitetado.

Entra em "Dívidas conhecidas" do `docs/roadmap.md`, junto do `409` do
`POST /auth/signup`, e fecha no mesmo momento: quando existir
verificação de telefone.

## Autenticação: como as duas identidades convivem

O payload assinado vira união; o `user` **não**:

```ts
type PayloadBarbeiro = { tipo: "barbeiro"; barbeiroId: string; barbeariaId: string };
type PayloadCliente  = { tipo: "cliente";  clienteId: string;  barbeariaId: string };

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: PayloadBarbeiro | PayloadCliente; // o que se assina
    user: PayloadBarbeiro;                     // o que o escopo do barbeiro garante
  }
}

declare module "fastify" {
  interface FastifyRequest { cliente?: PayloadCliente }
}
```

`user` continua sendo só o barbeiro porque virar união quebraria a
compilação de toda rota protegida existente — `request.user.barbeariaId`
aparece em `agendamentos.ts`, `clientes.ts`, `servicos.ts`,
`horarios.ts`, `me.ts` e `barbearias.ts` — e forçaria narrowing em
código estável. O que garante que `user` é mesmo barbeiro não é o tipo:
é o hook. `autenticar` passa a recusar `tipo !== "barbeiro"` **antes**
de consultar o banco, e `autenticarCliente` faz o espelho, decorando
`request.cliente`.

**Os hooks leem a união pelo retorno do `jwtVerify`, não pelo
`request.user`:**

```ts
const payload = await request.jwtVerify<PayloadBarbeiro | PayloadCliente>();
if (payload.tipo !== "barbeiro") {
  throw Object.assign(new Error("token não é de barbeiro"), { statusCode: 401 });
}
```

O `jwtVerify` do `@fastify/jwt` v9 aceita o genérico e devolve
`Promise<Decoded>` (`types/jwt.d.ts:29`). Isso importa: ramificar em
cima de `request.user.tipo` compilaria, mas como `user` está declarado
como `PayloadBarbeiro`, o campo teria o tipo literal `"barbeiro"` e o
compilador trataria o `!==` como sempre falso — a checagem funcionaria
em runtime e pareceria código morto para quem refatorasse depois. Lendo
a união, a checagem é real para o compilador, e `request.user` continua
tipado como barbeiro para as rotas de dentro do escopo.

`request.cliente` é opcional na declaração, então as seis rotas do
cliente não leem o campo direto: usam um helper `clienteDoToken(request)`
que devolve `PayloadCliente` e lança 401 se estiver ausente. Um `!` em
cada uma das seis dependeria de ninguém esquecer — o mesmo argumento do
escopo com hook, um nível abaixo.

`autenticarCliente` consulta o `Cliente` a cada requisição, pela mesma
razão que `autenticar` já paga essa query (`plugins/auth.ts:33-36`):
apagar um cadastro tem que invalidar o token na hora, não em sete dias.

As rotas do cliente ficam num terceiro escopo `app.register`, irmão do
de `app.ts:70`, pelo motivo que o comentário de lá já registra —
pendurar o hook rota a rota dependeria de ninguém esquecer.

**Alternativa descartada:** dois segredos, via namespaces do
`@fastify/jwt` (`JWT_SECRET_CLIENTE`). Torna um token de cliente
criptograficamente incapaz de verificar como barbeiro, mas custa env
var nova em todo ambiente — incluindo a VM da OCI, que ainda nem
existe — e `jwtVerify` namespaced em todo lugar. O risco que ela fecha
é fechado por uma checagem de campo mais um teste
(`tests/rotas/auth-escopo-cruzado.test.ts`), e prova de teste vale mais
que prova de configuração. Se um dia cliente e barbeiro tiverem ciclos
de vida de credencial diferentes, a decisão se revisita.

**Efeito colateral:** token emitido antes desta fase não tem `tipo`, e
passa a ser recusado. Todo barbeiro logado é deslogado no deploy. Só
ambiente de dev por enquanto.

## Superfície HTTP

| Rota | Corpo / regra | Resposta |
|---|---|---|
| `POST /barbearias/:slug/auth/cliente/signup` | `{ nome, telefone, senha }` — telefone novo **cria** o cadastro; existente sem `senhaHash` **define** a senha; existente com senha → `409` | `201 { token, cliente }` |
| `POST /barbearias/:slug/auth/cliente/login` | `{ telefone, senha }` | `200 { token, cliente }` |
| `GET /clientes/me` | — | `{ cliente }` |
| `PATCH /clientes/me` | `{ nome?, email? }`, `minProperties: 1` | `{ cliente }` |
| `GET /clientes/me/agendamentos` | query `?de&ate` opcional | `{ agendamentos }`, com serviços |
| `POST /clientes/me/agendamentos/:id/cancelar` | só futuro, só `pendente`/`confirmado` | `{ agendamento }` |
| `POST /clientes/me/agendamentos/:id/remarcar` | `{ data, horaInicio, servicoIds? }` | `201 { agendamento }` |
| `GET /barbearias/:slug` *(altera)* | — | ganha `barbeiros: [{ id, nome }]` |

Os patterns de `lib/padroes.ts` valem aqui: `PADRAO_TELEFONE` no
telefone, `PADRAO_UUID` nos ids, `PADRAO_DATA` e `PADRAO_HORA` no
remarcar, `PADRAO_EMAIL` no PATCH. Senha com `minLength: 8` no signup e
`minLength: 1` no login, igual a `rotas/auth.ts`.

Três consequências que a tabela decide:

- **Signup cria o cadastro quando o telefone é novo.** Se ele recusasse
  telefone desconhecido, quem nunca agendou não teria conta e a
  resposta diria "esse telefone não é cliente daqui" — o vazamento que
  o login evita. Assim o único caminho que revela algo é o `409` de
  telefone que já tem senha.
- **O `nome` do signup não sobrescreve cadastro existente.** Ele só é
  usado quando o telefone é novo. Em cadastro que já existe, o signup
  define a senha e ignora o nome — mesma regra do `update: {}` vazio do
  upsert público (`rotas/agendamentos.ts:289-291`), que existe para
  quem digita o nome abreviado no celular não renomear o cadastro que o
  barbeiro ajustou.
- **Cancelar e remarcar precisam de "agora".** `Agendamento.data` é
  `@db.Date` e `horaInicio` é `@db.Time`, ambos sem fuso. Uma constante
  `America/Sao_Paulo` em `lib/horas.ts` resolve; barbearias em fusos
  diferentes já estão fora de escopo pelo roadmap.
- **Remarcar não troca de barbeiro.** Herda o `barbeiroId` do
  agendamento antigo. Trocar de barbeiro é agendar outro, e a barbearia
  do MVP tem um só.

`serializarCliente` nunca inclui `senhaHash` — campos listados um a um,
nunca spread, como `serializar.ts:29` já faz para a barbearia.

O login responde igual, e com o mesmo custo, para telefone inexistente
e senha errada: o caminho sem cliente confere contra um hash
descartável, pelo motivo que `rotas/auth.ts:135-146` documenta — o
scrypt é lento de propósito, e pular a conferência faria o relógio
entregar o que o corpo esconde.

## O fluxo do remarcar

Uma transação só, dentro do `comRetryDeDeadlock`, e a ordem importa:

```
1. findFirstOrThrow  where { id, clienteId: request.cliente.clienteId }
2. valida: futuro (America/Sao_Paulo) e status ∈ { pendente, confirmado }
3. update  status = "cancelado"      ← libera o horário do próprio agendamento
4. criarAgendamento(tx, { barbeariaId e barbeiroId herdados,
                          servicoIds do corpo ou os do agendamento antigo,
                          data, horaInicio, origem: "cliente" })
```

O passo 3 vir antes do 4 não é arbitrário. Sem ele, remarcar 10:00 →
10:15 no mesmo dia bate no próprio agendamento, duas vezes: em
`horariosLivres`, que lista os ocupados com `status: { not: "cancelado" }`
(`lib/agendamento.ts:86-90`), e na `EXCLUDE USING gist
sem_conflito_horario`, que é parcial no mesmo predicado. Cancelando
primeiro, dentro da mesma transação, o horário antigo deixa de contar.

A mesma transação dá a garantia inversa: se o horário novo estiver
ocupado, `criarAgendamento` lança, **o cancelamento desfaz junto**, e o
cliente continua com o agendamento que tinha. Nunca fica sem nenhum.
É teste, não comentário.

O filtro por `clienteId` no `where` do passo 1 é o que faz o
agendamento de outra pessoa responder `404` em vez de `403` — mesma
política que `plugins/erros.ts:36-39` descreve para o escopo do
barbeiro.

Cancelar é o mesmo caminho sem os passos 3 e 4.

**Caso de borda:** `carregarServicos` recusa serviço inativo
(`lib/disponibilidade.ts:96-102`) e `DELETE /servicos/:id` é soft
delete (`rotas/servicos.ts:112-115`). Logo, remarcar herdando os
serviços de um agendamento cujo serviço o barbeiro desativou responde
`422 servico_inativo`, e a tela tem que pedir os serviços de novo. Não
é bug: deixar passar faria o cliente remarcar para um serviço que a
barbearia não vende mais.

## Erros

Nenhum tratador novo — `plugins/erros.ts` já cobre tudo. Entram dois
códigos de `ErroDeNegocio` (422):

| Código | Quando |
|---|---|
| `agendamento_passado` | cancelar/remarcar algo que já aconteceu |
| `status_nao_permite` | agendamento já `cancelado`, `concluido` ou `no_show` |

Os demais vêm de graça: `horario_indisponivel`, `servico_inativo`,
`data_invalida` e `duracao_invalida` pelo `criarAgendamento`;
`401 nao_autenticado` para token ausente, inválido ou de `tipo` errado
(o hook lança com `statusCode: 401`, que `erros.ts:92` captura);
`404 nao_encontrado` pelo P2025; `409 conflito` no signup de telefone
que já tem senha; `409 horario_ocupado` quando a `sem_conflito_horario`
pega um remarcar concorrente.

## Testes

Vitest contra o Postgres de teste, um arquivo por rota, espelhando
`apps/api/tests/rotas/`:

```
auth-cliente-signup.test.ts     telefone novo cria; sem senha define; com senha 409
auth-cliente-login.test.ts      erro idêntico e de mesmo custo em telefone e em senha
clientes-me.test.ts             GET/PATCH; token de outra barbearia não enxerga
clientes-me-agendamentos.test.ts
clientes-me-cancelar.test.ts    passado 422; concluído 422; de outro cliente 404
clientes-me-remarcar.test.ts    sucesso; mesmo dia deslocando 15 min; serviço inativo
                                422; horário tomado 409 COM o antigo ainda confirmado
auth-escopo-cruzado.test.ts     token de cliente em rota de barbeiro → 401, e o inverso
barbearias-publica.test.ts      (altera) passa a exigir `barbeiros` na resposta
```

`auth-escopo-cruzado` é o teste que sustenta a escolha de um segredo
só: é ele que substitui o isolamento criptográfico da alternativa
descartada. Sem ele, a decisão vira confiança.

## Fora de escopo

- **OTP / verificação de telefone.** Depende do canal do passo 4 do
  roadmap.
- **Recuperação de senha.** Sem email confiável nem canal de mensagem,
  não há para onde mandar o link. O barbeiro consegue limpar o
  `senhaHash` pelo banco enquanto isso.
- **Cliente global na plataforma.** O `product-brief.md` diz que
  `Cliente` é identidade global; o schema diz o contrário, com
  `@@unique([barbeariaId, telefone])` e um comentário explícito
  (`schema.prisma:93-95`). O schema ganha: a conta é por barbearia,
  "Meus agendamentos" mostra só aquela barbearia, e quem é cliente de
  duas tem dois cadastros. Unificar é outra fase, com migration.
- **O cliente escolher barbeiro.** Um barbeiro por barbearia no MVP.

## Dívidas que esta fase cria

- **Reivindicação de cadastro por telefone**, descrita acima. Vai para
  "Dívidas conhecidas" do `docs/roadmap.md`.
- **`409` no signup do cliente revela telefone com conta**, exatamente
  como o `409` do signup do barbeiro revela email. Mesma dívida, mesmo
  fechamento.
