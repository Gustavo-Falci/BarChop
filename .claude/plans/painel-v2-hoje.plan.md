# Plan: Painel v2 — Hoje

**Source PRD**: `.claude/prds/painel-v2.prd.md`
**Selected Milestone**: 4 — Hoje
**Complexity**: Medium

## Summary
A tela "Hoje" (`/painel`, `DashboardDoDia`) mostra três números e uma lista
crua do dia. O marco 4 a transforma no lugar de onde o dono **compartilha o
link** (cartão com QR e janela de compartilhar: copiar, WhatsApp,
compartilhar do celular, baixar e imprimir o QR) e **vê o dia sem sair da
tela** (próximos atendimentos com "agora", barra de ocupação certa, por
profissional). A trilha "Primeiros passos" já está em "X de N" e fica.

## O que está errado hoje (motivo da API nova)
`painel/metricas.ts` calcula a ocupação com o horário da **casa** no dia da
semana: ignora pausa do almoço, datas especiais, bloqueios, jornada própria
e a equipe — com 3 profissionais a janela conta uma vez só e a ocupação
passa de 100%. A conta certa já existe na API (`janelaEfetiva`,
`pausaComoOcupado`, `aplicarBloqueios` em `apps/api/src/lib/disponibilidade.ts`);
o painel não deve copiá-la.

## Decisões propostas (o dono confirma ao aprovar o plano)
1. **Ocupação** = minutos agendados ÷ minutos de trabalho, por profissional e
   da casa (soma). Trabalho = janela efetiva (exceção da data > horário da
   casa ∩ jornada) − pausa − bloqueios. Agendado = pendente, confirmado,
   concluído (mesma regra de `CONTAM` hoje; cancelado e falta liberam).
   Dia sem trabalho → "fechado", não 0%.
2. **Quem vê o quê**: dono e recepção veem a casa + uma barra por
   profissional; o profissional vê só a dele (`agendaVisivel`, como na lista).
3. **Próximos atendimentos**: até 5, a partir de agora (o que está em curso
   ganha o selo "Agora"), com hora, cliente, serviços, profissional (só com
   equipe) e status; "Ver o dia na agenda →". Os que já passaram ficam na
   Agenda, não aqui.
4. **Cartão do link** pra todos os papéis (o link é público; o
   `POST /barbearias/me/link-copiado` já é de qualquer membro). Toda ação de
   compartilhar marca o passo "Seu link" da trilha. O "Copiar link" da trilha
   passa a abrir a mesma janela.
5. **QR**: dependência nova `qrcode` (1.5.x, + `@types/qrcode`), gerado no
   navegador, sem API. Baixar = PNG; imprimir = cartaz simples
   (`/painel/compartilhar/cartaz`: nome da casa, QR grande, endereço,
   "Aponte a câmera e agende"), que chama `window.print()`.
6. **WhatsApp** = `https://wa.me/?text=` com frase + link (sem número: o dono
   escolhe o contato). "Compartilhar" só aparece onde `navigator.share` existe
   (celular).
7. **Layout horizontal** ([[telas-horizontais]]): no desktop, números no topo;
   abaixo, à esquerda os próximos atendimentos, à direita cartão do link +
   ocupação. Em 375px, uma coluna: link, próximos, ocupação.

## Patterns to Mirror
| Category | Source | Pattern |
|---|---|---|
| Rota da API | `apps/api/src/routers/horarios.ts:223` (`GET /barbearias/me/horarios/excecoes`) | Rota `GET /barbearias/me/...` com schema de querystring, `barbeariaId` sempre do token |
| Escopo por papel | `apps/api/src/plugins/auth.ts:206` `agendaVisivel` | Profissional enxerga só o próprio `barbeiroId` |
| Conta do dia | `apps/api/src/lib/disponibilidade.ts:282` `agendaDoPeriodo` | Uma consulta por tabela com `in`, resto em memória; reaproveitar `janelaEfetiva`, `pausaComoOcupado`, `aplicarBloqueios` |
| Membros que atendem | `apps/api/src/lib/disponibilidade.ts:183` `PODE_ATENDER` | Mesmo critério da agenda pública |
| Erros | `apps/api/src/lib/erro-negocio.ts`, `routers/agendamentos.ts:212` | `ErroHttp(400, "requisicao_invalida")` pra query ruim |
| Teste de rota | `apps/api/tests/routers/excecoes-de-horario.test.ts` | `buildApp`, `criarBarbeariaComToken`, `criarMembroComToken`, `app.inject`, datas de `helpers/datas` |
| Cliente da API | `packages/api-client/src/barbeiro.ts:321` + `falso.ts:1002` | Método no cliente real e no falso, tipo em `@barchop/types` |
| Tela que olha relógio | `apps/web/src/telas/painel/DashboardDoDia.tsx:21` | `agora` por parâmetro (sem fake timers) |
| Copiar com fallback | `apps/web/src/telas/painel/TrilhaDoOnboarding.tsx:61` | `clipboard.writeText` com fallback "copie à mão"; endereço inteiro via `enderecoDaBarbearia` + `origin` em dev |
| Layout lado a lado | `apps/web/src/componentes/Colunas.tsx` | `LadoALado` no desktop, coluna no celular |
| Peças visuais | `componentes/Estatistica`, `Chip`, `Vazio`, `CabecalhoDaPagina` | Reusar; nada de peça nova onde uma existente serve |
| Teste de tela | `apps/web/tests/painel/*.test.tsx`, `tests/ajudantes/painel.tsx` | Vitest + Testing Library com a API falsa, `getByRole` com nome |

## Files to Change
| File | Action | Why |
|---|---|---|
| `packages/types/src/…` | UPDATE | Tipo `OcupacaoDoDia` (`{ data, casa: {trabalho, agendado} \| null, profissionais: [{id, nome, trabalho, agendado}] }`, minutos) |
| `apps/api/src/lib/ocupacao.ts` | CREATE | Conta pura: minutos de trabalho (janela − pausa − bloqueios) e agendados por profissional |
| `apps/api/src/routers/ocupacao.ts` (ou em `horarios.ts`) | CREATE | `GET /barbearias/me/ocupacao?data=YYYY-MM-DD`, escopo por papel |
| `apps/api/tests/lib/ocupacao.test.ts`, `tests/routers/ocupacao.test.ts` | CREATE | Pausa, exceção, bloqueio de horas e de dia, jornada própria, folga, equipe, profissional só vê a dele, cancelado não conta |
| `packages/api-client/src/barbeiro.ts`, `falso.ts` | UPDATE | `ocupacaoDoDia(data)` |
| `apps/web/package.json` | UPDATE | `qrcode` + `@types/qrcode` |
| `apps/web/src/painel/compartilhar.ts` | CREATE | Puro: endereço inteiro do link, texto e URL do WhatsApp |
| `apps/web/src/componentes/CodigoQr.tsx` | CREATE | SVG do QR a partir de um texto (client) |
| `apps/web/src/telas/painel/hoje/CartaoDoLink.tsx` + css | CREATE | Link, QR pequeno, "Compartilhar" |
| `apps/web/src/telas/painel/hoje/JanelaDeCompartilhar.tsx` + css | CREATE | `<dialog>`: copiar, WhatsApp, compartilhar, baixar PNG, imprimir |
| `apps/web/app/(painel)/painel/(guardado)/compartilhar/cartaz/page.tsx` + tela | CREATE | Cartaz pra imprimir |
| `apps/web/src/telas/painel/hoje/ProximosAtendimentos.tsx` + css | CREATE | Até 5 a partir de agora, selo "Agora" |
| `apps/web/src/telas/painel/hoje/BarraDeOcupacao.tsx` + css | CREATE | Casa + por profissional |
| `apps/web/src/painel/metricas.ts` | UPDATE | `ocupacao` antiga sai (ou passa a ler a resposta da API); `previstoDoDia` fica; `proximos(agendamentos, agora)` puro |
| `apps/web/src/telas/painel/DashboardDoDia.tsx` + css | UPDATE | Montagem nova, horizontal |
| `apps/web/src/telas/painel/TrilhaDoOnboarding.tsx` | UPDATE | "Copiar link" abre a janela |
| `apps/web/tests/painel/*.test.tsx`, `tests/painel/metricas.test.ts` | CREATE/UPDATE | Telas e contas novas |
| `barchop/docs/screens.md`, PRD | UPDATE | Estado do marco 4 |

## Tasks
### Task 4a — Ocupação do dia na API (PR `painel-v2-hoje-ocupacao`)
- **Action**: tipo em `@barchop/types`; `lib/ocupacao.ts` puro em cima de `janelaEfetiva`/`pausaComoOcupado`/`aplicarBloqueios`; rota `GET /barbearias/me/ocupacao?data=`; método no api-client real e falso. Uma consulta por tabela (funcionamento, exceção da data, jornadas, bloqueios, agendamentos), membros com `PODE_ATENDER`.
- **Mirror**: `agendaDoPeriodo`, `agendaVisivel`, `excecoes-de-horario.test.ts`.
- **Validate**: `pnpm --filter ./apps/api exec vitest run tests/lib/ocupacao.test.ts tests/routers/ocupacao.test.ts`; tsc da API e do api-client.

### Task 4b — Cartão do link e janela de compartilhar (PR `painel-v2-hoje-link`)
- **Action**: dependência `qrcode`; `compartilhar.ts` puro; `CodigoQr`; `CartaoDoLink`; `JanelaDeCompartilhar` (copiar, WhatsApp, compartilhar se houver, baixar PNG, imprimir); página do cartaz; toda ação marca o passo do link; a trilha abre a janela. Entra no Hoje ainda no layout atual.
- **Mirror**: `TrilhaDoOnboarding.copiarLink`, `enderecoDaBarbearia`.
- **Validate**: testes de `compartilhar.ts`, da janela (botões, marcação do passo, fallback de cópia, "Compartilhar" some sem `navigator.share`) e do cartaz. **Aprovação visual do dono** (375 e 1440) antes do merge.

### Task 4c — Próximos atendimentos, ocupação e layout horizontal (PR `painel-v2-hoje-dia`)
- **Action**: `proximos()` puro em `metricas.ts`; `ProximosAtendimentos`; `BarraDeOcupacao` lendo a API da 4a (casa + por profissional; "fechado" sem trabalho); `DashboardDoDia` remontado em `LadoALado`; a `ocupacao` antiga sai.
- **Mirror**: `DashboardDoDia` (`agora` por parâmetro), `Colunas`, `Estatistica`, `Chip`.
- **Validate**: testes das contas e da tela com a API falsa (com e sem equipe, profissional, dia fechado, nada pela frente). **Aprovação visual do dono** antes do merge.

### Task 4d — Docs (junto do 4c ou PR curto)
- `screens.md` (Hoje ✅), PRD (marco 4 complete), RETOMAR AQUI.

## Validation
```bash
cd barchop
pnpm --filter ./apps/api exec vitest run tests/lib/ocupacao.test.ts tests/routers/ocupacao.test.ts
pnpm --filter ./apps/web exec vitest run tests/painel tests/componentes
pnpm --filter ./apps/api exec tsc --noEmit
pnpm --filter ./apps/web exec tsc --noEmit
pnpm exec eslint <arquivos tocados>
```
Depois, no Chrome DevTools do ECC com a conta `teste1`: `/painel` em 375px e 1440px, claro e escuro; abrir a janela, copiar, WhatsApp, baixar o PNG e abrir o cartaz.

## Risks
| Risk | Likelihood | Mitigation |
|---|---|---|
| Ocupação da API divergir da agenda pública | Medium | Reusar as mesmas funções de `disponibilidade.ts`, não reescrever; testes com pausa, exceção e bloqueio |
| `qrcode` pesar no bundle do painel | Low | Import dinâmico só quando o cartão/janela monta; conferir no build |
| QR ilegível impresso | Low | Correção de erro "M", margem 4, SVG no cartaz (vetor) |
| `navigator.clipboard`/`share` ausentes (http, desktop) | Medium | Fallback do texto pra copiar à mão; "Compartilhar" só onde existe |
| Fuso: "agora" e "hoje" do navegador x data da API | Low | Mesma `hojeIso(agora)` da tela atual; a API recebe a data, não calcula |
| Chrome cair por memória ao ver as telas | Medium | Listar páginas e reabrir; contexto isolado |

## Acceptance
- [ ] Dono abre `/painel`, toca em "Compartilhar" e manda o link pelo WhatsApp, copia, baixa o QR e imprime o cartaz
- [ ] Compartilhar marca o passo "Seu link" da trilha
- [ ] Próximos atendimentos mostram o que vem a partir de agora, com "Agora" no que está em curso
- [ ] Ocupação respeita pausa, data especial, bloqueio e jornada; uma barra por profissional com equipe; profissional vê só a dele
- [ ] Desktop lado a lado; celular em coluna
- [ ] Testes, tsc e lint passam; aprovação visual do dono em 375 e 1440
