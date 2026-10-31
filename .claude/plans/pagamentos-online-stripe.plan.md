# Plan: Pagamentos online — Stripe

**Source PRD**: `.claude/prds/pagamentos-online-stripe-infinitepay.prd.md`
**Selected Milestone**: 1 — Stripe em Pagamentos online
**Complexity**: Large

Diferenças do plano, combinadas no caminho:
- **PR 1:**
  - `nomeDoProvedor` devolve as formas da frase (`o`, `do`, `inicioDaChave`, `teste`, `real`), não só o nome: as mensagens pedem "o Asaas"/"a Stripe", "do Asaas"/"da Stripe", o começo da chave e como o provedor chama os modos. Mais `comMaiuscula` ("O Asaas estornou…") e `provedorGravado` (o `provedor` da conexão, texto no banco, conferido contra `PROVEDORES`).
  - A frase do CPF no assinar e o sino "Cancelamento não feito" leem o provedor da conexão (`provedorGravado`), pra não mudar a ordem do assinar (CPF antes do `daConexao`). A troca de ordem vem no PR 5, com o `pedeCpf`.
  - `pedeCpf` só declarado (Asaas: `true`), sem uso até o PR 5.
  - Dois logs mudaram de texto: o do assinar com a chave recusada vira "recusada pelo provedor" com o campo `provedor`. Os textos que a pessoa vê são os de antes.
  - `PROVEDORES` segue só `["asaas"]` até o PR 3: o PUT do conectar tira dele a lista aceita. (Mudou no PR 2: ver abaixo.)
- **PR 2:**
  - `PROVEDORES` já tem `stripe` (o tipo e o `nomeDoProvedor` pedem); o PUT do conectar ficou com `enum: ["asaas"]` fixo, e o `daConexao` recusa a Stripe até o PR 3 gravar o segredo do webhook.
  - Interface: `NovaAssinatura.planoId` (o produto `barchop_plano_<planoId>`; o Asaas ignora); `registrarWebhook` devolve `{ id, segredo }` (Asaas: `segredo: null`); `lerEvento(corpo, assinatura?)` (a Stripe pede o corpo cru e o `stripe-signature`; sem segredo ou sem assinatura, recusa).
  - Gravado na API `2026-09-30.endive` (31/10, `respostas-da-stripe/`). Nela a charge não diz a fatura: o `charge.refunded` vira `cobrancaId = payment_intent`, e o `lerCobranca("pi_…")` acha a fatura por `invoice_payments`. A fatura paga não diz se foi estornada: o conector relê o pagamento (`latest_charge.amount_refunded > 0` = estornada, parcial também). A expansão direta passa do limite de 4 níveis da Stripe.
  - A assinatura com dias grátis nasce com uma fatura de R$ 0 já paga, e o `invoice.paid` dela chega: o conector devolve fatura de R$ 0 como `pendente`, pra não entrar no Caixa nem avisar "Nova assinatura". Sem fatura aberta, o assinar com dias grátis devolve `linkDaFatura: null` (o Asaas devolve o link da cobrança do fim do teste). O `trial_end` é 00:00 do primeiro vencimento no fuso da barbearia.
  - Vencida = aberta com `attempt_count > 0`, ou `uncollectible`; `void` = removida. Assinatura: `canceled` → inativa, `incomplete_expired` → expirada (é o que o cancelar da incompleta dá), o resto segue ativa. O vencimento é o início do período da linha da fatura.
  - Cancelar a já cancelada dá 404 na Stripe: aceito. O `conferirChave` lê clientes e webhooks.
  - As permissões que o conector usa na chave restrita (pro guia do PR 6 e o teste da tarefa 9): Customers (escrita), Products (escrita), Prices (escrita: o `price_data` cria preço), Subscriptions (escrita), Invoices (leitura), Invoice Payments (leitura), PaymentIntents (leitura), Webhook Endpoints (escrita). O `conferirChave` só confere clientes e webhooks: uma chave sem PaymentIntents conecta e falha com 403 (`chave_invalida`) no webhook da fatura paga. Decidir no PR 4: recusar no conectar ou tratar `chave_invalida` no webhook (sem virar 500, que a Stripe repete até desligar o endpoint).
  - O produto arquivado no painel da Stripe por quem vende é reativado no assinar (arquivado não assina).
  - O `recusado` da Stripe sai com frase nossa ("a Stripe recusou o pedido"): a mensagem dela vem em inglês.
  - A gravação usou a `STRIPE_SECRET_KEY` de teste do `apps/api/.env` (a conta de teste do BarChop). Ficou nela 1 produto arquivado (`barchop_plano_…`); cliente, assinaturas e webhook apagados.
  - Pro PR 4: a Stripe ancora a renovação no dia da assinatura (31/01 → 28/02 → 31/03); conferir se o `fimDoCiclo` do BarChop bate.
- **PR 3:**
  - Migração `20261101120000_stripe_nos_planos`: a coluna `segredo_do_webhook_cifrado` (anulável), `stripe` nos CHECKs de provedor da conexão **e do `evento_do_provedor`** (sem este, o dedupe do PR 4 falharia), e o índice "uma por membro e provedor" virou "uma por membro" (`conexao_de_pagamento_barbeiro_key`): com dois provedores, dois conectar ao mesmo tempo (um em cada) deixariam duas contas ligadas, contra a decisão 8. `PROVEDORES_DE_PAGAMENTO` do formato com `stripe`.
  - Trocar de provedor com a conta ligada é `outra_conta` antes de falar com o provedor ("a conta conectada é do Asaas: desconecte antes de conectar a da Stripe").
  - Se a Stripe não devolve o segredo ao criar o webhook, o conector apaga o webhook e falha (`indisponivel`): conexão sem segredo recusaria todo evento.
  - Desconectar apaga o segredo junto com a chave. O token e o hash do webhook seguem gravados na Stripe também (a coluna é NOT NULL), sem uso.
  - O provedor de memória serve os dois (modo pelo prefixo de cada um, `pedeCpf`, segredo `whsec_memoria_N` no webhook da Stripe); os eventos assinados na memória ficam pro PR 4.
  - O assinar com a Stripe ainda pede o CPF até o PR 5. O api-client segue mandando `provedor: "asaas"` e a tela só mostra o Asaas até o PR 6.
  - **Deploy:** a rota `/webhooks/stripe/<conexão>` só chega no PR 4. Uma conta da Stripe conectada (pela API, já que a tela não oferece) antes dele faria a Stripe receber 404, tentar de novo e desligar o endpoint. Subir o PR 3 junto com o 4 (ou não conectar Stripe antes). Ordem: migração antes da API.
- **PR 4:**
  - Decisão da chave sem PaymentIntents (PR 2): recusada no conectar. O `conferirChave` lê também assinaturas, faturas, pagamentos de fatura e PaymentIntents (`limit=1`, só leitura; gravado na conta de teste: 200 nas quatro). A restrita sem uma delas dá 403 `chave_invalida` no PUT, em vez de passar e falhar no webhook. As permissões de escrita (cliente, produto, preço, assinatura) só aparecem ao assinar (PR 5). A chave revogada ou com permissão tirada **depois** de conectar ainda dá 500 no webhook: a Stripe repete, e volta a valer quando a chave é trocada (o PUT da mesma conta mantém o webhook). Se a troca não vier, a Stripe acaba desligando o endpoint; reconectar recria.
  - A recepção comum (dedupe, releitura fora da transação, evento gravado na transação, P2002 da entrega dupla) saiu da rota do Asaas para `receberEvento` em `lib/webhook-dos-planos.ts`; as duas rotas só acham a conexão, conferem a origem e leem o evento. O log de "não acha mais" fala o nome do provedor.
  - A rota do Asaas passou a filtrar `provedor: "asaas"` na conexão (e a nova, `provedor: "stripe"`): o token de uma conta da Stripe não serve no endereço do Asaas, e vice-versa. Antes não importava, só havia um provedor.
  - Rota nova em `routers/webhook-stripe-planos.ts`, num escopo próprio com o corpo cru (como `/stripe/webhook` da cobrança). Assinatura inválida ou ausente: 400 sem gravar; conexão desconhecida, desligada, de outro modo ou do Asaas: 200 e log.
  - A leitura do evento assinado virou `lerEventoDaStripe(corpo, assinatura, segredo)` exportada do conector, para o provedor de memória conferir a assinatura como o de verdade (os testes assinam com `Stripe.webhooks.generateTestHeaderString`).
- **PR 5:**
  - `PEDE_CPF` (`{ asaas: true, stripe: false }`) em `provedores/tipos.ts`, e o `pedeCpf` de cada conector lê dele: a vitrine precisa saber sem decifrar a chave de quem vende.
  - O assinar faz o `daConexao` antes do CPF (a troca de ordem prevista no PR 1). Na Stripe, o CPF mandado é ignorado (nem conferido, nem guardado, nem enviado) e o do cadastro não vai para ela: só o necessário sai do BarChop (os Termos do PR 7 dizem "sem CPF"). O cadastro só é regravado quando o CPF muda.
  - `NovoCliente.cpfCnpj` passou a `string | null`; o conector do Asaas só manda o campo com valor.
  - A vitrine devolve `pagamento: { provedor, pedeCpf } | null` (null sem o online agora), em vez de `{ provedor, pedeCpf }` sempre. O `falso.ts` do api-client faz o mesmo. A web ainda não lê: segue pedindo o CPF até o PR 6, e o CPF que ela mandar para um plano da Stripe é ignorado.
  - O cancelar (painel e cliente) já falava pelo provedor desde o PR 1: sem mudança no código, só os testes com a Stripe.
  - O provedor de memória fala o nome do provedor nos erros e dá o link de fatura de cada um (`invoice.stripe.com` na Stripe).
- **PR 6:**
  - Correção do PR 5: a página **não** pedia o CPF de antemão. O passo do CPF já só aparecia quando a API respondia `cpf_obrigatorio`, e com a Stripe ela não responde. O corpo do #241 dizia o contrário.
  - A escolha do provedor é **uma por página** (pílulas "Onde você recebe", acima das contas, só enquanto há conta a conectar), e não uma por conta: o guia é um só, embaixo das contas, e mostra o do escolhido. A conta conectada fala sempre pelo provedor dela (linha, selo, campo do "Trocar a chave", confirmação do desconectar, erro padrão), nunca pela pílula.
  - O selo do modo de teste: "Sandbox" no Asaas, "Teste" na Stripe. O campo: "Chave de API do Asaas" / "Chave restrita da Stripe"; o prefixo mostrado na Stripe é `rk_test_`/`rk_live_` (a API aceita `sk_` também).
  - Guia da Stripe: criar a conta (`dashboard.stripe.com/register`), criar a chave restrita em Desenvolvedores › Chaves de API (link `/test/apikeys` ou `/apikeys` pelo modo) com as permissões nomeadas como no painel da Stripe (escrita: Customers, Products, Prices, Subscriptions, Webhook Endpoints; leitura: Invoices, Invoice Payments, PaymentIntents), e colar. Conferir os nomes no E2E (tarefa 9).
  - Os textos de provedor ficam num módulo só (`apps/web/src/fluxo/provedores.ts`), usado pelo painel e pela vitrine. "Cartão" na Stripe confere com o conector (`payment_method_types: ["card"]`).
  - O "Como funciona" da vitrine nomeia o provedor só quando todo plano online é pago no mesmo; com os dois, "na página de pagamento".
  - api-client: `conectarPagamentosOnline(daCasa, provedor, chave)`; tipo `ProvedorDePagamento` em `@barchop/types`. O `falso.ts` lê o prefixo de cada provedor com as frases da API, responde `outra_conta` e só pede o CPF no Asaas.
  - Termos, Privacidade e novidades ficaram para o PR 7, como no plano.

## Summary
Quem vende (a casa ou o profissional) passa a escolher entre o Asaas e a Stripe em Pagamentos online e cola a chave da própria conta Stripe; o BarChop cria o webhook pela API, como no Asaas (sem Stripe Connect, decisão do dono em 30/10). O cliente assina na fatura da Stripe (cartão, renovação automática), e o resto — vitrine, Minha conta, assinantes, Caixa, acerto, sino — segue pelo mesmo caminho do Asaas, porque o conector da Stripe entra atrás da interface `Provedor` que já existe.

## Decisões deste plano (valem até o dono mudar)
1. **A chave**: aceita a restrita (`rk_live_`/`rk_test_`, recomendada no guia da tela) e a secreta (`sk_live_`/`sk_test_`). O prefixo diz o modo (`_test_` = teste), como `$aact_hmlg_` no Asaas. As permissões da restrita são conferidas no teste ponta a ponta (tarefa 9) e entram no guia.
2. **A assinatura nasce na Stripe** com `payment_behavior: default_incomplete`, `payment_settings.save_default_payment_method: on_subscription` e `payment_method_types: ["card"]`. O link devolvido é o `hosted_invoice_url` da primeira fatura: mesmo modelo do Asaas (o id existe na hora e o cliente paga numa página do provedor). Sem o Checkout da Stripe, que só dá o id da assinatura depois de pago.
3. **Dias grátis**: `trial_end` no fim do teste, sem pedir cartão antes (como o Asaas, cuja primeira cobrança vence no fim do teste). No fim do teste, a fatura sai, a cobrança falha sem cartão e o cliente paga pelo "Pagar" da Minha conta (o `linkDaFatura`), que guarda o cartão para os ciclos seguintes.
4. **O produto**: um por plano do BarChop, com id fixo `barchop_plano_<planoId>` (a Stripe aceita id escolhido): lê, cria se não existe, atualiza o nome se mudou. O preço vai em `price_data` em cada assinatura. Nada novo no banco.
5. **O CPF**: a Stripe não pede. O conector diz se pede (`pedeCpf`), e o assinar e a vitrine só pedem quando o provedor da conta de quem vende pede.
6. **O webhook**: um endpoint por conexão, `/webhooks/stripe/<conexão>`, criado com `webhookEndpoints.create` e a mesma `api_version` da biblioteca. O `secret` (`whsec_`) volta só na criação: fica cifrado numa coluna nova. A conferência é a da biblioteca (`Stripe.webhooks.constructEvent`, já usada em `lib/cobranca.ts:221`). O endereço do Asaas (`/webhooks/asaas/<conexão>`) **não muda**: há webhooks registrados em contas de produção.
7. **A "cobrança" da Stripe é a fatura** (`invoice`): `paid` → paga; aberta com tentativa falha ou vencida → vencida; estorno pelo `charge.refunded` → estornada (só avisa, como no Asaas). Assinatura `canceled`/`incomplete_expired` → parou.
8. **Trocar de plataforma**: segue a regra que já existe, uma conta ligada por vendedor e desconectar só sem assinatura online viva (`pagamentos-online.ts:205`). Responde a pergunta aberta do PRD sem código novo.
9. **Pix na Stripe**: fora deste marco (só cartão); a pergunta segue aberta no PRD.

## Patterns to Mirror
| Category | Source | Pattern |
|---|---|---|
| Interface do provedor | `barchop/apps/api/src/lib/provedores/tipos.ts:93` | `Provedor` sem nome de provedor nos tipos; `ErroDoProvedor` com `codigo` |
| Fábrica | `barchop/apps/api/src/lib/provedores/index.ts:35` | `provedoresDoAmbiente`: `switch` por provedor em `modoDaChave`, `conector`, `daConexao`; de memória nos testes |
| Conector | `barchop/apps/api/src/lib/provedores/asaas.ts:158` | lê só o que usa, prazo por pedido, status HTTP → `ErroDoProvedor` |
| Biblioteca Stripe | `barchop/apps/api/src/lib/cobranca.ts:297` | `new Stripe(chave)`; `stripe` ^23 já é dependência |
| Webhook dos planos | `barchop/apps/api/src/routers/webhook-asaas.ts:220` | relê no provedor fora da transação; evento + mudança na mesma transação; estranho → log e 200 |
| Corpo cru | `barchop/apps/api/src/routers/webhook-stripe.ts:136` e `app.ts:197` | parser `buffer` só no escopo registrado |
| Conectar | `barchop/apps/api/src/routers/pagamentos-online.ts:112` | confere a chave, registra o webhook antes de gravar, apaga se não gravou |
| Erros HTTP | `barchop/apps/api/src/lib/provedores/index.ts:77` | `erroHttpDoProvedor` e `ErroDeNegocio(mensagem, codigo)` |
| Testes do conector | `barchop/apps/api/tests/lib/provedor-asaas.test.ts:24` | `fetch` falso com respostas gravadas no sandbox (`respostas-do-asaas/`) |
| Testes de rota | `barchop/apps/api/tests/routers/webhook-asaas.test.ts`, `pagamentos-online.test.ts` | provedor de memória + banco de teste |
| Tela | `barchop/apps/web/src/telas/painel/configuracoes/PagamentosOnline.tsx:141` | quadro "Como pegar a chave" em 3 passos, links e prefixo pelo modo aceito |

## Files to Change
| File | Action | Why |
|---|---|---|
| `barchop/apps/api/src/lib/provedores/tipos.ts` | UPDATE | `PROVEDORES = ["asaas", "stripe"]`; `pedeCpf`; `cpfCnpj` anulável em `NovoCliente`; `ConexaoGravada` com o segredo do webhook; `registrarWebhook` devolve também o segredo (quando o provedor dá) |
| `barchop/apps/api/src/lib/provedores/stripe.ts` | CREATE | O conector da Stripe |
| `barchop/apps/api/src/lib/provedores/index.ts` | UPDATE | `switch` com a Stripe; `urlDoWebhook(provedor, conexaoId)`; `nomeDoProvedor` para as mensagens; `erroHttpDoProvedor` com o nome |
| `barchop/apps/api/src/lib/provedores/memoria.ts` | UPDATE | Memória serve os dois (nome e `pedeCpf` configuráveis; eventos assinados pra Stripe) |
| `barchop/apps/api/src/lib/webhook-dos-planos.ts` | CREATE | `aplicar`, `registrarPagamento`, `marcarAtraso` saem do `webhook-asaas.ts`, sem mudar o comportamento |
| `barchop/apps/api/src/routers/webhook-asaas.ts` | UPDATE | Fica só a rota (token, leitura, releitura), chamando o comum |
| `barchop/apps/api/src/routers/webhook-stripe-planos.ts` | CREATE | `POST /webhooks/stripe/:conexaoId`, corpo cru, assinatura com o segredo da conexão |
| `barchop/apps/api/src/app.ts` | UPDATE | Registra a rota nova num escopo com o parser de `buffer` |
| `barchop/apps/api/src/routers/pagamentos-online.ts` | UPDATE | Mensagens pelo nome do provedor; grava o segredo cifrado; "outra conta" também quando muda de provedor |
| `barchop/apps/api/src/routers/assinaturas-do-cliente.ts` | UPDATE | CPF só se `pedeCpf`; mensagens e logs sem "Asaas" fixo |
| `barchop/apps/api/src/lib/planos-do-cliente.ts`, `routers/planos.ts`, `routers/assinantes.ts` | UPDATE | Avisos do sino e erros pelo nome do provedor (os que hoje dizem "Asaas") |
| `barchop/packages/database/prisma/schema.prisma` + `migrations/<data>_segredo_do_webhook/migration.sql` | UPDATE / CREATE | `conexao_de_pagamento.segredo_do_webhook_cifrado bytea NULL` |
| `barchop/packages/types/src/index.ts` | UPDATE | `PagamentosOnline.conta.provedor: "asaas" \| "stripe"`; `PlanoDaVitrine.pagamento: { provedor, pedeCpf } \| null` |
| `barchop/packages/api-client/src/{barbeiro,publico,falso}.ts` | UPDATE | Campo novo e o dublê |
| `barchop/apps/web/src/telas/painel/configuracoes/PagamentosOnline.tsx` | UPDATE | Escolher Asaas ou Stripe antes de colar; guia "Como pegar a chave na Stripe"; textos pelo provedor |
| `barchop/apps/web/src/telas/painel/configuracoes/IndiceDeConfiguracoes.tsx` | UPDATE | "A conta do Asaas…" → genérico |
| `barchop/apps/web/src/telas/PlanosDaBarbearia.tsx` | UPDATE | CPF só se `pedeCpf`; "na página do Asaas/da Stripe"; formas pelo provedor (Stripe: cartão) |
| `barchop/apps/web/src/telas/MinhasAssinaturas.tsx`, `painel/CadastroDePlano.tsx`, `painel/ListaDePlanos.tsx`, `painel/CentralDeAjuda.tsx` | UPDATE | Textos que citam só o Asaas |
| `barchop/apps/web/src/site/Termos.tsx`, `site/Privacidade.tsx` | UPDATE | Stripe como serviço de pagamento que quem vende pode escolher (LGPD: operador e dados enviados) |
| `barchop/apps/web/src/painel/novidades.ts` | UPDATE | Novidade "Receba os planos pela Stripe" |
| `barchop/docs/adr/0012-stripe-nos-planos-por-chave-colada.md` + `README.md` | CREATE / UPDATE | Por que chave colada e não Connect; fatura em vez de Checkout |
| `barchop/docs/screens.md` | UPDATE | Pagamentos online com a escolha do provedor |
| Testes: `tests/lib/provedor-stripe.test.ts` (+ `respostas-da-stripe/`), `tests/routers/webhook-stripe-planos.test.ts`, os de `pagamentos-online`, `assinar-online`, `webhook-asaas`, e na web `pagamentos-online.test.tsx`, `planos-da-barbearia.test.tsx` | CREATE / UPDATE | Ver cada tarefa |

## Tasks
PRs pequenos, na ordem, cada um com "pode mergear" do dono. O 1 não muda nada no ar.

### Task 1 (PR 1): O provedor sem "Asaas" fixo — só refatoração
- **Action**: extrair `aplicar`/`registrarPagamento`/`marcarAtraso` para `lib/webhook-dos-planos.ts`; `nomeDoProvedor(nome)` ("Asaas"/"Stripe") e trocar as mensagens fixas da API por ele; `urlDoWebhook` recebe o provedor (o do Asaas dá o mesmo endereço de hoje); `pedeCpf` na interface (Asaas: `true`).
- **Mirror**: `webhook-asaas.ts` como está; textos de erro iguais aos de hoje para o Asaas.
- **Validate**: os testes de hoje passam sem mudar as expectativas (`webhook-asaas`, `pagamentos-online`, `assinar-online`, `cancelar-no-provedor`, `provedores`) + `tsc` + lint.

### Task 2 (PR 2): Conector da Stripe
- **Action**: `provedores/stripe.ts` implementando `Provedor` com a biblioteca `stripe` e um `httpClient` injetável (`Stripe.createFetchHttpClient(fetchFalso)`) para os testes. `modoDaChaveDaStripe`; `conferirChave` (lista 1 cliente); `registrarWebhook`/`apagarWebhook`/`temWebhook` (webhook endpoints); `criarCliente` (sem CPF, `metadata.barchop`); `criarAssinatura` (decisões 2, 3, 4; ciclos mensal = mês/1, trimestral = mês/3, anual = ano/1); `linkDaFatura` (fatura aberta mais antiga); `lerAssinatura`; `lerCobranca` (decisão 7; forma `cartao`); `cancelarAssinatura` (já cancelada não é erro); `lerEvento` com conferência da assinatura. Prazo por pedido abaixo dos 15 s do desconectar, como o `PRAZO_DO_ASAAS_MS`. Status: 401 → `chave_invalida`; 403 de permissão → `chave_invalida` com a mensagem de permissão; 400/402 → `recusado`; 404 → `nao_encontrado`; 429 → `limite`; resto → `indisponivel`.
- **Mirror**: `asaas.ts` + `tests/lib/provedor-asaas.test.ts` (respostas gravadas no modo teste da Stripe em `respostas-da-stripe/`, ids trocados por exemplos).
- **Validate**: `pnpm --filter api test tests/lib/provedor-stripe.test.ts` + `tsc`.

### Task 3 (PR 3): Conectar a Stripe
- **Action**: migração `segredo_do_webhook_cifrado`; `PROVEDORES` com `stripe`; o PUT aceita `provedor: "stripe"`, grava o segredo cifrado e trata "outra conta" também quando o provedor é outro; mensagens de chave errada/modo errado pelo provedor; `ConexaoGravada` com o segredo; tipos e api-client.
- **Mirror**: `pagamentos-online.ts:112`; migração no estilo de `20261028120000_mensalidade_online`.
- **Validate**: `pagamentos-online.test.ts` (conectar Stripe, modo errado, troca de chave da mesma conta, troca para outro provedor recusada, desconectar com viva recusado) + `prisma migrate dev` no banco local + `tsc`.

### Task 4 (PR 4): Webhook da Stripe
- **Action**: `routers/webhook-stripe-planos.ts`: conexão ligada do modo aceito (senão log e 200); `constructEvent` com o segredo decifrado (falhou → 400); dedupe em `evento_do_provedor` com `provedor = "stripe"`; relê fatura/assinatura fora da transação; chama `lib/webhook-dos-planos.ts`. Eventos: `invoice.paid`, `invoice.payment_failed`, `invoice.marked_uncollectible`, `customer.subscription.updated`, `customer.subscription.deleted`, `charge.refunded`.
- **Mirror**: `webhook-asaas.ts:220` e o escopo do corpo cru em `app.ts:197`.
- **Validate**: `webhook-stripe-planos.test.ts`: paga entra uma vez no Caixa (com evento repetido), primeira paga avisa "Nova assinatura", falha vira em atraso, `incomplete_expired`/`deleted` cancela, estorno só avisa, assinatura que não é do BarChop → 200, assinatura errada → 400.

### Task 5 (PR 5): Assinar e cancelar com a Stripe
- **Action**: `assinaturas-do-cliente.ts`: CPF só quando `pedeCpf`; erro de chave recusada e logs pelo provedor. Cancelar pelo painel e pelo cliente já passa por `cancelarNoProvedor`: conferir que funciona com a Stripe e trocar os textos do sino. A vitrine (`planos-publicos`) devolve `pagamento: { provedor, pedeCpf }` por plano.
- **Mirror**: `assinaturas-do-cliente.ts:115`.
- **Validate**: `assinar-online.test.ts` (Stripe sem CPF; Asaas segue pedindo), `cancelar-no-provedor.test.ts`, `planos-publicos.test.ts`.

### Task 6 (PR 6): As telas
- **Action**: Pagamentos online — sem conta: escolher Asaas ou Stripe (duas opções lado a lado, sem caixas empilhadas) e o guia do escolhido; guia da Stripe em 3 passos (ter a conta, criar a chave restrita com as permissões da tarefa 9 em Desenvolvedores › Chaves de API, com link para `dashboard.stripe.com/apikeys` ou `/test/apikeys` conforme o modo; colar aqui); com conta: "**Stripe** · chave terminando em …". Vitrine: CPF só com `pedeCpf`; "Cartão, na página da Stripe" no lugar de "Pix, cartão ou boleto, na página do Asaas". Demais textos genéricos (Índice, Cadastro e Lista de planos, Minhas assinaturas, Central de ajuda).
- **Mirror**: `PagamentosOnline.tsx:141` (quadro do #230); regra das telas horizontais e sem blocos (memória do projeto).
- **Validate**: `pagamentos-online.test.tsx`, `planos-da-barbearia.test.tsx`, `configuracoes-indice.test.tsx`, `central-de-ajuda.test.tsx`, `planos.test.tsx` + `tsc` + lint da web.

### Task 7 (PR 7): Termos, privacidade, novidades, ADR
- **Action**: Termos e Privacidade com a Stripe ao lado do Asaas (o que vai para ela: nome, e-mail, telefone; sem CPF); novidade; ADR-0012; `docs/screens.md`.
- **Mirror**: o PR 12 do marco 3 (#222).
- **Validate**: `legal.test.tsx` + lint.

### Task 8: Deploy (o dono)
- Migração antes da API (coluna anulável, compatível com a API antiga); API antes da web (a web lê `pagamento` da vitrine).

### Task 9: Teste ponta a ponta em produção (com o dono, como o do Asaas em 25/10)
- `PAGAMENTOS_ONLINE_MODO=teste` por algumas horas na `barbearia-teste`; conectar uma chave restrita `rk_test_` e anotar as permissões mínimas que funcionaram; plano de R$ 10 do Gustavo, só online; assinar com o cartão de teste da Stripe na fatura; conferir Ativa, Caixa (linha Online), acerto e sino; cancelar pelo painel; desconectar (o endpoint some da Stripe); modo de volta a vazio. Um segundo plano com dias grátis confere a decisão 3.

## Validation
```bash
# Só os testes tocados (regra do projeto), no pacote de cada um
pnpm --filter api test tests/lib/provedor-stripe.test.ts tests/lib/provedores.test.ts \
  tests/routers/webhook-stripe-planos.test.ts tests/routers/webhook-asaas.test.ts \
  tests/routers/pagamentos-online.test.ts tests/routers/assinar-online.test.ts \
  tests/routers/cancelar-no-provedor.test.ts tests/routers/planos-publicos.test.ts
pnpm --filter web test tests/telas/painel/pagamentos-online.test.tsx tests/telas/planos-da-barbearia.test.tsx
pnpm -r exec tsc --noEmit
pnpm lint
```
(Os nomes exatos dos filtros e scripts são conferidos no `package.json` no PR 1.)

## Risks
| Risk | Likelihood | Mitigation |
|---|---|---|
| A fatura hospedada da Stripe com `default_incomplete` não guarda o cartão para renovar | Baixa | `save_default_payment_method: on_subscription`; conferido na tarefa 9 com um segundo ciclo simulado (test clock da Stripe) |
| Dias grátis sem cartão: a fatura do fim do teste falha e o cliente não volta para pagar | Média | "Pagar" na Minha conta com o `linkDaFatura`; em atraso avisa quem vende; mesma situação do Asaas hoje |
| Assinatura sem pagamento expira em 23 h na Stripe (`incomplete_expired`) | Certa | O webhook cancela no BarChop e o cliente pode assinar de novo; diferente do Asaas, onde a pendente fica |
| Versão da API: a fatura mudou de forma nas versões novas (o `invoice.parent` já aparece em `cobranca.ts:210`) | Média | Webhook criado com a `api_version` da biblioteca; respostas gravadas na versão usada |
| Chave restrita sem alguma permissão: erro só no assinar | Média | Lista mínima conferida na tarefa 9 e no guia; `conferirChave` também tenta listar webhooks |
| O nome "Stripe" no BarChop já é a cobrança do SaaS (`/stripe/webhook`, `cobranca.ts`) | Média | Nomes separados: `provedores/stripe.ts`, rota `/webhooks/stripe/:conexaoId`, nada importado de `cobranca.ts` |
| O refator do webhook (PR 1) quebra o Asaas em produção | Baixa | PR só de refator, testes de hoje sem mudar as expectativas; endereço do webhook igual |

## Acceptance
- [ ] Quem vende conecta uma chave da Stripe em Pagamentos online, vê "Stripe · chave terminando em …" e desconecta (sem assinatura viva)
- [ ] O cliente assina um plano de quem tem Stripe sem informar CPF, paga na fatura da Stripe e a assinatura fica Ativa
- [ ] A mensalidade entra uma vez no Caixa (linha Online) e o acerto bate; a primeira avisa "Nova assinatura" no sino
- [ ] Renovação no cartão entra sozinha; falha deixa em atraso; estorno só avisa
- [ ] Cancelar pelo painel e pelo cliente para a cobrança na Stripe
- [ ] O Asaas segue igual (testes de hoje verdes, endereço do webhook o mesmo)
- [ ] Teste ponta a ponta em produção feito com o dono
- [ ] Patterns mirrored, not reinvented
