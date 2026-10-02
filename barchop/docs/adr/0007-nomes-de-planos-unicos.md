# ADR-0007: Planos definidos num lugar só

**Date**: 2026-10-02
**Status**: accepted
**Deciders**: Gustavo Falci (dono do produto), Claude

## Context

Os planos aparecem no site (preços), no painel (assinatura atual,
upgrade), na API (limites: profissionais, agendamentos por mês,
serviços) e na cobrança. A referência mostra o custo de não centralizar:
a home chama o plano de topo de "WhatsApp" a R$ 99,90 e outras páginas
falam em "Enterprise" a R$ 119,90.

## Decision

Nome, preço base, preço por profissional extra, desconto anual e limites
de cada plano são definidos uma vez em `packages/config`. Site, painel e
API leem desse mesmo módulo; nenhum deles escreve um preço ou um limite à
mão.

## Alternatives Considered

### Alternativa 1: Planos numa tabela do banco
- **Pros**: mudar preço sem deploy.
- **Cons**: o site estático teria que consultar a API no build; mais um CRUD administrativo.
- **Why not**: preço muda raramente; um deploy é aceitável.

### Alternativa 2: Planos só no gateway de pagamento
- **Pros**: fonte única para a cobrança.
- **Cons**: limites de uso não moram no gateway; o site dependeria dele.
- **Why not**: o gateway é detalhe de implementação (ADR-0005).

## Consequences

### Positive
- O site nunca promete o que a API não aplica.

### Negative
- Promoção temporária exige deploy.

### Risks
- Preço do gateway divergir do `packages/config`. Mitigação: a criação da assinatura no gateway lê o mesmo módulo.
