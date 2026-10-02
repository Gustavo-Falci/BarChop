# Painel web do barbeiro — design

Data: 2026-09-06
Sub-projeto C do passo 3 do `docs/roadmap.md`. As seis telas de painel
do mapa, que na prática são doze rotas — ver "Rotas". Depende dos
sub-projetos A e B, os dois na `main` (PRs #7 e #8).

## Contexto

A fundação entregou a camada entre a API e as telas, e o fluxo do
cliente entregou as oito primeiras. O que existe hoje em `apps/web`:
`ProvedorDaApi` e `useRequisicao`, sete componentes, a sessão em
`localStorage`, os tokens em CSS custom properties, e o route group
`(painel)/` com um layout que só devolve `<div>{children}</div>`.

Este sub-projeto põe o outro lado do produto de pé. Quando ele fechar,
o BarChop é usável de ponta a ponta sem passar por loja de
aplicativos: o cliente agenda pelo link do WhatsApp, o barbeiro
gerencia pelo navegador. É o que destrava o piloto do passo 7 sem
depender de submissão — e é por isso que a ordem da fundação pôs o
painel antes do app.

## Decisões tomadas antes do design

Cinco perguntas fechadas com o dono do projeto, mais uma correção.

1. **Detalhe e criação viram rotas, não modais.** O mapa dá 6 telas ao
   painel e 10 ao app do barbeiro para a mesma função: Detalhe do
   agendamento, Novo agendamento, Cadastro de cliente e Cadastro de
   serviço não têm tela nomeada no painel. Cada um vira rota. É o mesmo
   argumento que fechou o sub-projeto B — recarregar não perde nada, o
   voltar do navegador volta um passo, e o estado (o dia da agenda, a
   busca de clientes) fica linkável. A alternativa de modal sobre a
   lista perde as três coisas.
2. **Novo agendamento é uma tela larga só, não um wizard.** O wizard do
   fluxo do cliente existe porque um celular não comporta quatro passos
   numa tela; um monitor comporta. Cliente, serviços, data e horário
   ficam visíveis ao mesmo tempo, e cadastrar cliente novo acontece ali
   dentro — o walk-in, que é o caso que a tela existe para atender, é
   justamente quem ainda não está cadastrado.
3. **A agenda é um dia por vez, com faixa de semana em cima.** É o que
   `docs/design-system.html` desenha. A visão de semana em colunas
   cobriria o "semanal" do mapa numa chamada só, mas num dia cheio o
   bloco fica pequeno demais para ler nome e serviço, e não é o desenho
   que existe.
4. **A troca de tema tem dois estados, claro e escuro.** Sem a opção
   "sistema": na primeira visita o painel resolve pelo
   `prefers-color-scheme` e grava a escolha; daí em diante manda o
   `localStorage`. O custo aceito é que trocar o tema do sistema depois
   não mexe mais no painel, e não há como voltar ao automático.
5. **A guarda de sessão vive no layout do painel, não em cada tela.**
   Guarda por repetição depende de ninguém esquecer o hook, e quem
   esquecesse publicaria a tela sem sessão em silêncio — é o mesmo
   raciocínio que fez o `app.ts` da API usar escopo com `onRequest` em
   vez de pendurar o hook rota a rota.

**A correção: o painel ganha o prefixo `/painel`.** O slug da barbearia
é validado como `^[a-z0-9-]{3,80}$` em `apps/api/src/routers/auth.ts:23`,
sem lista de reservados, e o fluxo do cliente mora em `/[slug]`. Com o
painel na raiz, uma rota estática como `/agenda` ou `/clientes` ganha da
rota dinâmica e torna aqueles slugs inalcançáveis — sem nenhum erro,
só uma barbearia cujo link nunca abre. O prefixo resolve sem tocar na
API, e casa com o passo 6 do roadmap: se painel e link público virarem
hosts separados, a mudança é tirar o prefixo do roteamento, não migrar
código.

**O que é herdado e não se rediscute:** todas as telas são client
components falando com o `api-client` pelo `ProvedorDaApi` e o
`useRequisicao`, como decidiu o sub-projeto B. Abrir Server Components
aqui criaria o segundo modo de acesso à API que aquela spec recusou —
com `baseUrl` próprio e sem `localStorage`.

## Rotas

```
/painel/entrar               login e criação da barbearia   (fora da guarda)
/painel                      dashboard do dia
/painel/agenda               ?data=YYYY-MM-DD
/painel/agendamentos/novo    ?data=&hora=&cliente=
/painel/agendamentos/[id]    detalhe: status, observações
/painel/clientes             ?busca=
/painel/clientes/novo
/painel/clientes/[id]        dados e histórico
/painel/servicos
/painel/servicos/novo
/painel/servicos/[id]
/painel/configuracoes        barbearia, horários da semana e perfil
```

Doze rotas contra as seis do mapa, e a divergência é registrada aqui
como o sub-projeto B registrou a oitava tela dele. Duas causas
distintas:

- **Quatro delas são telas que o mapa deu ao app e não ao painel**, para
  a mesma função — decisão 1 acima.
- **Uma delas o mapa não tem em lugar nenhum: criar barbearia.** O
  `docs/screens.md` põe o primeiro acesso na tela de login do app do
  barbeiro, que é o sub-projeto D. Como C vem antes de D, entre o fim
  deste sub-projeto e o do próximo **o painel é o único caminho pelo
  qual uma barbearia pode existir** — sem ele, nem o piloto do passo 7
  nem o próprio desenvolvimento das telas teriam um cadastro para usar.
  É a mesma forma do que aconteceu no B: sem primeiro acesso, ninguém
  jamais teria senha. `criarApiBarbeiro.signup` já existe e cria
  barbearia e barbeiro numa chamada só.

`/painel/entrar` fica fora do grupo guardado — dentro dele, a guarda
redirecionaria a tela para ela mesma. A árvore que produz essas rotas:

```
app/
  (painel)/
    painel/
      entrar/page.tsx        sem guarda
      (guardado)/
        layout.tsx           guarda + navegação + contexto
        page.tsx             /painel
        agenda/page.tsx
        agendamentos/novo/page.tsx
        agendamentos/[id]/page.tsx
        clientes/page.tsx
        clientes/novo/page.tsx
        clientes/[id]/page.tsx
        servicos/page.tsx
        servicos/novo/page.tsx
        servicos/[id]/page.tsx
        configuracoes/page.tsx
  (publico)/
    [slug]/...               como está hoje
```

O segmento `painel/` é real e os dois grupos entre parênteses não
entram no caminho — é o que faz `(guardado)/page.tsx` responder em
`/painel` e não em `/painel/guardado`. O `app/(painel)/layout.tsx` que
a fundação criou continua existindo, e é ele que aplica o tema do
grupo.

## Sessão e o shell do painel

`(painel)/layout.tsx` vira client component e faz três coisas:

1. **Guarda.** Sem token, `router.replace("/painel/entrar")` e não
   renderiza nada. Com token, segue.
2. **Carrega uma vez** o perfil (`meuPerfil()`) e põe perfil e barbearia
   em contexto. A navegação mostra o nome da barbearia; as telas leem
   dali em vez de repetir a chamada.
3. **Trata o fim da sessão.** O `aoExpirarSessao` do `api-client` limpa
   a sessão e manda para `/painel/entrar`. Um lugar só, porque 401 no
   meio da sessão é evento normal e não canto raro: o token vale 7 dias
   e o hook da API consulta o banco a cada requisição, então desativar
   um barbeiro invalida o token na hora.

**A sessão do barbeiro passa a ter duas chaves.** `GET /me` devolve
`PerfilBarbeiro`, que tem `barbeariaId` mas não tem slug. E o slug é
necessário: a disponibilidade só existe como rota pública por slug
(`/barbearias/:slug/disponibilidade`), e a tela de novo agendamento
depende dela. O slug chega uma única vez, no `SessaoBarbeiro` que o
login e o signup devolvem — então é gravado junto do token.

`apps/web/src/sessao/armazenamento.ts` ganha `sessao.barbearia` ao lado
de `sessao.barbeiro`, e uma função `encerrarSessaoDoBarbeiro()` que
limpa as duas. Uma função e não duas chamadas soltas porque logout que
esquece o slug deixa lixo que a próxima sessão lê como se fosse dela.

**O `barbeiroId` não precisa de chave nenhuma:** é o `id` do
`PerfilBarbeiro`, que o layout já carrega.

## As telas

**`/painel/entrar` — login e criação da barbearia.** Duas ações
explícitas, como a tela de entrar do cliente: "Entrar" com email e
senha (`barbeiro.login`), e "Criar barbearia", que pede nome e slug da
barbearia mais nome, email e senha do barbeiro (`barbeiro.signup`).
Quem escolhe entre as duas é a pessoa. O erro de cada uma vem do
código da API: `nao_autenticado` no login vira "email ou senha
incorretos"; `conflito` no signup vira "esse email ou esse endereço já
está em uso" — sem dizer qual dos dois, porque a dívida do 409 já é
conhecida e não vale ampliá-la na tela. As duas gravam token e slug e
vão para `/painel`.

O campo do slug mostra o link que vai resultar (`/<slug>`), porque é
ele que o barbeiro vai mandar no WhatsApp, e o formato dele é o mesmo
`^[a-z0-9-]{3,80}$` que a API exige.

**`/painel` — dashboard do dia.** Uma chamada,
`agendamentosDoDia(hoje)`, mais os horários da semana que o layout já
tem. Três números e a lista do dia; clicar numa linha vai para o
detalhe. Ver "Os números do dashboard".

**`/painel/agenda` — o dia, com a semana em cima.** `?data=` na URL, e
sem ela o dia é hoje. A faixa de sete dias marca quais têm agendamento
(`agendamentosDoIntervalo` da semana); a grade abaixo lista os horários
do dia entre a abertura e o fechamento, cada um ocupado ou livre.
Clicar num livre vai para `/painel/agendamentos/novo?data=&hora=`;
clicar num ocupado vai para o detalhe.

**A grade não chama a disponibilidade, e não pode.** `FiltroDoDia`
exige `servicoIds`, porque a pergunta que aquela rota responde é "onde
cabe um atendimento de duração D" — e na agenda não há serviço
escolhido, é só o dia sendo olhado. Foi o que fez a tela de horário do
sub-projeto B só ser alcançável com `?servicos=` já na URL.

A grade desenha, então, uma coisa mais simples: as faixas entre
`horaAbertura` e `horaFechamento` do dia, que o layout já tem em
`horarios()`, marcadas com o que `agendamentosDoDia(data)` ocupa. Isso
é desenho de slot, não cálculo de disponibilidade — não decide se algo
cabe, só mostra o que está lá. Quem chama `disponibilidadeDoDia` é a
tela de novo agendamento, que tem os serviços selecionados e portanto
tem a pergunta que a rota responde.

**`/painel/agendamentos/novo` — tela larga.** Quatro blocos numa tela:
busca de cliente (`clientes(busca)`) com um "+ cadastrar" que abre os
campos ali mesmo e chama `criarCliente`; checklist de serviços com soma
de duração e preço; calendário; lista de horários
(`publico.disponibilidadeDoDia`, que aqui tem os `servicoIds` que ela
exige).

**O cadastro embutido trata `conflito`.** Telefone repetido é o caso
comum, não o raro: quem chega para um walk-in muitas vezes já existe
como `Cliente`, criado pelo upsert do agendamento público ou por um
walk-in anterior. Um erro seco ali seria um beco — a tela busca o
cadastro existente pelo telefone e o oferece para seleção, que é
exatamente o que a pessoa queria. Sem isso, o cadastro embutido não
resolve o caso pelo qual existe. `data`, `hora` e
`cliente` viajam na query, então o link que a agenda gera chega
preenchido e recarregar não perde a escolha. Envia
`criarAgendamento({ barbeiroId, clienteId, servicoIds, data, horaInicio,
observacoes })`.

O `usePassoDoFluxo` do sub-projeto B **não** é reusado: ele existe para
um wizard de quatro rotas, e aqui não há passo nenhum — a validação é a
do formulário, que só habilita o envio com cliente, ao menos um
serviço, data e hora. Os componentes `Calendario`, `ListaDeHorarios` e
`ItemDeServico` são reusados como estão.

**`/painel/agendamentos/[id]` — detalhe.** Mostra cliente, serviços com
preço congelado, data, hora, origem e observações. As ações são mudar
status (`pendente`, `confirmado`, `concluido`, `cancelado`, `no_show`)
e editar observações — e só. **O barbeiro não remarca:** o
`PATCH /agendamentos/:id` aceita apenas `status` e `observacoes`, e o
comentário em `apps/api/src/routers/agendamentos.ts:50` diz o porquê —
aceitar data e hora ali pularia a checagem de disponibilidade inteira.
Trocar horário é cancelar e criar outro, e a tela diz isso em vez de
oferecer um botão que a API recusaria.

**`/painel/clientes` — lista com busca.** `?busca=` na URL,
`clientes(busca)` na API, que compara dígito com dígito quando a busca
parece telefone. Colunas: nome, telefone e último agendamento. "+ Novo"
vai para `/painel/clientes/novo`.

**`/painel/clientes/novo` e `/painel/clientes/[id]`.** O cadastro pede
nome, telefone e email opcional; o detalhe mostra os mesmos campos
editáveis mais o histórico que `cliente(id)` devolve junto
(`ClienteComHistorico`). O telefone é escrito e exibido no formato
`(11) 99999-8888` — `packages/formato` já tem a formatação progressiva
para digitar e a `normalizarTelefone` que roda antes de enviar.

**`/painel/servicos`, `/painel/servicos/novo` e `/painel/servicos/[id]`.**
A lista vem de `servicos()`, que **inclui os inativos** de propósito: é
desta tela que o barbeiro reativa o que desativou, e um serviço
inativo que sumisse da lista seria irrecuperável pela interface.
Inativo aparece marcado como tal.

**`/painel/servicos/[id]` acha o serviço na lista, porque não existe
`servico(id)`.** O `criarApiBarbeiro` tem `cliente(id)` e
`agendamento(id)`, mas não o irmão de serviço — a assimetria é fácil de
não notar e viraria um método inventado no plano. `servicos()` devolve
todos, inclusive inativos, então a lista basta.

O preço é `string` em todo o caminho,
nunca `number` — é `Decimal` no banco, e passar por float perderia
centavo. Desativar chama `desativarServico`, que é soft delete: some da
lista pública e o histórico de quem já foi atendido sobrevive.

**`/painel/configuracoes` — três blocos numa tela.** Dados da barbearia
(`atualizarMinhaBarbearia`), horários da semana (`horarios()` e
`salvarHorarios`) e perfil do barbeiro (`atualizarMeuPerfil`). O bloco
de horários manda **a semana inteira** num `PUT`: dia ausente do corpo
vira fechado na API, de propósito, porque "sem linha" e "fechado" são
estados diferentes para o cálculo de disponibilidade. A tela edita os
sete dias juntos e envia os sete, sempre.

## O passado, no painel

O `garantirFuturo` continua não existindo na API, e
`apps/api/src/routers/disponibilidade.ts:178` continua dizendo que quem
desabilita o passado é a tela. O painel é agora a segunda tela sobre
essa rota desguardada.

**Mas a natureza da obrigação é outra aqui.** No sub-projeto B era
requisito de correção: um cliente que remarcasse para o passado
trancava a própria conta, porque o `garantirAlteravel` recusa depois
exatamente o agendamento que ele acabou de criar. No painel isso não
acontece — `garantirAlteravel` é chamado só em
`apps/api/src/routers/clientes-me.ts`, nunca no escopo do barbeiro. O
barbeiro altera agendamento em qualquer data e qualquer status, então
um registro com data passada é sempre recuperável por quem o criou.

Duas regras, então, e são de produto, não de correção:

1. **Na agenda, faixa de hoje que já passou não é `livre +`.** Renderiza
   como passada, sem o atalho de criar. Oferecer 09:00 às 15h é ruído,
   não recurso.
2. **Data no passado entra só por caminho deliberado.** O calendário da
   tela de novo agendamento não oferece dia passado, e uma `?data=`
   passada editada à mão não vira agendamento por acidente — o
   formulário avisa e exige confirmação explícita. Registrar
   retroativamente um atendimento que acabou de acontecer é legítimo;
   fazer isso sem perceber, não.

O sub-projeto D herda as duas regras e o motivo delas, em vez de
redescobrir a diferença entre os dois escopos.

## Tema claro e escuro

Hoje `apps/web/app/tokens-css.ts` define o escuro só dentro de
`@media (prefers-color-scheme: dark)` no `:root`, e nenhum seletor lê
`[data-theme]`. **Consequência que ninguém viu até agora: o
`data-theme="light"` que `(publico)/layout.tsx` já põe não faz nada, e
o fluxo do cliente fica escuro num celular no modo escuro** — o oposto
do que a spec do sub-projeto B decidiu, e do que o design system
desenha. Este sub-projeto conserta isso pelo mesmo caminho que traz a
troca manual.

O `tokens-css.ts` passa a ter três blocos:

```
:root                                          { claro }
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"])              { escuro }
}
[data-theme="dark"]                            { escuro }
```

Os três, e não dois. Sem a guarda `:not([data-theme="light"])`, um
barbeiro que escolheu claro continua escurecendo num sistema escuro,
porque o `@media` venceria. Sem `[data-theme="dark"]`, a escolha por
escuro não faz nada num sistema claro.

**O atributo vai no `<html>`, e nos dois grupos.** É o detalhe que faz o
conserto do `(publico)` funcionar de verdade: hoje o
`data-theme="light"` está numa `<div>` dentro do layout, e nenhuma
custom property que ela redeclare chega ao `body` — que é quem pinta o
fundo da página, lendo `var(--cor-paper)` do `:root`. Um painel escuro
sobre um `body` claro, ou uma página pública clara com faixa escura em
volta, seriam o resultado.

Então quem escreve o atributo é um script inline no `<head>` do layout
raiz, antes da primeira pintura, decidindo pelo caminho da URL:

- `/painel...` → lê `localStorage`; sem valor gravado, resolve pelo
  `prefers-color-scheme` e grava.
- qualquer outra rota → `light`, fixo.

Ler `location.pathname` no script é o que evita o pisca, e é a única
informação de rota disponível antes de o React montar. O botão do
painel troca o mesmo atributo e regrava a chave; navegar entre os dois
grupos reavalia na montagem do layout de cada um, porque navegação do
lado do cliente não roda o script de novo.

A `<div data-theme="light">` de `(publico)/layout.tsx` **sai**. Com o
atributo no `<html>`, ela não é só inerte — é um segundo mecanismo
aparente para a mesma coisa, e quem ler depois vai achar que funciona.

## Os números do dashboard

Os três números de `docs/design-system.html` — agendamentos hoje,
ocupação e faturamento — saem todos do que a API já devolve, sem rota
nova:

- **Contagem:** os agendamentos do dia.
- **Ocupação:** soma de `duracaoNoMomento` dividida pelos minutos entre
  `horaAbertura` e `horaFechamento` do dia na semana. Dia fechado não
  mostra ocupação; mostrar 0% ou dividir por zero seriam os dois
  errados.
- **Previsto:** soma de `precoNoMomento`. `precoNoMomento` e não o preço
  de hoje, porque é o que foi combinado com aquele cliente naquele dia.

**Os três contam `pendente`, `confirmado` e `concluido`, e ignoram
`cancelado` e `no_show`.** A alternativa de contar dinheiro só do
`concluido` foi recusada: o número ficaria zerado o dia inteiro até o
barbeiro começar a marcar conclusões, e ele só marca se o número servir
para alguma coisa. A legenda diz "previsto hoje", não "faturamento" —
o número é promessa, não caixa.

## Componentes

Os nove que existem são reusados onde servem: `Aviso`, `Botao`,
`Calendario`, `Campo`, `Cartao`, `Chip`, `ItemDeServico`,
`ListaDeHorarios` e `Resumo`. O painel acrescenta o que o design system
desenha e o fluxo do cliente não tinha:

- **`Tabela`** — clientes e serviços, com cabeçalho e linha clicável.
- **`GradeDeAgenda`** — a faixa de sete dias mais os slots do dia.
- **`Estatistica`** — o bloco de número e legenda do dashboard.
- **`NavegacaoDoPainel`** — a barra superior com nome da barbearia,
  links e o botão de tema.

CSS Modules, um arquivo por componente, tokens por `var(--*)`, como já
é a regra do repositório. Nada de CSS-in-JS.

## Testes

Vitest e Testing Library contra `criarApiClientFalso`, um arquivo por
tela, como no sub-projeto B. As três lições dele valem aqui e são
requisito, não estilo:

- **`agora` entra por parâmetro** em toda tela que olhe relógio — a
  agenda, o dashboard e a tela de novo agendamento — e todo teste com
  data fixa passa o instante. Teste que compara data fixa com o relógio
  real passa hoje e falha sozinho depois; já aconteceu uma vez.
- **`vi.fn(async (...) => …)` declara os parâmetros**, senão
  `mock.calls` vira tupla vazia e a asserção quebra no type-check com o
  teste verde.
- **Arquivo único roda com `pnpm --filter X exec vitest run <caminho>`**;
  o `--` do pnpm não chega ao vitest.

**O dublê precisa de dois reparos**, e eles são escopo desta fase:

1. **`clientes()` no falso ignora a busca** — a assinatura não recebe
   parâmetro nenhum, então a tela de clientes não teria como testar
   filtro. Ganha o filtro por nome e por telefone comparando dígitos,
   como a API faz no SQL.
2. **`signup()` no falso ignora o que recebe** e devolve sempre a mesma
   barbearia. A tela de criação precisa que o slug e o nome enviados
   apareçam na sessão devolvida.

Os dois são a divergência que a spec da fundação já previu ao registrar
que o falso pode se afastar da API real sem teste de contrato.

## Fora de escopo

- As 10 telas do app do barbeiro no Expo, e o setup de teste de React
  Native — sub-projeto D.
- Múltiplos barbeiros por barbearia. O painel assume um, como o resto
  do produto: o `barbeiroId` do novo agendamento é sempre o do perfil
  logado.
- Remarcar pelo painel. A API não tem a rota no escopo do barbeiro, e
  criá-la é mudança de API, não de tela.
- Relatórios, faturamento por período, exportação. O dashboard mostra o
  dia e nada além.
- Fechar as dívidas da API do roadmap, incluindo o `garantirFuturo` e o
  409 do signup.
- Cookie `httpOnly` no lugar do `localStorage` — dívida registrada na
  fundação, que fecha junto do passo 5.
- CI, deploy e domínio — passos 5 e 6.

## Dívidas que esta fase cria

- **O slug fica em `localStorage` ao lado do token, gravado uma vez no
  login, e não existe jeito de trocá-lo.** É lido pela tela de novo
  agendamento para chamar a disponibilidade. Uma versão anterior desta
  dívida descrevia uma aba antiga sobrevivendo com o slug velho depois
  de uma troca em Configurações — isso não pode acontecer:
  `PATCH /barbearias/me` exclui `slug` de propósito
  (`apps/api/src/routers/barbearias.ts`), e a tela de Configurações não
  tem campo pra ele. A dívida real é essa ausência — um barbeiro que
  erra o slug no cadastro, ou quer mudar o nome do salão no link, fica
  preso nele. Fecha com uma rota de troca de slug — mudança de API — e
  o campo correspondente em Configurações.
- **O painel lê a própria barbearia pela rota pública.** A API tem
  `PATCH /barbearias/me` e nenhum `GET`: a única leitura dos dados da
  barbearia é `GET /barbearias/:slug`, a mesma que o cliente usa. Serve,
  porque o painel já tem o slug, mas quer dizer que a tela de
  configurações depende de uma rota pública para exibir o que ela
  própria escreve. Fecha com um `GET /barbearias/me`, que é mudança de
  API.
- **O prefixo `/painel` protege as rotas de hoje, não as de amanhã.** A
  API continua sem lista de slugs reservados; qualquer rota nova na
  raiz do `apps/web` volta a criar a colisão. A proteção de verdade é
  um `reservados` na validação do slug, e fica registrada aqui.

## Critérios de conclusão

1. `pnpm test` na raiz passa, com uma suíte de tela por rota nova e os
   dois reparos do dublê cobertos.
2. `pnpm type-check` e `pnpm build` limpos.
3. Um barbeiro cria a barbearia em `/painel/entrar`, cadastra serviço e
   horário de funcionamento, e o link `/<slug>` do fluxo do cliente
   funciona de ponta a ponta contra a API real — é a prova de que os
   sub-projetos B e C se encontram.
4. O tema escuro do painel troca pelo botão e sobrevive ao
   recarregamento, sem piscar; e o fluxo do cliente continua claro num
   sistema em modo escuro, o que hoje não acontece.
5. `/primitivos` é removida, fechando o critério 4 da spec da fundação,
   que a previa saindo junto com a chegada do painel.
6. `docs/screens.md` e `docs/roadmap.md` registram as doze rotas e o
   motivo da divergência, como o sub-projeto B fez com a oitava tela.
