# ADR-0003: Fila de jobs com pg-boss

**Date**: 2026-10-02
**Status**: accepted
**Deciders**: Gustavo Falci (dono do produto), Claude

## Context

Os lembretes (de 30 minutos a 24 horas antes) são a primeira coisa do
BarChop que roda fora de uma requisição: precisam de agendamento,
retentativa e cancelamento quando o horário muda. O deploy é uma VM só
na Oracle OCI, com o Postgres que a API já usa.

## Decision

Usamos o pg-boss, uma fila de jobs que guarda o estado em tabelas do
próprio Postgres. O worker roda junto da API.

## Alternatives Considered

### Alternativa 1: BullMQ + Redis
- **Pros**: o mais usado no ecossistema Node; rápido.
- **Cons**: mais um serviço para operar, monitorar e fazer backup na VM.
- **Why not**: o volume de lembretes de uma barbearia não justifica Redis.

### Alternativa 2: Inngest ou outro serviço gerenciado
- **Pros**: nada para operar; painel pronto.
- **Cons**: dependência externa e custo por evento; dados saem da VM.
- **Why not**: a stack é auto-hospedada na OCI.

### Alternativa 3: cron varrendo a tabela de agendamentos
- **Pros**: o mais simples.
- **Cons**: retentativa e garantia de "envia uma vez só" escritas à mão.
- **Why not**: reinventa o que a fila já resolve.

## Consequences

### Positive
- Job e agendamento podem ser gravados na mesma transação.
- Nenhum serviço novo na infra.

### Negative
- Carga de fila divide o Postgres com a aplicação.

### Risks
- Crescer além do que o Postgres aguenta como fila. Mitigação: a interface da fila fica atrás de um módulo nosso, e trocar para BullMQ vira troca de implementação.
