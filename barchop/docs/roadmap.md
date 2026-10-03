# Roteiro

Desde 2026-10-02 o BarChop é um SaaS para barbearias, construído em
ondas (ADR-0001, em `docs/adr/`). A GR Barber é o primeiro cliente e o
piloto, não o produto. O que cada onda entrega, as métricas de sucesso e
o estado de cada uma moram no PRD, `.claude/prds/barchop-saas.prd.md`;
cada onda em andamento tem plano próprio em `.claude/plans/`, feito com
`ecc:plan` (ADR-0008). As telas de cada onda estão em `docs/screens.md`.

| Onda | Resultado | Estado |
|---|---|---|
| 0 — Casa arrumada | Recuperação de senha do dono, trocar senha derruba sessões, slugs reservados e trocáveis, nada agendado no passado, docs do SaaS | feita, na main (PR #13) — plano em `.claude/plans/onda-0-casa-arrumada.plan.md`, revisão em `.claude/reviews/onda-0-review.md` |
| 1 — Agenda que funciona | Equipe com papéis e jornada por profissional, cliente escolhe o profissional, página pública rica no subdomínio, lembrete com confirmar/cancelar, cadastro self-service com onboarding, painel do dia, deploy na OCI e piloto com a GR Barber | em andamento na branch `onda-1` — plano em `.claude/plans/onda-1-agenda-que-funciona.plan.md` |
| 1s — Site de marketing | Landing, preços, plano grátis, termos e privacidade | pendente, em paralelo à 1 |
| 2 — Dinheiro | Caixa do dia, comissões, relatórios, cobrança da assinatura do BarChop | pendente |
| 3 — Retenção do cliente final | Pagamento e sinal online, pacotes, clube de assinatura, fidelidade, lista de espera, avaliações | pendente |
| 4 — Crescimento | Indicação, loja, múltiplas unidades, campanhas, login social | pendente |
| 5 — Diferenciais | IA no WhatsApp, NFS-e, domínio próprio, app do profissional | pendente |

Nenhuma onda nova abre antes de o piloto rodar a Onda 1.

**Verificação da Meta em standby (decisão de 2026-10-03).** Ela exige
CNPJ e leva semanas; até sair, a Onda 1 não depende do WhatsApp: o
lembrete automático e os códigos do cliente saem por e-mail, e o painel
oferece lembrar pelo WhatsApp à mão (`wa.me`). O canal da Cloud API
(ADR-0004) entra quando a verificação andar.

## Histórico — até 2026-10-02

O roteiro antigo, de quando o BarChop era a agenda de uma barbearia
só. Os passos 1 a 3 ficam como registro; os passos 4 a 7 foram
absorvidos pelas ondas (ver o fim desta seção).

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
     `@barchop/types`, tokens de espaço/borda/texto, Clash Grotesk
     self-hosted, Vitest + Testing Library no `apps/web`, os primitivos
     e a sessão. A suíte foi de 305 pra 370 testes.
   - **B — fluxo do cliente na web: pronto.** PR #8, merge `8b01e6f`,
     em 2026-09-05. Oito telas sob `/[slug]` — perfil, os quatro passos
     de agendar, confirmação, entrar e minha conta. A suíte foi de 370
     pra 463 testes. O mapa previa sete: `/[slug]/entrar` é a oitava, e
     existe porque "Meus agendamentos" exige token e nenhuma tela do
     mapa fazia login. Ela cobre também o primeiro acesso, sem o qual
     ninguém jamais teria senha.
   - **C — painel web do barbeiro: pronto.** PR #10, merge `9cb7760`,
     em 2026-09-09. Doze rotas sob
     `/painel`, não seis: quatro são telas que o mapa deu ao app do
     barbeiro pra mesma função (detalhe e criação de agendamento,
     cadastro de cliente, cadastro de serviço), e a décima segunda —
     criar barbearia — o mapa não tem em lugar nenhum, porque o
     primeiro acesso estava na tela de login do sub-projeto D e o
     painel chegou primeiro. Fecha também o quarto critério da spec da
     fundação: a vitrine `/primitivos` sai, substituída pelas telas de
     verdade. A suíte foi de 463 pra 571 testes.
   - **Depois do C — acabamento das telas web, de 2026-09-10 a
     2026-09-28.** Não é sub-projeto: nenhuma tela nova do mapa, só as
     que já existiam ficando de pé de verdade. Fora os PRs #11 e #12,
     tudo foi direto na `main`, sem PR.
     - *Casca do painel* (PR #11, merge `033994a`, 2026-09-10): o
       painel ganha moldura de dashboard, e saem o aviso de hidratação
       do `<html>` e a `busca` vazia que o `api-client` mandava na
       query. Em 2026-09-13 a barra lateral passa a recolher.
     - *Agenda como calendário* (2026-09-12, spec e plano
       `2026-09-12-agenda-calendario`): vistas de dia, semana e mês, com
       eixo de tempo e eventos de altura proporcional à duração, e
       sobreposições em faixas lado a lado. Cobre o "visão
       semanal/mensal" que o mapa pedia e o C tinha adiado, e conserta a
       grade antiga, que só olhava `horaInicio`: um corte de 09:00–10:00
       deixava 09:15, 09:30 e 09:45 como "livre", com botão pra agendar
       por cima.
     - *Novo agendamento* (2026-09-13 a 16): passos que abrem um por
       vez, com resumo do que já foi escolhido; o cliente chega
       pré-preenchido pela URL quando a tela é aberta a partir dele.
     - *Clientes e serviços* (2026-09-16 a 20): a lista de clientes
       ganha busca com atalho de teclado, filtro por frequência de
       visita, linha clicável, cabeçalho fixo e paginação por cursor —
       esta última muda a API: `GET /clientes` passa a devolver o total
       e o próximo cursor. O cadastro de cliente valida nome, telefone e
       email como a API valida, e telefone repetido aponta pro cadastro
       que já existe. Em serviços, os validadores espelham o schema da
       rota (duração 5..480 e múltipla de 5), a lista não pisca "nenhum
       serviço" enquanto carrega, e serviço inativo aparece atenuado.
     - *Login* (2026-09-26 e 27): rate limiting na API
       (`apps/api/src/lib/limites.ts`) pro login e os dois signups; os
       dois logins viram `<form>` (Enter envia); o `Campo` anuncia o
       erro com `role="alert"` e ganha mostrar/ocultar senha; o login do
       painel ganha acabamento; e os dois logins respondem o mesmo
       `credenciais_invalidas` pra senha errada — o login do cliente
       respondia `nao_autenticado`, o código de token vencido. Fechou a
       dívida dos dois códigos antes de o app no Expo consumir o
       contrato.
     - *Fluxo do cliente* (2026-09-26 e 27): o nome da barbearia
       aparece em todas as telas públicas, numa barra no layout; a
       coluna de 480px centra no desktop, onde antes encostava na
       esquerda; o passo de dados vira "quem é você" — quem está logado
       vê o próprio cadastro num cartão, e quem não está escolhe entre
       seguir sem conta ou entrar e voltar pro mesmo passo; e a home da
       barbearia mostra apresentação, serviços com preço e horário de
       funcionamento. A apresentação é a coluna nova `barbearia.sobre`
       (texto puro, até 1000 caracteres), editada em Configurações. A
       migration dela foi escrita à mão: `prisma migrate dev` propõe
       derrubar `agendamento.periodo`, a coluna gerada que sustenta a
       constraint `EXCLUDE` e que o schema do Prisma não enxerga. Toda
       migration daqui pra frente segue esse caminho, aplicada com
       `migrate deploy`.
     - *Auditoria do fluxo do cliente* (PR #12, merge `361e233`,
       2026-09-28, mergeado em 2026-10-02): auditoria de UI/UX feita
       no app rodando a 390px, e o fluxo de agendar cai de seis telas
       pra três — serviços, quando, confirmar. Dia e horário viram uma
       tela só, com os horários numa grade reta separada em manhã,
       tarde e noite; `/agendar/horario` sobrevive como redirect. A
       identificação entra no formulário da confirmação, com "Já tenho
       conta? Entrar" como link: some a tela "quem é você" de
       2026-09-27, e `/agendar/dados` também vira redirect. A home diz
       se a barbearia está aberta agora e até que horas, mostra o dia
       fechado como "Fechado" em vez de omiti-lo, e cada serviço leva
       ao passo de serviços já com ele marcado. A tela de sucesso mostra
       serviços, total e endereço, e oferece o `.ics` pro calendário.
       Hoje sem horário restante deixa de ser beco sem saída, e falha ao
       carregar os horários do dia avisa e deixa tentar de novo. O
       título da aba e a prévia do link no WhatsApp passam a ter o nome
       da barbearia, via `generateMetadata` — o que faz o servidor do
       Next ler `NEXT_PUBLIC_API_URL` também, não só o navegador
       (conferir no deploy: se ela só for alcançável pelo navegador, o
       título cai em "BarChop" em silêncio). Por último, as quatro
       telas do fluxo ganham duas colunas a partir de 900px; entrar,
       minha conta e sucesso ficam numa coluna estreita centrada. Tudo
       testado contra o dublê do `api-client`; criar agendamento,
       remarcar e o cartão de quem está logado ainda não rodaram contra
       a API real.

     A suíte da web está em 434 testes. A da API não foi recontada:
     ela exige o Postgres de teste do `apps/api/.env.test`, que não
     estava configurado nesta máquina.
   - **Acesso à conta do cliente — Fases 1 a 3 prontas, Fase 4
     pendente.** Plano de 2026-10-01, feito com TDD, direto na `main`.
     Saiu de três buracos: nenhuma tela levava à conta, ninguém
     recuperava senha, e quem definisse a senha primeiro assumia o
     cadastro de um telefone.
     - *Fase 1 — links* (`44c2efe`): "Entrar" ou "Meus agendamentos"
       (`fluxo/LinkDaConta.tsx`, conforme a sessão) na barra da
       barbearia e na home, e "Ver meus agendamentos" na confirmação.
       `gravar`/`limpar` da sessão disparam `barchop:sessao`, e o
       `useTemSessaoDoCliente` acompanha sem remontar a barra.
     - *Fase 2 — códigos* (`757dabe`): tabela `codigo_verificacao`
       (HMAC do código, nunca o código), `lib/codigos.ts` (6 dígitos, 10
       minutos, uso único, 5 tentativas, à prova de corrida) e
       `lib/canal.ts` (memória nos testes, log em desenvolvimento,
       recusa de subir em produção sem provedor).
     - *Fase 3 — senha do cliente com código* (`19d6ab0`, `77c7d83`):
       sai o signup do cliente; `POST .../auth/cliente/codigo` e
       `.../senha` juntam primeiro acesso e esqueci a senha. O pedido
       responde igual tendo ou não conta, e o nome é obrigatório
       sempre, pra nenhuma diferença de resposta dizer quem tem
       cadastro. A tela `/[slug]/entrar` ganha o caminho do código.
     - *Fase 4 — pendente*: derrubar as sessões abertas ao trocar a
       senha, e o esqueci a senha do barbeiro por e-mail. Ver as
       dívidas abaixo.

     Suítes ao fim da Fase 3: web 415, api-client 50, API 339 — a da
     API agora roda nesta máquina, com o Postgres de teste
     (`barchop_test`) e o `apps/api/.env.test` configurados.
   - **D — app do barbeiro no Expo (10 telas)** — foi para a Onda 5,
     como app do profissional: o painel web já cobre a mesma gestão.

   Duas decisões do sub-projeto A que mudam o resto do roteiro: o
   painel e o link público ficam no mesmo app Next, separados por route
   groups (ver passo 6), e **o app opcional do cliente saiu do MVP** —
   nenhuma tela foi cortada, as 7 do cliente viraram rotas web, porque
   o login do cliente é por barbearia e um app instalado não tem slug
   antes de receber um deep link.
Os passos 4 a 7 do roteiro antigo viraram parte da Onda 1:

- **Lembretes automáticos** — decidido: WhatsApp pela Cloud API oficial
  e e-mail pelo Resend (ADR-0004), disparados por uma fila pg-boss
  (ADR-0003). O push pelo Expo saiu junto com o app do barbeiro.
- **Infra na Oracle OCI** — continua: VM, Postgres, variáveis de
  ambiente, deploy da API e do app web, agora com certificado coringa.
- **Domínio `barchop.com.br`** — comprado; a dúvida "mesmo host ou
  subdomínios" foi decidida: cada barbearia em `<slug>.barchop.com.br`
  e o site em `www` (ADR-0002).
- **Piloto com o barbeiro real** — é o fechamento da Onda 1.

## Dívidas conhecidas

A Onda 0 fecha, pelo plano, a recuperação de senha do barbeiro, as
sessões que sobrevivem à troca de senha, as datas no passado (nas duas
rotas e na disponibilidade), o `GET /barbearias/me` e a troca de slug.
Cada uma sai desta lista quando o commit que a fecha entrar. Já saíram:
o slug `painel` sombreado (`961d2f4`, lista de reservados no
`@barchop/formato`); o painel lendo a própria barbearia pela rota
pública e o slug sem troca (`GET /barbearias/me` e
`PATCH /barbearias/me/slug`, com o campo "Link da barbearia" em
Configurações). O link antigo para de responder na hora; o redirect
dele vem com o tenant por subdomínio (Onda 1). E as duas rotas que
criam ou movem um agendamento pelo lado do cliente recusam data
passada com 422 `horario_passado` (`garantirFuturo`); a criação manual
pelo barbeiro continua aceitando, porque registrar um walk-in depois do
fato é legítimo. Do lado da leitura, as duas rotas de disponibilidade
(dia e mês) passam pelo `descartarPassados`: dia passado sem vaga, hoje
só o que começa depois de agora. O `horaJaPassou` da tela do dia fica
como redundância inofensiva. Trocar a senha derruba as sessões abertas:
`senha_alterada_em` no cliente e no barbeiro, e o hook de
`plugins/auth.ts` recusa token com `iat` anterior a ela (comparado no
segundo, pra o token que a própria troca devolve seguir valendo). E o
barbeiro tem "Esqueci a senha": `POST /auth/codigo` (sempre 202, o
código é emitido com ou sem conta e só enviado se ela existe, sem
esperar o envio) e `POST /auth/senha` (código de uso único, sessão nova
no mesmo formato do login), com a tela de dois passos no
`/painel/entrar`. Como os códigos do cliente, os do barbeiro só saem
pelo log até o provedor de e-mail da Onda 1.

A revisão da Onda 0 (`.claude/reviews/onda-0-review.md`) deixou três
dívidas novas: o orçamento de pedido de código que um terceiro consegue
gastar, a sessão do cliente que cai quando o slug muda, e o monorepo
sem lint. Esta saiu na Onda 1: `pnpm lint` roda o ESLint da raiz, com a
config compartilhada em `packages/config/eslint.mjs`.

- **O orçamento de pedido de código é gastável por terceiros.** O
  limite de 3 pedidos por destino em 15 minutos (`codigoDoCliente` e
  `codigoDoBarbeiro` em `lib/limites.ts`) é por telefone ou e-mail, não
  por quem pede: alguém que conheça o número ou o e-mail de outra
  pessoa gasta o orçamento dela, e a recuperação legítima fica travada
  pela janela. Não vaza nada nem dá acesso — é um incômodo de 15
  minutos. Fecha com um desafio humano (captcha) a partir do segundo
  pedido, ou com a chave por destino + IP e um teto global por destino
  bem mais alto.
- **Trocar o slug derruba a sessão dos clientes no navegador.** O token
  do cliente fica em `sessao.cliente.<slug>` (`apps/web/src/sessao/
  armazenamento.ts`), e com o slug novo a página procura outra chave:
  quem estava logado precisa entrar de novo. Fecha junto do redirect do
  slug antigo, com o tenant por subdomínio (Onda 1) — o mais simples é
  a chave passar a ser o id da barbearia.
- **`POST /auth/signup` diz se um email já está cadastrado**, via o
  `409`. Quem quiser sondar a plataforma manda um slug livre e um email
  qualquer, e o código de resposta responde. O rate limiting que esta
  dívida esperava chegou (`apps/api/src/lib/limites.ts`): sondar em
  série custa, porque o signup de barbearia aceita 5 por hora por IP. O
  buraco em si continua aberto — cada tentativa, dentro do orçamento,
  ainda responde se aquele email existe. Fechar de verdade é verificação
  de email, que só faz sentido junto do canal de mensagem do passo 4.
- **O telefone do cliente não recebe código.** Desde a Onda 1 o canal
  real é o e-mail (`lib/canal-email.ts`, Resend, com
  `CANAL_DE_MENSAGEM=email`), e o cliente entra e recupera a senha por
  e-mail. Quem só tem telefone agenda sem conta. Pedir código pro
  telefone com o canal de e-mail responde 422 `destino_indisponivel`.
  Fecha com o canal do WhatsApp (ADR-0004), quando a verificação da Meta
  sair do standby.
- **O Novo agendamento do painel marca em quem está logado.** A tela
  manda `barbeiroId: perfil.id` (`NovoAgendamento.tsx`): a recepção
  marcaria na própria agenda, e ela nasce sem atender. Fecha no C3 do
  bloco C, quando a tela escolhe o profissional. Até lá, a GR Barber
  não tem recepção cadastrada.
- **Convite e reenvio não têm limite de envio.** `POST /equipe` e
  `POST /equipe/:id/convite` mandam e-mail sem contador: só o dono
  autenticado chama, mas um dono pode usar a rota pra mandar e-mail a
  qualquer endereço. Fecha com um contador por barbearia em
  `lib/limites.ts`, que exige registrar o `rateLimit` no escopo
  protegido.
- **Um profissional não fica em duas barbearias.** O e-mail do
  `barbeiro` é único na plataforma (é a chave do login), e convidar
  quem já tem conta responde 409 `email_em_uso`. Fecha separando a
  conta (pessoa) da associação (membro de barbearia).
- **`POST /auth/senha` não devolve o `papel`.** O login e o aceite do
  convite devolvem; o esqueci-a-senha do barbeiro ficou no formato
  antigo. O painel não depende disso (lê o papel no `GET /me`), mas o
  contrato fica desigual.
- **Os limites por IP viram limite global atrás de proxy reverso.** O
  `request.ip` do Fastify vem do socket, então quando a API subir atrás
  de proxy (passo 5, a VM da OCI) toda requisição chega com o endereço
  do proxy, e os contadores por IP de `lib/limites.ts` — o do login, o
  do signup do barbeiro e o do pedido de código do cliente — passam a
  somar o tráfego de todo mundo num
  orçamento só. Fecha com `trustProxy` no `Fastify()` do `app.ts`, e
  isso não pode ser ligado antes: sem proxy confiável na frente,
  `trustProxy` faz a API acreditar num `X-Forwarded-For` que qualquer um
  escreve, e daí o limite por IP deixa de limitar. Os limites por conta
  (email, telefone) não dependem do IP e continuam valendo nos dois
  casos.
