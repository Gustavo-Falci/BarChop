# Roteiro

O que falta pro GR Barber sair do papel, mais ou menos em ordem:

1. **Scaffolds do Expo e do Next.js — pronto.** `apps/mobile` e
   `apps/web` já têm o scaffold versionado (commit `6abe8a1`), com o
   `package.json` e o `metro.config.js` do monorepo preservados.
2. **Rotas da API — pronto.** A spec
   `docs/superpowers/specs/2026-08-30-api-crud-agendamentos-design.md`
   dividiu o trabalho em cinco fases, todas concluídas: fundação e
   autenticação (PR #1), cadastros do barbeiro (PR #2), criação de
   agendamento (PR #3) e disponibilidade (PR #4), mais o retry em
   deadlock do PR #5. Cada uma tem plano próprio em
   `docs/superpowers/plans/`. A autenticação foi
   fundida aqui dentro (era o passo 3 separado), porque quase toda rota
   de escrita precisa saber qual barbearia é a do chamador — sem isso
   as rotas nasceriam abertas ou receberiam `barbeariaId` no corpo, e
   seriam reescritas quando o JWT chegasse.

   A fase 6 (identidade do cliente) fechou as duas lacunas que
   sobraram: o `barbeiroId` que nenhuma rota pública devolvia, e a
   conta do cliente que a tela "Meus agendamentos" precisa. Spec em
   `docs/superpowers/specs/2026-09-04-api-identidade-cliente-design.md`.

   A superfície HTTP que as 23 telas consomem está completa; o que a
   spec deixou de fora continua fora (múltiplos barbeiros por
   barbearia, barbearias em fusos diferentes).
3. **Construir as telas reais** — as 23 telas já mapeadas
   (`docs/screens.md`), quebradas em quatro sub-projetos com spec e
   plano próprios. A decomposição e as decisões que a moldaram estão em
   `docs/superpowers/specs/2026-09-05-fundacao-das-telas-design.md`.

   - **A — fundação (0 telas): pronto.** PR #7, merge `4ea6f43`, em
     2026-09-05. É a camada que faltava entre a API e as telas:
     `packages/api-client` (com dublê em memória), `packages/formato`
     (telefone e email, que saíram da API), os DTOs de resposta em
     `@gr-barber/types`, tokens de espaço/borda/texto, Clash Grotesk
     self-hosted, Vitest + Testing Library no `apps/web`, os primitivos
     e a sessão. A suíte foi de 305 pra 370 testes.
   - **B — fluxo do cliente na web: pronto.** PR #8, merge `8b01e6f`,
     em 2026-09-05. Oito telas sob `/[slug]` — perfil, os quatro passos
     de agendar, confirmação, entrar e minha conta. A suíte foi de 370
     pra 463 testes. O mapa previa sete: `/[slug]/entrar` é a oitava, e
     existe porque "Meus agendamentos" exige token e nenhuma tela do
     mapa fazia login. Ela cobre também o primeiro acesso, sem o qual
     ninguém jamais teria senha.
   - **C — painel web do barbeiro: pronto.** PR *(pendente — ainda não
     aberto)*, merge *(pendente)*, em 2026-09-08. Doze rotas sob
     `/painel`, não seis: quatro são telas que o mapa deu ao app do
     barbeiro pra mesma função (detalhe e criação de agendamento,
     cadastro de cliente, cadastro de serviço), e a décima segunda —
     criar barbearia — o mapa não tem em lugar nenhum, porque o
     primeiro acesso estava na tela de login do sub-projeto D e o
     painel chegou primeiro. Fecha também o quarto critério da spec da
     fundação: a vitrine `/primitivos` sai, substituída pelas telas de
     verdade. A suíte foi de 463 pra 571 testes.
   - **D — app do barbeiro no Expo (10 telas)**.

   Duas decisões do sub-projeto A que mudam o resto do roteiro: o
   painel e o link público ficam no mesmo app Next, separados por route
   groups (ver passo 6), e **o app opcional do cliente saiu do MVP** —
   nenhuma tela foi cortada, as 7 do cliente viraram rotas web, porque
   o login do cliente é por barbearia e um app instalado não tem slug
   antes de receber um deep link.
4. **Lembretes automáticos** — decidir WhatsApp Business API vs
   push notification via Expo, e integrar o disparo ao confirmar
   um agendamento. Ainda não arquitetado.
5. **Infra na Oracle OCI** — provisionar a VM, subir o Postgres,
   configurar variáveis de ambiente, deploy do backend e do painel.
6. **Domínio `barchop.com.br` — comprado.** Falta apontar o DNS, e isso
   depende do passo 5: sem a VM da OCI de pé não existe endereço pra
   onde apontar. Continua de pé decidir se o painel do barbeiro e o
   link público do cliente ficam no mesmo host ou em subdomínios
   separados — o fluxo do cliente é um link que vai por WhatsApp, então
   o endereço que ele mostra importa. O que mudou é o custo: como os
   dois vivem no mesmo app Next, separados por route groups, essa
   escolha virou configuração de roteamento no deploy, não migração de
   código.
7. **Piloto com o barbeiro real** que validou o problema original,
   antes de pensar em abrir pra outras barbearias.

## Dívidas conhecidas

- **`POST /auth/signup` diz se um email já está cadastrado**, via o
  `409`. Quem quiser sondar a plataforma manda um slug livre e um email
  qualquer, e o código de resposta responde. O rate limiting que esta
  dívida esperava chegou (`apps/api/src/lib/limites.ts`): sondar em
  série custa, porque o signup de barbearia aceita 5 por hora por IP. O
  buraco em si continua aberto — cada tentativa, dentro do orçamento,
  ainda responde se aquele email existe. Fechar de verdade é verificação
  de email, que só faz sentido junto do canal de mensagem do passo 4.
- **Não existe recuperação de senha.** Quem esquecer a senha fica
  trancado do lado de fora, sem caminho nenhum no produto — vale pro
  barbeiro (`POST /auth/login`) e pro cliente. No piloto com um barbeiro
  isso se resolve por `psql`; no primeiro cliente de fora, não. É também
  a razão de os limites de `lib/limites.ts` serem janela que passa, e
  não bloqueio de conta: sem rota de recuperação, um bloqueio de verdade
  seria definitivo. O fechamento depende de canal de saída — email
  (provedor de envio que não está nas dependências) ou WhatsApp, junto
  do passo 4 — e é decisão de escopo, não item já na fila.
- **Os limites por IP viram limite global atrás de proxy reverso.** O
  `request.ip` do Fastify vem do socket, então quando a API subir atrás
  de proxy (passo 5, a VM da OCI) toda requisição chega com o endereço
  do proxy, e os contadores por IP de `lib/limites.ts` — o do login e os
  dos dois signups — passam a somar o tráfego de todo mundo num
  orçamento só. Fecha com `trustProxy` no `Fastify()` do `app.ts`, e
  isso não pode ser ligado antes: sem proxy confiável na frente,
  `trustProxy` faz a API acreditar num `X-Forwarded-For` que qualquer um
  escreve, e daí o limite por IP deixa de limitar. Os limites por conta
  (email, telefone) não dependem do IP e continuam valendo nos dois
  casos.
- **Quem definir a senha primeiro assume o cadastro de um telefone.**
  Os cadastros de `Cliente` são criados por outra pessoa — pelo upsert
  do agendamento público, ou pelo barbeiro no walk-in. Sem verificar
  posse do número, a API não distingue o dono do telefone de quem só o
  conhece, e quem chegar primeiro passa a ver o histórico daquela
  pessoa naquela barbearia. A mitigação é que definir senha só é
  permitido em cadastro que ainda não tem uma, e ela hoje vale de
  verdade: desde a normalização de telefone (`lib/telefone.ts`), o
  número é gravado num formato único — `(11) 99999-8888` — pelos quatro
  escritores e pelas buscas, então a mesma pessoa ocupa uma linha só e
  o `409` não se contorna reformatando o número. Fica de pé o buraco
  original, que só o OTP fecha: quem conhece o número de outra pessoa e
  chega antes dela ainda reivindica o cadastro. Fecha junto com o canal
  de mensagem do passo 4, que traz o código de verificação.
  Sobra um detalhe menor: dois signups concorrentes no mesmo cadastro
  sem senha passam os dois — ambos leem `senhaHash` nulo, ambos gravam,
  o último grava por cima, e os dois chamadores saem com token válido.
  Fechar isso é um `updateMany` com predicado de status, do mesmo
  formato do que o remarcar já usa.
- **O `409` do signup de cliente diz que aquele telefone já tem conta**,
  exatamente como o do barbeiro diz do email. Mesma dívida, mesmo
  fechamento.
- **Nenhuma das duas rotas que criam ou movem um agendamento recusa uma
  data no passado.** `POST /barbearias/:slug/agendamentos` e
  `POST /clientes/me/agendamentos/:id/remarcar` passam pelo mesmo
  `horariosLivres`, que não tem noção de "agora" — só recebe a janela
  de funcionamento e os horários já ocupados. O único relógio do fluxo
  é o `agoraNaBarbearia`, usado pelo `garantirAlteravel` em
  `lib/agendamento-alteravel.ts`, e essa guarda olha pro agendamento
  de origem, o que está sendo alterado, nunca pro destino da mudança.
  Na prática, um cliente que remarca pra uma data passada tranca a
  própria conta: o agendamento resultante é exatamente o que o
  `garantirAlteravel` recusa cancelar ou remarcar depois, e só o
  barbeiro consegue desfazer. O fechamento tem a forma de um
  `garantirFuturo(data, horaInicio)` ao lado do `garantirAlteravel`,
  chamado pelas rotas que criam ou movem um agendamento — isso não
  quer dizer que já está na fila pra ser feito. Empurrar a checagem
  pra dentro do `criarAgendamento` mudaria comportamento da fase 4,
  que já tem testes escritos sem essa regra.
- **Uma barbearia com o slug `painel` perde o próprio link público.** O
  painel vive sob o prefixo `/painel`, e esse é um segmento estático —
  que vence a rota dinâmica `[slug]` do fluxo do cliente. A validação
  de slug na API é `^[a-z0-9-]{3,80}$`, sem lista de reservados, então
  `painel` é aceito no cadastro e fica inalcançável depois, sem erro em
  lugar nenhum. O prefixo reduziu o problema de pouco mais de uma
  dezena de slugs sombreados (um por rota que o painel teria criado na
  raiz) pra exatamente um, mas não o eliminou. Fechar de verdade é uma
  lista de reservados na validação de slug — mudança de API, fora do
  escopo deste sub-projeto.
- **O painel lê a própria barbearia pela rota pública.** A API tem
  `PATCH /barbearias/me` e nenhum `GET`: a única leitura dos dados da
  barbearia é `GET /barbearias/:slug`, a mesma rota que a tela de
  agendamento do cliente usa. A tela de Configurações do painel depende
  então de uma rota pública pra exibir o que ela própria escreve. Fecha
  com um `GET /barbearias/me`.
- **O slug da barbearia é gravado uma vez, no login, e não existe jeito
  de trocá-lo.** `GET /me` devolve `barbeariaId` e nenhum slug, e a
  disponibilidade é rota pública endereçada por slug — por isso o
  painel grava o slug no `localStorage`, ao lado do token, no momento
  do login. Uma versão anterior desta dívida descrevia uma aba antiga
  sobrevivendo com o slug velho depois de uma troca em Configurações —
  isso não pode acontecer: `PATCH /barbearias/me` exclui `slug` de
  propósito (`apps/api/src/routers/barbearias.ts`), e a tela de
  Configurações não tem campo pra ele. A dívida real é essa ausência —
  um barbeiro que erra o slug no cadastro, ou quer mudar o nome do
  salão no link, fica preso nele. Fecha com uma rota de troca de slug
  — mudança de API — e o campo correspondente em Configurações.
