# ADR-0004: WhatsApp pela Cloud API oficial da Meta

**Date**: 2026-10-02
**Status**: accepted
**Deciders**: Gustavo Falci (dono do produto), Claude

## Context

O lembrete automático e o código de acesso do cliente precisam chegar
onde o cliente de barbearia está: o WhatsApp. Hoje os códigos só saem
pelo log (`apps/api/src/lib/canal.ts`), e a API se recusa a subir em
produção sem um provedor real. A referência vende a API oficial como
argumento contra concorrentes que usam bibliotecas não oficiais.

## Decision

O WhatsApp sai pela WhatsApp Business Cloud API oficial da Meta, com
templates aprovados para lembrete e código. O e-mail transacional sai
pelo Resend. Os dois entram como provedores do `lib/canal.ts`. O modo
coexistência (a IA no número do dono) fica para a Onda 5.

## Alternatives Considered

### Alternativa 1: Bibliotecas não oficiais (Baileys, whatsapp-web.js)
- **Pros**: grátis; nenhuma verificação na Meta.
- **Cons**: violam os termos; o número pode ser banido sem aviso.
- **Why not**: um número banido derruba o lembrete de todas as barbearias de uma vez.

### Alternativa 2: Só SMS
- **Pros**: sem templates, sem verificação de negócio.
- **Cons**: custo por mensagem maior; o cliente não responde "Confirmar" por SMS com naturalidade.
- **Why not**: não é onde o cliente conversa com a barbearia.

## Consequences

### Positive
- Número estável e verificado; argumento de venda.
- O cliente confirma ou cancela respondendo à própria mensagem.

### Negative
- Verificação de negócio na Meta (exige CNPJ) e aprovação de templates levam semanas.
- Custo por mensagem da Meta.

### Risks
- A verificação atrasar o piloto. Mitigação: começar já e lançar o lembrete por e-mail primeiro.
