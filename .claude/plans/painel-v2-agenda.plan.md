# Plan: Painel v2 — Agenda

**Source PRD**: `.claude/prds/painel-v2.prd.md`
**Selected Milestone**: 6 — Agenda
**Complexity**: Medium

## Summary
A agenda passa a mostrar o dia como ele é de verdade e a agir sem sair dela: faixa de resumo do dia, botão "Agora", "Bloquear" numa janela dentro da agenda, e o que está fechado (pausa do almoço, fora da jornada, data especial) sombreado — sem oferecer horário livre ali. Hoje a grade (`apps/web/src/painel/grade.ts`) só conhece o horário semanal da casa: ignora data especial, jornada e pausa de cada profissional, e oferece "livre" no meio do almoço, que a API recusa (`horario_na_pausa`). A verdade já existe na API (`janelaEfetiva` + `pausaComoOcupado` em `lib/disponibilidade.ts`, usadas pela ocupação do marco 4); a rota de ocupação passa a devolvê-la, e a vista de dia a desenha.

## Decisões propostas (confirmar com o dono)
1. **"Fechado" sombreado = pausa + fora da jornada + data especial fechada.** Bloqueios continuam como já são (faixa com o motivo) — responde a Open Question do PRD.
2. **Só na vista de dia** (a da equipe e a de quem trabalha sozinho). A semana continua com o horário da casa: precisaria de 7 consultas ou de uma rota de período — fica pra depois, se fizer falta.
3. **"Bloquear" abre uma janela (`<dialog>`) na própria agenda**, com o formulário de Folgas extraído num componente comum; já vem com a data à vista e, na equipe, o profissional escolhido. Alternativa mais simples: botão que leva a `/painel/bloqueios` com a data preenchida.
4. **"Agora"** ao lado de "Hoje", nas vistas de dia e semana: vai pra hoje (se não estiver) e rola a grade até a régua do agora.

## Patterns to Mirror
| Category | Source | Pattern |
|---|---|---|
| Janela do dia | `apps/api/src/lib/ocupacao.ts:96` | `aplicarBloqueios(janelaEfetiva(excecao ?? funcionamento, jornada), …)` + `pausaComoOcupado(jornada)` — nunca uma cópia da regra no painel |
| Rota | `apps/api/src/routers/ocupacao.ts:23` | `agendaVisivel(request).barbeiroId` recorta o profissional; recepção fora (`PODE_ATENDER`) |
| Grade pura | `apps/web/src/painel/grade.ts:147` | entrada em objeto, saída posicionada em linhas de 5 min; `bloqueiosNaColuna` é o molde do recorte por coluna |
| Métricas | `apps/web/src/painel/metricas.ts` | `previstoDoDia`, `percentual`, `proximos` — reusar no resumo |
| Janela | `apps/web/src/telas/painel/hoje/` (compartilhar o link) | `<dialog>` com `showModal`; `tests/setup.ts` já tem o dublê de `showModal`/`close` |
| Barra | `apps/web/src/componentes/SeletorDeVista.tsx:33` | botão "Hoje" — "Agora" entra como prop opcional ao lado |
| Errors | `apps/web/src/telas/painel/Agenda.tsx:106` | `Aviso` com `erro.mensagem` ou frase em português; dado opcional que falha não derruba a agenda |
| Tests API | `apps/api/tests/routers/ocupacao.test.ts` | banco real, `describe` por rota |
| Tests tela | `apps/web/tests/telas/painel/agenda.test.tsx`, `agenda-da-equipe.test.tsx`, `tests/painel/grade.test.ts` | dublê da API, `agora` fixo por prop |

## Files to Change
| File | Action | Why |
|---|---|---|
| `apps/api/src/lib/ocupacao.ts` + `routers/ocupacao.ts` | UPDATE | cada profissional ganha `janela: {abre, fecha} \| null` e `pausa: {inicio, fim} \| null` |
| `packages/types/src/index.ts` | UPDATE | `OcupacaoDoProfissional.janela/pausa` |
| `packages/api-client/src/falso.ts` | UPDATE | dublê devolve janela/pausa (jornada e exceção semeadas) |
| `apps/api/tests/routers/ocupacao.test.ts`, `tests/lib/ocupacao.test.ts` | UPDATE | janela com data especial, jornada e pausa |
| `apps/web/src/painel/grade.ts` | UPDATE | entrada `expediente` por profissional: faixas `fechadas` (antes/depois da janela e pausa) e livres só dentro da janela fora da pausa |
| `apps/web/src/componentes/GradeDeTempo.tsx` + css | UPDATE | desenha as faixas fechadas sombreadas (hachura), régua com `ref` pra rolar |
| `apps/web/src/telas/painel/agenda/ResumoDoDia.tsx` (+ css) | CREATE | faixa: agendamentos · ainda hoje · previsto · ocupação (dia); agendamentos · previsto (semana) |
| `apps/web/src/telas/painel/FormularioDeBloqueio.tsx` | CREATE | formulário extraído de `FolgasEBloqueios` (mesma validação), usado lá e na janela da agenda |
| `apps/web/src/telas/painel/FolgasEBloqueios.tsx` | UPDATE | passa a usar o formulário extraído, sem mudar comportamento |
| `apps/web/src/componentes/SeletorDeVista.tsx` | UPDATE | botão "Agora" opcional e espaço pra ação ("Bloquear") |
| `apps/web/src/telas/painel/Agenda.tsx` | UPDATE | busca a ocupação na vista de dia, resumo, "Agora", "Bloquear" |
| testes de grade, agenda, agenda da equipe, folgas | UPDATE | |
| `docs/screens.md`, PRD, plano, RETOMAR AQUI | UPDATE | fim do marco |

## Tasks

Cinco PRs, TDD (RED → GREEN), push + PR, aprovação visual do dono (375 e 1440) antes de mergear tela.

### PR 6a — API: expediente na ocupação
- **Action**: em `ocupacaoDoDia`, cada profissional devolve também `janela` (a efetiva: data especial > horário da casa, ∩ jornada; `null` se fechado) e `pausa` (da jornada; `null` sem pausa). Mesmo recorte de papel de hoje. Campos aditivos — o Hoje não muda.
- **Validate**: `ocupacao.test.ts` — data especial fechada → `janela: null`; data especial com horas → janela dela; jornada mais curta que a casa → recorte; pausa devolvida; profissional só vê a própria. api-client + tsc.

### PR 6b — Grade com o que está fechado
- **Action**: `gradeDeTempo({ …, expediente? })` — por coluna (profissional, ou a única coluna de quem trabalha sozinho/profissional), `fechadas: { linha, linhas, rotulo }[]` ("Fechado" antes/depois da janela, "Pausa" no almoço) e `livres` só dentro da janela e fora da pausa. Sem `expediente` (semana), tudo como hoje. Na tela: hachura atrás dos eventos (agendamento fora do expediente continua visível por cima).
- **Mirror**: `bloqueiosNaColuna` (recorte na janela da grade).
- **Validate**: `grade.test.ts` (pausa some dos livres e vira faixa; janela menor que a casa; data especial fechada = coluna toda fechada) + `agenda-da-equipe.test.tsx` (sem botão de horário livre às 12:00 de quem almoça).

### PR 6c — Resumo do dia e "Agora"
- **Action**: `ResumoDoDia` acima da grade: dia = "N agendamentos · N ainda hoje (só se for hoje) · previsto R$ X · ocupação Y%" (ocupação da casa, ou "Sua ocupação" do profissional; "Fechado" sem trabalho); semana = "N agendamentos · previsto R$ X". "Agora" no `SeletorDeVista` (dia e semana): vai pra hoje e rola até a régua (`scrollIntoView({ block: "center" })`).
- **Mirror**: `metricas.ts` (contas já testadas), `BarraDeOcupacao` (fechado ≠ 0%).
- **Validate**: `agenda.test.tsx` — números do resumo; "ainda hoje" só hoje; "Agora" navega pra hoje e chama `scrollIntoView` (dublê no setup).

### PR 6d — "Bloquear" na agenda
- **Action**: extrair `FormularioDeBloqueio` de `FolgasEBloqueios` (sem mudar comportamento — testes de folgas continuam passando); botão "Bloquear" na barra da agenda (dia e semana) abre `<dialog>` com o formulário, data à vista preenchida e, na equipe, seletor de profissional (profissional: só ele). Salvou → fecha e recarrega bloqueios e ocupação.
- **Validate**: `jornada-e-bloqueios.test.tsx` intacto; `agenda.test.tsx` — abrir, salvar chama `criarBloqueio` com a data à vista, a faixa aparece na grade.

### PR 6e — Docs
- `docs/screens.md` (Agenda), PRD marco 6 `complete`, plano marcado, RETOMAR AQUI.

## Validation
```bash
cd barchop
pnpm --filter @barchop/api test -- tests/routers/ocupacao.test.ts tests/lib/ocupacao.test.ts
pnpm --filter @barchop/web test -- tests/painel/grade.test.ts tests/telas/painel/agenda.test.tsx tests/telas/painel/agenda-da-equipe.test.tsx tests/telas/painel/jornada-e-bloqueios.test.tsx tests/telas/painel/dashboard.test.tsx
pnpm --filter @barchop/api-client test
pnpm -r --no-bail type-check   # formato já falha antes do marco
pnpm lint
```
Visual: Chrome DevTools, `teste1`, 375 e 1440; pausa e data especial de demo criadas e desfeitas depois.

## Risks
| Risk | Likelihood | Mitigation |
|---|---|---|
| Grade divergir da API sobre o que é fechado | M | a regra vem pronta da API (`janelaEfetiva`); a grade só desenha |
| Agendamento fora do expediente ficar escondido sob a hachura | M | hachura atrás dos eventos; teste com evento na pausa |
| Uma requisição a mais na vista de dia | L | a ocupação já existe e é leve; falha vira grade como hoje, sem derrubar a tela |
| Extrair o formulário quebrar Folgas | M | extração em commit próprio com os testes de folgas verdes antes da janela nova |
| Semana sem sombreado parecer inconsistente | M | decisão 2 explícita; perguntar ao dono no visual |

## Acceptance
- [x] PRs 6a–6e mergeados (#84 expediente na ocupação, #85 grade sombreada, #86 resumo + Agora, #87 Bloquear, `docs-marco-6-agenda`)
- [x] Testes tocados passando; tsc e lint limpos (`packages/formato` já falhava antes do marco)
- [x] Vista de dia não oferece horário livre na pausa nem fora da jornada
- [x] Aprovação visual do dono (375 e 1440)
- [x] Patterns mirrored, not reinvented

## Diferenças do previsto
- O componente do resumo virou `agenda/ResumoDoPeriodo` (dia e semana), não `ResumoDoDia`.
- O formulário extraído é um hook (`useFormularioDeBloqueio`: estado + validação) + `FormularioDeBloqueio` (campos): Folgas põe o botão no cabeçalho da seção e a janela no rodapé, os dois precisam do `salvando` fora do form.
- Conserto junto no 6d: a coluna única (quem trabalha sozinho) não desenhava bloqueio nenhum; passou a usar o id do único expediente.
- Janela da ocupação: o expediente vem ANTES dos bloqueios (bloqueio do dia inteiro não apaga a janela), pra agenda desenhar o bloqueio por cima com o motivo.
