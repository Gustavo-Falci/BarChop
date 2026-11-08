# Plan: Várias pausas na jornada (pedido do barbeiro em produção, 08/11)

**Origem**: conversa do dono com o barbeiro da `jesus-barber` (08/11/2026), "Mais de uma pausa"; passo 4 da ordem combinada.
**Canvas**: página "Várias pausas" (Pau-Jornada, Pau-Jornada-Folha, Pau-PausasDeSempre, Pau-Horarios, escuro e claro), publicada em 08/11; aguarda aprovação do dono.
**Complexity**: Medium, 3 PRs (expandir → web → contrair).

## Summary

Hoje cada dia da jornada de um profissional guarda **uma** pausa (`jornada_profissional.pausa_inicio/pausa_fim`). O barbeiro quer mais de uma no mesmo dia, toda semana (ex.: almoço 12:00–13:00 e café 16:00–16:15). Pausa num dia só continua sendo o Bloqueio com horas.

O cálculo dos horários livres já trata a pausa como uma lista de intervalos ocupados (`pausaComoOcupado` devolve um array); a mudança é no que é guardado, no contrato e nas telas.

## Decisões

Respondidas pelo dono em 08/11 (as marcadas com **(dono)**).

- **Tabela nova `pausa_da_jornada`**: `id`, `jornada_id` → `jornada_profissional.id` (ON DELETE CASCADE; as 7 linhas existem desde o insert do membro, pelo trigger), `hora_inicio`, `hora_fim` (TIME). CHECK `hora_inicio < hora_fim`. EXCLUDE (btree_gist, como `sem_conflito_horario`) pra duas pausas do mesmo dia não se cruzarem. Faixas meio-abertas: 12:00–13:00 e 13:00–13:30 podem (encostar não é cruzar).
- As pausas que já existem são copiadas pra tabela na migration (`INSERT … SELECT` das linhas com `pausa_inicio`). O CHECK `jornada_pausa_inteira` já garante início < fim e nada na folga, então a cópia não quebra as travas novas.
- **Folga não tem pausa**: o banco não consegue checar entre tabelas; o PUT apaga as pausas do dia de folga na mesma transação, e o `pausaComoOcupado` continua ignorando a folga.
- **(dono) a) Pausa fora do horário do dia**: hoje a API aceita e ela não tem efeito (só conta o pedaço dentro do expediente). Na análise de 08/11 eu disse "não podem sair da jornada". **Decidido: continuar aceitando, sem efeito, com um aviso na folha** ("fora do horário deste dia, não muda nada"). Recusar seria frágil: o horário da casa e as datas especiais mudam por fora, e uma mudança lá invalidaria pausas já salvas.
- **(dono) b) Quantas o barbeiro precisar**: a tela não limita (o "+ Outra pausa" fica sempre). Na API, só um teto técnico de 24 por dia (`maxItems`), contra corpo gigante; ninguém chega nele.
- **(dono) c) "Pausa de sempre" vira "Pausas de sempre"**: uma lista aplicada a todos os dias de trabalho, trocando a lista de cada dia. Nasce do primeiro dia salvo que tem pausa.
- Códigos de erro novos: `pausas_se_cruzam` e `recarregue_a_pagina` (junto de `pausa_incompleta` e `pausa_invalida`). Passar do teto técnico é o 400 da validação de schema (o `pausas_demais` do rascunho saiu: nunca apareceria).
- Datas especiais: as pausas valem nelas como hoje.

## Contrato (transição sem quebrar a web antiga)

- `DiaDaJornada` ganha `pausas: { inicio, fim }[]` (em ordem de início). `pausaInicio`/`pausaFim` continuam na resposta com a **primeira** pausa, até o PR 3.
- `OcupacaoDoProfissional` ganha `pausas`; `pausa` continua com a primeira.
- `PUT /equipe/:id/jornada`: **quem decide é o campo antigo comparado com o que está salvo**, não a presença de `pausas`. A web antiga monta o corpo espalhando o dia do GET (`{ ...dia, pausaInicio, pausaFim }`), então depois do PR 1 ela devolve as `pausas` velhas junto da pausa editada. Por dia:
  - campos antigos ausentes, ou iguais a `pausas[0]` do corpo: web nova, valem as `pausas`;
  - campos antigos iguais à primeira salva: a web antiga não mexeu no dia, fica tudo;
  - senão, a web antiga mexeu: com 0 ou 1 salva vira `[antiga]` (ou `[]`); com 2+ salvas, **422 `recarregue_a_pagina`**, em vez de apagar as outras em silêncio.
  - **PR 2: a web nova manda os campos antigos iguais a `pausas[0]`, ou não manda.** Espalhar o dia do GET e trocar só `pausas` cairia no caminho da web antiga.
- Durante a transição a API também grava a primeira pausa nas colunas antigas: se a API voltar pra versão anterior, ela ainda vê a pausa principal.

## PRs

### PR 1 — Banco, API, tipos, api-client e dublê (sem mudança visível)
- Migration escrita à mão (o `migrate dev` propõe derrubar `agendamento.periodo`), com bloco "Desfazer", como a `20261008120000_jornada_pausa`. Conferir no banco de teste que o Postgres aceita a expressão do EXCLUDE.
- `disponibilidade.ts`: o tipo da jornada perde `pausaInicio/pausaFim` e ganha `pausas`; `pausaComoOcupado` lê a lista. Assim o tsc acha todo leitor: `findUnique` (dia, linha 174), `findMany` (período/mês, 305), ocupação (`ocupacao.ts:86`, `const [pausa] =` vira todas; `minutosDeTrabalho` já conta sobreposição uma vez), `conferirHorario` (`contexto.pausa`; a mensagem diz qual pausa bateu), `equipe.ts` (GET/PUT). Conferir que `proximosHorarios` (página pública) passa pelo mesmo caminho.
- PUT: `deleteMany` + `createMany` das pausas da semana na mesma `$transaction` dos 7 updates; `maxItems: 24` por dia no schema (teto técnico).
- **Prova da compatibilidade**: os testes de API `jornada-e-servicos`, `disponibilidade-profissional`, `ocupacao` e `agendamentos-cabe` passam; nos de formato exato (`toEqual`) a única mudança é acrescentar `pausas: []`. A prova de verdade é o teste que simula a web antiga (GET → muda o campo antigo mantendo `pausas` → PUT). Testes novos (`varias-pausas.test.ts`): duas pausas no dia, na disponibilidade (dia e mês), no POST/`/cabe`, na ocupação; cruzar → 422; 25 → 400; folga apaga; aba antiga (1 salva aplica, 2+ dá 422, dia não mexido sobrevive, aba de antes do deploy); o `INSERT … SELECT` da migration rodado de novo (a suíte aplica as migrations num banco vazio); EXCLUDE e CHECK no banco.
- api-client e dublê aceitam as duas formas na semente e derivam `pausas` (os testes da web que semeiam `pausaInicio` não mudam neste PR).
- Typecheck dos 7 projetos (o mobile usa os tipos).
- **Deploy**: migration + API. A web antiga segue funcionando.

### PR 2 — Web (depois do canvas aprovado e do PR 1 no ar)
- Agenda: `grade.ts` (`ExpedienteDoProfissional.pausas`; "no turno"/"alguém atende" testam todas; uma faixa "Pausa" por pausa no `GradeDeTempo`); lista (`dele.pausas`, o helper do PR #320 já recebe lista).
- `JornadaDoMembro`: resumo do dia ("pausa 12:00–13:00 e 16:00–16:15"), validação e `oQueMudou`; `FolhaDoDia` com uma linha por pausa, remover, "+ Outra pausa" sem limite, aviso de pausa fora do horário; `FolhaDaPausa` ("Pausas de sempre").
- `pausa.ts` (`temPausa`, `resumoDaPausa` comparando listas) e `PausasDaEquipe`.
- Sementes dos testes passam pra `pausas`.
- Canvas: `Det-Membro-Jornada`, `Det-Membro-Jornada-Folha` (2 pausas, adicionar e remover, aviso), o resumo em `Config-Horarios`.

### PR 3 — Contrair (depois dos dois deploys conferidos)
- Tira `pausaInicio/pausaFim`/`pausa` do contrato; migration derruba as colunas antigas e o CHECK `jornada_pausa_inteira`.

## Riscos

- Aba aberta com a web antiga depois do deploy: coberta pelo 422 `recarregue_a_pagina`.
- EXCLUDE com expressão de horário: conferir imutabilidade no banco de teste antes de seguir.
- `apps/mobile` compartilha os tipos: typecheck no PR 1.
