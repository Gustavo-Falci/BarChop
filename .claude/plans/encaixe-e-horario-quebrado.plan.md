# Plan: Encaixe e horário quebrado (pedido do barbeiro em produção, 08/11)

**Origem**: conversa do dono com o barbeiro da `jesus-barber` (08/11/2026), passo 3 da ordem combinada.
**Canvas**: página "Agenda: encaixe e horário quebrado" (pranchas `Enc-*`), aprovada em 08/11.
**Complexity**: Medium-Large, 4 PRs.

## Summary

O barbeiro quer (a) marcar um cliente num buraco da agenda com duração menor que a do serviço (**encaixe**), sem mudar o preço; (b) marcar em horário quebrado: no painel, qualquer minuto que caiba; no link, uma regra nova que oferece o horário em que o atendimento anterior termina (09:40 em vez de esperar 10:00).

## Decisões (aprovado 08/11; perguntas abertas seguiram a proposta)

- **Encaixe** escolhe 5, 10, 15, 20 ou 25 min, sempre menor que a soma dos serviços. Preço = o dos serviços. Só o painel faz encaixe.
- **Encaixe não sobrepõe**: a EXCLUDE `sem_conflito_horario` fica; pausa, bloqueio e expediente valem igual.
- **Sem coluna nova pro encaixe**: é derivado. `horaFim - horaInicio < soma(duracaoNoMomento)` ⇒ encaixe. `AgendamentoServico` continua com a duração do serviço.
- **Remarcar no painel mantém a duração do encaixe** (se ainda for menor que a soma atual dos serviços; senão volta pra do serviço). **Remarcar pelo link do cliente usa a duração do serviço** (o encaixe é decisão do barbeiro pra aquele buraco). *Confirmar com o dono no review do PR 3.*
- **"Oferecer logo depois do anterior"** (regra do link, padrão desligada = hoje): além da grade, oferece o minuto em que um **atendimento** termina. Depois de pausa ou bloqueio, não.
- **Painel sempre oferece "logo depois"** (com bolinha na lista) e aceita **qualquer minuto** pelo "Outro horário".

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| Cálculo | `packages/scheduling/src/index.ts` (`calcularHorariosDisponiveis`) | Pura, sem framework; testes em `packages/scheduling/tests` |
| Três caminhos | `apps/api/src/lib/disponibilidade.ts` (`horariosDoProfissionalNoDia`, `agendaDoPeriodo`, `diasComVaga`) + `lib/agendamento.ts` (`criarAgendamento`, `escolherProfissional`) | "o horário que a tela oferece tem que ser o que o POST aceita": regra nova entra em todos via `Grade` |
| Grade | `apps/api/src/lib/regras.ts` (`gradeDe`) | Cliente usa as regras; painel nunca vê menos que o cliente |
| Regras | migration `painel-v2` regras + `SELECT_REGRAS`/`regrasDe`, `packages/formato/src/regras.ts` (`REGRAS_PADRAO`), `formato/src/areas.ts` (`AREA_DO_CAMPO`), PUT em `routers/barbearias.ts:95` | Coluna com padrão = hoje |
| Erros | `lib/erro-negocio.ts` | `ErroDeNegocio(mensagem, codigo)` |
| Contrato | body/query com `additionalProperties: false` | campo novo ⇒ API sobe antes ou junto da web |
| Testes | Vitest: API com banco real, api-client, web (dublê `falso.ts`) | TDD: RED, depois GREEN |

## PRs

### PR 1 — "Logo depois do anterior" (scheduling + regra + listas)
- `scheduling`: `IntervaloOcupado.atendimento?: boolean`; opção `logoDepoisDoAnterior?: boolean` (padrão false). No vão que começa no fim de um atendimento, fora da grade, oferece também o início do vão se a duração cabe. Testes: liga/desliga; fim de pausa não conta; fim na grade não duplica; `cabeAntesDeFechar` desligado.
- Migration `logo_depois_do_anterior boolean not null default false` em `barbearia`.
- `types` (`RegrasDeAgendamento`), `formato` (`REGRAS_PADRAO`, área), API (`SELECT_REGRAS`, `regrasDe`, PUT, `Grade.logoDepoisDoAnterior`: cliente = regra, painel = sempre true). Os chamadores marcam os agendamentos como `atendimento: true`.
- api-client + dublê.
- Web: linha com interruptor em Regras de agendamento (com exemplo); bolinha nos horários fora da grade em `NovoAgendamento` (o painel já recebe a lista do painel).
- Deploy: migration + API antes ou junto da web.

### PR 2 — "Outro horário" no painel (qualquer minuto)
- `scheduling`: `horarioCabe(params, horaInicio)` → `null | motivo`, mesmas restrições do cálculo, qualquer minuto.
- `criarAgendamento` com `origem = "barbeiro"`: usa `horarioCabe` em vez de `includes` na lista. Cliente segue na lista.
- Rota `GET /agendamentos/cabe?barbeiroId&data&horaInicio&servicoIds[&duracaoMinutos]` → `{ cabe: true } | { cabe: false, codigo, mensagem }` (mensagem: "bate com Fulano, marcado das 09:40 às 10:30", "cai na pausa", "fora do expediente", "bloqueado").
- api-client + dublê; web: botão "Outro horário" abre o campo, valida ao digitar (com debounce), "Usar HH:MM".

### PR 3 — Encaixe
- API: `duracaoMinutos?` (inteiro, múltiplo de 5, ≥ 5) no `POST /agendamentos` e na disponibilidade do dia e do mês (só membro; cliente recebe 422 `encaixe_so_no_painel`). `criarAgendamento` recusa `>= soma dos serviços` (422 `encaixe_invalido`), `horaFim` sai da duração escolhida.
- Serializador do painel: `encaixe: boolean`.
- Remarcar do painel mantém a duração (ver Decisões); remarcar do cliente usa a do serviço.
- api-client + dublê; web: passo "Duração" antes do Horário ("Do serviço · N min" | "Encaixe" com chips menores que N); a lista refaz; barra de baixo "N min · encaixe · R$ X"; aviso quando o horário escolhido deixa de caber.

### PR 4 — Agenda: encaixe à vista e buraco livre
- Lista da agenda: etiqueta "Encaixe" e "15 min (o serviço tem 30)".
- Linha "Livre HH:MM – HH:MM · N min" entre dois itens do mesmo profissional (só com um profissional na lista: a lista mistura a equipe). Com menos de 30 min o botão é "Encaixar", que abre o Novo agendamento com a hora e a duração do buraco; senão "Marcar".
- Detalhe do agendamento: linha "Encaixe · 15 min (o serviço tem 30)".

## Conferido antes de começar (08/11)

- `regraQueRecusa` (formato) não olha `intervaloMinutos`: o 13:40 do cliente passa nas regras e no `descartarPassados`.
- `proximosHorarios` (página da barbearia) usa `gradeDe(regras, true)`: ganha a regra junto, desde que marque os atendimentos como `atendimento: true` também lá.
- `horaFim` só é gravado em `criarAgendamento` (`duracao_no_momento` vem do init, sem backfill): o encaixe derivado não pega agendamento antigo. Ainda assim, antes do PR 3, o dono roda em produção (só leitura): `select count(*) from agendamento a where a.hora_fim - a.hora_inicio < (select sum(s.duracao_no_momento) from agendamento_servico s where s.agendamento_id = a.id) * interval '1 minute';` — tem que dar 0.
- Cursor do vão: a marca "veio de atendimento" é de quem empurrou o cursor pro máximo (bloqueio 13:00–14:00 + atendimento 13:00–13:40 ⇒ vão começa 14:00, sem "logo depois"). Empate no mesmo minuto entre pausa e atendimento: conta como atendimento.
- `GET /agendamentos/cabe` mostra nome de cliente: profissional só consulta a própria agenda (403 como no POST).

## Riscos

- O `ListaDeHorarios` é componente comum (cliente e painel): a bolinha entra opcional (`foraDaGrade?: string[]`), sem mudar o link.
- `apps/mobile` usa tipos das regras: conferir o typecheck no PR 1.
- A EXCLUDE continua sendo a garantia contra corrida; `horarioCabe` só dá a mensagem.
