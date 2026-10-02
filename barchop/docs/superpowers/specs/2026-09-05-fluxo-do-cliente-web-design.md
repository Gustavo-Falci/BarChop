# Fluxo do cliente na web — design

Data: 2026-09-05
Sub-projeto B do passo 3 do `docs/roadmap.md`. As sete telas de cliente
do mapa, mais a de entrar, que o mapa não previu — ver "Decisões".
Depende do sub-projeto A, que está na `main` (PR #7) — ver
`2026-09-05-fundacao-das-telas-design.md`.

## Contexto

A fundação entregou tudo que fica entre a API e uma tela: o
`packages/api-client` com dublê em memória, `packages/formato`, os DTOs
de resposta em `@barchop/types`, os tokens, a fonte, os quatro
primitivos, o setup de teste e a sessão. O que não existe ainda é tela
nenhuma — o `apps/web` tem os dois route groups vazios e uma vitrine de
primitivos.

Este sub-projeto constrói o fluxo que o produto inteiro existe para
servir: o cliente abre o link que o barbeiro mandou no WhatsApp,
escolhe serviços, vê só os horários que cabem, e agenda. Cinco das oito
telas não têm sessão nenhuma, e o fluxo de agendar inteiro é uma delas.

## Decisões tomadas antes do design

Quatro perguntas fechadas com o dono do projeto:

1. **O estado do agendamento em progresso vive na URL**, um passo por
   rota, exceto os dados pessoais. Recarregar a página não perde nada e
   o botão voltar do celular volta um passo em vez de sair do fluxo —
   num link aberto pelo navegador embutido do WhatsApp, as duas coisas
   acontecem bastante. As alternativas eram `sessionStorage` com URL
   limpa, e um wizard de rota única em estado React; a segunda perde
   tudo a cada recarregamento.
2. **Nome e telefone ficam em `sessionStorage`, apagados assim que o
   agendamento é criado.** Fora da URL de propósito: URL entra em
   histórico, print e cabeçalho de referência. Sobrevive a recarregar e
   morre com a aba. A alternativa de guardar só em memória obrigaria a
   redigitar depois de um refresh na última tela.
3. **O fluxo público nunca pede conta.** Se existir sessão daquela
   barbearia, a tela de dados chega preenchida; fora isso, `/entrar` e
   `/minha-conta` são um ramo à parte, alcançado por link direto. Quem
   nunca criou senha jamais vê uma tela de login. Foi recusado o convite
   a criar senha depois de agendar — tela fora do mapa das 23, e ela
   esbarra na dívida do OTP.

   **Consequência que o mapa não previu:** `docs/screens.md` lista sete
   telas de cliente e nenhuma delas é login, mas "Meus agendamentos"
   exige token. `/[slug]/entrar` é, portanto, uma oitava tela, e ela
   cobre os dois casos numa só: entrar com telefone e senha, e o
   primeiro acesso, que define a senha de um cadastro que ainda não tem
   uma. Sem o primeiro acesso ninguém jamais teria senha, e a conta
   seria inalcançável — a API já expõe as duas rotas
   (`/auth/cliente/login` e `/auth/cliente/signup`).

   **Quem escolhe entre as duas é a pessoa, não a tela.** Não existe
   rota pública que responda se um telefone já tem senha, e é de
   propósito: seria exatamente a sondagem que o `409` do signup já é
   criticado por permitir. Então a tela tem duas ações explícitas —
   "Entrar" e "Primeiro acesso" — e cada uma reage ao que a API
   responder: `nao_autenticado` no login vira "telefone ou senha
   incorretos", e `conflito` no primeiro acesso vira "esse telefone já
   tem senha, use Entrar". O `temConta` que o cadastro devolve depois do
   login serve pra outra coisa: preencher a tela de dados de quem já
   está autenticado.
4. **Tudo é buscado no navegador, por um caminho de dados só.** Todas as
   telas são client components falando com o `api-client`. A alternativa
   híbrida — perfil e serviços em Server Components — traria um segundo
   modo de acesso à API, com `baseUrl` próprio e sem `localStorage`, e
   é a peça que mais gera bug de configuração num deploy que ainda não
   existe (passo 5 do roadmap). O que se perde é SEO da landing, e o
   canal deste produto é um link de WhatsApp, não busca orgânica. Se
   virar requisito no piloto, o perfil sobe pra Server Component sozinho.

## Rotas

```
/[slug]                      perfil da barbearia
/[slug]/agendar              escolha dos serviços      ?servicos=
/[slug]/agendar/data         escolha da data           ?servicos=
/[slug]/agendar/horario      escolha do horário        ?servicos=&data=
/[slug]/agendar/dados        nome + telefone           ?servicos=&data=&hora=
/[slug]/agendar/confirmar    resumo, confirmação e sucesso
/[slug]/entrar               login e primeiro acesso
/[slug]/minha-conta          meus agendamentos
```

Todas dentro do route group `(publico)/`, que a fundação criou e que
força tema claro — o fluxo do cliente é sempre claro, mesmo com o
sistema em escuro, porque é uma página que chega a quem não conhece o
produto.

`servicos` é uma lista separada por vírgula; o `api-client` a converte
no `servicoIds` repetido que a API espera. O `barbeiroId` **não** entra
na URL: sai do perfil, que é a única rota pública que o entrega, e a
barbearia do MVP tem um barbeiro só.

Preço e duração também não entram na URL, e não porque seriam feios:
os dois são resolvidos pelo backend no POST, e confiar no que veio da
URL seria deixar o cliente escolher quanto paga.

**Cada passo valida o que veio antes, e a falha tem destino.** Abrir
`/agendar/horario` sem `data` — link velho, histórico, alguém editando
a barra de endereço — redireciona pro passo que falta em vez de
renderizar quebrado. `/agendar/confirmar` sem nome e telefone no
`sessionStorage` volta pra `/agendar/dados` preservando a query. É a
mesma regra que faz recarregar funcionar em qualquer ponto.

**Depois de confirmar, a própria rota vira o sucesso**: mesmo
`/agendar/confirmar`, conteúdo trocado — o que foi agendado, quando, e
um caminho de volta. Nenhuma rota nova por causa disso, e é nesse
momento que o `sessionStorage` é apagado.

**Remarcar reusa os dois seletores** em vez de duplicá-los:
`/[slug]/agendar/data?remarcar=<id>` percorre data e horário como o
fluxo novo, e a confirmação chama `cliente.remarcar` no lugar de
`publico.agendar`. Mesmo motivo de a API ter feito o remarcar
transacional: cancelar e criar em passos separados deixaria o cliente
sem nada se o segundo falhasse.

Esse caminho **pula `/agendar/dados`**: quem remarca já está autenticado
e o cadastro é o do token, então pedir nome e telefone de novo seria
pedir o que a API vai ignorar. O passo de horário, ao ver `remarcar` na
query, aponta direto pra confirmação — que é a mesma tela, decidindo
pela presença do parâmetro qual das duas chamadas faz.

## Dados

Cada tela faz no máximo uma chamada, todas pelo `api-client`:

| Tela | Chamada |
|---|---|
| Perfil | `publico.perfilDaBarbearia(slug)` — daqui sai o `barbeiroId` |
| Serviços | `publico.servicos(slug)`; soma de duração e preço é local |
| Data | `publico.disponibilidadeDoMes(slug, { barbeiroId, mes, servicoIds })` |
| Horário | `publico.disponibilidadeDoDia(slug, { barbeiroId, data, servicoIds })` |
| Dados | nenhuma |
| Confirmar | `publico.agendar(slug, …)` ou `cliente.remarcar(id, …)` |
| Entrar | `publico.loginCliente(slug, …)` ou `publico.signupCliente(slug, …)`, grava a sessão |
| Minha conta | `cliente.meusAgendamentos()`, `cancelar`, `remarcar` |

**As telas recebem a API por um provider.** `ProvedorDaApi` no layout de
`(publico)/[slug]` monta `apiDoCliente(slug)` uma vez, e as telas leem
por hook; em teste o mesmo provider recebe `criarApiClientFalso()`. Sem
ele cada tela importaria a fábrica direto e não teria como rodar sem
rede — é para isso que o `fetch` é injetável desde a fundação.

Dois hooks, e só dois:

- `usePassoDoFluxo` — lê a query, valida o pré-requisito do passo e
  redireciona quando falta.
- `useRequisicao` — carregando/erro/dados em volta de uma chamada.
  Cinco telas repetiriam o mesmo `useState` triplo.

## O passado é responsabilidade desta fase

A API não sabe que dia é hoje. `disponibilidade/mes` marca como
disponível qualquer dia com janela livre, ontem inclusive, e
`disponibilidade` devolve `09:00` mesmo quando já são duas da tarde —
`apps/api/src/routers/disponibilidade.ts:178` diz literalmente que quem
desabilita o passado é a tela, e o `garantirFuturo` previsto nas
dívidas do roadmap não existe.

São dois lugares distintos, e os dois são requisito de correção:

1. O calendário desabilita dias anteriores a hoje.
2. A lista de horários, **quando a data escolhida é hoje**, descarta os
   que já passaram.

Sem a segunda, o cliente agenda pras 9h às 14h e o agendamento nasce
inalterável: o `garantirAlteravel` recusa cancelar ou remarcar o que já
passou, e só o barbeiro desfaz. O mesmo vale no caminho de remarcar,
que passa pelos mesmos dois seletores.

**Limitação assumida:** o relógio é o do aparelho do cliente, não o da
barbearia. Com uma barbearia e clientes na mesma cidade dá no mesmo; um
cliente viajando pode ver um horário a mais ou a menos. Fica na mesma
família do "barbearias em fusos diferentes" que a spec da API já pôs
fora de escopo.

## Erros

A tela ramifica no `codigo` do `ErroDaApi`, nunca no status solto:

- **`horario_ocupado`** (409) na confirmação — alguém pegou o horário
  entre a listagem e o envio. É a corrida que a trava do banco pega
  depois de a disponibilidade já ter dito que cabia, e por isso é o
  único erro que uma tela correta ainda encontra. A tela volta pro passo
  de horário **recarregando a lista**; não repete o envio.
- **`regra_de_negocio`** (422) — telefone fora do formato, horário que
  não cabe mais. Mostra a mensagem que a API mandou.
- **`nao_encontrado`** (404) no slug — barbearia inexistente ganha tela
  própria, não erro cru.
- **`nao_autenticado`** (401) em `/minha-conta` — a sessão já foi limpa
  pelo gancho da fundação; a tela manda pra `/entrar`.

Qualquer outro código cai no componente `Aviso` com a mensagem da API.

## Componentes novos

A fundação deixou `Botao`, `Campo`, `Cartao` e `Chip`. Faltam cinco,
todos vindos dos mockups de `docs/design-system.html`:

- `Calendario` — grade do mês, navegação entre meses, e dia desabilitado
  com motivo declarado (`sem vaga` ou `no passado`).
- `ListaDeHorarios` — as pílulas selecionáveis.
- `ItemDeServico` — linha com checkbox e preço, fundo `paleYellow`
  quando selecionada.
- `Resumo` — a barra "2 serviços · 50 min", que aparece em três passos.
- `Aviso` — a mensagem de erro que sobra.

## Testes

Vitest + Testing Library + `criarApiClientFalso`, o setup que a fundação
instalou. Um teste por comportamento que pode quebrar em produção:

- soma de duração e preço; "Continuar" desabilitado sem serviço escolhido
- calendário: dia sem vaga desabilitado, **dia passado desabilitado**
- horários: com a data de hoje, os que já passaram não aparecem
- `/agendar/horario` sem `data` na URL redireciona pro passo de data
- `/agendar/confirmar` sem dados no `sessionStorage` volta pra
  `/agendar/dados` com a query intacta
- confirmação que recebe `horario_ocupado` volta pro horário e recarrega
  a lista
- telefone formata enquanto digita, e o envio manda `(11) 99999-8888`
- dados preenchidos quando existe sessão daquela barbearia
- `/entrar` traduz `nao_autenticado` do login em "telefone ou senha
  incorretos", e `conflito` do primeiro acesso em "esse telefone já tem
  senha"
- o caminho de remarcar vai do horário direto pra confirmação, sem
  passar pelo passo de dados
- `/minha-conta` com 401 manda pra `/entrar`
- cancelar e remarcar atualizam a lista

Os testes de data e hora fixam o relógio pelo parâmetro do componente,
não por fake timers — mesma razão da API, onde `agoraNaBarbearia` recebe
o instante: um relógio congelado global esconde mais do que revela.

## Fora de escopo

- Painel do barbeiro (sub-projeto C) e app no Expo (D).
- Server Components e SEO da landing.
- Convite a criar senha depois de agendar.
- Fechar o `garantirFuturo` na API. A tela continua sendo a única
  barreira contra o passado, e é por isso que dois dos testes acima
  existem.
- Escolha de barbeiro: a barbearia do MVP tem um só, e o `barbeiroId`
  sai do perfil.

## Dívidas que esta fase cria

- **O relógio do cliente decide o que é passado**, não o da barbearia.
- **O dublê do `api-client` ignora `barbeiroId` ao detectar horário
  ocupado**, então um teste semeado com dois barbeiros veria
  `horario_ocupado` onde a API real aceitaria. Herdada da fundação, e
  registrada lá; vale lembrar aqui porque é este sub-projeto que escreve
  os testes contra o dublê.

## Critérios de conclusão

1. `pnpm test` na raiz verde, com os dez comportamentos acima cobertos.
2. `pnpm type-check` e `pnpm build` na raiz sem erro.
3. Com a API local de pé, o fluxo fecha ponta a ponta no navegador:
   abrir `/[slug]`, escolher serviços, data e horário, informar nome e
   telefone, confirmar, e o agendamento aparecer em `/[slug]/minha-conta`
   depois de entrar com telefone e senha.
4. Um dia passado e um horário de hoje que já passou não são
   selecionáveis em nenhum dos dois caminhos, o de agendar e o de
   remarcar.
