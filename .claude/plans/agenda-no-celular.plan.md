# Plan: Agenda no celular (no jeito do Google Agenda)

**Source**: pedido do dono 24/10 ("melhorar a tela de agenda quando for Mobile, use de exemplo o app Agenda do Google"); 10 prints do Google Agenda; telas montadas no Claude Design e **aprovadas pelo dono em 24/10**: https://claude.ai/artifact/Vus5qcnD2mRpy5orskvtGy (1 Lista · 2 Dia por profissional · 3 · 3 dias · 4 Semana · 5 Mês · 6 Menu lateral)
**Complexity**: Large (7 PRs; só web; nenhuma migração, nenhuma rota nova)
**Alvo**: o painel web abaixo de 900px (o mesmo corte da barra inferior, `NavegacaoDoPainel.module.css:272`). O app do Expo (`apps/mobile`) ainda não tem agenda; o comentário em `GradeDeTempo.module.css:401` ("o cliente móvel do barbeiro é o app do Expo") fica desatualizado e sai no PR 5.

## Summary
No celular a agenda é a do desktop espremida: barra com Hoje/Agora/‹ ›/título/Bloquear/Dia·Semana·Mês quebrando em várias linhas, a faixa de resumo, e a semana com colunas de 120px que rolam de lado (`GradeDeTempo.module.css:405`). O plano dá ao celular uma agenda de celular: uma barra só (☰ · mês ▾ · ‹ › · Hoje · Bloquear), menu lateral com as vistas e os profissionais, a vista **Lista** (nova), **3 dias** (nova), Semana e 3 dias cabendo na largura, Mês com nomes, e o status do agendamento legível no bloco (vale pro desktop também).

## Decisões (minhas, a confirmar com o dono na revisão do plano)
- **Navegar entre períodos: setas ‹ › na barra**, ao lado do título. O desenho tirou as setas, mas sem elas não há como ir pra amanhã. Deslizar de lado fica de fora da v1: briga com o segurar-250ms do arrasto (`GradeDeTempo.tsx`, `TouchSensor`) e com a rolagem. O "mês ▾" abre o `Calendario` (`src/componentes/Calendario.tsx`) pra pular pra qualquer dia.
- **Status no bloco** (os 5 do `StatusAgendamento`, `schema.prisma:15`):
  - `confirmado` → bloco cheio no tom do profissional (como hoje);
  - `pendente` → **contorno tracejado** no tom, texto no tom, e "aguardando confirmação" pro leitor de tela;
  - `concluido` → apagado (opacidade), continua clicável;
  - `no_show` → apagado e riscado ("faltou");
  - `cancelado` → não aparece (como hoje, `grade.ts:188`);
  - **em atendimento** não é status: é derivado do relógio (agora dentro do horário, status `pendente`/`confirmado`) e ganha um anel na cor da marca.
  - O ✓ de `presencaConfirmadaEm` (cliente confirmou pelo link) continua como está. Tracejado é o status da agenda, não o link do lembrete.
- **Filtro de profissionais: vários ao mesmo tempo** (as caixinhas do desenho aprovado). A URL passa de `?profissional=<id>` pra `?profissionais=<id>,<id>`, lendo o formato antigo. Vale em todas as vistas: no Dia, quem sai do filtro perde a coluna. No desktop as pílulas viram alternáveis ("Todos" limpa). Profissional (papel) não vê a seção, porque só vê a própria agenda.
- **Lista**: 14 dias a partir da data da URL, com "Mostrar mais 14 dias" no fim (sem rolagem infinita na v1). Mostra agendamentos e **bloqueios** (`api.barbeiro.bloqueios(de, ate)` já aceita intervalo). **Não** mostra a pausa do expediente: ela vem da ocupação, uma chamada por dia. Hoje: o que já passou fica recolhido em "Mais cedo · N atendidos". Dia fechado: "Fechado". Dia aberto vazio: "Nenhum horário. Toque para marcar." (link pro Novo com a data).
- **Vista padrão**: no celular, **Lista**; no desktop, **Semana** (como hoje). Decidido no cliente com `window.matchMedia?.("(max-width: 900px)")` (o `?.` deixa o jsdom no desktop e os testes de hoje não mexem). A última vista escolhida fica guardada no aparelho (`localStorage`, com try/catch) e vale quando a URL não traz `vista`. Sem buscar duas vezes: a vista se resolve antes da primeira requisição.
- **Desktop**: o `SeletorDeVista` ganha "Lista" e "3 dias" (5 opções), e mais nada muda. As vistas novas e o status no bloco valem nos dois.
- **Resumo do período** (`ResumoDoPeriodo`): some abaixo de 900px. O desenho aprovado não tem, e o Hoje já mostra os mesmos números.
- **Dia com 4 ou mais profissionais no celular**: até 3, as colunas dividem a largura. Com 4 ou mais, as colunas ficam com 110px no mínimo e o quadro rola de lado, como hoje, com o eixo de horas preso à esquerda. A outra saída é o filtro do menu.
- **Cores e fontes: os tokens, não o desenho.** `--cor-*`, os `data-tom` 0 a 5 que já existem (`GradeDeTempo.module.css:282`) e `--fonte-display` (Clash Grotesk). Os hex e a Space Grotesk do canvas eram só pra desenhar. Claro e escuro pelos tokens; o canvas só desenhou o escuro.
- **Barra inferior**: a de hoje (Hoje · Agenda · Novo · Caixa · Mais). Sem botão + flutuante, porque o "Novo" já faz isso.

## Patterns to Mirror
| Category | Source | Pattern |
|---|---|---|
| Vista na URL com queda silenciosa | `src/telas/painel/Agenda.tsx:29` (`lerVista`) | valor estranho cai no padrão, sem erro |
| Intervalo por vista | `Agenda.tsx:80` | um caminho de dados, limites variando por vista |
| Ocupação dia a dia | `Agenda.tsx:125` | `Promise.all` da rota do dia, presa ao primeiro dia |
| Grade | `src/painel/grade.ts` (`gradeDeTempo({ dias })`) | 3 dias = `dias` com 3 datas, sem código novo de grade |
| Bloco e tons | `src/componentes/GradeDeTempo.tsx:422` (`BlocoDoEvento`, `data-tom`) | atributo `data-*` + CSS; nada de cor no JS |
| Janela com saída animada | `src/telas/painel/agenda/JanelaDeMover.tsx` (`depoisDaSaida`) | `<dialog>` nativo, `onClose` segurado até a saída |
| Indicador deslizante | `src/componentes/SeletorDeVista.tsx:83` (`Indicador`) | `layoutId` do motion |
| Calendário | `src/componentes/Calendario.tsx` | o mesmo do Novo agendamento e do Mudar horário |
| Pílulas de filtro | `src/componentes/PilulasDeFiltro.tsx` | rótulo do grupo, "Todos" |
| Testes web | `apps/web/tests/telas/painel/agenda.test.tsx`, `mover-na-agenda.test.tsx` | Vitest + Testing Library; `agora` fixo por prop |

Todo PR de web lê antes o guia em `apps/web/node_modules/next/dist/docs/` (pedido do `apps/web/AGENTS.md`).
Testes do celular: um ajudante `comTelaDeCelular()` em `tests/` que dubla `window.matchMedia` (`max-width: 900px` → true) e desfaz no `afterEach`.

## PRs

### PR 1: Status no bloco da grade
- `BlocoDoEvento` ganha `data-status` (`pendente`/`confirmado`/`concluido`/`no_show`) e `data-agora` (em atendimento, pelo `agora` que a grade já recebe). CSS: tracejado no tom, apagado, riscado, anel. O nome acessível do botão ganha ", aguardando confirmação", ", atendido", ", faltou", ", em atendimento".
- O mesmo na `GradeDoMes` só onde houver bloco (PR 6).
- **Testes**: cada status põe o `data-status` e a frase no nome do botão; em atendimento só com `agora` dentro do horário; cancelado não aparece; o ✓ de presença segue.

### PR 2: Vistas "lista" e "3 dias" na URL e nos dados
- `Vista` = `"lista" | "dia" | "3dias" | "semana" | "mes"`. `lerVista` aceita as novas, mantendo a queda silenciosa.
- Intervalos: 3 dias = `[data, data+2]`; lista = `[data, data+13]` (com "mostrar mais" estendendo `ate`). Passo das setas: 1 dia, 3 dias, 7 dias, mês; na lista, 14 dias.
- 3 dias usa a `GradeDeTempo` com `dias` de 3 datas, a ocupação de cada dia (como a semana) e os bloqueios do intervalo.
- `SeletorDeVista` (desktop) com as 5 opções. A Lista entra aqui como um esqueleto (só a lista de dias); o desenho vem no PR 4.
- Vista padrão: celular → lista, desktop → semana; última vista lembrada no aparelho.
- **Testes**: `?vista=3dias` mostra 3 colunas e anda de 3 em 3; `?vista=xyz` cai no padrão; no celular (`comTelaDeCelular`), sem `vista` abre a lista; a vista guardada vale sem `vista` na URL; uma requisição só ao abrir.

### PR 3: Barra do celular e menu lateral
- Abaixo de 900px a `SeletorDeVista` dá lugar a `BarraDaAgendaNoCelular`: ☰ · título ▾ (mês, ou "24 out" no dia) · ‹ › · Hoje (ícone com o dia) · Bloquear (cadeado). Alvos de 44px, `aria-label` nos ícones. A barra gruda abaixo da barra do topo (`BarraDoTopo`).
- `MenuDaAgenda` (`<dialog>` que entra pela esquerda, saída com `depoisDaSaida`, "reduzir movimento" respeitado): nome da barbearia; "Ver como": Lista, Dia, 3 dias, Semana, Mês (a atual marcada); "Profissionais": caixinhas com a cor de cada um e quantos tem hoje (só pra quem vê a equipe); Bloquear horário; Regras de agendamento.
- Título ▾ abre o `Calendario` numa folha; escolher um dia vai pra ele na vista atual.
- `ResumoDoPeriodo` escondido abaixo de 900px.
- **Testes**: no celular, a barra nova aparece e a `SeletorDeVista` não; ☰ abre o menu, escolher "3 dias" navega e fecha; Esc fecha; título ▾ e escolher o dia 28 vão pra `data=…-28`; ‹ › andam no passo da vista; o profissional não vê a seção Profissionais; desktop sem mudança.

### PR 4: A vista Lista
- `src/telas/painel/agenda/ListaDaAgenda.tsx`: um bloco por dia (dia da semana e número; hoje com o número no círculo da cor da marca), cartões em ordem de horário com cliente · serviço, horário, etiqueta do profissional (só com 2+) e o status do PR 1. Bloqueios listrados ("12:00 – 13:00 · Almoço do Gui"). A régua do agora entre os cartões de hoje. "Mais cedo · N atendidos" recolhido (botão `aria-expanded`). Separador de semana ("26 out – 1 nov"). Dia fechado: "Fechado"; dia aberto vazio: "Nenhum horário. Toque para marcar."
- Tocar no cartão abre o detalhe (`/painel/agendamentos/:id`). "Mostrar mais 14 dias" no fim.
- **Testes**: agrupa por dia em ordem; recolhe o que já passou hoje e abre no toque; régua do agora entre o último passado e o próximo; bloqueio aparece; domingo fechado diz "Fechado"; dia vazio leva pro Novo com a data; filtro de profissionais esconde os de quem saiu; "Mostrar mais" estende o intervalo.

### PR 5: Semana e 3 dias cabendo no celular
- Abaixo de 900px, sai o `minmax(120px, 1fr)` e a rolagem de lado: Semana com 7 colunas e 3 dias com 3, na largura da tela. Eixo de horas estreito ("09", "10" na semana). Bloco compacto: só o nome do cliente (o serviço some abaixo de ~60px de coluna; o horário vai pro nome acessível). Cabeçalho com dia da semana e número, hoje no círculo.
- O arrasto continua: `destinoDoArrasto` (`src/painel/arrasto.ts`) com 3 e 7 colunas estreitas.
- Dia com 4+ profissionais: colunas de 110px no mínimo e rolagem de lado com o eixo preso (ver Decisões).
- Atualiza o comentário do `GradeDeTempo.module.css:401`.
- **Testes**: arrasto numa semana de 7 colunas estreitas cai no dia e no horário certos; com 3 colunas idem; o nome acessível do bloco compacto traz o horário e o serviço.

### PR 6: Mês com nomes
- `GradeDoMes`: em cada dia, até 3 pílulas com o nome do cliente no tom do profissional (status do PR 1: tracejada se pendente), e "+N" quando há mais. Dia fechado com o número apagado. Hoje com o número no círculo. Tocar no dia abre a vista Dia (como hoje).
- O nome acessível do dia diz quantos agendamentos tem ("Abrir 24 de outubro, 16 agendamentos").
- **Testes**: até 3 nomes e "+N"; dia sem agendamento sem pílula; nome acessível com a contagem; filtro de profissionais vale no mês.

### PR 7: Filtro de vários profissionais
- `?profissionais=a,b`, lendo `?profissional=a` antigo. Aplica em todas as vistas: a Lista e o Mês filtram cartões; Semana e 3 dias filtram blocos e expediente (como `Agenda.tsx:210` faz com um); o Dia tira a coluna de quem saiu. Sem ninguém marcado = todos.
- Desktop: `PilulasDeFiltro` alternáveis ("Todos" limpa).
- **Ordem**: este PR vem **antes do PR 3** na execução (o menu usa o filtro). Ficou numerado por último porque é o que mais mexe em regra; pode ser cortado se o dono preferir o filtro de um só (aí o menu usa a lista de um só, como as pílulas de hoje).
- **Testes**: `?profissional=` antigo ainda filtra; dois marcados mostram os dois; no Dia, desmarcar tira a coluna; pílulas do desktop alternam; id que não atende é ignorado.

**Ordem de execução sugerida**: PR 1 → PR 2 → PR 7 → PR 3 → PR 4 → PR 5 → PR 6.

## Fora (v1)
- Deslizar pra trocar de período; rolagem infinita na Lista; pausa do expediente na Lista; desenho claro no canvas; agenda no app do Expo.

## Decidido pelo dono (24/10)
Plano aprovado e "sim" pras quatro perguntas: (1) o alvo é o painel web no celular; (2) setas ‹ › na barra; (3) filtro de vários profissionais (PR 7 fica); (4) o celular abre na Lista. "Pode fazer todas as PRs seguidas": empilhadas, na ordem de execução, cada uma sobre a anterior; merge só com "pode mergear".
