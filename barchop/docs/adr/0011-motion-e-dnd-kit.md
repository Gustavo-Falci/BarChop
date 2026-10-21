# ADR-0011: `motion` pra animação e dnd-kit pra arrastar no web

**Date**: 2026-10-21
**Status**: accepted
**Deciders**: Gustavo Falci (dono do produto), Claude

## Context

O dono pediu (19/10) mais movimento no web: telas trocando de uma vez,
janelas e menus sumindo sem saída e listas aparecendo secas deixam o
painel duro. O CSS cobre bem hover e entrada, mas não a saída de algo
que o React desmonta, um indicador que desliza entre itens, ou uma
lista cujos vizinhos fecham o buraco. No mesmo pedido entrou arrastar
pra reordenar serviços e equipe e remarcar na agenda — e o arrastar
precisa animar os vizinhos com o mesmo ritmo do resto. O dono escolheu
fazer com biblioteca ("Faz com lib").

## Decision

Animação no web pela lib `motion` (`motion/react`), versão fixa
`13.5.1`, sempre por `LazyMotion` + `domAnimation` + componente `m`, com
`MotionConfig reducedMotion="user"` na raiz. Arrastar pelo dnd-kit
(`@dnd-kit/core` 6.3.1, `sortable` 10.0.0, `utilities` 3.2.2,
`modifiers` 9.0.0), também em versão fixa. Durações, curvas e molas
moram em `apps/web/src/movimento/tokens.ts`, de onde o CSS também lê as
suas — nenhum número de movimento solto em componente.

## Alternatives Considered

### Alternativa 1: só CSS (keyframes, `@starting-style`, View Transitions)
- **Pros**: zero KB; o navegador faz tudo.
- **Cons**: saída de elemento desmontado e reordenação de lista exigem
  código próprio frágil; View Transitions ainda variam entre navegadores.
- **Why not**: o arrastar precisaria de outra base de qualquer jeito, e
  os dois ritmos iam divergir.

### Alternativa 2: `motion` 14
- **Pros**: versão mais nova.
- **Cons**: saiu em 02/10 e teve 6 releases em 17 dias.
- **Why not**: esperar assentar; a 13.5.1 tem o que o plano usa.

### Alternativa 3: arrastar com a própria `motion` (`Reorder`)
- **Pros**: uma lib só.
- **Cons**: sem teclado nem leitor de tela prontos, e só lista em uma
  dimensão — a agenda é grade.
- **Why not**: o dnd-kit traz sensores de teclado e toque e anúncios
  acessíveis.

## Consequences

### Positive
- Saída animada, indicador deslizante e listas que reorganizam, todos
  com o mesmo ritmo do CSS.
- Quem pediu menos movimento no sistema só vê fade.

### Negative
- Bundle maior: a `motion` entra no layout raiz (~5KB com `LazyMotion`,
  features carregadas uma vez); o dnd-kit só nas telas que arrastam.
- Duas libs novas pra acompanhar versão.

### Risks
- **Alguém usar `motion.div` cheio e trazer a lib inteira.** Mitigação:
  `LazyMotion strict` quebra no dev.
- **Flash na hidratação.** Mitigação: `initial` igual ao HTML do
  servidor; entrada só depois de montar.
- **Transform num container com `position: fixed` dentro** move a barra
  fixa junto. Mitigação: a troca de tela anima só opacity.
- **Testes esperando elemento sumir.** Mitigação:
  `MotionGlobalConfig.skipAnimations` no `tests/setup.ts`.
