# ADR-0008: Fluxo de desenvolvimento com o plugin ECC

**Date**: 2026-10-02
**Status**: accepted
**Deciders**: Gustavo Falci (dono do produto), Claude

## Context

Até 2026-10-01 o trabalho seguia o fluxo do plugin superpowers: specs em
`docs/superpowers/specs/` e planos em `docs/superpowers/plans/`. Em
2026-10-01 o plugin ECC foi instalado, e o dono do produto pediu que todo
o desenvolvimento passe a usar as skills dele.

## Decision

Requisitos viram PRD com `ecc:plan-prd` (`.claude/prds/`), cada marco
vira plano com `ecc:plan` (`.claude/plans/`), a implementação segue o
`ecc:tdd-workflow` (commit RED, depois GREEN), a revisão usa
`ecc:code-review`, e as decisões de arquitetura viram ADR aqui em
`docs/adr/`. `docs/superpowers/` fica como histórico e não recebe
arquivos novos.

## Alternatives Considered

### Alternativa 1: Continuar com o superpowers
- **Pros**: os 15 documentos existentes seguem o mesmo formato.
- **Cons**: dois plugins de fluxo competindo pelo mesmo papel.
- **Why not**: decisão do dono do produto.

## Consequences

### Positive
- Um fluxo só, do PRD ao commit, com o estado de cada marco na tabela do PRD.

### Negative
- O histórico de planejamento fica dividido entre `docs/superpowers/` (até 2026-09) e `.claude/` (a partir de 2026-10).

### Risks
- Nenhum relevante.
