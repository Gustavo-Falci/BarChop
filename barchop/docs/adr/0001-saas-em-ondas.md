# ADR-0001: BarChop é um SaaS multi-tenant, construído em ondas

**Date**: 2026-10-02
**Status**: accepted
**Deciders**: Gustavo Falci (dono do produto), Claude

## Context

O BarChop nasceu como agenda para uma barbearia, a GR Barber, que agora
é o primeiro cliente e não o produto. A referência de mercado, o
Barbeiro.app, tem 13 módulos construídos ao longo de 2 anos. Tentar
copiar tudo de uma vez adiaria o piloto indefinidamente. O modelo de
dados já é multi-tenant (`barbeariaId` em toda tabela), então a virada
é de produto, não de arquitetura.

## Decision

O BarChop é um SaaS para barbearias, entregue em ondas com resultado de
negócio cada uma: 0 casa arrumada, 1 agenda que funciona (MVP + piloto),
2 dinheiro, 3 retenção do cliente final, 4 crescimento, 5 diferenciais,
e o site de marketing em paralelo à Onda 1. A stack atual fica. As ondas
e as métricas de sucesso vivem em `.claude/prds/barchop-saas.prd.md`.

## Alternatives Considered

### Alternativa 1: Reescrever na stack sugerida pela referência (Supabase, Drizzle, shadcn)
- **Pros**: igual à referência; Supabase traz auth e cron prontos.
- **Cons**: joga fora API, testes (mais de 800) e telas que funcionam.
- **Why not**: a stack atual cobre o mesmo papel; reescrever não compra nada que o piloto precise.

### Alternativa 2: Continuar como produto de uma barbearia só
- **Pros**: menos escopo.
- **Cons**: não vira negócio; cada barbearia nova seria um fork.
- **Why not**: o objetivo declarado é vender o produto.

## Consequences

### Positive
- Cada onda tem critério de pronto verificável e cabe num plano do `ecc:plan`.
- O piloto começa depois da Onda 1, sem esperar caixa, assinatura ou loja.

### Negative
- Recursos que o concorrente já tem (pagamento online, clube) chegam tarde.

### Risks
- Escopo crescer em direção aos 13 módulos. Mitigação: não abrir onda nova antes de o piloto rodar a Onda 1.
