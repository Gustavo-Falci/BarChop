# Plan: Motion sutil no web (com a lib `motion`)

**Source**: pedido do dono 19/10 ("mais motion design, animações, mais suave"); dono escolheu **com lib** ("Faz com lib")
**Escopo decidido**: painel + agendamento público + site de marketing · intensidade **sutil e rápida** (100–280ms, estilo Linear/Stripe)
**Complexity**: Medium (6 PRs pequenos, só `apps/web`, sem migração, sem API)
**Irmão**: `.claude/plans/arrastar-e-reordenar.plan.md` (dnd-kit) — depende do PR 1 deste (tokens + springs)

## Summary
Hoje o web tem 2 durações, 2 curvas e 6 keyframes soltos; telas trocam de uma vez, janelas e menus somem sem saída, listas aparecem secas. O plano adota a lib `motion` (`motion/react`), cria a base (tokens, springs, gate de movimento reduzido) e aplica em camadas: troca de tela, janelas/menus com saída, micro-interações, listas, fluxo público e site.

## Decisão de arquitetura (ADR 0011)
- **`motion` (`motion/react`), versão fixa `13.5.1`** (02/10, >2 semanas; a 14 saiu 02/10 e teve 6 releases em 17 dias — esperar assentar). Nunca importar de `framer-motion`.
- Por quê: saída animada de coisa que o React desmonta (`AnimatePresence`), indicador deslizante entre itens (`layoutId`), listas que reorganizam (`layout`) e molas consistentes — tudo que CSS puro faz mal. E o arrastar (plano irmão) anima os vizinhos com a mesma base.
- Peso: ~35KB gz no 1º uso. Mitigação: `LazyMotion` + `domAnimation` + componente `m` (≈ 5KB inicial, features carregadas sob demanda); o site de marketing só carrega o que usa.
- CSS continua dono do hover/cor/`:active` simples (`globals.css:86`, `Botao.module.css:18`) — `motion` só onde há montar/desmontar, layout ou sequência.
- Regras (de `motion-foundations`):
  - só `transform` e `opacity`; nunca width/height/top/margin;
  - toda duração, curva e mola vem de `src/movimento/tokens.ts` — nada de número solto em componente;
  - `"use client"` em todo arquivo que importa `motion/react`;
  - `initial` igual ao que o servidor renderiza (sem flash/hydration): entrada só depois de montar, ou `initial={false}`;
  - movimento reduzido: `<MotionConfig reducedMotion="user">` na raiz + regra global de `globals.css:98` mantida → só fade ≤ 200ms, nada desliza/escala.

## Patterns to Mirror
| Category | Source | Pattern |
|---|---|---|
| Tokens CSS de movimento | `barchop/apps/web/app/tokens-css.ts:69` | `varsDeMovimento` injeta `--curva-*` / `--duracao-*` no `:root` |
| Janela nativa | `barchop/apps/web/app/globals.css:110` | `dialog[open]` + `@keyframes janela-entra`, comentário com o porquê e o tempo |
| Movimento reduzido | `barchop/apps/web/app/globals.css:98` | media query global zerando duração |
| Feedback de toque | `barchop/apps/web/src/componentes/Botao.module.css:18` | transição própria de `transform` no componente |
| Layout do painel | `barchop/apps/web/src/painel/LayoutDoPainel.tsx:33` | `<main>` → `.container` com children |
| Passos do fluxo | `barchop/apps/web/src/fluxo/passos.ts` | passo = rota; ordem já definida |
| Hooks client | `barchop/apps/web/src/painel/useAgora.ts` | `use*` em `src/<área>/`, `"use client"` no topo |
| Testes | `barchop/apps/web/tests/` + `tests/setup.ts` | Vitest + Testing Library, jsdom, imports explícitos |

## PRs

### PR 1 — Base: lib, tokens, ADR e troca de tela
- `pnpm --filter @barchop/web add motion@13.5.1` (exato, sem `^`).
- **`src/movimento/tokens.ts`**: `DURACAO` (instante .1, curta .16, media .2, longa .28), `CURVA` (entrada = mesma `cubic-bezier(0.2,0.8,0.2,1)` do CSS, saída, padrão), `DESLIZE` (curto 4, normal 8), `ESCALA` (aperto .97, janela .98), `MOLAS` (`firme` p/ UI, `suave` p/ janela/cartão, `solta` p/ soltar arrasto). Sem mola com quique (sutil).
- `tokens-css.ts`: acrescentar `--duracao-instante` e `--duracao-longa` lidos do mesmo `DURACAO` (uma fonte só).
- **`src/movimento/ProvedorDeMovimento.tsx`**: `LazyMotion features={domAnimation} strict` + `MotionConfig reducedMotion="user"`; no layout raiz (`app/layout.tsx`).
- **`src/movimento/EntradaDaTela.tsx`**: ao mudar o `pathname`, o container entra com fade + 4px (200ms). Sem `key={pathname}` → não remonta a tela nem perde estado (usa `useAnimate` no ref). Pula a 1ª renderização.
- Aplicar no `.container` do `LayoutDoPainel` e no layout de `(publico)/[slug]`.
- `tests/setup.ts`: `MotionGlobalConfig.skipAnimations = true` → saídas terminam na hora e os testes que esperam elemento sumir seguem valendo.
- ADR `barchop/docs/adr/0011-motion-e-dnd-kit.md` (cobre as duas libs) + linha no README dos ADRs.
- **Testes**: `EntradaDaTela` anima na troca de rota, não anima na montagem; provedor renderiza filhos.

### PR 2 — Janelas, menus e avisos com saída
- `<dialog>` nativo continua (focus trap, Esc, `aria-modal` grátis): CSS `@starting-style` + `overlay`/`display allow-discrete` → entra **e sai** (fade + escala .98). Firefox sem `overlay` só corta a saída.
- `MenuSuspenso`, `SinoDeNotificacoes`, `JanelaDeNovidades`, menu do celular (`NavegacaoDoPainel.module.css:414`): `AnimatePresence` + `m.div` com `exit`, chave estável.
- `Aviso`, `BarraDeMudancas`: entram e saem deslizando 8px (`AnimatePresence`).
- Remove os `@keyframes` substituídos (`entrar`, `subir` x2, `aparecer`).
- **Testes**: os existentes seguem verdes (skipAnimations); acrescentar "fecha e some" no MenuSuspenso.

### PR 3 — Micro-interações
- **Indicador deslizante** (`layoutId`) em `SeletorDeVista`, `Abas`, `SeletorEmPilulas`, `PilulasDeFiltro`: um fundo/traço único que desliza até o item ativo. Hoje o ativo só troca de cor.
- `Chip`/pílulas: `whileTap={{ scale: ESCALA.aperto }}`.
- Cartões clicáveis (`CartaoDeServico`, `ItemDeServico`, linhas da agenda): hover com sombra + 1px (CSS); só os que levam a algum lugar.
- Anel de foco com transição (CSS). `Botao`: troca `120ms` pelo token.
- **Testes**: indicador renderiza no item ativo e muda junto (`aria-selected`/`aria-current`).

### PR 4 — Listas e conteúdo carregando
- **Carregando → conteúdo**: `AnimatePresence mode="popLayout"` entre esqueleto e dado (fade 160ms).
- **Escalonamento** na 1ª carga (Hoje › próximos, clientes, serviços, equipe): `staggerChildren` 0.04, **só os 6 primeiros** (resto entra junto), `initial={false}` em re-render → não repete ao filtrar/paginar.
- **Item saindo/entrando** (cancelou, bloqueou, apagou): `AnimatePresence` + `layout` na lista curta (≤ ~30 itens) → os vizinhos fecham o buraco em vez de pular. Lista grande (clientes): só fade, sem `layout`.
- **Acordeões** (`<details>`, 15 no código): conteúdo com `AnimatePresence` + fade/4px (altura sem animar; regra "nunca layout property").
- **Números** (`Estatistica` no Hoje e no Caixa): valor novo troca com fade + 4px (`AnimatePresence mode="popLayout"` com `key={valor}`). Sem contador rolando.
- **Testes**: limite de 6 no escalonamento (função pura `atrasoDoItem(i)`); Estatistica mostra o valor novo.

### PR 5 — Agendamento público
- **Direção dos passos**: avançar entra da direita (8px), voltar da esquerda. Função pura `direcaoDoPasso(anterior, atual)` sobre a ordem de `passos.ts`; o `EntradaDaTela` recebe a direção.
- Escolher serviço/profissional/horário: ✓ entra com `scale` .8→1 (mola `firme`).
- `IndicadorDePasso`: progresso com `scaleX` animado.
- **Confirmação**: ✓ em SVG desenhado (`pathLength` 0→1, 400ms) e o texto entrando 80ms depois. Único momento "comemoração".
- **Testes**: `direcaoDoPasso` (avança, volta, mesmo passo, fora da ordem).

### PR 6 — Site de marketing
- Seções da Home/Preços: `whileInView` + `viewport={{ once: true, margin: "-80px" }}`, sobe 8px + fade. **Conteúdo visível no HTML do servidor**: o componente `Revelar` só aplica o estado escondido depois de montar e só no que está abaixo da dobra → crawler, sem-JS e print do OG veem tudo.
- Hero: título, subtítulo e CTA escalonados (60ms) na carga.
- `TabelaDePrecos`: troca de período (se houver) com fade nos valores; plano destacado com hover mais marcado.
- **Testes**: `Revelar` renderiza o conteúdo visível no 1º render (sem `opacity:0` no HTML).

## Validation (por PR, só os afetados)
```bash
cd barchop/apps/web
pnpm vitest run tests/<arquivos tocados>
pnpm type-check
pnpm lint
pnpm build   # PR 1 e PR 6: confere tamanho do chunk (LazyMotion) e SSR
```
+ conferir no navegador (dev 3000) as telas tocadas, inclusive com "reduzir movimento" ligado no sistema.

## Risks
| Risk | Likelihood | Mitigation |
|---|---|---|
| Movimento atrasar quem usa o painel o dia todo | Médio | teto 280ms, nada bloqueia clique, sem `mode="wait"` na troca de tela |
| Flash/hydration no SSR | Médio | `initial` = HTML do servidor; entrada só depois de montar; `Revelar` esconde só no cliente |
| Bundle crescer | Médio | `LazyMotion` + `m` + `strict` (falha se alguém usar `motion.div` cheio); medir no `pnpm build` |
| Testes quebrarem com saída animada | Alto sem mitigação | `MotionGlobalConfig.skipAnimations` no `tests/setup.ts` (PR 1) |
| Remontar tela e perder estado | Baixo | nunca `key={pathname}`; `useAnimate` no container |
| `layout` pesado em lista grande | Médio | `layout` só em lista curta; clientes só fade |
| Visual mudar demais (estilo "menos moldura" 17/10) | Médio | hover só em clicáveis, 1px; dono revisa no dev antes de cada merge |

## Fora do escopo
- App mobile (Expo).
- Arrastar/reordenar → plano irmão.

## Acceptance
- [ ] 6 PRs mesclados, cada um revisado pelo dono no dev
- [ ] Nenhum número de duração/curva/mola solto em componente — tudo de `src/movimento/tokens.ts`
- [ ] Nenhum import de `framer-motion`; `motion` fixo em `13.5.1`
- [ ] Com "reduzir movimento" ligado, nada desliza nem escala
- [ ] Testes tocados + tsc + lint verdes em cada PR
