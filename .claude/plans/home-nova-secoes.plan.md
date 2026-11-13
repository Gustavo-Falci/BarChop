# Plan: Home nova — seções no estilo novo

**Source PRD**: `.claude/prds/home-nova.prd.md`
**Selected Milestone**: 4 — Seções no estilo novo
**Complexity**: Medium

## Summary
Abaixo do topo, a home ainda tem a cara da home antiga: dores com tarja amarela em caixa, passos com bolinha numerada, seis cartões em "O que vem junto", cartões de plano e o fecho num cartão. Este marco põe todas as seções na linguagem do protótipo (`Documents/barchop-prototipo`, `index.html` + `src/styles/secoes.css` + `src/motion/titulos.js`):
- nada de caixa;
- título em duas metades, leve e pesada, com as palavras subindo do desfoque quando entram na tela;
- listas lado a lado com um fio em cima e o número ou passo em mono ouro;
- o fecho no escuro.

O protótipo só desenha dores, passos e fecho. "O que vem junto", "Planos" e "Perguntas frequentes" seguem as mesmas regras. Tudo é reescrito em TSX, CSS Module e tokens do site, sem GSAP.

## Decisões de desenho
- **Cada seção tem um rótulo e um título.** O nome de hoje vira o rótulo mono pequeno em cima ("Soa familiar?", "Como funciona"…). O título grande é uma frase em duas metades, leve e forte.
  - É o `<h2>`, e a seção continua `aria-labelledby` nele.
  - Os textos das listas não mudam.
  - Os títulos novos (o dono aprova ou troca):

  | Rótulo (o nome de hoje) | Título: leve + **forte** | Fonte |
  |---|---|---|
  | Soa familiar? | Cadeira vazia **é horário perdido.** | protótipo |
  | Como funciona | Três passos **e a agenda anda.** | protótipo |
  | O que vem junto | Do link ao lembrete, **tudo num lugar só.** | novo |
  | Planos | Comece grátis, **mude quando crescer.** | novo |
  | Perguntas frequentes | Antes de começar, **o que todo mundo pergunta.** | novo |
  | — (fecho) | Comece hoje, **sem falar com ninguém.** | o de hoje, partido |

- **Âncoras e testes.** As âncoras `#como-funciona` (usada pelo "Ver como funciona" do topo) e `#planos` vão para a `<section>`, e não para o título. O teste de hoje que acha a região "Planos" pelo nome passa a achá-la pelo título novo.
- **Listas.**
  - *Dores:* 3 colunas no computador, cada item com fio em cima, o número (`01`…`03`) em mono `--cor-accent-text` e a frase em display 400.
  - *Passos:* igual, com "Passo 1" no lugar do número e título `h3` 600. Some a bolinha amarela.
  - *O que vem junto:* 6 itens em grade de 3×2, mesmo fio e mesmo `h3`, sem cartão.
  - Celular: uma coluna.
- **Planos sem cartão.** A `TabelaDePrecos` ganha `variante?: "cartoes" | "linhas"`. O padrão continua `cartoes`, e `/precos` não muda. A home passa `linhas`: 3 colunas com fio em cima, nome, apoio, preço grande, itens e convite, sem borda, fundo nem raio. O "Ver todos os detalhes dos preços" continua embaixo.
- **Perguntas em duas colunas** (regra das telas horizontais): no computador, o rótulo e o título à esquerda e a lista `<details>` à direita, com fio entre as perguntas, como hoje. Celular: uma coluna.
- **Fecho escuro.**
  - Faixa inteira (fora do miolo de 1120 px) com o fundo `#151412`, o mesmo do topo.
  - Título grande no peso leve e no forte.
  - O botão ouro e "14 dias com tudo liberado · sem cartão" em mono.
  - O crédito da cadeira sai do miolo e fica numa linha discreta no fim do fecho.
  - O rodapé do site continua o mesmo, claro. Se a emenda do fecho escuro com o rodapé claro ficar feia no navegador, a saída é escurecer o rodapé só na home (`:has()`), e isso só com o ok do dono.
- **Títulos que sobem do desfoque**, sem biblioteca: o componente `TituloDaSecao`.
  - O servidor parte as palavras em `<span>` com `--i`.
  - Um pedaço client com IntersectionObserver liga `data-visivel` em `top 86%`. O CSS faz `opacity`, `translate: 0 .42em` e `filter: blur(8px)` → 0 em ~950 ms, com 70 ms de passo, a metade leve antes da pesada.
  - Ao voltar acima, as palavras saem de novo (como no protótipo).
  - Mesmas regras do `Revelar`: o HTML do servidor sai visível. O estado escondido só entra depois de montar, e só abaixo da primeira dobra. Sem o observer, ou com "reduzir movimento", fica parado.
- **Fonte leve:** a `clashLeve` (já pré-carregada na rota da home) vai também no invólucro das seções, sem arquivo novo.
- **Cores:** só tokens que já existem, sem número solto no CSS: `--cor-ink`, `--cor-ink-soft`, `--cor-line`, `--cor-accent-text` no claro; `--cor-accent-on-dark` e o claro do topo no fecho. O fio é `--cor-line-strong`.

## Patterns to Mirror
| Category | Source | Pattern |
|---|---|---|
| Revelar ao entrar | `apps/web/src/site/Revelar.tsx:24-55` | HTML do servidor visível; esconde só depois de montar e abaixo da dobra; sai cedo sem observer ou com "reduzir movimento" |
| Título leve + forte | `apps/web/src/site/TopoDaHome.tsx:108-111` | `<span className={leve}>` + `<span className={forte}>` no mesmo `<h1>` |
| Fonte leve só na home | `apps/web/src/site/fontesDaHome.ts:9` | `clashLeve.variable` no invólucro |
| Textos em constantes | `apps/web/src/site/Home.tsx:20-91` | `DORES`, `PASSOS`, `RECURSOS`, `PERGUNTAS` no topo do arquivo |
| Variação de componente | `apps/web/src/site/LinkDeAcao.tsx` (`variante`) | prop `variante` com padrão que não muda quem já usa |
| Testes da home | `apps/web/tests/site/home.test.tsx:1-60` | Testing Library por papel e nome; mock de `next/font/local` |
| Teste de CSS sem layout | `apps/web/tests/site/topo-da-home.test.tsx` | lê a regra do CSS Module quando o jsdom não mede |
| Testes com observador falso | `apps/web/tests/site/revelar.test.tsx` | IntersectionObserver falso + caso sem a API |

## Files to Change
| File | Action | Why |
|---|---|---|
| `apps/web/src/site/TituloDaSecao.tsx` | CREATE | rótulo mono + `<h2>` leve/forte com as palavras partidas |
| `apps/web/src/site/TituloDaSecao.module.css` | CREATE | tipografia e a subida do desfoque (só com `data-visivel` controlado pelo client) |
| `apps/web/src/site/PalavrasQueSobem.tsx` | CREATE | client: observer que liga e desliga `data-visivel` |
| `apps/web/src/site/Home.tsx` | UPDATE | seções novas, títulos, ids nas `<section>`, fecho fora do miolo, crédito no fecho |
| `apps/web/src/site/Home.module.css` | UPDATE | listas com fio, grades, perguntas em duas colunas, fecho escuro; sai o CSS de caixa |
| `apps/web/src/site/TabelaDePrecos.tsx` | UPDATE | `variante: "cartoes" \| "linhas"` |
| `apps/web/src/site/TabelaDePrecos.module.css` | UPDATE | estilo `linhas` |
| `apps/web/tests/site/titulo-da-secao.test.tsx` | CREATE | palavras partidas, nome acessível inteiro, observer, reduzir movimento, sem observer |
| `apps/web/tests/site/home.test.tsx` | UPDATE | títulos novos, região "Planos" pelo título, âncoras nas seções, o fecho |
| `apps/web/tests/site/tabela-de-precos.test.tsx` | UPDATE | `linhas` sem cartão; `/precos` igual |

## Tasks
### Task 1: TituloDaSecao (RED → GREEN)
- **Action**: teste primeiro. O nome acessível do `<h2>` é a frase inteira, com um espaço entre as palavras. Cada palavra é um `<span>` com `--i` em ordem (as leves antes das pesadas). Sem observer ou com "reduzir movimento", nada fica escondido. Com o observer falso, entrar liga `data-visivel` e voltar acima desliga. Acima da dobra, nunca esconde. Depois, o componente e o CSS.
- **Mirror**: `Revelar.tsx` (montagem e saídas cedo), `revelar.test.tsx`.
- **Validate**: `pnpm --filter @barchop/web test -- tests/site/titulo-da-secao.test.tsx`

### Task 2: Planos em linhas (RED → GREEN)
- **Action**: teste. `variante="linhas"` não põe a classe de cartão. Sem variante, a saída é igual à de hoje. Depois, a prop e o CSS.
- **Mirror**: `variante` do `LinkDeAcao`.
- **Validate**: `pnpm --filter @barchop/web test -- tests/site/tabela-de-precos.test.tsx tests/site/precos.test.tsx`

### Task 3: Seções da home (RED → GREEN)
- **Action**: `home.test.tsx` primeiro.
  - Testes:
    - cada seção tem o rótulo e o título novos;
    - "Ver como funciona" leva a `#como-funciona`, que é uma `<section>`;
    - a região "Planos" acha os 3 convites com `?origem=home`;
    - o fecho tem o convite e "sem cartão";
    - o crédito CC BY 4.0 continua na página;
    - as frases que a home não pode dizer continuam fora.
  - Depois, o `Home.tsx` e o `Home.module.css`. O CSS de caixa sai: `.dores li` com tarja, `.passo::before`, `.recurso` e `.final` com borda.
- **Mirror**: `home.test.tsx`, constantes do `Home.tsx`.
- **Validate**: `pnpm --filter @barchop/web test -- tests/site/home.test.tsx tests/site/site-no-celular.test.ts`

### Task 4: Conferir no navegador
- **Action**: build de produção local, como na lição de 12/11: `NEXT_PUBLIC_URL_DO_SITE=https://barchop.com.br`, `public/` copiado pro standalone e a opção "reduzir movimento" emulada como `no-preference`.
  - Telas: 1440×900, 1280×720, 375×812 e 320×568.
  - O que olhar:
    - a emenda da névoa com "Soa familiar?";
    - os títulos subindo;
    - o fecho escuro com o rodapé;
    - com "reduzir movimento", tudo parado e visível.
  - Console limpo. Lighthouse mobile: acessibilidade 100, CLS 0.
- **Validate**: prints nas 4 larguras, para o dono.

## Validation
```bash
pnpm --filter @barchop/web test -- tests/site/titulo-da-secao.test.tsx tests/site/home.test.tsx tests/site/tabela-de-precos.test.tsx tests/site/precos.test.tsx tests/site/site-no-celular.test.ts tests/site/revelar.test.tsx
pnpm --filter @barchop/web exec tsc --noEmit
pnpm lint
```

## Risks
| Risk | Likelihood | Mitigation |
|---|---|---|
| Título partido em `<span>` lido palavra por palavra pelo leitor de tela | Baixa | Espaços de texto entre os spans; teste do nome acessível inteiro |
| Palavras escondidas se o JS falhar | Baixa | Escondido só depois de montar (padrão `Revelar`); sem JS fica tudo visível |
| `blur` em muitos spans pesa no celular fraco | Média | Só nos títulos (~6, com ≤ 7 palavras cada); `filter` some no fim (`blur(0)` → `none`) |
| Fecho escuro colado no rodapé claro fica estranho | Média | Conferir na Task 4; escurecer o rodapé só na home, se o dono quiser |
| Títulos novos prometem o que o produto não faz | Baixa | Só frases de forma; o dono aprova a tabela acima |

## Acceptance
- [ ] Nenhuma seção da home com caixa, cartão, tarja ou bolinha
- [ ] Rótulo mono + título leve/forte em todas as seções, subindo do desfoque; parado com "reduzir movimento"
- [ ] `/precos` sem mudança
- [ ] Testes, tsc e lint passam
- [ ] Prints nas 4 larguras aprovados pelo dono
