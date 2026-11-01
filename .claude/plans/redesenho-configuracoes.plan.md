# Plan: Redesenho das Configurações no celular

**Fonte**: manual `barchop/docs/UI_UX_DESIGN_GUIDELINES.md` e o canvas do Claude Design, página "Configurações", com 11 pranchas nos dois temas (https://claude.ai/artifact/LpMm9AAYAVzsQXsZB1w7Xb). O dono aprovou o desenho em 01/11 e as quatro decisões abaixo. O canvas é direção, não especificação: regra de negócio e decisão registrada no código valem mais que ele (manual §18.4–5).

## Decisões do dono (01/11)
1. **Horários**: sai o cartão "rotina da semana", que repetia a lista dos dias. Ficam os atalhos ("Preencher a semana com…") e a lista de 7 dias, um por linha, com abre–fecha e um interruptor.
2. **Divisão**: no celular, a tabela "Cliente de outro profissional" vira lista ("X atende cliente de Y", com o campo de %). No computador, a tabela fica.
3. **Pagamentos**: a conta conectada fica resumida, com "Trocar chave" e "Desconectar"; o formulário aparece só na conta que falta.
4. **Notificações**: a caixinha do lembrete vira interruptor (`role="switch"`). Os testes mudam de propósito.

## Princípios
- Peça compartilhada primeiro: um conserto no componente vale pra todas as telas que o usam.
- Celular primeiro, mas o desktop é conferido a cada PR (1280px). Mudança só do celular fica em media query.
- As palavras do código valem mais que as do canvas: o selo é "Configurado"/"Faltando" (canvas: "Feito"/"Falta"), a consequência vem de `areas.ts`, e "Próxima área faltando" vem de `proximaFaltando()`.
- TDD: teste RED, depois GREEN. Regra de CSS se testa lendo o `.module.css`, porque o jsdom não faz layout.
- Os dois temas: toda cor por token (`--cor-*`).
- Um PR por vez; merge só com "pode mergear".

## Achados da conferência (01/11, 390px, escuro)
- **Dados do negócio com 656px de largura.** `.pagina` (Configuracoes.module.css) é grid sem `grid-template-columns`; a coluna `auto` cresce com o `.ladoALado`. Com `minmax(0, 1fr)` volta a 390. É o mesmo padrão já corrigido na Agenda.
- **Vão de ~72px acima do título** em telas curtas (Seu perfil, Comunicação, Notificações). No celular, `.coluna` do shell tem `grid-template-rows: auto auto` e altura de 100vh; a sobra se reparte entre as duas linhas e a de cima (topo + faixa "Teste grátis") cresce. Vale pro painel inteiro, não só as Configurações.
- **Barra de salvar em duas linhas.** `BarraDeMudancas`: `.resumo` com `flex: 1 1 240px` não cabe ao lado dos botões em 358px, e os botões descem. Cobre o conteúdo acima da barra de baixo.
- **Escolhas que quebram com uma opção sozinha** (`SeletorEmPilulas`, flex-wrap): "24 h / 12 h" e "2 h" embaixo; o mesmo nas regras.
- **Índice**: a frase de apoio fica por cima do "0 de 6 decididas"; cada linha repete "Configurar →".

## PRs

### PR 1 — Peças comuns (branch `redesenho-config-pr1`)
- `.pagina`: `grid-template-columns: minmax(0, 1fr)`.
- Shell no celular: `.coluna` com `grid-template-rows: auto 1fr` (o conteúdo fica com a sobra, não o topo).
- `BarraDeMudancas` no celular: resumo e botões numa linha; o aviso de erro segue na linha de baixo.
- `SeletorEmPilulas`: prop `preencher`. No celular, as opções viram colunas iguais, sem opção sozinha (até 3 por linha; 4 → 2 + 2). Usado onde o canvas mantém o segmentado: Notificações ("Quando sai"), Pagamentos ("Onde você recebe") e Aparência ("Modo padrão").

### PR 2 — Índice
- Contagem com barra própria; apoio embaixo, sem sobrepor.
- Cada área é uma linha: nome + selo, e embaixo o resumo (decidida) ou a consequência em âmbar (faltando). Chevron no lugar de "Configurar →".
- Dinheiro e Você na mesma lista, sem selo (não são áreas de `AREAS`).

### PR 3 — Horários
- Sai o cartão da rotina; os atalhos preenchem a semana.
- Lista de 7 dias: nome curto, abre – fecha, interruptor. Dia fechado mostra "Fechado".
- Datas especiais e Pausas da equipe em lista (pausa leva pra `/painel/equipe/<id>`, como hoje).
- Salvar pela `BarraDeMudancas`.

### PR 4 — Regras de agendamento
- Cada regra vira uma linha com o valor à direita; tocar abre a escolha numa folha de baixo (rádios, "Usar esta"). Booleanas viram interruptor na própria linha.
- O efeito de cada escolha ("O cliente vê horários de 15 em 15 minutos") fica como apoio da linha.

### PR 5 — Dados do negócio
- Abas Identidade, Marca e Comodidades, sem rolar de lado em 360px.
- Link da página com "Copiar link" e "Pedir outro link" (o pedido abre o formulário que já existe).

### PR 6 — Aparência
- Logo e capa resumidos numa linha (aponta pra Dados → Marca).
- Temas em grade de 2 com "Mostrar mais"; Modo padrão com `preencher`; a prévia abre por botão.

### PR 7 — Comunicação, Notificações e Seu perfil
- Formulário num cartão; salvar pela barra.
- Notificações: caixinha → interruptor (decisão 4).

### PR 8 — Divisão do dinheiro
- No celular, "Cliente de outro profissional" em lista (decisão 2); exemplo de um corte de R$ 100 no fim.

### PR 9 — Pagamentos online
- As duas contas num cartão; a conectada resumida (decisão 3); ajudas em linhas que abrem.

## Resultado (01/11)
Concluído: os 9 PRs mesclados, #269 a #277, na ordem acima.
- Desvios registrados nos PRs: o selo do índice é "Configurado"/"Faltando" e a consequência fica cinza (#270); o botão segue "Trocar a chave" (canvas: "Trocar chave"); "Como funciona na InfinitePay" fica atrás de uma linha, com "Não renova sozinha" à vista (#277).
- Peças novas: `Interruptor` (#271), `FolhaDeEscolha` (#272), `FolhaDeAjuda` (#277), `BarraDeMudancas` com `podeSalvar` (#276).
- Fora do escopo, sem PR: "Mostrar a chave" e o "$" no campo da InfiniteTag (Pagamentos).

## Conferência visual
- Semente `apps/api/scripts/conferencia-visual.ts` (API em :3333 já semeada no banco de teste), `next dev`, token em `sessao.barbeiro`.
- A cada PR: 360, 390 e 1280px, nos dois temas. Estender a semente com o que a tela pedir (horários, datas especiais, divisão), sem chave real nem id real.
