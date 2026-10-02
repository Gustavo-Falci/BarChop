# Fundação das telas — design

Data: 2026-09-05
Passo 3 do `docs/roadmap.md`. Primeiro de quatro sub-projetos; não
entrega nenhuma das 23 telas.

## Contexto

A API fechou. As seis fases estão na `main` (a última, identidade do
cliente, no PR #6), com 305 testes, e a superfície HTTP que as telas
consomem está completa: 31 endpoints em 22 caminhos, dois escopos de
autenticação, o formato de erro estável.

Do outro lado, `apps/web` e `apps/mobile` são scaffold. Cada um tem uma
tela provisória cujo comentário diz o que ela é — existe pra provar que
o bundler enxerga os pacotes internos do monorepo. Não há cliente HTTP,
não há sessão, não há navegação, não há componente nenhum, e nenhum dos
dois tem setup de teste (o `turbo run test` da raiz espera scripts que
não existem).

Construir as 23 telas sem essa camada significa cada tela inventar a
sua: o próprio `fetch`, o próprio tratamento de 401, a própria máscara
de telefone. É o que esta fase impede.

## Decisões tomadas antes do design

Quatro perguntas fechadas com o dono do projeto:

1. **Um app Next só, com dois route groups.** O painel do barbeiro e o
   link público do cliente convivem em `apps/web`, separados por
   `(painel)/` e `(publico)/` — layouts, tema e sessão distintos, build
   e deploy únicos. A alternativa era um segundo pacote em `apps/`. O
   passo 6 do roadmap deixa em aberto se painel e link público ficam no
   mesmo host ou em subdomínios; com route groups essa escolha vira
   configuração de roteamento na hora do deploy, não migração de
   código.
2. **O app opcional do cliente fica fora do MVP, e nenhuma tela é
   cortada.** As 7 telas do fluxo do cliente viram rotas web sob
   `/[slug]`, inclusive "Meus agendamentos". O que empurra a decisão é
   a API: o login do cliente é
   `POST /barbearias/:slug/auth/cliente/login`, por barbearia. Um app
   instalado não tem slug antes de receber um deep link, então a tela
   de entrada de um app de cliente ou seria ambígua ou dependeria de o
   cliente já ter clicado no link — que é justamente o fluxo web. O
   Expo fica sendo só o app do barbeiro, com 10 telas.
3. **Ordem: fundação, cliente na web, painel web, app do barbeiro.**
   Termina toda a web antes de tocar no React Native, e o vocabulário
   de componentes só é traduzido pra `StyleSheet` depois de assentar.
   No fim do terceiro sub-projeto o produto já é usável de ponta a
   ponta — cliente agenda pelo link, barbeiro gerencia pelo painel —
   sem passar por loja de aplicativos, o que destrava o piloto do
   passo 7 sem depender de submissão.
4. **Vitest + Testing Library, com API falsa em memória.** Sem MSW e
   sem Postgres: o `api-client` é injetado, então o teste passa uma
   implementação falsa. A alternativa mais completa (Playwright ponta a
   ponta contra a API real) exigiria banco de pé em CI e minutos por
   rodada; fica pra quando existir CI.

E uma correção de divergência: **a fonte de display é Clash Grotesk**,
como diz `packages/design-tokens/src/index.ts`. O
`docs/design-system.html` dizia Space Grotesk em um lugar; é ele que se
corrige.

## Decomposição: as 23 telas em quatro sub-projetos

Cada um ganha spec, plano e ciclo próprios. Esta spec cobre só o A.

| | Entrega | Telas |
|---|---|---|
| **A** | Fundação — esta spec | 0 |
| **B** | Fluxo do cliente na web, sob `/[slug]` | 7 |
| **C** | Painel web do barbeiro | 6 |
| **D** | App do barbeiro no Expo | 10 |

Duas restrições que a decomposição carrega pra frente, e que a spec de
cada sub-projeto precisa reafirmar:

- **Os seletores de data e hora são load-bearing.**
  `apps/api/src/routers/disponibilidade.ts:178` diz literalmente que
  "quem desabilita o passado é a tela", e o `garantirFuturo` previsto
  nas dívidas do roadmap não existe. Até existir, a tela é a única
  barreira contra um cliente remarcar pro passado — e um agendamento no
  passado é exatamente o que o `garantirAlteravel` recusa alterar
  depois, ou seja, o cliente tranca a própria conta e só o barbeiro
  desfaz. Isso é requisito de correção do sub-projeto B, não polimento
  de UX.
- **Telefone tem um formato só.** `(11) 99999-8888`, com DDD
  obrigatório; número fora disso é 400 na API. Vale pra toda tela que
  envie ou exiba telefone.

## `packages/api-client`

Um módulo por área, espelhando `apps/api/src/routers/`: `auth`,
`auth-cliente`, `barbearias`, `servicos`, `clientes`, `clientes-me`,
`agendamentos`, `disponibilidade`, `horarios`, `me`.

Fábrica única:

```ts
criarApiClient({
  baseUrl: string,
  obterToken: () => string | null,
  aoExpirarSessao?: () => void,
  fetch?: typeof globalThis.fetch,
})
```

O `fetch` injetável é o que dispensa MSW: teste de unidade passa uma
função; o app não passa nada e usa o global. O `obterToken` é uma
função, não um valor, porque o pacote não guarda sessão — quem guarda é
cada app, e o token muda no meio da vida do client (login, logout,
expiração).

**Erros.** Uma classe `ErroDaApi { status, codigo, mensagem }`,
construída a partir do corpo real da resposta — que o
`apps/api/src/plugins/erros.ts` garante ser sempre
`{ erro, mensagem? }`. As telas ramificam em `codigo`, nunca em status
solto: os códigos que existem hoje são `nao_autenticado`,
`nao_encontrado`, `conflito`, `horario_ocupado`, `regra_de_negocio`,
`requisicao_invalida` e `erro_interno`. O `horario_ocupado` merece
destaque porque é o único que uma tela correta ainda encontra: é a
corrida que a trava do banco pega depois de a disponibilidade já ter
dito que cabia, e a resposta certa na tela é recarregar os horários,
não repetir o envio.

**401.** Todo 401 chama `aoExpirarSessao` antes de propagar. O token
expira em 7 dias (`apps/api/src/plugins/auth.ts`), e o hook consulta o
banco a cada requisição — desativar um barbeiro ou apagar um cliente
invalida o token na hora. Quer dizer: 401 no meio da sessão é evento
normal, não canto raro.

**Dublê.** O próprio pacote exporta `criarApiClientFalso`, com estado em
memória e a mesma assinatura. É o que as telas usam em teste.

## Tipos de resposta mudam de casa

Hoje `BarbeariaSerializada`, `HorarioSerializado` e as irmãs moram em
`apps/api/src/lib/serializar.ts` — invisíveis pro front, que teria de
redeclará-las e torcer. Vão pra `@barchop/types`, e a API passa a
importar de lá.

É o padrão que já vale pro `ClientePublico`, e o comentário que o
acompanha em `packages/types/src/index.ts` explica por quê: o
serializador importa o tipo, então divergir os dois quebra o type-check
em vez de quebrar uma tela.

`GET /barbearias/:slug` devolve, além da barbearia serializada, a
semana completa de horários e a lista de barbeiros ativos (`id`,
`nome`) — este último é o `barbeiroId` que o fluxo público inteiro
exige. O tipo dessa resposta composta também vive em `types`.

## `packages/formato`

Telefone **e** email saem da API juntos: `lib/telefone.ts` e
`lib/email.ts` viram `packages/formato`, e a API importa de lá. Os dois,
e não só o telefone, porque as telas precisam dos dois — o cadastro do
barbeiro e o perfil do cliente mandam email, e `PATCH /clientes/me`
compara em caixa baixa. Extrair um e deixar o outro é como a terceira
cópia aparece no sub-projeto B; foi exatamente o que aconteceu na fase
6, quando o plano reimplementou duas vezes o que já existia.

Nada de reescrever a regra no front: o formato guardado é
`(AA) NNNNN-NNNN`, o `55` inicial cai em 12 ou 13 dígitos mas não em
10, e assinante fora de 8 ou 9 dígitos é erro.

O pacote ganha uma função que a API não precisava e as telas precisam:
formatação progressiva enquanto se digita, que aceita entrada
incompleta sem lançar. `normalizarTelefone` continua sendo a que lança,
e continua sendo a que roda antes de enviar.

**O erro precisa de cuidado, porque é o único ponto da fase que toca
teste que já passa.** Hoje `normalizarTelefone` lança `ErroDeNegocio`,
que é da API: estende `ErroHttp`, carrega status 422 e o código
`telefone_invalido`. O front não pode depender de uma classe com
semântica de HTTP, então o pacote passa a lançar um `TelefoneInvalido`
próprio.

O que preserva os 305 testes:

- A API mantém um `lib/telefone.ts` fino, que reexporta as funções do
  pacote convertendo `TelefoneInvalido` em
  `ErroDeNegocio(mensagem, "telefone_invalido")`. Status, código e
  mensagem ficam idênticos, e nenhum router muda de import.
- Os testes de rota assertam 400 do `pattern` do schema, não 422, então
  não enxergam a troca.
- `tests/lib/telefone.test.ts` é o único que assertava a classe
  (`toThrow(ErroDeNegocio)`). Ele se divide: os casos de normalização
  vão pro pacote e assertam `TelefoneInvalido`; fica na API um teste
  novo, pequeno, provando que a tradução para 422 e `telefone_invalido`
  acontece.

`normalizarEmail` não lança, então a mudança dele é só de endereço.

## Tokens, fonte e estilo do web

**Tokens.** `packages/design-tokens` ganha `spacing`, `borderWidth` e
uma escala de tamanho de fonte. Hoje só tem cor, raio, sombra e família
— e o design system usa borda de 2px e uma escala própria em todas as
23 telas, que sem token viraria número solto repetido.

**Fonte.** Clash Grotesk (display) e Inter (corpo). Os arquivos da
Clash vieram do pacote completo do Fontshare, com a licença em
`License/FFL.txt`: `Fonts/WEB/fonts/*.woff2` servem o Next via
`next/font/local`, e `Fonts/OTF/*.otf` servem o Expo via `expo-font`
quando o sub-projeto D chegar. Só os pesos que os tokens citam entram
no repositório, e a licença entra junto. A Inter vem por
`next/font/google`, que baixa e serve do próprio domínio no build — no
Expo ela virará `@expo-google-fonts/inter`, no sub-projeto D.

**Estilo.** CSS Modules, um arquivo por componente. Os tokens continuam
chegando como CSS custom properties pelo `tokens-css.ts` que já existe,
e o `globals.css` encolhe pra reset, corpo e fonte — hoje ele carrega
`.chip` e `.grade`, que são da tela provisória e saem junto com ela.

Sem CSS-in-JS: nada que obrigue um componente a virar `"use client"` só
pra ter estilo. E o `tokens-css.ts` já traz um comentário dizendo que,
quando existir troca manual de tema, o `prefers-color-scheme` vira
`[data-theme]` no `<html>` — o painel do barbeiro tem modo escuro no
design system, o fluxo do cliente é sempre claro, então essa troca é
por route group e acontece no sub-projeto C.

## Estrutura de rotas do `apps/web`

```
app/
  (painel)/     sessão do barbeiro; claro/escuro
  (publico)/    sem sessão obrigatória; sempre claro
    [slug]/
  primitivos/   vitrine dos componentes; fora dos dois grupos
```

Os dois grupos têm layout próprio. O grupo público não impõe login: das
7 telas do cliente, 5 não têm sessão nenhuma, e só "Meus agendamentos"
e o login exigem token.

`apps/web/AGENTS.md` avisa que este Next difere do que o modelo
aprendeu e manda ler `node_modules/next/dist/docs/` antes de escrever
código. Vale na implementação, não aqui — e vale em particular pro
`next/font/local` e o `next/font/google` citados acima, e pra forma dos
route groups: o plano confirma os três na documentação instalada antes
de escrever, em vez de descobrir divergência no meio da fase.

## Sessão

Dois tokens, nunca um. O `apps/api/src/app.ts` monta dois escopos cujos
hooks recusam o token um do outro — `autenticar` rejeita payload de
cliente e `autenticarCliente` rejeita o de barbeiro. Tratar como uma
sessão só quebraria na primeira tela que misturasse as duas.

No web, `localStorage`, com chaves separadas por identidade:
`sessao.barbeiro` e `sessao.cliente.<slug>` — o token do cliente é por
barbearia, porque o login dele é.

**Escolha assumida:** `localStorage` é legível por XSS. A alternativa
mais segura seria cookie `httpOnly` posto por route handler do Next, o
que obrigaria a proxiar a API inteira pelo servidor do Next e mudaria o
formato de erro no caminho. Fica como dívida registrada, e o app mobile
usará bearer de qualquer forma.

## Testes

Vitest nos pacotes e no `apps/web`, com `@testing-library/react`. Cada
`package.json` ganha `test` e `lint` — hoje o `turbo run test` da raiz
roda contra apps que não têm o script.

**O `apps/mobile` fica de fora**, com um `test` que roda
`vitest run --passWithNoTests` só pra não derrubar o turbo. Instalar
`@testing-library/react-native` e o transform de RN numa fase que não
escreve uma linha de React Native é escopo do sub-projeto D, e é lá que
o setup entra junto dos primeiros testes que ele roda.

O que esta fase testa, já que não tem tela:

- `packages/formato` — normalização de telefone, o `55` que cai e o que
  não cai, formatação progressiva, entrada inválida, e a caixa do
  email.
- `packages/api-client` — montagem de URL e corpo, cabeçalho de
  autorização, tradução de cada código de erro em `ErroDaApi`, e o
  `aoExpirarSessao` disparando no 401. Tudo com `fetch` injetado.
- `criarApiClientFalso` — que ele responde no mesmo formato do real.

O risco de o falso divergir da API real existe e é contido, não
eliminado: os tipos compartilhados pegam mudança de forma, não mudança
de comportamento. Um teste de contrato contra a API de verdade é
candidato ao passo de infra, junto com o CI.

## Fora de escopo

- Qualquer uma das 23 telas.
- React Native, `expo-router`, `expo-secure-store`, os primitivos em
  `StyleSheet` e o setup de teste do `apps/mobile` — sub-projeto D.
- Troca manual de tema claro/escuro — sub-projeto C, junto do painel.
- Fechar as dívidas da API listadas no roadmap. Em particular o
  `garantirFuturo`: continua aberta, e por isso as telas de data do
  sub-projeto B carregam a responsabilidade.
- CI, deploy, domínio — passos 5 e 6 do roadmap.

## Dívidas que esta fase cria

- **Token do web em `localStorage`**, exposto a XSS. Fecha com cookie
  `httpOnly` e proxy no Next, ou com um domínio próprio e cookie de
  sessão — decisão que casa com o passo 5.
- **O client falso pode divergir da API real** sem que nenhum teste
  perceba, enquanto não existir teste de contrato. Uma divergência já
  nasce conhecida: o `agendar` do dublê considera horário ocupado
  olhando só data e hora, sem o `barbeiroId`. Com um barbeiro por
  barbearia, que é o MVP, os dois concordam; num cenário semeado com
  dois barbeiros o dublê responderia `horario_ocupado` onde a API real
  aceitaria. Fica anotado porque é o dublê, e não a API, que as telas
  enxergam ao serem escritas.

## Critérios de conclusão

1. `pnpm test` na raiz roda e passa nos pacotes e no `apps/web`, e não
   quebra no `apps/mobile`, que ainda não tem teste.
2. `pnpm type-check` passa com os tipos de resposta já morando em
   `@barchop/types` e a API importando de lá.
3. A API continua verde depois de perder a normalização e as
   interfaces do serializador para os pacotes: dos 305 testes, os de
   rota passam sem alteração nenhuma, e o `tests/lib/telefone.test.ts`
   se divide entre o pacote e um teste novo da tradução do erro.
4. `apps/web` sobe com os dois route groups e seus layouts, a fonte
   Clash Grotesk carregando, e os primitivos renderizando numa página
   de vitrine em `/primitivos` — que substitui a tela provisória de
   hoje e sai quando o sub-projeto C entregar o painel. Sem ela a fase
   não teria como ser vista rodando, já que não entrega tela nenhuma.
