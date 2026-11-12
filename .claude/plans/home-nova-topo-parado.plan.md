# Plan: Home nova — topo novo, parado

**Source PRD**: `.claude/prds/home-nova.prd.md`
**Selected Milestone**: 2 — Topo novo, parado
**Complexity**: Medium

## Summary
Trocar o topo da home de barchop.com.br pelo do protótipo, sem movimento: fundo escuro com o feixe de luz e o sopro da grade da agenda, "Bar" fino atrás da cadeira, "Chop" pesado na frente, a frase "Sua barbearia agenda sozinha." como título, o status de exemplo, o texto de apoio e os botões. A cadeira é uma **imagem parada** da cena 3D (gerada do protótipo), que no marco 3 vira a base por baixo do 3D. A home ganha cabeçalho próprio: escuro sobre o topo, claro quando o topo sai. O resto da home (dores, passos, recursos, planos, perguntas, fecho) fica igual, no tema claro.

Decisão do dono (12/11): **sem esperar a linha de base** — a troca vai pra produção neste marco. Este é o PR que substitui a home atual.

## Decisões de desenho
- **Tudo no HTML do servidor.** Título, botões, imagem e textos saem prontos na primeira pintura; o único JavaScript novo é o do cabeçalho (escuro → claro).
- **Cabeçalho só da home** por grupo de rotas: `app/(marketing)/layout.tsx` fica com metadata e rodapé; as outras páginas (`precos`, `gratis`, `termos`, `privacidade`) vão para `app/(marketing)/(paginas)/`, cujo layout põe o `CabecalhoDoSite` de hoje. As URLs não mudam. A home desenha o `CabecalhoDaHome`.
- **CabecalhoDaHome** (client): fixo no topo, transparente com texto claro sobre o topo escuro; quando o topo sai de baixo dele (IntersectionObserver), ganha fundo de papel e texto de tinta, como o cabeçalho das outras páginas. Mesmos links do site: Preços, Entrar e "Criar barbearia" (sem `?origem=home`, como no cabeçalho de hoje). Some ao descer e volta ao subir fica para o marco 3, junto da rolagem.
- **Segundo botão**: "Ver como funciona" leva a `#como-funciona` (o "Ver como o cliente agenda" do protótipo está fora do escopo do PRD).
- **Status**: "Exemplo · próximo horário livre 14:40", fixo e marcado como exemplo (resposta à pergunta aberta do PRD; algo real fica para depois).
- **Fontes**: o topo usa a Clash Grotesk 200 (o "Bar") e 300 (a frase leve), que o site ainda não carrega. Entram num `localFont` só da home (`--fonte-display-leve`), do mesmo pacote em `font/`; as outras páginas não baixam.
- **Imagem da cadeira**: render do protótipo com fundo transparente (canvas WebGL com alpha), na pose de repouso, exportada uma vez e convertida em WebP e AVIF em duas larguras (celular e computador), via `<picture>` com `fetchpriority="high"`. Sem otimizador do Next na VM: arquivos prontos em `public/home/`. Teto: **≤ 90 kB** a versão do celular.
- **Crédito da cadeira** (CC BY 4.0) entra já neste marco, embaixo do fecho da home: a imagem é derivada do modelo.
- **Reduzir movimento**: o único movimento deste marco é o pulso do ponto do status; com a preferência ligada, ele para.

## Patterns to Mirror
| Category | Source | Pattern |
|---|---|---|
| Página do site | `apps/web/src/site/Home.tsx` | componente de servidor, constantes de texto no topo do arquivo, CSS Module ao lado |
| Componente client do site | `apps/web/src/site/Revelar.tsx` | `"use client"` só no pedaço que precisa, o resto continua servidor |
| Cabeçalho | `apps/web/src/site/CabecalhoDoSite.tsx` | `MarcaDoBarChop`, `LinkDeAcao`, Preços some abaixo de 420 px |
| Fontes locais | `apps/web/app/fontes.ts` | `next/font/local` apontando para `font/` do monorepo, `variable` em CSS |
| Gerar imagens | `scripts/marca/gerar.mts` | script com sharp rodado por `pnpm`, saída versionada |
| Testes do site | `apps/web/tests/site/home.test.tsx` | Testing Library por papel e nome; o que a página NÃO diz também é testado |
| Teste de CSS sem layout | `apps/web/tests/telas/suporte/abas-no-desktop.test.ts` | ler a regra do CSS quando o jsdom não mede |

## Files to Change
| File | Action | Why |
|---|---|---|
| `apps/web/app/(marketing)/layout.tsx` | UPDATE | tirar o cabeçalho (fica metadata + rodapé) |
| `apps/web/app/(marketing)/(paginas)/layout.tsx` | CREATE | o `CabecalhoDoSite` das outras páginas |
| `apps/web/app/(marketing)/{precos,gratis,termos,privacidade}/` | MOVE → `(paginas)/` | grupo de rotas; corrigir imports relativos |
| `apps/web/src/site/CabecalhoDaHome.tsx` + `.module.css` | CREATE | cabeçalho escuro que clareia |
| `apps/web/src/site/TopoDaHome.tsx` + `.module.css` | CREATE | o topo novo, parado |
| `apps/web/src/site/fontesDaHome.ts` | CREATE | Clash 200 e 300 só na home |
| `apps/web/src/site/Home.tsx` + `Home.module.css` | UPDATE | trocar o topo e a `AgendaDeExemplo` pelo `TopoDaHome`; crédito da cadeira; remover CSS morto |
| `apps/web/public/home/cadeira-{720,1280}.{avif,webp}` | CREATE | a imagem parada da cadeira |
| `scripts/home/foto-da-cadeira.mts` + script no `package.json` raiz | CREATE | PNG do protótipo → AVIF/WebP nas duas larguras |
| `apps/web/tests/site/home.test.tsx` | UPDATE | o topo novo |
| `apps/web/tests/site/cabecalho-da-home.test.tsx` | CREATE | escuro → claro, links |
| `apps/web/tests/site/topo-da-home.test.ts` | CREATE | regras de CSS: tela baixa, reduzir movimento |

## Tasks
### Task 1: Imagem da cadeira
- **Action**: no protótipo (porta 4318), pôr a cena na pose de repouso, ler o canvas com alpha em PNG grande; `pnpm foto-da-cadeira` converte para AVIF e WebP em 720 e 1280 px de largura.
- **Mirror**: `scripts/marca/gerar.mts`.
- **Validate**: arquivos em `public/home/`, o de 720 px em WebP ≤ 90 kB; abrir sobre fundo escuro e conferir as bordas (sem halo).

### Task 2: Cabeçalho por grupo de rotas
- **Action**: criar `(paginas)` com o layout do cabeçalho, mover as quatro páginas, tirar o cabeçalho do layout do site.
- **Validate**: `tests/site` continua verde; `next build` lista `/`, `/precos`, `/gratis`, `/termos`, `/privacidade`; no navegador, /precos com o cabeçalho de sempre.

### Task 3: CabecalhoDaHome (TDD)
- **Action**: testes primeiro — links (Preços, Entrar, "Criar barbearia" para `/painel/cadastro`), tema escuro de início, claro quando o topo deixa de cruzar o cabeçalho (IntersectionObserver falso). Depois o componente.
- **Validate**: `vitest run tests/site/cabecalho-da-home.test.tsx`.

### Task 4: TopoDaHome (TDD)
- **Action**: testes primeiro — h1 com nome "Sua barbearia agenda sozinha." ("Bar" e "Chop" fora da leitura), botão de criar com `?origem=home`, "Ver como funciona" para `#como-funciona`, status marcado "Exemplo", nota dos 14 dias, imagem decorativa (`alt=""`), crédito da cadeira na home, tela baixa sem texto de apoio, ponto parado com reduzir movimento. Depois o componente e o CSS, reescrito do `hero.css` do protótipo em CSS Module e tokens do site (sem copiar).
- **Validate**: `vitest run tests/site`.

### Task 5: Home e revisão
- **Action**: `Home.tsx` usa o `TopoDaHome`; sai a `AgendaDeExemplo` e o CSS dela. Revisão no navegador: 1440×900, 375×812, 320×568 e 393×659, com e sem reduzir movimento; /precos, /gratis, /termos e /privacidade sem mudança.
- **Validate**: Lighthouse mobile em `next build && next start`: LCP ≤ 2,5 s, CLS ≤ 0,1, acessibilidade ≥ 95.

## Validation
```bash
# de barchop/
pnpm --filter @barchop/web exec vitest run tests/site
pnpm --filter @barchop/web exec tsc --noEmit
npx eslint <arquivos tocados>
pnpm --filter @barchop/web build
```
Só os testes afetados, mais tsc, lint e o build (por causa do grupo de rotas).

## Risks
| Risk | Likelihood | Mitigation |
|---|---|---|
| Imagem da cadeira pesar e atrasar a primeira pintura no celular | Média | AVIF/WebP no tamanho certo, teto de 90 kB, `fetchpriority="high"`; o título é texto e pinta antes |
| Fontes novas (200/300) trocarem tarde e o "Bar" piscar | Média | Só dois arquivos, carregados na home com pré-carga; posição absoluta, então não empurra nada (CLS) |
| Mover as páginas quebrar imports ou o `opengraph-image` | Baixa | `tsc` + `next build`; o `opengraph-image.tsx` fica onde está (é o da home) |
| Comparação antes/depois sem linha de base | Alta | Decisão do dono; o contador segue ligado e mede a home nova a partir da troca |
| Cabeçalho fixo cobrir as âncoras (#como-funciona) | Média | `scroll-margin-top` nas seções da home |

## Acceptance
- [ ] Topo novo no ar em 375, 320×568 e 1440 px, aprovado pelo dono no navegador (revisado em 1440×900, 1280×720, 375×812, 393×659 e 320×568; falta o dono)
- [x] Cabeçalho escuro sobre o topo, claro depois; outras páginas iguais
- [x] Título e botão no HTML do servidor; nada se move com "reduzir movimento"
- [x] Crédito da cadeira na home
- [x] Testes afetados, tsc, lint e build passando; Lighthouse mobile dentro das metas (acessibilidade 100; LCP 1,3 s e CLS 0 no trace de celular com 4G lenta e CPU 4×, servidor local)
- [x] Patterns mirrored, not reinvented

## Notas da execução
- Tela baixa: a regra que tira o apoio e a nota vale até **760 px** de altura, não 720: medido, a 760 px o apoio já encostava no status. No celular o rótulo "Agenda online para barbearias" também sai (o apoio diz o que é).
- Abaixo de 360 px o nome "BarChop" do cabeçalho fica só pro leitor de tela: em 320 px o convite saía pela direita.
- Imagem: computador `cadeira-{1280,2200}`, celular `cadeira-celular-{640,1280}` (miolo do quadro, bordas esmaecidas). Celular 1280: AVIF 41 kB, WebP 87 kB.
- "Reduzir movimento" coberto por teste de CSS; o chrome-devtools não emula a preferência.
