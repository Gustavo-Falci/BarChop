# ADR-0005: Asaas como gateway de pagamento

**Date**: 2026-10-02
**Status**: accepted
**Deciders**: Gustavo Falci (dono do produto), Claude

## Context

Dois fluxos de dinheiro chegam nas Ondas 2 e 3: a cobrança da própria
assinatura do BarChop (recorrente, por profissional) e o pagamento do
cliente final à barbearia (PIX, cartão, sinal). Os dois são no Brasil,
em reais, e o PIX é obrigatório.

## Decision

Usamos o Asaas nos dois fluxos: assinatura recorrente para cobrar o
SaaS, e cobranças e subcontas para o dinheiro das barbearias. A
integração fica atrás de um módulo nosso, para que trocar de gateway não
espalhe mudança pelas rotas.

## Alternatives Considered

### Alternativa 1: Mercado Pago
- **Pros**: marca conhecida pelo cliente final; PIX e cartão.
- **Cons**: assinatura recorrente e split menos diretos.
- **Why not**: fica como segunda opção se o Asaas não atender o split.

### Alternativa 2: Stripe
- **Pros**: a melhor API e documentação; Billing completo.
- **Cons**: PIX e boleto no Brasil mais limitados; taxas pensadas para fora.
- **Why not**: o público é 100% brasileiro e paga em PIX.

## Consequences

### Positive
- Um fornecedor só para PIX, boleto, cartão e recorrência.

### Negative
- Dependência de um gateway nacional menor que Stripe e Mercado Pago.

### Risks
- Condições comerciais mudarem. Mitigação: o módulo de pagamento isolado permite trocar.
