# ADR-0009: Lembrete por e-mail primeiro, WhatsApp oficial atrás de flag

**Date**: 2026-10-04
**Status**: accepted
**Deciders**: Gustavo Falci (dono do produto), Claude

## Context

A ADR-0004 escolheu a Cloud API oficial da Meta para o WhatsApp, mas a
verificação do negócio e a aprovação dos modelos levam semanas, e o dono
pôs a Meta em standby em 2026-10-03. A Onda 1 precisa do lembrete com
confirmar/cancelar rodando no piloto da GR Barber sem esperar a Meta.
A Meta só entrega mensagem iniciada pela empresa com modelo aprovado:
texto livre é aceito pela API e descartado na entrega.

## Decision

O lembrete automático sai por e-mail (Resend), com link assinado de
confirmar ou cancelar. O painel ganha "Lembrar pelo WhatsApp", que abre
o `wa.me` com o mesmo texto e link — envio manual, zero aprovação. O
canal da Cloud API existe (`apps/api/src/lib/canal-whatsapp.ts`), só
envia `Mensagem.modelo` e fica atrás de `WHATSAPP_ATIVO`, desligada; ligada,
ele cuida dos telefones e o e-mail continua cuidando dos endereços.

## Alternatives Considered

### Alternativa 1: Esperar a Meta para lançar o lembrete
- **Pros**: um canal só, onde o cliente já conversa com a barbearia.
- **Cons**: o piloto fica sem lembrete por semanas, sem prazo garantido.
- **Why not**: o lembrete é o que a Onda 1 entrega; a métrica de faltas não anda sem ele.

### Alternativa 2: Mandar texto livre pela Cloud API
- **Pros**: sem cadastrar modelos.
- **Cons**: a Meta descarta na entrega toda mensagem iniciada pela empresa sem modelo.
- **Why not**: o cliente nunca receberia, e nada avisaria.

### Alternativa 3: Biblioteca não oficial de WhatsApp
- **Why not**: a mesma da ADR-0004 — número banido derruba o lembrete de todas as barbearias.

## Consequences

### Positive
- O piloto tem lembrete com confirmar/cancelar sem depender da Meta.
- Ligar o WhatsApp é configuração (`WHATSAPP_ATIVO=true`, `WHATSAPP_TOKEN`, `WHATSAPP_NUMERO_ID`), não reescrita: as rotas falam com `CanalDeMensagem`.

### Negative
- Cliente só com telefone (sem e-mail) não recebe lembrete automático; depende do barbeiro tocar em "Lembrar pelo WhatsApp".
- O e-mail digitado na página pública não é verificado (fica só no agendamento, nunca no cadastro).

### Risks
- **Ligar a flag antes da hora.** Com `WHATSAPP_ATIVO=true`, toda mensagem pra telefone sem `modelo` falha no envio — hoje nenhum chamador passa `modelo`. Antes de ligar: cadastrar e aprovar os modelos (código de acesso e lembrete), fazer o código do cliente e o lembrete montarem `modelo` com os nomes e a ordem dos parâmetros aprovados, e mandar o lembrete por WhatsApp a quem não tem e-mail.
- **Versão da Graph API.** O canal usa `v21.0` por padrão; confirmar a versão vigente ao ligar (`WHATSAPP_VERSAO_API`).
