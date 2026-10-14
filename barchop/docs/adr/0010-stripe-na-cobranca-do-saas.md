# ADR-0010: Stripe na cobrança da assinatura do BarChop

**Date**: 2026-10-14
**Status**: accepted
**Deciders**: Gustavo Falci (dono do produto), Claude

## Context

O marco 1 da Onda 2 é o BarChop cobrar a assinatura das barbearias:
recorrente, por profissional, mensal ou anual. A ADR-0005 escolheu o
Asaas, mas nenhum provedor nacional abre conta sem CNPJ, e o BarChop
ainda não tem um. A Stripe aceita conta de pessoa física (CPF) no Brasil
e traz Checkout, Portal do cliente, preço graduado e webhook prontos.

## Decision

A assinatura do BarChop é cobrada pela Stripe, numa conta de pessoa
física (CPF), com o pagamento todo nas páginas da Stripe (Checkout e
Portal do cliente): o BarChop não guarda cartão. A situação chega pelo
webhook. Os preços são graduados (1ª unidade = base, demais = extra) e
lidos de `@barchop/formato` (`planos.ts`). Esta ADR substitui a ADR-0005
só na cobrança do SaaS; o provedor do dinheiro da barbearia (marco 3)
segue em aberto.

## Alternatives Considered

### Alternativa 1: Asaas (ADR-0005)
- **Pros**: Pix, boleto e cartão recorrente; nacional.
- **Cons**: exige CNPJ para abrir a conta.
- **Why not**: o BarChop não tem CNPJ, e o marco 1 travaria esperando.

### Alternativa 2: Mercado Pago
- **Pros**: marca conhecida; Pix e cartão.
- **Cons**: assinatura por quantidade e portal do cliente menos prontos.
- **Why not**: mais código nosso para o mesmo resultado.

## Consequences

### Positive
- O marco 1 anda sem CNPJ.
- Checkout e Portal prontos: trocar cartão, ver faturas e cancelar sem tela nossa.
- O preço graduado da Stripe é a mesma conta de `precoDoPlano` (base + extra por profissional a mais).

### Negative
- **Só cartão por enquanto.** Na conta (14/10/2026), o Pix aparece habilitado, mas com "Pagamentos recorrentes: Não"; o Checkout de assinatura só mostra formas recorrentes. Se a Stripe liberar o Pix Automático, ele entra pelo Dashboard, sem mudar código.
- Taxas da Stripe pensadas para fora do Brasil.

### Risks
- **Conta PF não vira PJ** sem abrir conta nova (relato de fórum). Mitigação: assinaturas ligadas por `stripe_customer_id`; mudar de conta = migrar os clientes.
- **Preço na Stripe divergir de `planos.ts`.** Mitigação: o script que cria os preços lê o módulo, por `lookup_key`.
- **Webhook perdido ou fora de ordem.** Mitigação: evento idempotente e a assinatura relida na Stripe ao processar.

## Nota sobre a ADR-0007

A ADR-0007 pôs os planos em `packages/config`. Esse pacote ficou só com
tooling, então o módulo mora em `@barchop/formato` (`src/planos.ts`), ao
lado das outras listas fechadas que API e web compartilham.
