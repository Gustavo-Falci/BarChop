# ADR-0013: InfinitePay nos planos que a barbearia vende

**Date**: 2026-10-31
**Status**: accepted
**Deciders**: Gustavo Falci (dono do produto), Claude

## Context

Quem vende plano de assinatura recebe online conectando a própria conta
do Asaas ou da Stripe (ADR-0012). Quem recebe por outra plataforma
teria de abrir uma dessas contas só para vender planos pelo BarChop. O
dono decidiu (30/10/2026) oferecer a InfinitePay também, com uma
plataforma por vendedor (PRD `pagamentos-online-stripe-infinitepay`,
marco 2).

A InfinitePay não tem assinatura recorrente nem sandbox. A API do
checkout tem só dois pedidos: criar um link de pagamento e conferir um
pagamento (`payment_check`). Não busca link por pedido, não cancela nem
estorna (documentação conferida em 31/10/2026).

## Decision

A InfinitePay entra como terceiro provedor dos pagamentos online, atrás
da mesma interface (`apps/api/src/lib/provedores`), mas com outro tipo
de cobrança: **por link**, e não por assinatura. O BarChop é quem toca
o ciclo:

- quem vende **cola a chave `inchk_` e a InfiniteTag** da conta. A chave
  fica cifrada; a tag, em texto, porque o `payment_check` pede a tag e
  não há como descobri-la pela chave;
- a cada ciclo, uma **varredura diária** (pg-boss, 08:00 de São Paulo)
  cria um link de pagamento único **3 dias antes do vencimento** e o
  manda ao cliente por e-mail. A Minha conta mostra o link, e o painel
  tem o botão de mandar o mesmo link pelo WhatsApp;
- sem pagamento no vencimento, a assinatura fica **Em atraso** e o link
  é reenviado. Passados os **dias para cancelar** que quem vende escolhe
  (de 3 a 30, padrão 10), ela é cancelada, com aviso a quem vende e ao
  cliente;
- o pagamento é confirmado sempre pelo `payment_check` (nunca só pelo
  aviso), por três caminhos que fazem a mesma coisa: o aviso da
  InfinitePay, a volta do cliente pela página e a varredura. Entra no
  Caixa o valor do link, e a mesma transação entra uma vez só;
- o **"Recebi" do painel** vale na assinatura da InfinitePay, para o
  pagamento que o BarChop não viu;
- pago numa assinatura cancelada ou num link já fechado: não entra no
  Caixa, e o sino pede o estorno no app da InfinitePay;
- **sem modo de teste:** toda chave é de produção, e com
  `PAGAMENTOS_ONLINE_MODO=teste` a tela recusa a InfinitePay. O mínimo
  da InfinitePay é R$ 1,00, e o plano abaixo disso fica sem o online.

## Alternatives Considered

### Alternativa 1: esperar uma API de assinatura da InfinitePay
- **Pros**: o ciclo ficaria com a InfinitePay, como no Asaas e na Stripe.
- **Cons**: não existe hoje, e não há data.
- **Why not**: a decisão de produto é ter a InfinitePay agora.

### Alternativa 2: o vendedor cria o link à mão a cada ciclo
- **Pros**: nada a fazer no BarChop.
- **Cons**: o BarChop não saberia do pagamento, e o plano não valeria
  sozinho nos atendimentos nem entraria no Caixa.
- **Why not**: tira o que o BarChop oferece nos planos.

## Consequences

### Positive
- Quem já recebe pela InfinitePay vende planos sem abrir conta nova, e
  o cliente paga no Pix ou no cartão.
- O Caixa, o acerto e o sino seguem pelo mesmo caminho dos outros
  provedores (`registrarPagamento`).

### Negative
- **Não renova sozinho:** o cliente precisa pagar um link por ciclo, e a
  vitrine e a Minha conta avisam isso.
- **Sem teste ponta a ponta:** sem sandbox, e o dono decidiu não testar
  com dinheiro de verdade. As respostas dos testes do conector foram
  montadas a partir da documentação.
- Estorno, só no app da InfinitePay. O estorno feito lá não chega ao
  BarChop, e quem vende acerta o Caixa à mão.

### Risks
- **A documentação não fecha a resposta do criar link:** o conector lê a
  URL de três nomes possíveis e registra no log os nomes dos campos (sem
  valores). A primeira conta real mostra a forma, e o ajuste vem num PR
  pequeno.
- **Pagamento que o BarChop nunca vê** (o aviso se perde e o cliente não
  volta pela página): o "Recebi" do painel cobre.
- **A varredura não rodar:** a repetição do pg-boss é registrada no
  start, e cada execução fica no log.
- **Chave vazada.** Mitigação: a mesma das outras chaves (cifrada, nunca
  volta para a tela, apagada ao desconectar).
