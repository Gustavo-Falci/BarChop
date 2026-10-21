# Plan: Arrastar e reordenar (dnd-kit)

**Source**: pedido do dono 19/10 ("Faz com lib" → motion + arrastar; reordenar serviços e categorias, profissionais e agendamento na agenda)
**Complexity**: Large (7 PRs; 1 migração; API nova de ordem e de remarcar pelo painel; web)
**Depende de**: PR 1 de `.claude/plans/motion-sutil.plan.md` (lib `motion`, tokens, springs, ADR 0011 cobre as duas libs)

## Summary
Hoje nada se reordena: serviços saem por nome (`apps/api/src/routers/servicos.ts:87`), profissionais por entrada na equipe (`barbearias.ts:346`, `equipe.ts:271`), categorias na ordem fixa de `CATEGORIAS_DE_SERVICO` (`packages/formato/src/pagina.ts:43`). E o painel não remarca: o PATCH aceita só status/observações (`agendamentos.ts:72`) e o detalhe manda "cancele e crie outro" (`DetalheDoAgendamento.tsx:360`). O plano dá ao dono a ordem que o cliente vê (serviços, categorias, equipe) e deixa mover agendamento arrastando na agenda — com um "Mudar horário" no detalhe como caminho acessível e de celular.

## Decisões
- **dnd-kit**: `@dnd-kit/core@6.3.1`, `@dnd-kit/sortable@10.0.0`, `@dnd-kit/utilities@3.2.2`, `@dnd-kit/modifiers@9.0.0` (versões exatas; estáveis desde dez/2024; peer React ≥16.8, ok com 19.2). Não usar o `@dnd-kit/react` (beta).
- Sensores: `PointerSensor` (distância 4px, pra clique não virar arrasto), `TouchSensor` (segurar 250ms, tolerância 5px — rolar a página continua rolando), `KeyboardSensor` com `sortableKeyboardCoordinates` (espaço pega, setas movem, espaço solta, Esc cancela). Anúncios do leitor de tela em português (`announcements` + `screenReaderInstructions`).
- Animação: vizinhos abrindo espaço = transform do dnd-kit com a curva/duração dos tokens de `src/movimento/tokens.ts`; soltar = mola `solta` do `motion`; item pego com `scale(1.02)` + sombra.
- Ordem salva **inteira** (lista completa de ids numa chamada), não "mover X pra posição N": idempotente, sem corrida entre dois cliques.
- **O limite do plano Grátis e o "qualquer um" seguem por entrada na equipe (`criadoEm`)**, não pela ordem nova: reordenar não pode esconder do link alguém que estava visível nem mudar quem recebe o agendamento (`lib/assinatura.ts:128`, `lib/disponibilidade.ts`). A ordem nova é só de exibição.

## Decidido (21/10): avisar o cliente quando o painel remarca
- **Sim** (dono, 21/10). Na confirmação do arrasto e no "Mudar horário", "avisar cliente por e-mail" vem marcado: e-mail "seu horário mudou" pra quem tem `emailLembrete` (canal de e-mail que já existe, `lib/canal-email.ts`), lembrete reagendado pro horário novo, notificação interna "remarcado" (`lib/notificacoes.ts:9` já tem o evento). Sem e-mail, o cliente chega no horário antigo.

## Patterns to Mirror
| Category | Source | Pattern |
|---|---|---|
| Migração com backfill e CHECK | `packages/database/prisma/migrations/20261017120000_caixa` | SQL à mão, comentário do porquê, CHECK no banco |
| Rota com schema | `apps/api/src/routers/agendamentos.ts:72` | JSON schema `additionalProperties: false`, comentário do que fica de fora |
| Remarcar = cancela + cria na transação | `apps/api/src/routers/clientes-me.ts:180` | `updateMany` com status no WHERE (clique duplo), `criarAgendamento` checa disponibilidade, `comRetryDeDeadlock` |
| Lista com ordem estável | `apps/api/src/routers/equipe.ts:271` | `orderBy` com desempate por `id` |
| Notificação | `apps/api/src/lib/notificacoes.ts:56` | `notificarAgendamento(tx, evento, id)` |
| Lembrete | `apps/api/src/routers/agendamentos.ts:312` | `agendarLembrete({ fila, log }, agendamento)` |
| Grade da agenda | `apps/web/src/componentes/GradeDeTempo.tsx` + `src/painel/grade.ts` | linhas de `MINUTOS_POR_LINHA`, colunas = dias (semana) ou profissionais (dia) |
| Testes API | `apps/api/tests/` | integração com banco de teste (`.env.test`) |
| Testes web | `apps/web/tests/` | Vitest + Testing Library, jsdom |

## PRs

### PR 1 — Migração: ordem
- `servico.ordem SMALLINT NOT NULL` — backfill pela ordem de hoje (ativo desc, nome asc) por barbearia, de 10 em 10.
- `barbeiro.ordem SMALLINT NOT NULL` — backfill por `criado_em, id` por barbearia.
- `barbearia.ordem_categorias TEXT[] NOT NULL DEFAULT '{}'` — vazio = ordem padrão de `CATEGORIAS_DE_SERVICO`; CHECK `ordem_categorias <@ ARRAY[...]` (mesmos valores do CHECK da `20261011120000_categoria_fechada`).
- Serviço/membro novo nasce no fim (`max(ordem)+10`, na rota de criação).
  - **Feito (21/10) por trigger `BEFORE INSERT`**, não na rota: como os triggers de jornada/serviços da `20261004120000`, cobre signup, convite, seed e Prisma cru dos testes. Prisma: `ordem Int @default(dbgenerated())`. Migração `20261021120000_ordem`, aplicada no dev e no teste; testes em `apps/api/tests/banco-ordem.test.ts`.
- **Testes**: migração aplica no dev e no teste; backfill preserva a ordem atual.

### PR 2 — API: salvar e devolver a ordem
- `PUT /servicos/ordem` `{ ids: uuid[] }`, `PUT /equipe/ordem` `{ ids: uuid[] }`, `PUT /barbearia/categorias/ordem` `{ categorias: string[] }`. Só dono. Lista tem que ser **exatamente** o conjunto da barbearia (nem a mais, nem a menos, sem repetir) → senão 400. Uma transação.
- `orderBy` passa a `ordem, id` em: lista de serviços do painel, serviços e profissionais da página pública, lista da equipe. Categorias: `formato` ganha `ordenarCategorias(ordemSalva)` (salva primeiro, faltantes no fim na ordem padrão).
- **Testes**: cada PUT (ok, id de outra barbearia → 400, lista incompleta → 400, repetido → 400, profissional → 403); página pública devolve na ordem nova; limite do Grátis continua escondendo por `criadoEm`.

### PR 3 — Web: lista reordenável
- `src/componentes/ListaReordenavel.tsx` (`"use client"`): `DndContext` + `SortableContext` (vertical), alça de arrastar visível (⋮⋮ com `aria-label`), sensores e anúncios em português, `restrictToVerticalAxis` + `restrictToParentElement`.
- Salva ao soltar (otimista: a lista já fica na ordem nova; erro → volta e mostra aviso).
- **Testes**: reordenar pelo teclado (espaço, seta, espaço) chama `onReordenar` com os ids na ordem nova; Esc cancela; erro volta a ordem.
- **Feito (21/10), desvios:** `MouseSensor` + `TouchSensor` em vez do `PointerSensor` (o de ponteiro pegaria o toque sem a espera de 250ms); linha pega só com sombra, sem `scale(1.02)` nem mola `solta` (o transform da linha é do dnd-kit; vizinhos com curva/duração dos tokens). API do componente: `itens`, `nomeDaLista`, `rotulo`, `aoReordenar(ids)` (promise; rejeitou → volta e avisa), `renderizar(item, alca)`. Teste do teclado precisa de dublê de `getBoundingClientRect` (linhas e a `<ul>`) e um tick entre teclas.

### PR 4 — Web: aplicar em Serviços, Categorias e Equipe
- `ListaDeServicos`: serviços arrastam **dentro** da categoria; categorias arrastam como blocos (lista de categorias com o mesmo componente).
- `ListaDaEquipe`: membros arrastam. Nota curta: "É a ordem da sua página."
- Só dono vê a alça (`SoDoDono`).
- Prévia da página (`PreviaDaPagina`) reflete a ordem nova.
- **Testes**: telas mostram alça só pro dono; reordenar chama a API certa.
- **Feito (21/10), desvios:** a alça não entra na `Tabela`: botão **Mudar ordem** (só dono) troca a tabela pelas listas de arrastar (`MudarOrdem.tsx`) e **Pronto** volta. Motivo: a tabela tem filtro e busca, e a API pede a lista inteira. Só entra quem aparece na página (serviço ativo; membro ativo e que atende); o resto vai pro fim da ordem. Categorias arrastam numa coluna à parte (só com 2+ categorias com serviço); "Sem categoria" fica sempre no fim. `PreviaDaPagina` é um iframe da página real, então segue sozinha. A página pública e o passo de serviços agrupam por `ordemCategorias` (o passo busca o perfil em paralelo). `ListaReordenavel` passou a comparar os itens pelos ids, não pelo array.

### PR 5 — API: remarcar pelo painel
- `POST /agendamentos/:id/remarcar` (escopo do barbeiro) `{ data, horaInicio, barbeiroId? }`. Mesmo esqueleto do `clientes-me.ts:180`: `garantirFuturo`, transação, `garantirAlteravel`, `updateMany` com status no WHERE, `criarAgendamento` (checa disponibilidade e conflito; `origem: "barbeiro"`), herda serviços, cliente e e-mail do lembrete.
- Permissão: dono e recepção qualquer um; profissional só os próprios e sem trocar de profissional (mesma regra do caixa).
- Depois: `notificarAgendamento(tx, "remarcado", novo.id)`, `agendarLembrete` do novo, e-mail ao cliente (se a pergunta aberta for "sim").
- Agendamento com pagamento registrado ou dia fechado no caixa → 409 com mensagem clara.
- **Testes**: remarca ok; horário ocupado → 409; dia passado → 400; profissional mexendo no de outro → 403; clique duplo gera um só; sobreposição consigo mesmo (10:00→10:15) ok; com pagamento → 409.
- **Feito (21/10), desvios:** códigos seguem a casa — ocupado é `422 horario_indisponivel` e passado `422 horario_passado` (não 409/400); o agendamento do colega é `404` pro profissional (como o GET), e passar o próprio pra outro é `403`. Sem notificação no sino: ele é só do que o cliente faz (`lib/notificacoes.ts`), e o texto diria "Fulano remarcou". E-mail "Seu horário mudou" (antes/agora) sai depois do commit, sem aguardar, se `avisarCliente` (padrão `true`) e houver e-mail. Com pagamento: `409 com_pagamento`; dia fechado (origem ou destino): `409 dia_fechado`.

### PR 6 — Web: "Mudar horário" no detalhe
- `DetalheDoAgendamento`: troca a nota "cancele e crie outro" por **Mudar horário** → janela com dia + horários livres (reusa `Calendario`/`ListaDeHorarios` e a disponibilidade do `NovoAgendamento`) + profissional (quem pode trocar).
- É o caminho acessível e o do celular pro PR 7.
- **Testes**: escolhe dia e horário e chama remarcar; erro 409 mostra a mensagem; profissional não vê troca de profissional.
- **Feito (21/10), desvios:** `JanelaDeRemarcar` (dialog nativo, `depoisDaSaida`) com `Calendario` + `ListaDeHorarios` e a disponibilidade com token (grade livre do painel). Profissional só aparece pra dono/recepção com 2+ que atendem. "Avisar o cliente por e-mail" marcado, só quando o cliente tem e-mail (sem, a janela diz pra avisar pelo telefone). Deu certo, `router.replace` pro agendamento novo (outro id). Agendamento que já passou não mostra o botão. Limite: a disponibilidade não sabe que o próprio sai, então o horário dele e os que o sobrepõem não aparecem — mover 15 min fica pro arrasto (PR 7).

### PR 7 — Web: arrastar na agenda
- `GradeDeTempo`: cada agendamento futuro e alterável é arrastável (`useDraggable`); cada célula de 15min é alvo (`useDroppable`). Vertical = horário (encaixa de 15 em 15); horizontal = dia (semana) ou profissional (dia, só quem pode trocar).
- Durante o arrasto: fantasma do bloco no destino com o horário novo escrito ("11:15 – 11:45"); destino ocupado/fora da jornada fica marcado e não aceita soltar (checagem local com a grade já carregada; a API decide no fim).
- Soltar → janela de confirmação curta ("Mover o corte do João de 10:00 para 11:15?" + "avisar cliente por e-mail" se aplicável) → chama o remarcar do PR 5. Nada muda sem confirmar (evita arrasto acidental no dia corrido).
- Celular: segurar 250ms pra pegar; rolar a agenda continua livre. Teclado: o caminho é o "Mudar horário" (PR 6).
- **Testes**: função pura `destinoDoArrasto(grade, bloco, delta)` (encaixe em 15min, limites da jornada, troca de coluna); soltar abre a confirmação; confirmar chama a API; cancelar não chama.
- **Feito (21/10), desvios:** sem `useDroppable` por célula: o destino sai da distância andada (`destinoDoArrasto(grade, id, { linhas, colunas }, agora)`, `src/painel/arrasto.ts`) e a tela só mede a altura da linha e a largura da coluna ao começar. O bloco fica no lugar (apagado) e o fantasma mostra o destino encaixado ("11:15 – 11:45"), riscado quando inválido (outro agendamento do mesmo profissional, fechado, bloqueio, fora da janela, passado). Sem os atributos do dnd-kit no botão (ensinariam um teclado que a grade não tem). O clique depois de soltar o próprio dnd-kit engole (50ms). Confirmação: `JanelaDeMover` com "avisar o cliente por e-mail" marcado; confirmou, recarrega a agenda. A rota da agenda passa a carregar o `@dnd-kit/core`.

## Validation (por PR, só os afetados)
```bash
cd barchop
pnpm --filter @barchop/database prisma migrate dev     # PR 1 (dev) + migrate deploy no banco de teste
pnpm --filter @barchop/api vitest run tests/<tocados>  # PRs 1, 2, 5
pnpm --filter @barchop/web vitest run tests/<tocados>  # PRs 3, 4, 6, 7
pnpm -r type-check && pnpm lint
```
+ conferir no navegador (dev 3000): mouse, toque (DevTools mobile) e teclado.

## Risks
| Risk | Likelihood | Mitigation |
|---|---|---|
| Arrasto acidental remarcar alguém no dia corrido | Médio | distância 4px / segurar 250ms + confirmação antes de salvar |
| Reordenar equipe mudar quem aparece no Grátis ou quem recebe "qualquer um" | Médio | limite e "qualquer um" seguem por `criadoEm`; teste no PR 2 |
| Cliente chegar no horário antigo | Alto se não avisar | e-mail + lembrete reagendado (pergunta aberta) |
| Remarcar com pagamento ou dia fechado bagunçar o caixa | Médio | 409 nesses casos (PR 5) |
| Conflito de horário entre a checagem local e a API | Baixo | API decide (`criarAgendamento` + EXCLUDE constraint); erro volta o bloco e mostra aviso |
| Toque no celular brigar com rolagem | Médio | `TouchSensor` com espera; agenda no celular também tem o "Mudar horário" |
| Leitor de tela/teclado | Médio | `KeyboardSensor` + anúncios nas listas; na agenda, o caminho é o detalhe |
| Migração em produção | Baixo | só colunas novas com default/backfill, sem lock longo; deploy `migrate deploy` antes da API |

## Fora do escopo
- Reordenar no app mobile (Expo).
- Arrastar pra mudar a duração (puxar a borda do bloco).
- Arrastar bloqueios.
- Desfazer depois de confirmar (o caminho é remarcar de novo).

## Acceptance
- [ ] Dono reordena serviços, categorias e equipe; página pública e prévia mostram a ordem nova
- [ ] Limite do Grátis e "qualquer um" inalterados
- [ ] Painel remarca pelo detalhe e arrastando na agenda, sempre com confirmação
- [ ] Mouse, toque e teclado funcionam (agenda: teclado pelo detalhe)
- [ ] Testes tocados + tsc + lint verdes em cada PR
