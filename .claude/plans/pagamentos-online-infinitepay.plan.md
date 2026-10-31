# Plan: Pagamentos online — InfinitePay (link por ciclo)

**Source PRD**: `.claude/prds/pagamentos-online-stripe-infinitepay.prd.md`
**Selected Milestone**: 2 — InfinitePay em Pagamentos online (link por ciclo)
**Complexity**: Large (8 PRs + deploy; sem teste ponta a ponta, decisão 16)

Diferenças do plano, combinadas no caminho:
- **PR 1:**
  - Nenhum `if (p.cobra === "recorrente")` nos lugares que chamam o provedor. O tipo do conector sai de `COBRA` (`ProvedorDe<P>`), e enquanto nenhum provedor cobra por link, `daConexao` devolve `ProvedorRecorrente`. Quando a InfinitePay entrar em `PROVEDORES` e `COBRA` (PR 3), o compilador aponta cada lugar a tratar. `daChave` é genérico no provedor.
  - `registrarPagamento` do webhook dos planos virou `registrarMensalidadeOnline`, para não confundir com o `registrarPagamento` do `lib/caixa.ts`. Ele recebe `MensalidadePaga { idExterno, valorCentavos, forma, vencimento }`, e `INCLUDE_ASSINATURA`, `AssinaturaDoWebhook` e `Avisar` também são exportados.
  - `recomecaNoDiaPago` fica para o PR 4, junto do primeiro uso e dos testes. Quem chama passa o `vencimento` já como `max(vencimento do link, hoje)`.
  - Fila de memória: `repeticoes` e `rodarRepeticao(trabalho)`, que roda o tratador com `{}`. No pg-boss, `schedule(trabalho, cron, {}, { tz: "America/Sao_Paulo" })`, depois do `garantirFila`.
- **PR 2:**
  - O conector (`provedorInfinitePay({ chave, tag, fetch })`) ainda não está na fábrica. Até a InfinitePay entrar em `PROVEDORES` (PR 3), ele devolve `ConectorDaInfinitePay` (`ProvedorDeLink` com `nome: "infinitepay"`), que vira só `ProvedorDeLink` no PR 3. A tag chega sem o `$`, e quem tira é a rota do PR 3.
  - Sem log dentro do conector: a fábrica não tem log. No lugar, o erro `indisponivel` do criar link sem URL traz os nomes dos campos que vieram, nunca os valores. **As rotas dos PRs 3 e 4 registram a `message` do `ErroDoProvedor` no log** quando o provedor é a InfinitePay.
  - `conferirChave`: 400, 404 e 422 no `payment_check` inventado passam. Só 401 e 403 são chave recusada, e 5xx ou rede são `indisponivel`.
  - `external_checkout_not_enabled` em qualquer parte do corpo (e com qualquer status) vira `recusado`, com o que fazer ("ligue em Configurações do Checkout").
  - `conferirPagamento`: 400, 404 e 422 voltam como não pago. Pago sem `amount` inteiro e positivo é `indisponivel` (tenta de novo, sem entrar no Caixa).
  - O celular vai com `+55` quando vem sem o país. `valid_until` é o fim do dia com `-03:00`.
  - As respostas de `tests/lib/respostas-da-infinitepay/` saem dos exemplos da documentação, com um README que diz isso. A do criar link é palpite (`url`).

## Summary
Quem vende passa a poder conectar a InfinitePay em Pagamentos online, colando a InfiniteTag e uma chave de API `inchk_`. A InfinitePay não tem assinatura recorrente: **o BarChop é quem toca o ciclo**. A cada ciclo, ele gera um link de pagamento único, manda ao cliente por e-mail e deixa um botão "Mandar pelo WhatsApp" para quem vende. Quando o link é pago, a confirmação vem pela própria InfinitePay (`/payment_check`, nunca só o aviso). O ciclo é ativado e a mensalidade entra no Caixa e no acerto pelo mesmo `registrarPagamento` do Asaas e da Stripe. Sem pagamento, a assinatura fica Em atraso e é cancelada sozinha depois dos dias que quem vende escolheu.

## O que a documentação da InfinitePay diz (conferida em 31/10/2026, https://www.infinitepay.io/checkout-documentacao)
- **Só dois pedidos:**
  - `POST https://api.checkout.infinitepay.io/links` cria o link;
  - `POST .../payment_check` confere o pagamento.
  - Não há busca de link por `order_nsu`, lista de pagamentos, cancelamento nem estorno pela API (só no app).
- **Chave `inchk_`** no cabeçalho `X-Api-Key` (até 5 por conta, mostrada uma vez). Com chave e `handle` (a InfiniteTag sem `$`) de contas diferentes, a resposta é **403**. O `payment_check` pede o `handle` no corpo.
- **Criar link:**
  - `items[{ description, price (centavos), quantity }]`, `order_nsu`, `redirect_url`, `webhook_url` (ou `webhook: { url, events }`), `customer { name, email, phone_number }`;
  - `options` (só com chave): `single_payment`, `valid_until` (ISO, até 1 ano), `payment_methods_enabled` (`pix`; cartão sempre), `assured_installments`;
  - o mesmo pedido idêntico pode devolver o mesmo link;
  - a resposta não está documentada além de "a URL".
- **`payment_check`:**
  - pede `{ handle, order_nsu, transaction_nsu, slug }` e devolve `{ success, paid, amount, paid_amount, installments, capture_method }`;
  - o que não bate é 200 com `success: false` ou `paid: false`;
  - `paid_amount` pode passar de `amount` (juros do parcelamento repassados ao comprador).
- **Aviso de pagamento (webhook):**
  - **sem assinatura**, por link e fixo na criação;
  - corpo `{ invoice_slug, amount, paid_amount, installments, capture_method, transaction_nsu, order_nsu, receipt_url, items }`, sem campo de tipo de evento;
  - responder 2xx em até 1 s; 400 em erro, e o não-2xx é repetido.
- **`redirect_url`:** o comprador volta com `receipt_url`, `order_nsu`, `slug`, `capture_method` e `transaction_nsu` na query.
- **Sem sandbox:** todo teste é dinheiro de verdade (mínimo R$ 1,00, parcela mínima R$ 1,00), e o estorno é no app. O "checkout integrado" precisa estar ligado nas configurações da conta (sem ele: `external_checkout_not_enabled`).

## Decisões deste plano (valem até o dono mudar)
Do dono, em 31/10/2026:
1. **Conectar com a chave `inchk_`**, cifrada como as outras. O link sai de pagamento único (`single_payment`), com validade (`valid_until`) e com Pix ligado.
2. **Link não pago:**
   - o link do próximo ciclo sai **3 dias antes** do vencimento;
   - sem pagamento no vencimento, a assinatura fica **Em atraso** e o link é reenviado;
   - depois de **N dias de atraso** ela é **cancelada sozinha**, e **quem vende escolhe o N**;
   - pago atrasado, o ciclo recomeça no dia pago (como o "recebi" do balcão).
3. **O cliente é avisado**, na vitrine e na Minha conta, de que o plano não renova sozinho e de que recebe um link a cada ciclo por e-mail e WhatsApp. A Minha conta mostra o link aberto para pagar.
4. **Mesmo recurso do plano do BarChop** (`planosDaBarbearia`) do Asaas e da Stripe. Vale para a Stripe também, que já é assim no código.

As propostas 6, 7, 10 e 13 foram conferidas com o dono em 31/10/2026, e a 7 mudou: a pendente cancelada avisa quem vende e o cliente. **Sem teste ponta a ponta** (decisão do dono em 31/10/2026: "vou confiar no desenvolvimento"). Ver decisão 16.

5. **A tela pede a InfiniteTag e a chave.** O `payment_check` pede o `handle`, e não há como descobrir a tag pela chave. A tag fica no banco em texto (não é segredo), e a chave cifrada.
   - Trocar a chave só vale com a tag gravada: a InfinitePay dá 403 se a chave nova é de outra conta. Isso substitui o `temWebhook`, que aqui não existe.
6. **Os dias para cancelar:** padrão **10**, de **3 a 30**, guardados na conexão (`dias_para_cancelar`). Mudar vale para os links gerados depois; o link já enviado mantém a validade que tinha.
7. **O primeiro link nunca pago:** a assinatura nasce Pendente, e o link vale os mesmos N dias. Passado o prazo sem pagar, ela é cancelada, e **o sistema avisa quem vende (sino) e o cliente (e-mail)**. Voltar a assinar com a pendente viva devolve o mesmo link.
8. **Dias grátis:** a assinatura nasce Em teste, sem link. O link do primeiro pagamento sai 3 dias antes do fim do teste, como uma renovação.
9. **Confirmar o pagamento, por três caminhos que fazem a mesma coisa (`confirmarPagamentoDoLink`):**
   - o aviso da InfinitePay;
   - a volta do comprador pelo `redirect_url`, que cai numa página do BarChop e chama a API;
   - a varredura diária, para os links abertos que tenham `transaction_nsu` e `slug` conhecidos.
   - A confirmação é sempre o `payment_check`. Ele só vale com `paid: true`, com o `order_nsu` sendo de um link nosso e com `amount` igual ao valor do link.
   - Entra no Caixa o `amount`, nunca o `paid_amount`.
   - O `transaction_nsu` é o `idExterno` do recebimento: a mesma transação entra uma vez só.
10. **Se o aviso se perde e o cliente não volta pela página:** o BarChop não tem como achar o pagamento, porque a API não busca por `order_nsu`. Proposta: o "Recebi" do painel passa a valer também na assinatura da InfinitePay.
    - Quem vende confere no app e marca, e o link do ciclo fica fechado no BarChop.
    - Se esse link for pago depois, o sino avisa para estornar no app.
11. **Pago numa assinatura já cancelada**, ou num link que o BarChop já fechou: não entra no Caixa. O sino avisa "estorne no app da InfinitePay", porque a API não estorna.
12. **Estorno feito no app:** a InfinitePay não diz nada confiável (o `payment_check` depois do estorno não está documentado). Fica como hoje no Asaas e na Stripe: o caixa não muda, e quem vende acerta à mão. Sem aviso automático neste marco.
13. **O WhatsApp:**
    - o e-mail sai sozinho;
    - no painel, a linha do assinante com link aberto mostra "Mandar pelo WhatsApp" (`wa.me` com o texto e o link prontos);
    - o sino só avisa "Link do ciclo pronto: mande pelo WhatsApp" quando o cliente **não tem e-mail**, para não encher o sino com um aviso por assinante a cada ciclo.
14. **Modo:**
    - a InfinitePay não tem chave de teste, e toda `inchk_` é `real`;
    - com `PAGAMENTOS_ONLINE_MODO=teste`, a tela recusa a InfinitePay ("aqui só vale a de teste…");
    - fora de produção, só o provedor de memória;
15. **Preço mínimo:** a InfinitePay não cobra menos de R$ 1,00. O assinar recusa plano abaixo disso numa conta da InfinitePay (`plano_indisponivel`), e o cadastro do plano avisa.
16. **Sem chamada real à InfinitePay no desenvolvimento.** As respostas dos testes do conector são montadas a partir dos exemplos da documentação, e não gravadas: o arquivo diz isso no topo. Como a documentação não fecha tudo, o conector é tolerante onde ela é vaga:
    - a URL do link criado é lida de `url`, `link` ou `checkout_url`, e a falta das três é `indisponivel` com o corpo no log (sem a chave);
    - o `conferirChave` (um `payment_check` com pedido inventado) só trata 401 e 403 como chave recusada; qualquer outra resposta passa;
    - `X-Api-Key` e `handle` vão juntos em todos os pedidos.
    - **O primeiro uso real é o teste:** a primeira conta da InfinitePay conectada em produção mostra se a documentação bate. Os logs do conector registram o status e os nomes dos campos da resposta, sem valores, para corrigir rápido.

## Patterns to Mirror
| Category | Source | Pattern |
|---|---|---|
| Interface do provedor | `barchop/apps/api/src/lib/provedores/tipos.ts:100` | `Provedor`, `ErroDoProvedor(codigo)`, sem nome de provedor nos tipos |
| Fábrica e nomes | `barchop/apps/api/src/lib/provedores/index.ts:37` (`nomeDoProvedor`), `:83` (`provedoresDoAmbiente`) | `switch` por provedor em `modoDaChave`, `conector`, `daConexao`; `{ o, do, inicioDaChave, teste, real }` |
| Conector HTTP | `barchop/apps/api/src/lib/provedores/asaas.ts` | `fetch` injetável, prazo por pedido, status → `ErroDoProvedor` |
| Pagamento no Caixa | `barchop/apps/api/src/lib/webhook-dos-planos.ts:55` (`registrarPagamento`) | recebimento uma vez por `idExterno`, parte da casa congelada, `proximoDiaAberto`, `cicloPagoOnline`, "Nova assinatura" só na primeira |
| Atraso | `barchop/apps/api/src/lib/webhook-dos-planos.ts:125` (`marcarAtraso`) | só a cobrança da renovação; aviso "Pagamento em atraso" |
| Trava | `webhook-dos-planos.ts:162` | `SELECT … FROM barbearia … FOR NO KEY UPDATE` antes de mexer no caixa |
| Rota de webhook | `barchop/apps/api/src/routers/webhook-asaas.ts:27` | conexão ligada do provedor e do modo aceito; se não achar, log e 200 |
| Assinar | `barchop/apps/api/src/routers/assinaturas-do-cliente.ts:123` | regras de venda antes da rede; trava `FOR SHARE` da conexão; desfaz no provedor se não gravou |
| Conectar | `barchop/apps/api/src/routers/pagamentos-online.ts:120` | prefixo → modo → `conferirChave` → gravar; `outra_conta` ao mudar de provedor |
| Trabalho agendado | `barchop/apps/api/src/lib/lembrete.ts:58`, `:280`; `lib/fila.ts` | o trabalho relê e decide; marca reivindicada antes do envio e devolvida se falhar; chave de dedupe |
| E-mail | `lembrete.ts:264` | `canal.enviar({ para, assunto, texto })` |
| Ciclo | `barchop/packages/formato/src/planos-do-cliente.ts:137` (`cicloPagoOnline`) | adiantado → `pagoAte`; atrasado → ciclo a partir do vencimento passado |
| Atraso lido na hora | `barchop/apps/api/src/lib/planos-do-cliente.ts:101` (`marcarAtrasadas`) | quem lê a situação acerta antes |
| Migração | `barchop/packages/database/prisma/migrations/20261101120000_stripe_nos_planos/migration.sql` | comentário com o porquê e o "desfazer"; CHECKs conferidos em `tests/banco-planos.test.ts` |
| Textos da web | `barchop/apps/web/src/fluxo/provedores.ts` | `PROVEDORES[provedor]` com `nome`, `o`, `do`, `formas`, `efeito`, `chave`, `prefixo` |
| WhatsApp | `barchop/apps/web/src/painel/whatsapp.ts` (`linkDoZap`) | `https://wa.me/55<dígitos>` |
| Testes | `tests/lib/provedor-stripe.test.ts` (respostas gravadas), `tests/routers/webhook-stripe-planos.test.ts`, `tests/routers/lembrete-agendado.test.ts` (fila de memória, `rodarVencidos`) | |

## Files to Change
| File | Action | Why |
|---|---|---|
| `barchop/apps/api/src/lib/provedores/tipos.ts` | UPDATE | `PROVEDORES` com `infinitepay`; `PEDE_CPF.infinitepay = false`; interface dividida: `ProvedorRecorrente` (o `Provedor` de hoje) e `ProvedorDeLink`; `COBRA` por provedor (`"recorrente" \| "link"`); `ConexaoGravada.infiniteTag` |
| `barchop/apps/api/src/lib/provedores/infinitepay.ts` | CREATE | O conector: `modoDaChaveDaInfinitePay`, `conferirChave`, `criarLink`, `conferirPagamento`, `lerAviso` |
| `barchop/apps/api/src/lib/provedores/index.ts` | UPDATE | `switch` com a InfinitePay; `nomeDoProvedor("infinitepay")` = `{ o: "a InfinitePay", do: "da InfinitePay", inicioDaChave: "inchk_", teste: "de teste", real: "de produção" }`; `daConexao` devolve a união; `recorrente(p)`/`deLink(p)` |
| `barchop/apps/api/src/lib/provedores/memoria.ts` | UPDATE | Memória da InfinitePay: links criados, pagamentos marcáveis pelo teste, `payment_check` falso |
| `barchop/apps/api/src/lib/webhook-dos-planos.ts` | UPDATE | `registrarPagamento` exportado, recebendo `{ idExterno, valorCentavos, forma, vencimento, recomecaNoDiaPago }` em vez da `CobrancaNoProvedor` |
| `barchop/apps/api/src/lib/links-do-ciclo.ts` | CREATE | `gerarLinkDoCiclo`, `confirmarPagamentoDoLink`, `varrerCiclosDeLink` (o trabalho diário), textos do e-mail |
| `barchop/apps/api/src/lib/fila.ts` | UPDATE | `repetir(trabalho, cron)` na interface: pg-boss `schedule(..., { tz: FUSO_DA_BARBEARIA })`; memória guarda e o teste roda à mão |
| `barchop/apps/api/src/server.ts` | UPDATE | Registra o trabalho e a repetição diária, ao lado do lembrete |
| `barchop/apps/api/src/routers/webhook-infinitepay-planos.ts` | CREATE | `POST /webhooks/infinitepay/:conexaoId` |
| `barchop/apps/api/src/app.ts` | UPDATE | Registra a rota |
| `barchop/apps/api/src/routers/pagamentos-online.ts` | UPDATE | PUT com `provedor: "infinitepay"` + `tag`; troca de chave pela tag; `PATCH` dos dias para cancelar; desconectar sem webhook para apagar |
| `barchop/apps/api/src/routers/assinaturas-do-cliente.ts` | UPDATE | Assinar na InfinitePay cria o link do 1º ciclo; voltar com a pendente devolve o link aberto; `POST /clientes/me/assinaturas/:id/conferir-pagamento` (volta do `redirect_url`); `linkParaPagar` |
| `barchop/apps/api/src/lib/planos-do-cliente.ts` | UPDATE | `cancelarNoProvedor` não chama nada na de link (só para de gerar); vitrine com o provedor da InfinitePay |
| `barchop/apps/api/src/routers/assinantes.ts` | UPDATE | `linkDoCiclo` na assinatura do painel; o "Recebi" aceita a da InfinitePay (decisão 10) e fecha o link aberto |
| `barchop/packages/database/prisma/schema.prisma` + `migrations/20261102120000_infinitepay_nos_planos/migration.sql` | UPDATE / CREATE | `infinitepay` nos CHECKs da conexão e do evento; `conexao_de_pagamento.infinite_tag`, `dias_para_cancelar`; tabela `link_do_ciclo` |
| `barchop/packages/formato/src/...` (`PROVEDORES_DE_PAGAMENTO`) | UPDATE | `infinitepay` na lista que os CHECKs espelham |
| `barchop/packages/types/src/index.ts` | UPDATE | `ProvedorDePagamento` com `infinitepay`; `PagamentosOnline.conta.{infiniteTag, diasParaCancelar}`; `AssinaturaNaConta.linkParaPagar`; `AssinaturaDoPainel.linkDoCiclo` |
| `barchop/packages/api-client/src/{barbeiro,cliente,falso}.ts` | UPDATE | Conectar com tag, dias para cancelar, conferir pagamento; o dublê |
| `barchop/apps/web/src/fluxo/provedores.ts` | UPDATE | Textos da InfinitePay (`formas: "Pix ou cartão"`, `renovaSozinho: false`) |
| `barchop/apps/web/src/telas/painel/configuracoes/PagamentosOnline.tsx` | UPDATE | Pílula InfinitePay; dois campos (tag e chave); "Como funciona sem recorrência"; dias para cancelar |
| `barchop/apps/web/src/telas/PlanosDaBarbearia.tsx` | UPDATE | Aviso de que não renova sozinho; o link do 1º pagamento |
| `barchop/apps/web/src/telas/MinhasAssinaturas.tsx` | UPDATE | "Pagar" com `linkParaPagar`; aviso do link a cada ciclo |
| `barchop/apps/web/src/telas/PagamentoConferido.tsx` (ou rota na Minha conta) | CREATE | Volta do `redirect_url`: chama o conferir e mostra o resultado |
| `barchop/apps/web/src/telas/painel/...` (lista de assinantes / detalhe do cliente) | UPDATE | "Mandar pelo WhatsApp" com o link do ciclo |
| `barchop/apps/web/src/telas/painel/CadastroDePlano.tsx` | UPDATE | Aviso do mínimo de R$ 1,00 na InfinitePay |
| `barchop/apps/web/src/site/Termos.tsx`, `site/Privacidade.tsx`, `painel/novidades.ts`, `controlador.ts` | UPDATE | A InfinitePay como opção de quem vende (o que vai: nome, e-mail, celular); vigência nova |
| `barchop/docs/adr/0013-infinitepay-link-por-ciclo.md` + `README.md`, `docs/screens.md` | CREATE / UPDATE | Por que o BarChop toca o ciclo, e a confirmação pelo `payment_check` |

## Tasks
PRs pequenos, na ordem, cada um com "pode mergear" do dono. O 1 não muda nada no ar.

### Task 1 (PR 1): Interface por tipo de cobrança e fila com repetição (só refatoração)
- **Action:**
  - Em `tipos.ts`, o `Provedor` de hoje vira `ProvedorRecorrente` (`cobra: "recorrente"`), e entra o `ProvedorDeLink` (`cobra: "link"`):
    - `conferirChave()`;
    - `criarLink({ orderNsu, valorCentavos, descricao, cliente, redirectUrl, webhookUrl, validoAte })` → `{ url }`;
    - `conferirPagamento({ orderNsu, transactionNsu, slug })` → `{ pago, valorCentavos, forma: "pix" | "cartao" | null }`;
    - `lerAviso(corpo)` → `{ orderNsu, transactionNsu, slug }`.
  - `Provedor = ProvedorRecorrente | ProvedorDeLink`. As rotas que usam a assinatura no provedor (assinar, `cancelarNoProvedor`, `receberEvento`, conectar) estreitam com `if (p.cobra === "recorrente")`. Nenhuma ganha stub.
  - `registrarPagamento` sai com uma entrada própria (`{ idExterno, valorCentavos, forma, vencimento, recomecaNoDiaPago }`). O `aplicar` monta essa entrada a partir da `CobrancaNoProvedor`, com `recomecaNoDiaPago: false`, e o comportamento fica igual.
  - Na `Fila`, entra `repetir(trabalho, cron)`. No pg-boss é `boss.schedule(trabalho, cron, null, { tz: FUSO_DA_BARBEARIA })` com o `garantirFila`. Na memória, ela guarda o cron e o teste chama `rodarVencidos`.
- **Mirror**: o PR 1 da Stripe (#237): refatoração sem mudar as expectativas.
- **Gotcha**: `recomecaNoDiaPago: true` passa `max(vencimento, hoje)` para o `cicloPagoOnline`, sem mudar a função do `@barchop/formato`.
- **Validate**: os testes de hoje sem mudar as expectativas (`webhook-asaas`, `webhook-stripe-planos`, `pagamentos-online`, `assinar-online`, `cancelar-no-provedor`, `mensalidades-no-caixa`, `lembrete-agendado`) + teste novo de `repetir` na fila de memória + `tsc` + lint.

### Task 2 (PR 2): Conector da InfinitePay
- **Sem conta real** (decisão 16): as respostas de `respostas-da-infinitepay/` são montadas dos exemplos da documentação, com um aviso no topo de cada arquivo.
- **Action:** criar `provedores/infinitepay.ts`, com `fetch` injetável e prazo por pedido:
  - `modoDaChaveDaInfinitePay`: `inchk_` → `real`, o resto → `null`.
  - `conferirChave(tag)`: um `payment_check` com `order_nsu` inventado. Só 401 e 403 são `chave_invalida`; o resto passa (decisão 16).
  - `criarLink`:
    - `handle` + `X-Api-Key`, `items` com uma linha (`description` = nome do plano, `price`, `quantity: 1`), `order_nsu`, `redirect_url`, `webhook_url`;
    - `customer` com o que o cliente tem;
    - `options: { single_payment: true, valid_until, payment_methods_enabled: ["pix", "credit_card"] }`;
    - devolve a URL, lida de `url`, `link` ou `checkout_url` (decisão 16).
  - `conferirPagamento`: `paid && success` → pago; `capture_method` `pix` → `pix`, `credit_card` → `cartao`; `amount` como valor.
  - `lerAviso`: valida as formas (`order_nsu`, `transaction_nsu`, `invoice_slug` strings não vazias), senão `recusado`.
  - Status: 401 e 403 → `chave_invalida`; `external_checkout_not_enabled` → `recusado` com frase nossa ("ligue o checkout integrado nas configurações da InfinitePay"); 400 e 422 → `recusado`; 429 → `limite`; o resto → `indisponivel`.
- **Mirror**: `stripe.ts` + `tests/lib/provedor-stripe.test.ts`, com as respostas em `respostas-da-infinitepay/` (só valores de exemplo).
- **Log**: em resposta inesperada, o status e os nomes dos campos, nunca os valores nem a chave.
- **Validate**: `pnpm --filter api test tests/lib/provedor-infinitepay.test.ts` + `tsc`.

### Task 3 (PR 3): Banco e conectar a InfinitePay
- **Action:**
  - Migração `20261102120000_infinitepay_nos_planos`:
    - `infinitepay` nos CHECKs de `conexao_de_pagamento.provedor` **e** de `evento_do_provedor.provedor`;
    - `conexao_de_pagamento.infinite_tag varchar(40) NULL` e `dias_para_cancelar smallint NULL`, com CHECK: `(provedor = 'infinitepay') = (infinite_tag IS NOT NULL AND dias_para_cancelar BETWEEN 3 AND 30)`, ressalvada a desligada;
    - tabela `link_do_ciclo`: `id uuid`, `assinatura_id`, `vencimento date`, `valor_centavos`, `order_nsu varchar(100) unique`, `url`, `valido_ate date`, `situacao` (`aberto`, `pago`, `fechado`), `transaction_nsu`, `slug`, `enviado_em`, `reenviado_em`, `pago_em`, `criado_em`, `unique (assinatura_id, vencimento)`.
  - `order_nsu` = `<assinaturaId>:<vencimento>`, fixo: o mesmo pedido de novo dá o mesmo link na InfinitePay e bate no índice aqui.
  - `PROVEDORES_DE_PAGAMENTO` com `infinitepay`.
  - O PUT do conectar:
    - aceita `{ provedor: "infinitepay", chave, tag }` (a tag sem `$` e sem espaço) e grava com `dias_para_cancelar = 10`;
    - o `webhookTokenHash` segue preenchido e sem uso, como na Stripe;
    - **trocar a chave** confere a chave nova com a tag gravada (403 → `outra_conta`).
  - `PATCH /barbearias/me/pagamentos-online` `{ diasParaCancelar }`, só na InfinitePay.
  - O desconectar não tem webhook para apagar e mantém a regra das vivas.
  - Tipos e api-client (`conectarPagamentosOnline(daCasa, provedor, chave, tag?)`, `diasParaCancelar`).
- **Mirror**: `pagamentos-online.ts:120`; migração no estilo de `20261101120000_stripe_nos_planos`.
- **Gotcha**: com `PAGAMENTOS_ONLINE_MODO=teste`, a `inchk_` dá `modo_errado` (decisão 14).
- **Validate**: `pagamentos-online.test.ts` (conectar, sem tag, chave de outra conta na troca, trocar para outro provedor recusado, dias fora do limite, desconectar com viva recusado), `banco-planos.test.ts` + `prisma migrate dev` no banco local + `tsc`.

### Task 4 (PR 4): Assinar, aviso de pagamento e volta da página
- **Action:**
  - `lib/links-do-ciclo.ts`:
    - `gerarLinkDoCiclo(assinatura, vencimento)`: idempotente pelo índice, com o pedido à InfinitePay fora da transação;
    - `confirmarPagamentoDoLink(link, { transactionNsu, slug })`: `payment_check`, decisão 9, `registrarPagamento` com `recomecaNoDiaPago: true`, `link.situacao = pago`;
    - decisão 11: pago com a assinatura cancelada ou o link fechado → sino "estorne no app".
  - O assinar com conta da InfinitePay:
    - sem dias grátis, nasce `pendente` com o link do 1º ciclo (vencimento hoje, validade hoje + N) e devolve `linkDaFatura` = a URL;
    - com dias grátis, nasce `teste`, sem link;
    - plano abaixo de R$ 1,00 → `plano_indisponivel`;
    - voltar com a pendente devolve o link aberto.
  - `POST /webhooks/infinitepay/:conexaoId`:
    - conexão ligada da InfinitePay; `lerAviso`; o link pelo `order_nsu` (que não é nosso → log e 200);
    - dedupe em `evento_do_provedor` (`provedor = infinitepay`, `id = transaction_nsu`);
    - `confirmarPagamentoDoLink`. Falha de rede → 400, para a InfinitePay repetir.
  - `POST /clientes/me/assinaturas/:id/conferir-pagamento` `{ orderNsu, transactionNsu, slug }`: o mesmo `confirmarPagamentoDoLink`, só no link da própria assinatura do cliente logado.
- **Mirror**: `webhook-dos-planos.ts:217` (`receberEvento`: rede fora da transação, evento e mudança juntos, P2002 da entrega dupla); `assinaturas-do-cliente.ts:123`.
- **Gotcha**: `amount` diferente do valor do link → não entra, log e aviso. `paid_amount` maior que `amount` é normal (juros).
- **Validate**: `webhook-infinitepay-planos.test.ts` e `assinar-online.test.ts`:
  - pago entra uma vez no Caixa, com o aviso repetido e a volta da página;
  - a primeira avisa "Nova assinatura";
  - `paid: false` não muda nada; aviso de link que não é nosso → 200;
  - pago na cancelada só avisa;
  - adiantado vai para `pagoAte`; atrasado recomeça no dia pago.

### Task 5 (PR 5): A varredura diária dos ciclos
- **Action:** o trabalho `ciclos-por-link`, repetido às 08:00 de São Paulo, roda por barbearia e é idempotente:
  1. Assinatura viva (`ativa`, `teste`, `em_atraso`) da InfinitePay com `cicloTerminaEm − 3 ≤ hoje` (ou `pagoAte` já cobrindo) e sem link para esse vencimento → `gerarLinkDoCiclo` e e-mail (`enviado_em` reivindicado antes, devolvido se o envio falhar).
  2. Vencido sem pagar → `em_atraso`, com o aviso "Pagamento em atraso" do `marcarAtraso` e o link reenviado por e-mail (`reenviado_em`).
  3. `hoje ≥ vencimento + diasParaCancelar` → cancelada, com o sino "Assinatura cancelada por falta de pagamento" e e-mail ao cliente. A pendente do 1º link → cancelada no dia N, com o sino para quem vende e e-mail para o cliente (decisão 7).
  4. Link aberto com `transaction_nsu` e `slug` conhecidos (veio da página, mas a confirmação falhou) → `confirmarPagamentoDoLink` de novo.
  - Cliente sem e-mail → o sino "Link do ciclo pronto: mande pelo WhatsApp" (decisão 13).
  - `marcarAtrasadas` não muda: a de link fica de fora dele, porque quem marca é a varredura.
- **Mirror**: `lembrete.ts:213` (relê e decide; marca antes do envio; só a falha de envio lança).
- **Gotcha**: o dia é o da barbearia (`agoraNaBarbearia`). Rodar duas vezes no mesmo dia não manda dois e-mails nem gera dois links.
- **Validate**: `ciclos-por-link.test.ts` com a fila de memória e datas fixas: gera 3 dias antes, uma vez só; atraso no dia seguinte ao vencimento; cancela no dia N; a pendente cancelada avisa os dois; a do balcão, a do Asaas e a da Stripe não são tocadas.

### Task 6 (PR 6): Os dados das telas e o "Recebi"
- **Action:**
  - `AssinaturaNaConta.linkParaPagar` (o link aberto da assinatura, ou null) e `AssinaturaDoPainel.linkDoCiclo` (`{ url, vencimento } | null`).
  - A vitrine segue com `pagamento: { provedor, pedeCpf }`, e a web sabe pela `provedores.ts` que a InfinitePay não renova sozinha.
  - O "Recebi" (decisão 10) na assinatura da InfinitePay: o mesmo do balcão, e o link aberto fica `fechado`.
  - api-client e dublê.
- **Validate**: `assinantes.test.ts`, `clientes-me.test.ts`, `planos-publicos.test.ts`, os testes do api-client.

### Task 7 (PR 7): As telas
- **Action:**
  - **Pagamentos online:**
    - pílula "InfinitePay", ao lado de Asaas e Stripe;
    - campos "InfiniteTag" e "Chave de API (`inchk_`)";
    - guia em 3 passos: ligar o checkout integrado, criar a chave, colar aqui;
    - quadro **"Como funciona na InfinitePay"**: sem renovação automática; link 3 dias antes de cada vencimento, por e-mail, com o botão do WhatsApp no painel; Em atraso depois do vencimento; cancelada depois de N dias;
    - com a conta conectada, o campo "Cancelar depois de [10] dias sem pagamento".
  - **Vitrine:** "Pix ou cartão, na página da InfinitePay. Não renova sozinho: a cada ciclo chega um link por e-mail e WhatsApp."
  - **Minha conta:** "Pagar" com o `linkParaPagar` e a mesma frase. Página de volta do `redirect_url` ("Pagamento recebido" / "Ainda não confirmamos o pagamento: confira em alguns minutos").
  - **Painel:** na assinatura com `linkDoCiclo`, "Mandar pelo WhatsApp" (`linkDoZap` + texto com o link). Cadastro do plano avisa o mínimo de R$ 1,00.
- **Mirror**: `PagamentosOnline.tsx` (pílulas e guia do #242); regra das telas horizontais e sem blocos; texto sem gênero.
- **Validate**: `pagamentos-online.test.tsx`, `planos-da-barbearia.test.tsx`, `minhas-assinaturas.test.tsx`, os do painel tocados + `tsc` + lint da web; telas em 375 e 1440.

### Task 8 (PR 8): Termos, privacidade, novidades, ADR
- **Action**: Termos e Privacidade com a InfinitePay (o que vai: nome, e-mail, celular, sem CPF; o e-mail do link sai pelo BarChop); vigência nova em `controlador.ts`; novidade "Planos pela InfinitePay"; ADR-0013; `docs/screens.md`.
- **Mirror**: o PR 7 da Stripe (#243).
- **Validate**: `legal.test.tsx` + lint.

### Task 9: Deploy (o dono)
- Migração antes da API (colunas anuláveis e tabela nova, compatível com a API antiga); API antes da web. A repetição diária é registrada no primeiro start.

### Task 10: Sem teste ponta a ponta (decisão do dono em 31/10/2026)
- Não há sandbox, e o dono decidiu não testar com dinheiro de verdade. O primeiro uso real fica por conta da primeira conta conectada.
- Depois do deploy, eu confiro por curl só o que não move dinheiro: `/health`, a rota `/webhooks/infinitepay/<id>` respondendo 200 a uma conexão desconhecida e o código publicado da web com as telas novas.

## Validation
```bash
pnpm --filter api test tests/lib/provedor-infinitepay.test.ts tests/lib/fila.test.ts \
  tests/routers/webhook-infinitepay-planos.test.ts tests/routers/ciclos-por-link.test.ts \
  tests/routers/pagamentos-online.test.ts tests/routers/assinar-online.test.ts \
  tests/routers/webhook-asaas.test.ts tests/routers/webhook-stripe-planos.test.ts \
  tests/routers/cancelar-no-provedor.test.ts tests/routers/assinantes.test.ts tests/banco-planos.test.ts
pnpm --filter web test tests/telas/painel/pagamentos-online.test.tsx tests/telas/planos-da-barbearia.test.tsx
pnpm -r exec tsc --noEmit
pnpm lint
```
(Só os testes tocados, regra do projeto. Os nomes exatos são conferidos no `package.json` no PR 1.)

## Risks
| Risk | Likelihood | Mitigation |
|---|---|---|
| Aviso falso ativando um ciclo (sem assinatura) | Média | Só o `payment_check` ativa; `order_nsu` nosso e aberto; `amount` igual ao link |
| Pagamento que o BarChop nunca vê (aviso perdido, cliente não volta pela página, sem busca por `order_nsu`) | Média | Três caminhos (decisão 9) + "Recebi" (decisão 10) |
| Resposta do criar link não documentada; `conferirChave` pelo `payment_check` sem garantia | Alta | Conector tolerante e log dos nomes dos campos (decisão 16); a primeira conta real mostra a forma, e o ajuste vem num PR pequeno |
| Link pago depois de a assinatura ser cancelada (a API não cancela link) | Média | `valid_until` = vencimento + N; o sino pede o estorno no app (decisão 11) |
| Sem teste ponta a ponta: o primeiro cliente real é o teste | Certa | Decisão do dono; testes com o provedor de memória e respostas da documentação; logs do conector |
| A varredura não rodar (fila parada) e ninguém receber link | Baixa | Repetição do pg-boss registrada no start; log por execução; o painel mostra "sem link do ciclo" na assinatura que já devia ter |
| Juros repassados (`paid_amount > amount`) virando divergência no Caixa | Média | Entra o `amount` (o preço do plano), como o PRD pede (0 divergência pagamento × Caixa × acerto) |
| E-mail do link na caixa de spam | Média | Botão do WhatsApp no painel; "Pagar" na Minha conta |
| Mexer no `Provedor` quebrar Asaas ou Stripe em produção | Baixa | PR 1 só de refatoração, com os testes de hoje sem mudar as expectativas |

## Acceptance
- [ ] Quem vende conecta a InfinitePay (tag + chave), vê como funciona sem recorrência, escolhe os dias para cancelar e desconecta (sem assinatura viva)
- [ ] O cliente vê na vitrine que não renova sozinho, assina, paga o link (Pix ou cartão) e a assinatura fica Ativa
- [ ] A mensalidade entra uma vez no Caixa (linha Online) e o acerto bate; a primeira avisa "Nova assinatura"
- [ ] 3 dias antes do vencimento, o link sai por e-mail e aparece no painel com o botão do WhatsApp e na Minha conta
- [ ] Sem pagamento: Em atraso no dia seguinte ao vencimento, link reenviado, cancelada no dia N
- [ ] Pago atrasado recomeça o ciclo no dia pago; pago adiantado entra no ciclo seguinte
- [ ] Asaas e Stripe seguem iguais (testes de hoje verdes)
- [ ] Rotas novas conferidas por curl depois do deploy (sem dinheiro)
