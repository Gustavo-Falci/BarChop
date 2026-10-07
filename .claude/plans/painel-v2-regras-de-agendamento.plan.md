# Plan: Painel v2 — marco 3, Regras de agendamento

**Source PRD**: `.claude/prds/painel-v2.prd.md`
**Selected Milestone**: 3 — Regras de agendamento (inclui pausa do almoço e exceções por dia, movidas do marco 2)
**Complexity**: Large

## Summary

O dono passa a decidir como o cliente marca pelo link: grade dos horários, antecedência mínima, mesmo dia, até quando a agenda abre, se o serviço precisa caber antes de fechar e até quando o cliente remarca e cancela. Junto, cada profissional ganha uma pausa por dia na jornada, e a barbearia ganha exceções por data (feriado, horário especial). Todos os padrões reproduzem o comportamento de hoje: nenhuma barbearia muda de disponibilidade sem o dono decidir.

## Decisões do dono (2026-10-07)

- **"Intervalo entre horários" = grade de início** (15, 30 ou 60 min; hoje fixo em 15). Não é folga entre atendimentos.
- **Regras valem só no link do cliente** (`origem = cliente`). O painel continua livre pra encaixar. Pausa e exceções valem pros dois: são horário, não regra.
- **Prazo passado**: Remarcar/Cancelar somem e aparece "O prazo pra alterar pelo link acabou. Fale com a barbearia" com o WhatsApp da casa (ou telefone).
- **Pausa do almoço é de cada profissional**, por dia da semana, na jornada dele (`JornadaProfissional`), em qualquer modo (acompanha a barbearia ou horário próprio). Folga não tem pausa.

**Suposição (confirmar no review):** exceções por dia são da **barbearia** (fecha a casa num feriado ou muda o horário de uma data). Exceção de uma pessoa continua sendo Bloqueio, como hoje.

## Padrões que reproduzem hoje

| Regra | Coluna | Opções | Padrão (= hoje) |
|---|---|---|---|
| Grade de início | `intervalo_minutos` | 15, 30, 60 | 15 |
| Antecedência mínima | `antecedencia_minutos` | 0, 30, 60, 120, 240, 1440 | 0 (só depois de agora) |
| Marcar no mesmo dia | `aceita_mesmo_dia` | sim/não | sim |
| Até quando a agenda abre | `janela_dias` | 7, 14, 30, 60, 90, sem limite (null) | sem limite |
| Serviço cabe antes de fechar | `cabe_antes_de_fechar` | sim/não | sim |
| Cliente remarca até | `prazo_remarcar_horas` | 0 (até começar), 1, 2, 6, 12, 24, 48 | 0 |
| Cliente cancela até | `prazo_cancelar_horas` | idem | 0 |

Listas fechadas em `@barchop/formato` (como `pagina.ts`), CHECK na migration com os mesmos valores.

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| Cálculo de horários | `apps/api/src/lib/disponibilidade.ts:178` (`horariosDoProfissionalNoDia`), `:237` (`agendaDoPeriodo`) | Toda regra entra nos **três** caminhos (dia, período, escolha do POST): "o horário que a tela oferece tem que ser o que o POST aceita" |
| Bloqueio como ocupado | `disponibilidade.ts:80` (`aplicarBloqueios`) | Faixa de horas vira intervalo ocupado — a pausa entra do mesmo jeito, sem mexer na janela |
| Relógio | `disponibilidade.ts:324` (`descartarPassados`), `lib/agendamento-alteravel.ts` | `agora` de fora, comparação de strings "YYYY-MM-DD"/"HH:mm", nunca Date com fuso |
| Guardas de alteração | `lib/agendamento-alteravel.ts:8` (`garantirAlteravel`) | Uma porta só pra cancelar e remarcar; o prazo entra aqui, só nos caminhos do cliente |
| Listas fechadas | `packages/formato/src/pagina.ts` + migration `20261004160000_pagina_da_barbearia` | Valores no formato, CHECK no banco com os mesmos |
| Áreas | `packages/formato/src/areas.ts` | `AREAS_DE_CONFIGURACAO` + `AREA_DO_CAMPO`; a API marca no salvar |
| Jornada | `apps/api/src/routers/equipe.ts:331-346`, `apps/web/src/telas/painel/JornadaDoMembro.tsx` | GET/PUT da semana inteira; CHECK de horas por modo |
| Erros | `lib/erro-negocio.ts` | `ErroDeNegocio(mensagem, codigo)` com código próprio por recusa |
| Testes | `apps/api/tests/*.test.ts` (Vitest, banco de teste real), `packages/scheduling/tests/calcular-horarios.test.ts`, `packages/api-client/tests/*`, `apps/web/tests/*` | TDD: commit RED, depois GREEN |

## PRs (um por item, TDD)

### 3a — Pausa na jornada (API + api-client + dublê) — **feito (#60)**; pausa mandada na folga é descartada (não 400), como as horas
- Migration `jornada_pausa`: `pausa_inicio`, `pausa_fim` (TIME, nulas) em `jornada_profissional`; CHECK as duas ou nenhuma, início < fim, e nula na folga.
- `GET/PUT /equipe/:id/jornada` com `pausaInicio`/`pausaFim`; 422 pausa fora da janela do dia não é erro (só não tem efeito) — **decidir na implementação**, o padrão é aceitar e recortar.
- Disponibilidade: a pausa do membro vira intervalo ocupado em `contextoDoDia`/`agendaDoPeriodo` (os três caminhos). Vale pra cliente e painel.
- Tipos (`DiaDaJornada`), api-client e dublê.
- **Testes**: horário que cruza a pausa some do dia, do mês e dos próximos horários; POST no meio da pausa recusa; folga com pausa = 400.

### 3b — Pausa nas telas — **feito (#61)**; a pausa se edita só na jornada (Horários mostra e leva até lá, inclusive o dono)
- `JornadaDoMembro`: pausa opcional por dia (início/fim), com atalho "mesma pausa em todos os dias".
- Configurações › Horários: seção "Pausas da equipe" — cada membro que atende com o resumo ("12:00–13:00, seg a sex") e "Editar →" pra jornada dele. Dono que trabalha sozinho edita ali mesmo (é a jornada dele).

### 3c — Exceções por dia (API) — **feito (#62)**; o dublê não recusa data passada (sem relógio)
- Tabela `excecao_horario` (`barbearia_id`, `data`, `fechado`, `hora_abertura`, `hora_fechamento`, `motivo`; único por barbearia+data; CHECK horas ↔ fechado).
- `GET /horarios/excecoes` (de hoje em diante), `PUT /horarios/excecoes/:data`, `DELETE /horarios/excecoes/:data` — só dono; marca a área `horarios`.
- Disponibilidade: a exceção da data substitui a linha do dia da semana antes do `janelaEfetiva` (três caminhos). Agendamentos já marcados na data **não** são mexidos; o PUT devolve quantos ficam fora do novo horário, pra tela avisar.
- api-client e dublê.

### 3d — Exceções na tela de Horários — **feito (#63)**; seção "Datas especiais"; Aviso ganhou o tom atencao
- Lista das próximas exceções; "Adicionar data": data, "Fechado o dia todo" ou horário; aviso com os agendamentos que ficam fora.

### 3e — Regras (API) — **feito (este PR)**. Diferenças do previsto:
- A área `regras_de_agendamento` (N passa a 5) **foi pro 3f**: somá-la já quebrava o índice da web (`AREAS` + `switch` exaustivo). No 3e o PATCH grava as regras sem marcar área.
- Painel mandar o token na disponibilidade (api-client + `NovoAgendamento`) **foi pro 3f**: a API já desliga as regras com token de membro (`ehMembroDaBarbearia`, nunca 401); ninguém muda regra antes da tela.
- "Painel nunca vê menos que o cliente": painel usa grade 15 (contém 30/60) e o `cabeAntesDeFechar` da barbearia.
- Limites: o minuto atual nunca serve; antecedência e prazo no limite exato ainda servem. Conta pura em `@barchop/formato/regras` (`regraQueRecusa`, `prazoDoClientePassou`) pra o 3g reaproveitar na tela.
- Regras entram em `BarbeariaSerializada` (painel e página pública), campos planos como no PATCH.
- Migration `20261009120000_regras_de_agendamento` (rodar `migrate deploy` nos 2 bancos).
- Migration `regras_de_agendamento` com as colunas da tabela acima (padrões = hoje) e CHECKs.
- `@barchop/formato/regras.ts`: listas e padrões; área nova `regras_de_agendamento` em `AREAS_DE_CONFIGURACAO` (N passa a 5) e os campos em `AREA_DO_CAMPO`.
- `PATCH /barbearias/me` aceita os campos; `GET /barbearias/me` e o perfil público devolvem as regras (a tela do cliente precisa dos prazos).
- `@barchop/scheduling`: `intervaloMinutos` já existe; parâmetro novo pra deixar começar antes de fechar mesmo terminando depois.
- Um filtro só do cliente por cima do `descartarPassados` (antecedência, mesmo dia, janela) usado no dia, no mês e nos próximos horários (que respeitam `min(14, janela_dias)`).
- POST do cliente (`garantirFuturo` vira a guarda das regras) e remarcar do cliente (`clientes-me`, `lembretes`): códigos `fora_da_antecedencia`, `fora_da_janela`, `mesmo_dia_fechado`, `prazo_de_remarcar`, `prazo_de_cancelar`. O caminho do painel (`routers/agendamentos.ts`) não passa por elas.
- **Painel livre**: as rotas de disponibilidade são públicas e o Novo agendamento do painel usa as mesmas. Com token válido de membro da barbearia, a resposta sai sem as regras do cliente; sem token, com. Mostrar a mais não abre brecha: o POST do cliente aplica as regras de novo.
- **Testes**: cada regra no dia, no mês, nos próximos e no POST; padrões = resultado de hoje (rodar a suíte de disponibilidade inteira sem mudar nenhum teste antigo); prazo de remarcar/cancelar no cliente e não no painel.

### 3f — Tela Regras de agendamento — **feito (este PR)**: rota `/painel/configuracoes/regras-de-agendamento`, dois salvar (como o cliente marca / prazos), frase de efeito por escolha; área entre Horários e Dados do negócio; `disponibilidadeDoDia/Mes(slug, filtro, { comToken: true })` no Novo agendamento
- Inclui o que saiu do 3e: área `regras_de_agendamento` em `AREAS_DE_CONFIGURACAO`/`AREA_DO_CAMPO`/tipo/`AREAS` da web, e o `NovoAgendamento` do painel pedindo a disponibilidade com token (`comToken`).
- 5ª área do índice (Operação, depois de Horários): pílulas pra cada regra, frase "Resultado: …" com o efeito pro cliente; "X de 5 decididas". Barbearias existentes passam a ver "4 de 5" com a consequência "Vale o padrão: …".

### 3g — Cliente obedece os prazos — **próximo**
- Telas do cliente (meus agendamentos, página do lembrete): sem Remarcar/Cancelar depois do prazo, com o aviso e o WhatsApp/telefone da casa; mensagens dos códigos novos no fluxo de agendar.

**Fora deste marco:** prévia "o que o cliente vê" nos Horários (TBD no PRD), sombra da pausa na agenda (marco 6).

## Validation

```bash
# por PR, só o afetado
pnpm --filter @barchop/scheduling test
pnpm --filter @barchop/api exec vitest run tests/<arquivos afetados>
pnpm --filter @barchop/api-client test
pnpm --filter @barchop/web exec vitest run tests/<afetados>
(cd apps/api && npx tsc --noEmit); (cd apps/web && npx tsc --noEmit)
pnpm lint
# migrations: migrate deploy nos bancos dev e test
# telas: navegador em 375px e 1440px (aprovação visual do dono)
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Regra nova mudar a disponibilidade de quem já agenda | M | Padrões = hoje; suíte antiga de disponibilidade passa sem mudança no 3a, 3c e 3e |
| Regra aplicada num caminho e não no outro (tela oferece, POST recusa) | M | Toda regra nos três caminhos; teste por caminho |
| Painel herdar regra do cliente pela rota pública | M | Token do membro desliga as regras; teste das duas formas |
| Exceção fechando dia com agendamentos marcados | M | Não mexe nos marcados; a tela mostra quantos ficam fora |
| Fuso em antecedência/prazo | M | Só `agoraNaBarbearia()` e strings; aritmética de minutos num helper testado em `lib/horas.ts` |
| Escopo grande (7 PRs) atrasar o G3 | H | PRs independentes; G3 pode entrar entre eles |

## Acceptance

- [ ] 3a–3g mergeados, um PR cada, RED antes do GREEN
- [ ] Barbearia sem nada decidido agenda exatamente como antes
- [ ] O que a tela oferece é o que o POST aceita, em todas as regras
- [ ] Telas aprovadas pelo dono em 375px e 1440px
