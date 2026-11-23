# Plan: Mudar os serviços de um agendamento (adicionar e tirar)

**Status: CONCLUÍDO e no ar em 22/11/2026** — #420 (API, main `5ea16fc`) e #421 (web, main `587b1d6`), deploy feito pelo dono.

**Origem**: pedido do dono, 22/11/2026 (o cliente na cadeira pede "faz a barba também").
**Canvas**: página "Mudar serviços do agendamento" (pranchas `Srv-*`) no canvas do painel, aprovada em 22/11.
**Complexity**: Medium, 2 PRs (API, web).

## Summary

No detalhe do agendamento, o barbeiro adiciona e tira serviços. A API recalcula o tempo: se cabe na agenda, o fim do horário anda e a tela só pergunta "Confirma os adicionais?"; se não cabe, a tela diz o tempo previsto, até onde a agenda tem tempo e pergunta "Tem certeza?" — confirmado, o fim estica até o próximo compromisso e o agendamento vira encaixe. O cliente recebe e-mail com os serviços e o total; o barbeiro do atendimento recebe e-mail quando quem mudou foi outra pessoa.

## Decisões (dono, 22/11)

- **Quando**: agendamento de hoje em diante (pela data da barbearia), inclusive o que já começou. Status `pendente`, `confirmado` ou `concluido` **sem pagamento**. Com pagamento: 409 `com_pagamento` (mesma frase do remarcar). Dia fechado no caixa: 409 `dia_fechado`. `cancelado` e `no_show`: 422 `status_nao_permite`. Dia passado: 422 `agendamento_passado`.
- **Adicionar**: previsto = duração real de hoje (`horaFim - horaInicio`, já conta encaixe) + soma dos novos.
- **Tirar**: duração = a menor entre a duração real e a soma dos que ficam. O que sobra fica livre.
- **As duas juntas** num salvar só: `min(real, soma dos que ficam) + soma dos novos`.
- **Cabe** quando `inicio + previsto <= limite`. **Limite** = o primeiro destes depois do fim de hoje: início de outro atendimento do profissional no dia (não cancelado, sem contar o próprio), pausa da jornada, bloqueio, fechamento da janela do dia, meia-noite. Se o limite cair antes do fim de hoje (bloqueio criado depois, por exemplo), vale o fim de hoje: nunca encurta por isso.
- **Não cabe**: `horaFim = max(limite, fim de hoje)`. Fica encaixe pela regra que já existe (dura menos que a soma de `duracaoNoMomento`; sem coluna nova).
- **"Tem certeza?" vale na API**: sem `aceitaSemTempo: true`, o PUT que não cabe responde 409 `sem_tempo` com a prévia no corpo. A tela pergunta de novo (a agenda pode ter mudado entre a prévia e o clique).
- **Serviço repetido**: não (`uniqueItems` no schema + 422 `servico_repetido` se o id já estiver no atendimento).
- **Pelo menos um serviço** fica: lista final com 1 a 10 itens.
- **Serviços novos**: ativos, da barbearia, e o profissional faz (`garantirServicosDoProfissional` só nos novos). Os que já estavam ficam mesmo que hoje estejam inativos ou o profissional não faça mais. Preço e duração dos novos congelados com os valores de hoje; os que ficam mantêm `precoNoMomento`/`duracaoNoMomento`.
- **Quem**: profissional só na própria agenda (`agendaVisivel`: o do colega é 404, como no GET); dono e recepção, em qualquer uma.
- **E-mail do cliente** (caixa "Avisar o cliente por e-mail", marcada; só aparece com e-mail): assunto fixo "Os serviços do seu horário mudaram"; texto com o que entrou ("Entrou: Barba (R$ 25,00).") e saiu ("Saiu: ..."), "Agora: A + B." e "Total: R$ X". Sem hora de término, sem "encaixe". Para `emailLembrete ?? cliente.email`.
- **E-mail do barbeiro**: quando `membro.id !== agendamento.barbeiroId` e `barbeiro.email` existe, sempre (não depende da caixa). Assunto fixo "Mudaram os serviços de um atendimento seu"; texto com quem mudou, cliente, dia e hora, entrou/saiu, agora, total e "Na sua agenda: 09:00 – 09:40" (+ ", como encaixe (os serviços têm 50 min)" quando for).
- **Sem sino**: o sino é do que o cliente faz sozinho (lib/notificacoes.ts).

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| Rota com prévia | `GET /agendamentos/cabe` em `routers/agendamentos.ts` | 200 com `cabe: false` quando a resposta é "não cabe"; erro só para pedido inválido |
| Mudar com transação | `POST /agendamentos/:id/remarcar` | `comRetryDeDeadlock` + `$transaction`; `findFirstOrThrow` com `agendaVisivel`; pagamento → 409; `diaEstaFechado` → 409 |
| Contexto do dia | `contextoDoDia`, `aplicarBloqueios`, `pausaQueBate` em `lib/disponibilidade.ts` | janela, pausas e bloqueios do profissional no dia |
| Frase "bate com" | `motivoDoPainel` em `lib/agendamento.ts` | nome do outro cliente só no painel |
| Encaixe | `duracaoDoEncaixe` (API) e `encaixeDe` (web, `painel/encaixe.ts`) | derivado; atualizar o comentário "nada muda os serviços depois" |
| E-mail | `avisarRemarcado` + `textoDoRemarcado` (`lib/lembrete.ts`), `nomeParaEmail` (`lib/texto-de-email.ts`) | assunto fixo, envio sem `await`, falha no log |
| Contrato | `additionalProperties: false` | API sobe antes da web |
| Testes | Vitest: API com banco real; api-client; web com dublê `falso.ts` | TDD: RED, depois GREEN |

## PRs

### PR 1 — API
- **Conta pura** (`packages/scheduling`, com testes lá): `limiteDepois({ janela, ocupados, fimAtual })` → minuto do limite; `duracaoDaMudanca({ real, somaQueFica, somaNova })`. Testes: atendimento logo depois; pausa; bloqueio do dia inteiro e por horas; fechamento; nada depois (meia-noite); limite antes do fim de hoje; só tirar; só adicionar; as duas; encaixe com e sem tirar.
- **`lib/servicos-do-agendamento.ts`**: `previaDaMudanca(tx, { barbeariaId, agendamento, servicoIds })` → `{ previstoMinutos, terminaPrevisto, cabe, limite, motivo?, horaFim, encaixe, entram, saem, totalAntes, totalDepois }`. Carrega o contexto do dia, os outros atendimentos (exclui o próprio id), valida status/data/pagamento/dia fechado, os novos e o repetido.
- **`GET /agendamentos/:id/servicos/previa?servicoIds=…`** (lista final, repetido na query como no `/cabe`) → a prévia.
- **`PUT /agendamentos/:id/servicos`** body `{ servicoIds (1–10, uniqueItems), aceitaSemTempo?: boolean, avisarCliente?: boolean (padrão true) }`. Na transação: `SELECT … FOR UPDATE` do agendamento (dois PUTs ao mesmo tempo não somam duas vezes), prévia, 409 `sem_tempo` sem a marca, apaga os que saem, cria os que entram, grava `horaFim`. A EXCLUDE segue sendo a garantia contra corrida (23P01 → 409, como hoje). Devolve o agendamento serializado.
- **E-mails**: `textoDosServicosMudados` (cliente) e `textoDosServicosMudadosProBarbeiro` em `lib/lembrete.ts`, `avisarServicosMudados` no router (depois do commit).
- **Lembrete**: não muda (`horaInicio` é o mesmo; o texto lê os serviços na hora de enviar).
- Comentário de `duracaoDoEncaixe` atualizado.
- **api-client**: `previaDosServicos(id, servicoIds)`, `mudarServicos(id, { servicoIds, aceitaSemTempo?, avisarCliente? })` + tipos + dublê `falso.ts` (mesmas recusas).
- **Testes de rota** (banco real): cabe; não cabe → 409 sem a marca, 200 com ela e vira encaixe; tirar encurta; tirar de encaixe; já começado hoje; concluído sem pagamento; com pagamento 409; dia fechado 409; dia passado 422; cancelado 422; repetido 422; novo que o profissional não faz 422; novo inativo 422; lista vazia 400; profissional no colega 404; dono e recepção em qualquer; preço congelado dos que ficam; e-mail do cliente com e sem a caixa; e-mail do barbeiro só quando outro mudou e só com e-mail; corrida com a EXCLUDE.
- **Deploy**: só API, sem migration.

### PR 2 — Web
- Detalhe (`DetalheDoAgendamento.tsx`): linha "Mudar serviços" ("Adicionar ou tirar. A agenda e o total acompanham.") no bloco Serviços, só quando a API aceitaria (de hoje em diante, sem pagamento, status que permite).
- Tela nova `telas/painel/ServicosDoAgendamento.tsx` + rota `app/(painel)/painel/(guardado)/agendamentos/[id]/servicos/page.tsx`: "No atendimento" (Tirar/Desfazer; o último trava com a frase), "Adicionar" (serviços ativos que o profissional faz e que não estão no atendimento: `servicos()` + `servicosDoMembro(barbeiroId)`), barra de baixo com tempo e total e a frase da prévia (pede a prévia a cada mudança; a resposta velha é descartada).
- Confirmação (`<dialog>`, como `JanelaDeRemarcar`): título pelo tipo (adicionais / tirar / mudança), lista do que entra e sai, com tempo → "Termina às HH:MM" (+ "Os N min que sobram ficam livres"), sem tempo → aviso "O tempo previsto pra concluir os serviços é de X min (até HH:MM), e na sua agenda só tem tempo até as HH:MM, quando começa Fulano. Tem certeza?" + "Na agenda ele fica como encaixe…", total "(era R$ Y)", caixa do e-mail, botões "Confirmar" / "Sim, adicionar mesmo assim" e "Voltar". 409 `sem_tempo` no PUT → reabre com a prévia nova.
- Depois de salvar: volta pro detalhe com o aviso "Serviços salvos." (+ "Pedro recebe um e-mail com o novo total." quando marcou).
- Testes com o dublê; conferência no navegador em 360/390, claro e escuro (`scripts/conferencia-visual.ts`).
- **Deploy**: só web, depois da API.

## Conferir antes de começar

- Conferido 22/11: este é o primeiro caminho que faz UPDATE de `hora_fim` (criar e remarcar inserem linha nova). `periodo` é `tsrange GENERATED ALWAYS ... STORED` (migration `20260829120000_init`, linha 166): o UPDATE recalcula, e a EXCLUDE `sem_conflito_horario` continua valendo. Nenhum trigger em `agendamento`. Sem migration.
- O handler de erros reconhece a EXCLUDE pela mensagem (`23P01` + `sem_conflito_horario`, `plugins/erros.ts:73`): vale pro UPDATE também (o teste de corrida confere).
- `carregarServicos` e `garantirServicosDoProfissional` usam `Set` (repetido passa ali): o PUT recusa antes, com `uniqueItems` e `servico_repetido`.
- Bloqueio de dia inteiro (sem hora): `aplicarBloqueios` devolve a janela `FECHADO`, e aí o limite é o fim de hoje (não a meia-noite). Caso de teste no `limiteDepois`. Bloqueio de várias datas: `cobreODia`.
- `Membro` do token (`plugins/auth.ts:62`) não tem `nome`: o nome de quem mudou é lido na transação e passa por `nomeParaEmail`.
- `servicosDoMembro` (GET `/equipe/:id/servicos`) responde para profissional e recepção.
- Remarcar pelo link do cliente de um agendamento que virou encaixe: volta pra duração cheia dos serviços (aceito, já é assim).

## Riscos

- Agendamento já começado com o próximo cliente colado: o limite é o fim de hoje, nada estica; vira encaixe na hora. A frase diz com quem bate.
- O caixa soma os serviços do agendamento: o total novo entra sozinho. Plano de assinatura do cliente (`conferirOPlano`) só olha no pagamento.
- `apps/mobile` não usa essas rotas (conferir o typecheck do api-client).
