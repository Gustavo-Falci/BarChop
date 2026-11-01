# Plan: Redesenho do painel no celular

**Fonte**: manual `barchop/docs/UI_UX_DESIGN_GUIDELINES.md` (#258) e o canvas do Claude Design com as 8 telas nos dois temas (https://claude.ai/artifact/LpMm9AAYAVzsQXsZB1w7Xb). O canvas é direção, não especificação: regra de negócio e decisão registrada no código valem mais que ele (manual §18.4–5).

## Princípios
- Peça compartilhada primeiro: um conserto no componente vale pras telas que o usam (`CabecalhoDaPagina` em 7 telas; `Tabela` e `PilulasDeFiltro` em Planos, Clientes, Serviços e Equipe).
- Só dentro das media queries do celular, salvo quando dito. O desktop não muda sem pedir.
- TDD como no resto do repo: teste RED, depois GREEN. O jsdom não faz layout: regra de CSS se testa lendo o `.module.css` (padrão de `grade-de-tempo-no-celular.test.ts`).
- Os dois temas: toda cor por token (`--cor-*`), nada de hex na tela.
- Um PR por vez; merge só com "pode mergear".

## PRs

### PR 1 — Peças comuns no celular (branch `redesenho-celular-pr1`)
- `Tabela`: nome do cartão alinhado com as outras linhas (o botão somava 16px ao recuo do cartão); título de grupo vira título de seção, sem caixa dentro de cartão.
- `CabecalhoDaPagina`: quebra em vez de empilhar; título curto e um botão dividem a linha.
- `CampoDeBusca`: dica da tecla / some com `hover: none`.
- Fora: `PilulasDeFiltro` continua quebrando linha (decisão do CSS: "um filtro escondido fora da tela é um filtro que ninguém usa"). O canvas mostra rolagem de lado; o dono decidiu em 31/10: **mantém quebrando linha**.

### PR 2 — Hoje
- No celular, sem "Novo agendamento" no cabeçalho (o "Novo" da barra de baixo faz o mesmo). No desktop o botão fica: lá não há barra de baixo.
- Resumo do dia em três números sem quebrar o rótulo.
- QR code recolhido atrás de um botão; link com copiar.

### PR 3 — Agenda no celular
- **Não** trocar a vista padrão: no celular já é "Lista", e a vista escolhida fica guardada (`vistaPadrao`, `CHAVE_DA_VISTA`). A semana do print era escolha guardada.
- Rótulos nos ícones da barra (o "31" e o calendário-x).
- Conferir os rótulos da barra de baixo, que pareciam cortados no print (possível bug).
  - Achado: era a Agenda mais larga que a tela (coluna `auto` do `.pagina`); o celular encolhia a página e a barra de baixo descia além da borda. Corrigido com `minmax(0, 1fr)`.
  - Fica: a 360px, meses de 8–9 letras (setembro a dezembro, fevereiro) ainda cortam com reticências no título da barra.

### PR 4 — Caixa
- Dia anterior / próximo numa barra só, com volta pra hoje.
- "Fechar o dia" embaixo, depois dos valores; a confirmação continua só com pendência.

### PR 5 — Planos, Folgas, Serviços, Equipe
- Equipe estoura a 360px (página com 372px): "Mudar ordem" + "Convidar membro" no cabeçalho somam 356px onde cabem 328. Tirar o "Mudar ordem" do cabeçalho resolve; conferir de novo com a varredura das rotas a 360px. As outras telas do painel ficaram em 360px (31/10). Folgas mora em `/painel/bloqueios`. Depois do PR 5, todas em 360px.
- "Mudar ordem" sai do cabeçalho (era secundário acima do principal); um lugar só nas duas telas.
- Folgas: estado vazio com ícone e orientação.
- Planos: explicação do "Mostrar na página" junto do switch; o selo "Desativado" fica (`plano.ativo` falso).
  - Já estava feito: a frase do efeito fica logo abaixo do switch, nos dois estados, com `aria-describedby`. Sem mudança no PR 5.

### PR 6 (a decidir) — Linhas de lista sem rótulo
- Cada tela daria o conteúdo da linha no celular (nome, detalhe, valor à direita), no lugar do "Rótulo: valor". Precisa de prop nova na `Tabela`; só com o conteúdo por tela não se perde informação.

## Conferência visual
- Semente: `pnpm --filter @barchop/api exec tsx scripts/conferencia-visual.ts` (sobe a API em :3333 já semeada), `next dev`, login `gustavo@exemplo.com` / `senha-forte-123` (token em `sessao.barbeiro`).
- A olhar num PR seguinte: vão de ~60px acima do título no celular junto da faixa "Teste grátis" (bloco de 150px antes do `main`).
- Não há semente de dados no repo para subir o painel logado no banco de teste (`gr_barber_test`). A de 31/10 (`apps/api/tests/visual-semente.ts`) era temporária e não existe mais.
- A cada PR: conferir em 390 px e 1280 px, nos dois temas. O dono escolheu (31/10) criar uma semente própria no banco de teste, reaproveitável nos PRs seguintes (cuidado: o `.env.test` tem BOM e o `node --env-file` cai no banco de dev).
