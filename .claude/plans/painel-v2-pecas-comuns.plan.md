# Plan: Painel v2 — Peças comuns

**Source PRD**: `.claude/prds/painel-v2.prd.md`
**Selected Milestone**: 1 — Peças comuns
**Complexity**: Medium

## Summary
Dar ao painel o vocabulário visual que os marcos 2–6 vão usar: selo de estado, cabeçalho com voltar e selo, pílulas de filtro com contagem, seletor em pílulas para formulário, seção numerada, estado vazio com ícone e tabela com grupos. Quase tudo é **extensão de componente que já existe** (`Chip`, `CabecalhoDaPagina`, `Vazio`, `Tabela`); só três peças são novas. Nenhuma tela muda de comportamento neste marco — a adoção acontece tela a tela nos marcos seguintes.

## Patterns to Mirror
| Category | Source | Pattern |
|---|---|---|
| Naming | `apps/web/src/componentes/CabecalhoDaPagina.tsx:8` | componente em PascalCase português, props em português, CSS Module irmão `X.module.css`, comentário explicando o porquê de cada prop |
| Variantes | `apps/web/src/componentes/Chip.tsx:4` | variante por prop `tom` mapeada direto pra classe do módulo (`estilos[tom]`) |
| Botão que alterna | `apps/web/src/componentes/SeletorDeVista.tsx:66` | `role="group"` + `aria-label` no grupo, `aria-pressed` no botão; ativo = amarelo + `box-shadow: 0 3px 0 var(--cor-shadow)` |
| Tokens | `packages/design-tokens/src/index.ts:6` | cor nova entra em `light` E `dark`, com contraste medido e anotado no comentário (como `erro` e `placeholder`); vira `--cor-*` sozinha via `apps/web/app/tokens-css.ts` |
| Vazio | `apps/web/src/componentes/Vazio.tsx:8` | `mensagem` + `dica` + `acao` opcionais |
| Tabela | `apps/web/src/componentes/Tabela.tsx:22` | props paralelas por coluna (`larguras`, `alinhamentos`); primeira célula é `<button>` quando `aoAbrir` |
| Ícones | `apps/web/src/painel/icones.tsx` | ícones SVG próprios exportados como `IconeX` — sem biblioteca nova |
| Tests | `apps/web/tests/componentes/Tabela.test.tsx:1` | Vitest + Testing Library, `describe` com nome do componente, `it` em frase de comportamento, comentário dizendo o porquê do teste; consulta por papel (`getByRole`) |
| Errors | — | não se aplica: componentes de apresentação, sem I/O |

## Files to Change
| File | Action | Why |
|---|---|---|
| `packages/design-tokens/src/index.ts` | UPDATE | tokens `ok`, `okFundo`, `atencao`, `atencaoFundo`, `erroFundo` nos dois temas |
| `apps/web/src/componentes/Chip.tsx` + `.module.css` | UPDATE | tons `ok`, `atencao`, `erro` e tamanho `pequeno` (o selo) |
| `apps/web/src/componentes/CabecalhoDaPagina.tsx` + `.module.css` | UPDATE | props `selo` (ao lado do título) e `voltar` (`{ href, rotulo }` → "← Configurações") |
| `apps/web/src/componentes/Vazio.tsx` + `.module.css` | UPDATE | prop `icone` num círculo acima da mensagem |
| `apps/web/src/componentes/Tabela.tsx` + `.module.css` | UPDATE | prop `grupos` (título + resumo + linhas), linha de grupo dentro do mesmo `<table>` |
| `apps/web/src/componentes/PilulasDeFiltro.tsx` + `.module.css` | CREATE | filtros de lista: rótulo + contagem + tom, um ativo por vez |
| `apps/web/src/componentes/SeletorEmPilulas.tsx` + `.module.css` | CREATE | escolha de formulário em pílulas (rádios nativos), com frase de efeito abaixo |
| `apps/web/src/componentes/SecaoNumerada.tsx` + `.module.css` | CREATE | "1 · TÍTULO" com régua; sem moldura (não é cartão) |
| `apps/web/tests/componentes/*.test.tsx` | CREATE/UPDATE | um arquivo por componente tocado |
| `barchop/docs/design-system.html` | UPDATE | registrar as peças novas e os tokens (PR do fim) |

## Tasks

Três PRs, TDD (commit RED `test: … (RED)` e GREEN `feat: …`), push + PR, merge com autorização.

### PR 1 — Selo (tokens + Chip)
#### Task 1.1: tokens de estado
- **Action**: `ok`/`okFundo` (verde), `atencao`/`atencaoFundo` (âmbar), `erroFundo` em `light` e `dark`. Texto ≥ 4,5:1 sobre o fundo dele e sobre `surface`; medir com script no scratchpad e anotar no comentário.
- **Mirror**: comentário de `erro`/`placeholder` em `packages/design-tokens/src/index.ts`.
- **Validate**: type-check do pacote + script de contraste.
#### Task 1.2: Chip ganha tons e tamanho
- **Action**: `tom?: "acento" | "neutro" | "ok" | "atencao" | "erro"`, `tamanho?: "normal" | "pequeno"`. Os 4 usos atuais não mudam.
- **Mirror**: `Chip.tsx` (classe por tom).
- **Validate**: `tests/componentes/Chip.test.tsx` — renderiza o texto, aplica a classe do tom; padrão continua `acento`.

### PR 2 — Estrutura de página
#### Task 2.1: CabecalhoDaPagina com `selo` e `voltar`
- **Action**: `selo?: ReactNode` na linha do título (quebra embaixo no celular); `voltar?: { href: string; rotulo: string }` vira `<Link>` "← {rotulo}" acima do título.
- **Mirror**: props opcionais com comentário, como `apoio`.
- **Validate**: teste — sem as props, saída igual à de hoje; com `voltar`, link com nome "Configurações" e `href`; com `selo`, texto dentro do `<header>`.
#### Task 2.2: SecaoNumerada
- **Action**: `numero?`, `titulo`, `apoio?`, `lado?` (contador à direita, ex. "1 de 3 no ar"), `children`. O número faz parte do título lido ("1 · A agenda que o cliente vê"); caixa alta por CSS, não no texto.
- **Mirror**: `Secao.tsx` (estrutura), mas sem borda/sombra — régua `--borda-hairline` ao lado do título.
- **Validate**: teste — heading nível 2 com o texto; filhos renderizados; `lado` aparece.
#### Task 2.3: Vazio com ícone
- **Action**: `icone?: ReactNode` num círculo `aria-hidden`.
- **Validate**: teste — ícone presente e escondido do leitor de tela; sem ícone, igual a hoje.

### PR 3 — Escolher e filtrar
#### Task 3.1: PilulasDeFiltro
- **Action**: `rotulo` (aria-label do grupo), `opcoes: { valor, rotulo, contagem?, tom? }[]`, `valor`, `aoTrocar`. Botões com `aria-pressed`; contagem em `<span>` dentro do nome ("Atrasados 0"). Ativa = amarelo + sombra deslocada; tom pinta borda/fundo quando a contagem > 0. Quebra linha em telas estreitas (não rola).
- **Mirror**: `SeletorDeVista.tsx` (grupo + `aria-pressed`).
- **Validate**: teste — clicar chama `aoTrocar(valor)`; só a ativa tem `aria-pressed="true"`; nome acessível inclui a contagem.
#### Task 3.2: SeletorEmPilulas
- **Action**: `nome`, `legenda`, `opcoes: { valor, rotulo }[]`, `valor`, `aoTrocar`, `efeito?: ReactNode`. `<fieldset>` + `<legend>` + `<input type="radio">` nativos com label estilizado em pílula (setas do teclado de graça); `efeito` em `aria-live="polite"` abaixo.
- **Mirror**: foco visível global de `app/globals.css`; ativo igual à pílula de filtro.
- **Validate**: teste — `getByRole("radio", { name: "30 min" })` marcado conforme `valor`; clicar chama `aoTrocar`; `efeito` renderizado.
#### Task 3.3: Tabela com grupos
- **Action**: `grupos?: { id, titulo, resumo?, linhas }[]` como alternativa a `linhas`. Cada grupo vira um `<tbody>` com uma linha de título (`<th scope="rowgroup" colSpan>`); vazio só quando todos os grupos estão vazios. `linhas` continua funcionando igual.
- **Mirror**: `Tabela.tsx` (mesmas classes de coluna, botão na primeira célula).
- **Validate**: teste — títulos de grupo como `rowheader`; linhas de cada grupo; `aoAbrir` continua funcionando; vazio com todos os grupos vazios.
#### Task 3.4: docs
- **Action**: seção "Peças do painel" em `docs/design-system.html` com tokens novos e cada peça.

## Validation
```bash
cd barchop
pnpm --filter @barchop/web test -- tests/componentes/Chip.test.tsx   # e os demais tocados
pnpm --filter @barchop/web type-check
pnpm lint
```
Visual: as peças só aparecem em tela a partir do marco 2; conferir no navegador (DevTools do ECC, 375px e 1440px, claro e escuro) assim que entrarem em uso.

## Risks
| Risk | Likelihood | Mitigation |
|---|---|---|
| Verde/âmbar sem 4,5:1 no tema escuro | M | medir antes de escolher; texto do selo usa a cor forte e o fundo a clara |
| Peças sem uso real até o marco 2 (difícil de julgar no olho) | H | marco 2 começa logo depois; ajustes finos entram lá |
| `grupos` complicar a `Tabela` (cabeçalho fixo, hover) | M | grupo é só mais um `<tbody>`; testes atuais da Tabela continuam passando sem mudança |
| Paginação numerada brigar com a lista de clientes (API por cursor, "carregar mais") | — | **fora deste marco**: a paginação do PRD fica como o "carregar mais" que já existe |

## Acceptance
- [x] Três PRs mergeados
- [x] Testes novos e os já existentes de Tabela/Chip passando; tsc e lint limpos
- [x] Os 4 usos atuais de `Chip` e os 8 de `CabecalhoDaPagina` sem mudança visual
- [x] Contraste dos tokens novos anotado (claro e escuro)
- [x] Patterns mirrored, not reinvented
