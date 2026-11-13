# Plan: Home nova — marco 6, medido e no ar

**Source PRD**: `.claude/prds/home-nova.prd.md`
**Selected Milestone**: 6 — Medido e no ar
**Complexity**: Medium (o risco está na investigação do LCP, não no volume de código)

## Summary
A home nova está inteira no ar (marcos 1–5). Falta provar as metas do PRD em produção: LCP ≤ 2,5 s e CLS ≤ 0,1 no Lighthouse mobile, acessibilidade ≥ 95, telas baixas e "reduzir movimento" conferidos, crédito da cadeira no rodapé e o contador lido. A medição de 13/11 mostra que **o LCP não passa (≈ 3,0 s)** e que a acessibilidade **oscila (96–100)**; este marco corrige os dois e registra os números.

## Medição de partida (13/11, produção, f55831e)
Lighthouse 12 CLI, mobile (Moto G Power, 4G lenta simulada, CPU 4×), Chrome local, aba anônima, 3 rodadas.

| | Perf | LCP | CLS | TBT | SI | FCP | A11y |
|---|---|---|---|---|---|---|---|
| Com abertura (`/`) | 79–83 | **2,9–3,0 s** | 0 | 460–590 ms | 2,6–2,7 s | 1,0 s | **96–100** |
| Sem abertura (`/#sem`) | 55–63 | 3,2–4,6 s | 0 | 2,3–3,5 s | — | 1,0 s | — |

- **Elemento do LCP**: a imagem da cadeira (`cadeira-celular-1280.avif`, 42 kB, `fetchpriority="high"`, descoberta no HTML).
- **Onde vai o tempo** (com abertura): TTFB ~630 ms (21%), espera ~35–355 ms, download ~300 ms, **atraso de renderização 1,7–2,0 s (58–68%)**.
- **Por quê**: na rodada sem limite, a 1ª pintura (FCP = LCP, 410–511 ms) só sai **depois** de o JS do Next/React rodar (DCL 150–240 ms, scripts chegando em 136–296 ms). O Lighthouse simula a rede e a CPU em cima desse gráfico e põe todo esse JS antes do LCP. A imagem chega cedo; o que atrasa é a CPU antes do primeiro quadro.
- **A abertura não é a causa**: sem ela o LCP é igual ou pior, e o TBT sobe pra 2,3–3,5 s, porque o 3D do marco 3 entra dentro da janela da medição (com a abertura ele só começa depois de 4,35 s).
- **Acessibilidade 96**: em 1 de 3 rodadas, o contraste do botão "Criar barbearia" do cabeçalho deu 3,94:1. O axe pegou o cabeçalho no meio da entrada (opacidade parcial: o dourado vira `#88752f`). É questão de quando o axe roda, mas a nota oscila, e a meta vale para toda rodada.
- **Crédito da cadeira**: já está no fim do fecho da home (`apps/web/src/site/Home.tsx:205`), desde o marco 2. Só conferir.

## Patterns to Mirror
| Category | Source | Pattern |
|---|---|---|
| Linha do tempo | `apps/web/src/site/abertura/linhaDoTempo.ts:314` | `peca(inicio, duracao, y)` define a entrada do cabeçalho; funções puras testadas quadro a quadro |
| Aplicar estado | `apps/web/src/site/abertura/tocar.ts:169-180,240` | `mostra(el, opacidade, y)` escreve opacity/translate/visibility e guarda o estilo original para o `encerra` |
| Testes | `apps/web/tests/site/tocar.test.ts`, `linha-do-tempo.test.ts` | vitest + jsdom, relógio por `requestAnimationFrame` falso (`passar(seg)`), asserções no estilo inline |
| Imagem do LCP | `apps/web/src/site/TopoDaHome.tsx:76-106` | `<picture>` com srcset avif/webp, `fetchPriority="high"`, `decoding="async"` |
| Fontes | `apps/web/src/site/fontesDaHome.ts:22`, `apps/web/src/app/fontes.ts` | `next/font/local`, `display: "swap"` |

## Files to Change
| File | Action | Why |
|---|---|---|
| `.claude/prds/home-nova.prd.md` | UPDATE | marco 5 `complete`; marco 6 `in-progress` → `complete` no fim, com os números |
| `apps/web/src/site/abertura/linhaDoTempo.ts` | UPDATE | cabeçalho entra sem opacidade parcial |
| `apps/web/src/site/abertura/tocar.ts` | UPDATE | aplicar a entrada nova do cabeçalho |
| `apps/web/tests/site/linha-do-tempo.test.ts`, `tocar.test.ts` | UPDATE | testes da entrada nova (RED antes) |
| `apps/web/src/site/TopoDaHome.tsx`, `src/app/layout.tsx`, `src/site/fontesDaHome.ts` e afins | UPDATE (a confirmar na Task 2) | o que a investigação do LCP apontar |
| `.claude/plans/home-nova-medido.plan.md` | UPDATE | seção "Execução" com antes/depois |

## Tasks

### Task 0: PRD em dia
- **Action**: marco 5 → `complete`; marco 6 → `in-progress` com este plano. (Feito junto com este plano.)

### Task 1: Acessibilidade sem oscilar (TDD)
- **Action**: o cabeçalho deixa de entrar por opacidade. Fica `visibility: hidden` até a hora dele e então **desce de cima já opaco** (translate de −100% → 0, mesma curva e duração), de modo que nunca existe um quadro com o botão semitransparente. A marca (`[data-marca-da-nav]`) continua aparecendo pela opacidade, porque é desenho (`svg`) sem texto, e o B pousa nela.
- **Testes primeiro**: (a) linha do tempo: em todo `t`, o cabeçalho visível tem opacidade 1; o `y` vai de −100% a 0 no trecho dele. (b) `tocar`: durante a entrada, o `style.opacity` do `<header>` nunca fica entre 0 e 1. RED, depois GREEN.
- **Validate**: `pnpm --filter @barchop/web exec vitest run tests/site/linha-do-tempo.test.ts tests/site/tocar.test.ts`, tsc, lint; Lighthouse a11y 100 em 5 de 5 rodadas no build local.

### Task 2: Por que o 1º quadro espera o JS (investigação, sem código de produto)
- **Action**: no build de produção local, trace de celular (chrome-devtools, CPU 4×, 4G lenta) e Lighthouse CLI com `--throttling-method=devtools` além do simulado, para ver o que segura a 1ª pintura. Suspeitos, nesta ordem:
  1. `decoding="async"` na imagem do LCP (a decodificação fora do quadro pode empurrar a pintura para depois dos scripts);
  2. as **6 fontes pré-carregadas** (~140 kB: Clash Grotesk ×4 e Inter ×2) disputando a 4G lenta com a imagem e o CSS. Ver quais aparecem acima da dobra no celular;
  3. o custo de hidratação de 3 componentes cliente do topo (`AberturaDaHome`, `CadeiraViva`, `ContaVisita`) e do cabeçalho;
  4. a imagem de 1280 px num espaço de 423 px CSS (o celular de teste tem DPR 1,75 → ~740 px bastam): menos bytes e menos decodificação.
- **Saída**: uma tabela na Execução com cada suspeito, a evidência e o ganho medido em experimento isolado (Lighthouse CLI, 5 rodadas, mediana).

### Task 3: Corrigir o LCP
- **Action**: aplicar só o que a Task 2 mostrou que move o número, do mais barato para o mais caro, com teste quando for comportamento (ex.: atributo da imagem, quais fontes têm preload). Nada que esconda o topo ou o título na primeira pintura.
- **Validate**: build local, Lighthouse CLI mobile, 5 rodadas: mediana do LCP ≤ 2,2 s (folga para o TTFB de produção, que é ~630 ms), CLS ≤ 0,1. Testes afetados, tsc e lint.
- **Parada**: se a mediana local não chegar a 2,5 s só com mudanças pequenas, paro e trago para o dono as opções maiores (ex.: atrasar a hidratação do topo, cortar fontes do topo) com o custo de cada uma, em vez de seguir sozinho.

### Task 4: TBT da abertura (opcional, só se sobrar)
- **Action**: o laço da abertura escreve só o que mudou desde o último quadro (hoje reescreve tudo nos 16 blocos, nos nomes e nas peças a cada quadro; o chunk dela soma ~1,1 s de CPU no Lighthouse). O dono aceitou TBT pior no marco 5, então isto só entra se a Task 3 fechar com folga.

### Task 5: Conferir em produção (depois do deploy, que o dono faz)
- Lighthouse CLI mobile em `https://barchop.com.br/`, 5 rodadas: **mediana** do LCP ≤ 2,5 s, CLS ≤ 0,1 em todas, acessibilidade ≥ 95 em todas.
- Telas baixas, com e sem abertura: 320×568, 375×667, 393×659. A frase não encosta na navegação, o B pousa no ícone e o botão de pular está visível e alcançável.
- "Reduzir movimento": nada anda, gira ou aproxima. Sem abertura, sem giro na rolagem, e o 3D não baixa.
- Crédito "Barber Chair, de sweedboy69, CC BY 4.0" no rodapé, com os dois links.
- Contador: o dono lê a aba **Números** do suporte (precisa do login dele) e me passa visitas e cadastros por dia desde a troca (12/11). Registro no PRD como sinal, sem tratar como prova, porque o volume ainda é baixo.

### Task 6: Fechar
- Execução no plano, marco 6 `complete` no PRD com os números, memória atualizada.

## Validation
```bash
cd barchop
pnpm --filter @barchop/web exec vitest run tests/site/linha-do-tempo.test.ts tests/site/tocar.test.ts tests/site/abertura-da-home.test.tsx
pnpm --filter @barchop/web exec tsc --noEmit
pnpm --filter @barchop/web lint
# build local (NEXT_PUBLIC_URL_DO_SITE=http://localhost:3100) + node server.js na 3100, depois:
npx lighthouse@12 http://localhost:3100/ --form-factor=mobile --only-categories=performance,accessibility   # 5×, mediana
npx lighthouse@12 https://barchop.com.br/ --form-factor=mobile --only-categories=performance,accessibility  # 5×, depois do deploy
```

## Risks
| Risk | Likelihood | Mitigation |
|---|---|---|
| O atraso de renderização é custo do Next/React que mudança pequena não tira | Média | Parada da Task 3: levar ao dono as opções maiores com custo, não seguir sozinho |
| A medição local não bate com a de produção (TTFB de produção ~630 ms, local ~0) | Alta | Meta local mais dura (≤ 2,2 s); a medição que vale é a de produção, 5 rodadas, mediana |
| Lighthouse oscila entre rodadas | Alta | Sempre 5 rodadas e mediana; a11y e CLS valem em todas |
| Mexer em fonte ou imagem muda o visual do topo | Baixa | Comparar capturas antes/depois em 375 px, 320×568 e 1440 px; o dono aprova |
| Entrada do cabeçalho por translate parecer diferente | Baixa | Mesma curva e duração; o dono vê no navegador antes do merge |

## Acceptance
- [x] Marco 5 `complete` no PRD
- [ ] Acessibilidade ≥ 95 em todas as rodadas (cabeçalho sem opacidade parcial)
- [ ] LCP mobile em produção ≤ 2,5 s (mediana de 5), CLS ≤ 0,1
- [ ] Telas baixas e "reduzir movimento" conferidos em produção
- [ ] Crédito da cadeira conferido no rodapé
- [ ] Números do contador registrados no PRD
- [ ] Testes afetados, tsc e lint passando
