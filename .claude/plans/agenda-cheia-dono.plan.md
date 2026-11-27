# Plan: Aviso de agenda cheia pro dono

**Source PRD**: `.claude/prds/agenda-cheia.prd.md`
**Selected Milestone**: 2 — Aviso pro dono
**Complexity**: Medium

## Summary
Quando um agendamento lota a barbearia, os donos ativos recebem um aviso no sininho e um e-mail. A conta é a mesma `agendaCheia` do marco 1, rodada na fila de trabalhos logo depois de cada mudança de agendamento, e não durante a requisição. Duas colunas novas na barbearia guardam o estado e evitam repetição: desde quando está cheia (a lotação) e o dia do último aviso (no máximo um por dia).

## Decisões
- **Quando avisa**: na hora em que o agendamento que lota é gravado, segundos depois, pela fila (decisão do dono, 27/11). Fecha a 1ª questão em aberto do PRD.
- **O que dispara a conferência**: toda mudança de agendamento que pode encher ou esvaziar a agenda:
  - marcar, pela página pública ou pelo painel;
  - remarcar, pelo painel ou pelo cliente;
  - mudar os serviços (a duração muda);
  - cancelar, pelo painel, pelo cliente ou pelo link do lembrete.

  Vale quem marcou: um encaixe do painel que lota também avisa, porque a regra é o estado da agenda.
- **Lotação**: `agenda_cheia_desde` vazio → cheia grava o instante e avisa. Já preenchido → não avisa de novo. Voltou a ter horário → apaga. Encher de novo é outra lotação.
- **No máximo um por dia**: `agenda_cheia_avisada_em` (data de São Paulo). Encher, vagar e encher de novo no mesmo dia gera um aviso só.
- **Virada do dia**: a janela anda à meia-noite e abre um dia novo. Um trabalho diário às 00:05 confere de novo só as barbearias marcadas como cheias e apaga a marca das que voltaram a ter horário. Ele só apaga, nunca avisa.
- **Quem recebe**: sininho pros donos ativos; e-mail pros donos ativos com e-mail. Recepção e profissionais não recebem (o do profissional é o marco 3).
- **Fica fora deste marco**: a lotação "parada", quando o dono fecha um dia ou cria uma folga sem ninguém marcar. A regra do marco 1 já não chama de cheia uma agenda sem agendamento. Fica registrada como questão em aberto no PRD.
- **Sem chave de deduplicação na fila**: a política do pg-boss é `exclusive` e descartaria a conferência pedida enquanto outra roda, perdendo a lotação. Cada mudança enfileira a sua, e a gravação com `updateMany … where agenda_cheia_desde is null` garante um aviso só.

## Textos
- **Sininho**: título "Agenda cheia"; texto "Todos os horários até 04/12 estão reservados. O dia 05/12 abre amanhã."; link `/painel/configuracoes/horarios`.
- **E-mail**: assunto fixo, sem texto de terceiro (`lib/texto-de-email.ts`): "A agenda da sua barbearia está cheia". Corpo:

  > Olá! Todos os horários que o link de agendamento oferece, até qua., 04/12, estão reservados. A página da barbearia já mostra o aviso de agenda cheia, com o número de vocês pra contato.
  >
  > O dia 05/12 abre amanhã. Pra abrir mais horários antes disso, ajuste os horários ou a janela de agendamento no painel: {URL_DO_PAINEL}/painel/configuracoes/horarios

  Sem `URL_DO_PAINEL`, a frase cita o caminho sem o link, como o `ondePagar` do Pix.

## Patterns to Mirror
| Category | Source | Pattern |
|---|---|---|
| Aviso por trabalho da fila | `apps/api/src/lib/pix-avisos.ts:120-200` | Gravar o estado e o sininho na mesma transação com `updateMany` condicional; e-mail depois do commit, com falha no log |
| Sininho dos donos | `apps/api/src/lib/notificacoes.ts:96` | `notificarDonos`: donos ativos, `createMany` |
| E-mail aos donos | `apps/api/src/lib/pix-avisos.ts:74` | `emailAosDonos`: donos ativos com e-mail, `try/catch` por envio |
| Enfileirar depois do commit | `apps/api/src/lib/lembrete.ts:60-90` | `agendarLembrete` fora da transação, erro no log sem derrubar a rota |
| Registro do trabalho e do cron | `apps/api/src/lib/pix-avisos.ts:207`, `src/server.ts:62` | `fila.trabalhar` + `fila.repetir` no `server.ts` |
| Testes com relógio e fila de memória | `apps/api/tests/lib/pix-avisos.test.ts`, `tests/lib/lembrete.test.ts` | `agora` injetado, `canalDeMemoria`, `filaDeMemoria().pendentes` |
| Conta de cheia | `apps/api/src/lib/agenda-cheia.ts` (marco 1) | Reusar, sem segunda conta |

## Files to Change
| File | Action | Why |
|---|---|---|
| `packages/database/prisma/schema.prisma` | UPDATE | `agendaCheiaDesde` (timestamptz?) e `agendaCheiaAvisadaEm` (date?) na Barbearia |
| `packages/database/prisma/migrations/20261127…_agenda_cheia/migration.sql` | CREATE | As duas colunas, anuláveis, sem backfill |
| `apps/api/src/lib/agenda-cheia-avisos.ts` | CREATE | `conferirAgendaCheia`, `pedirConferenciaDaAgenda`, `limparAgendasQueVagaram`, `registrarAgendaCheia` |
| `apps/api/src/lib/agenda-cheia.ts` | UPDATE | Devolver também o último dia da janela, pros textos (a rota pública continua devolvendo só `{ cheia }`) |
| `apps/api/src/routers/agendamentos.ts` | UPDATE | Pedir a conferência depois de marcar (painel e público), mudar status, remarcar e mudar serviços |
| `apps/api/src/routers/clientes-me.ts` | UPDATE | Depois de cancelar e remarcar |
| `apps/api/src/routers/lembretes.ts` | UPDATE | Depois de cancelar pelo link |
| `apps/api/src/server.ts` | UPDATE | Registrar o trabalho e o cron das 00:05 |
| `apps/api/tests/lib/agenda-cheia-avisos.test.ts` | CREATE | A regra dos avisos |
| `apps/api/tests/routers/*.test.ts` (os das rotas acima) | UPDATE | A conferência entra na fila |

## Tasks
### Task 1: Colunas da lotação
- **Action**: migração com as duas colunas; `prisma generate`; `migrate deploy` no banco de teste.
- **Mirror**: migrações anuláveis recentes (`20261120140000_cpf_cifrado`).
- **Validate**: `prisma migrate status` no banco de teste.

### Task 2: A regra dos avisos (RED → GREEN)
- **Action**: testes primeiro em `tests/lib/agenda-cheia-avisos.test.ts`:
  1. lotou → 1 sininho por dono ativo e 1 e-mail por dono com e-mail, com o último dia e o próximo dia certos;
  2. conferir de novo, ainda cheia → nada novo;
  3. não cheia → nada, e a marca apagada;
  4. janela sem limite → nada;
  5. vagou e lotou no mesmo dia → nada novo;
  6. lotou no dia seguinte → avisa;
  7. recepção, profissional e dono inativo não recebem;
  8. e-mail que falha não desfaz o sininho e vai pro log;
  9. a limpeza das 00:05 apaga a marca de quem vagou e mantém a de quem segue cheia, sem avisar.

  Depois, `agenda-cheia-avisos.ts`.
- **Mirror**: `pix-avisos.ts` (transação + `updateMany` condicional; e-mail depois).
- **Validate**: `vitest run tests/lib/agenda-cheia-avisos.test.ts tests/routers/agenda-cheia.test.ts`.

### Task 3: Ligar nas rotas (RED → GREEN)
- **Action**: nos testes das rotas, conferir que marcar (público e painel), cancelar (painel, cliente e link), remarcar (painel e cliente) e mudar serviços deixam `conferir-agenda-cheia` com o `barbeariaId` em `fila.pendentes`. Depois, a chamada a `pedirConferenciaDaAgenda` em cada rota, depois do commit e ao lado do `agendarLembrete`.
- **Mirror**: `agendarLembrete` (erro no log, rota segue).
- **Validate**: os testes das rotas tocadas.

### Task 4: Registro no servidor
- **Action**: `registrarAgendaCheia(app.fila, { canal, log, urlDoPainel })` no `server.ts`, com o cron `5 0 * * *` no fuso da barbearia.
- **Mirror**: `registrarPixDoBarChop`.
- **Validate**: teste de registro (trabalho e cron), como o do Pix.

### Task 5: Conferência local
- **Action**:
  1. Subir a API de conferência (`scripts/conferencia-visual.ts`, fila de memória ou pg-boss local) e a web.
  2. Lotar a barbearia-teste por um agendamento da página pública.
  3. Ver o aviso no sininho do dono e o e-mail no log do canal.
  4. Cancelar, lotar de novo no mesmo dia e confirmar que não chega um segundo aviso.
- **Validate**: prints do sininho no PR.

## Validation
```bash
pnpm --filter @barchop/database exec prisma migrate deploy   # banco de teste (.env.test)
pnpm --filter @barchop/api exec vitest run tests/lib/agenda-cheia-avisos.test.ts tests/routers/agenda-cheia.test.ts <testes das rotas tocadas>
pnpm --filter @barchop/api exec tsc --noEmit
npx eslint <arquivos tocados>
```

## Risks
| Risk | Likelihood | Mitigation |
|---|---|---|
| Uma conferência por mudança pesa no banco | Baixa (piloto) | A conta é a mesma da home (~0,2 s), fora da requisição, um trabalho por vez |
| Lotação perdida porque a fila descartou o pedido | Baixa | Sem chave de deduplicação; a gravação condicional evita o aviso duplo |
| Aviso duplo numa repetição da fila | Baixa | Marca e sininho na mesma transação, com `updateMany` condicional; o e-mail só sai se a marca foi gravada agora |
| Rota esquecida não pede a conferência | Média | Teste por rota; no pior caso o aviso só sai na próxima mudança, e a limpeza das 00:05 corrige a marca |
| Migração no deploy | Baixa | Colunas anuláveis, sem backfill; o deploy precisa rodar `migrate deploy` antes de subir a API |

## Acceptance
- [ ] All tasks complete
- [ ] Validation passes
- [ ] Patterns mirrored, not reinvented
- [ ] PRD: marco 1 `complete`, marco 2 `in-progress` com este plano, 1ª questão em aberto fechada
