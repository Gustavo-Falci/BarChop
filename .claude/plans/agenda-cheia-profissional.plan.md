# Plan: Aviso de agenda cheia pro profissional

**Source PRD**: `.claude/prds/agenda-cheia.prd.md`
**Selected Milestone**: 3 — Aviso pro profissional
**Complexity**: Medium

## Summary
Quando a agenda de um profissional lota, ele recebe um aviso no sininho e, se tiver e-mail, um e-mail. Vale mesmo que os colegas ainda tenham vaga. A conferência é a mesma do marco 2, já pedida pelas rotas a cada mudança de agendamento; agora ela também olha cada profissional do link. As regras de repetição são as mesmas (um aviso por lotação, no máximo um por dia), guardadas em duas colunas novas no profissional.

## Decisões
- **Agenda cheia do profissional** (definição do PRD): até o fim da janela, o link não oferece nenhum horário dele pra nenhum serviço ativo que ele faz. As mesmas regras do marco 1 valem aqui:
  - sem limite de dias, nunca está cheia;
  - sem nenhum agendamento dele no período (só folga ou bloqueio), não está cheia.
- **Quem entra**: os profissionais do link, os mesmos que a página oferece (ativos, que atendem, com senha, dentro do limite do plano). O dono que atende entra; a recepção não.
- **Uma conta só**: `agenda-cheia.ts` passa a calcular a barbearia e cada profissional na mesma passada, com as mesmas consultas. A barbearia está cheia se e só se todos estiverem cheios pelo serviço que fazem. A rota pública e o marco 2 não mudam.
- **Profissional sem e-mail**: recebe só o sininho. O `email` do profissional é opcional no banco. Fecha uma questão em aberto do PRD.
- **Dono que também atende** (questão em aberto do PRD), proposta: quando a barbearia lota na mesma conferência, o dono recebe só o aviso da barbearia, porque dizer as duas coisas ao mesmo tempo é repetir. A agenda dele fica marcada como cheia do mesmo jeito. Se só a agenda dele lotar e a barbearia ainda tiver vaga, ele recebe o aviso de profissional.
- **Limpeza das 00:05**: passa a apagar também a marca dos profissionais que voltaram a ter horário.
- **Fica fora**: o aviso pros colegas ou pro dono quando um profissional lota. O dono já vê a agenda de todos no painel.

## Textos
- **Sininho**: título "Sua agenda está cheia"; texto "Todos os seus horários até 04/12 estão reservados. O dia 05/12 abre amanhã."; link `/painel/agenda`.
- **E-mail**: assunto fixo "Sua agenda está cheia". Corpo:

  > Olá, Rafa! Todos os seus horários que o link de agendamento oferece, até sexta-feira, 04/12, estão reservados.
  >
  > O dia 05/12 abre amanhã. Sua agenda no painel: {URL_DO_PAINEL}/painel/agenda

  O nome sai do `primeiroNomeParaEmail`. Sem `URL_DO_PAINEL`, a frase final fica "Sua agenda está no painel, em Agenda."

## Patterns to Mirror
| Category | Source | Pattern |
|---|---|---|
| Lotação e repetição | `apps/api/src/lib/agenda-cheia-avisos.ts` (marco 2) | `updateMany` condicional pra marca e pro dia, sininho na mesma transação, e-mail depois |
| Conta de cheia | `apps/api/src/lib/agenda-cheia.ts` | `oQueOLinkOferece` + `agendaDoPeriodo` + `descartarPassados` |
| Nome no e-mail | `apps/api/src/lib/texto-de-email.ts:51` | `primeiroNomeParaEmail` |
| Testes | `apps/api/tests/lib/agenda-cheia-avisos.test.ts`, `tests/helpers/agenda.ts` | `prepararJanelaCurta`, `encher`, relógio injetado, `canalDeMemoria` |

## Files to Change
| File | Action | Why |
|---|---|---|
| `packages/database/prisma/schema.prisma` | UPDATE | `agendaCheiaDesde` e `agendaCheiaAvisadaEm` no Barbeiro |
| `packages/database/prisma/migrations/20261127150000_agenda_cheia_profissional/migration.sql` | CREATE | As duas colunas, anuláveis |
| `apps/api/src/lib/agenda-cheia.ts` | UPDATE | `lotacaoDoLink`: a barbearia e cada profissional numa passada; `agendaCheiaAte` passa a ler daí |
| `apps/api/src/lib/agenda-cheia-avisos.ts` | UPDATE | Avisar cada profissional que lotou; limpar a marca dos que vagaram |
| `apps/api/tests/lib/agenda-cheia.test.ts` | CREATE | A conta por profissional |
| `apps/api/tests/lib/agenda-cheia-avisos.test.ts` | UPDATE | Os avisos do profissional |
| `apps/api/tests/helpers/agenda.ts` | UPDATE | `encher` aceita o profissional (hoje é sempre o dono) |

## Tasks
### Task 1: Colunas da lotação do profissional
- **Action**: migração com as duas colunas no `barbeiro`; `prisma generate`.
- **Mirror**: `20261127120000_agenda_cheia`.
- **Validate**: a migração roda no setup dos testes.

### Task 2: A conta por profissional (RED → GREEN)
- **Action**: testes primeiro em `tests/lib/agenda-cheia.test.ts`, com dois profissionais na janela curta:
  1. um cheio e outro livre → o cheio tem o último dia, o livre e a barbearia não;
  2. os dois cheios → os dois e a barbearia têm o último dia;
  3. profissional só com bloqueio, sem agendamento → não está cheio;
  4. o serviço mais curto que só ele faz cabe num buraco → não está cheio;
  5. sem limite de dias → ninguém cheio.

  Depois, `lotacaoDoLink` em `agenda-cheia.ts`. A rota pública segue com os 7 testes de hoje.
- **Mirror**: a conta de hoje, sem uma segunda.
- **Validate**: `vitest run tests/lib/agenda-cheia.test.ts tests/routers/agenda-cheia.test.ts`.

### Task 3: Os avisos do profissional (RED → GREEN)
- **Action**: testes primeiro em `tests/lib/agenda-cheia-avisos.test.ts`:
  1. a agenda dele lotou com a barbearia ainda com vaga → sininho pra ele e e-mail com o nome, o último dia e o link da agenda; o dono não recebe nada;
  2. conferir de novo → nada novo;
  3. vagou e lotou no mesmo dia → nada novo; no dia seguinte → avisa;
  4. sem e-mail → só o sininho;
  5. a barbearia lotou → cada profissional recebe o aviso de profissional, e o dono que atende recebe só o da barbearia (com a agenda dele marcada);
  6. a limpeza das 00:05 apaga a marca do profissional que vagou.

  Os testes do marco 2 seguem verdes. Depois, o código em `agenda-cheia-avisos.ts`.
- **Mirror**: a transação do marco 2, agora por profissional.
- **Validate**: `vitest run tests/lib/agenda-cheia-avisos.test.ts tests/routers/agenda-cheia-na-fila.test.ts`.

### Task 4: Conferência local
- **Action**: com a API de conferência (que já roda a fila e imprime o e-mail), lotar só a agenda de um profissional da barbearia-teste e mudar um status pelo painel. Conferir o e-mail no terminal e o sininho dele; conferir que o dono não recebe nada.
- **Validate**: print do sininho no PR.

## Validation
```bash
pnpm --filter @barchop/database generate
pnpm --filter @barchop/api exec vitest run tests/lib/agenda-cheia.test.ts tests/lib/agenda-cheia-avisos.test.ts tests/routers/agenda-cheia.test.ts tests/routers/agenda-cheia-na-fila.test.ts
pnpm --filter @barchop/api exec tsc --noEmit
npx eslint <arquivos tocados>
```

## Risks
| Risk | Likelihood | Mitigation |
|---|---|---|
| A conta por profissional diverge da conta da barbearia | Baixa | Uma passada só, e a barbearia sai da mesma conta; teste "os dois cheios" |
| Dono que atende recebe aviso em dobro | Média | Regra explícita e testada (caso 5) |
| Conferência mais pesada com equipe grande | Baixa (piloto) | As mesmas consultas de hoje, uma vez por conferência; só o laço em memória cresce |
| Migração no deploy | Baixa | Colunas anuláveis; `migrate deploy` antes de subir a API |

## Acceptance
- [x] All tasks complete
- [x] Validation passes
- [x] Patterns mirrored, not reinvented
- [x] PRD: marco 2 `complete`, marco 3 `in-progress` com este plano (marco 3 `complete` depois do deploy de 27/11), questões do profissional sem e-mail e do dono que atende atualizadas
