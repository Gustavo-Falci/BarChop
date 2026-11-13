# Plan: Home nova — abertura da navalha

**Source PRD**: `.claude/prds/home-nova.prd.md`
**Selected Milestone**: 5 — Abertura da navalha
**Complexity**: Large

## Summary
Na primeira visita da sessão, a home abre no escuro com a agenda do dia vazia no fundo e "Bar" e "Chop" no meio. Em seguida, nesta ordem:
1. A navalha da marca, aberta, atravessa a tela. Os fios dourados que ela deixa viram horários marcados.
2. Os agendamentos acendem por onde ela passa ("Livres hoje" desce de 8 a 0).
3. No meio, a lâmina fecha e se deforma nas duas barrigas do B.
4. A agenda enche e apaga de baixo pra cima.
5. O B voa até o ícone do cabeçalho.
6. O nome vai pros cantos e o canhão de luz acende o topo de hoje.

A abertura dura ~4,3 s e pode ser pulada (botão, tecla, rolagem ou toque acelera até o fim). Com "reduzir movimento", ela não existe.

A fonte é o protótipo (`Documents/barchop-prototipo`): `src/motion/abertura.js`, `src/grade.js`, o SVG `hero__marca` do `index.html`, o CSS crítico do `<head>` e `src/styles/hero.css`. É reescrito em TypeScript, CSS Module e tokens, **sem GSAP**.

## Decisões de desenho
- **Quem vê.** Um script inline pequeno no começo da home, antes do topo (mesmo padrão do `SCRIPT_DE_TEMA` do layout raiz), põe `abertura-on` no `<html>` antes da primeira pintura. Só faz isso se todas as condições valerem:
  - sem "reduzir movimento";
  - sem a marca `barchop:abertura` no `sessionStorage`;
  - sem âncora no endereço (`#planos` vai direto);
  - a navegação não é "voltar" (`back_forward`).

  O mesmo script grava a marca na sessão e liga uma trava de 4,5 s: se o JS da abertura não começar até lá, ele tira a classe e a home aparece como hoje. Uma função pura `deveAbrir({ reduzido, jaViu, ancora, tipo })` decide; o script é gerado dela, e os testes cobrem as duas.
- **O topo não muda de lugar.** A abertura é o próprio topo no primeiro estado, como no protótipo. Com `abertura-on`, o CSS:
  - esconde o cabeçalho, a promessa, o apoio, os convites e o status;
  - mostra a grade da agenda inteira;
  - põe "Bar"/"Chop" no meio;
  - trava a rolagem do `body`.

  Ao terminar, a classe vira `abertura-fim` e tudo volta ao CSS de hoje. Sem a classe, nada disso existe.
- **LCP.** A imagem da cadeira **não** nasce com `opacity: 0`: o navegador não contaria e o LCP iria pra ~3 s. Ela é pintada desde o primeiro quadro, apagada por `filter: brightness()` ("a cadeira vazia no escuro"), e acende com o canhão. O 3D do marco 3 continua chegando depois do `load` e entra por cima como hoje. A abertura não espera nem mexe na cena three.js, então `cadeira.ts` não muda.
- **Motor da animação, sem biblioteca.** Uma linha do tempo própria: uma função pura `quadroDaAbertura(t, medidas)` devolve o estado de cada peça no segundo `t`. É o mesmo jeito do `rolagem.ts` do marco 3, e é o que os testes cobrem. Cada peça recebe:
  - a posição, o giro e a escala da navalha;
  - o giro da lâmina e o quanto ela já virou B (0..1);
  - o traço dos fios;
  - o contador;
  - a opacidade das camadas;
  - as metades do nome;
  - a luz.

  Um `requestAnimationFrame` aplica o estado em variáveis CSS e atributos SVG. As curvas são as do protótipo, em bezier (`pf-out`, `pf-io`, `power2/3`, `back.out(3)`), escritas como funções. Pular = o relógio anda 5× até o fim, sem corte seco (como no protótipo).
- **A navalha é a marca.** O componente `NavalhaDaAbertura` (SVG, `aria-hidden`) usa a geometria do `MarcaDoBarChop` / `scripts/marca/gerar.mts`, com as peças separadas pra animar: cabo, lâmina (`<g>` que gira no pino 69,52), aço (o `d` deformado da barra reta até as barrigas) e gume e detalhes. A deformação usa a mesma conta do protótipo (`laminaEm(t)`: 8 curvas, número a número) numa função pura testada nas pontas: `t=0` = barra, `t=1` = o B da marca.
- **A grade da agenda.** `GradeDaAgenda` (servidor, `aria-hidden`) desenha 10 horários × 4 profissionais e os 16 blocos do protótipo (nomes inventados). A navalha acende os blocos que ficaram pra trás dela. Sem `abertura-on`, a grade não aparece: o sopro de fundo continua sendo o degradê CSS de hoje (`.grade` em `TopoDaHome.module.css`).
- **O pouso no cabeçalho.** O ícone do `CabecalhoDaHome` ganha `data-marca-da-nav`. A abertura mede o ícone antes de começar, esconde ele, voa o B até lá e mostra o ícone quando o B some. O cabeçalho entra descendo 16 px, como no protótipo.
- **Os cantos da abertura** (`aria-hidden`): "BarChop · agenda online", "Para barbearias" e "Livres hoje N". A frase digitada letra a letra do protótipo **fica de fora**: ela partia o título em letras, e o leitor de tela e o LCP pioram.
- **Pular** (o PRD pede):
  - O botão é de verdade, "Pular abertura", visível no canto, o primeiro no Tab e com foco visível. No protótipo ele tinha `tabindex="-1"`; aqui não.
  - Teclas: Esc, Espaço, Enter, ↓ e PageDown.
  - Também aceleram: a roda do mouse e o primeiro toque.
  - O conteúdo já está todo no HTML e o leitor de tela lê a promessa normalmente: a abertura só mexe no visual.
- **Peso.** O código da abertura entra por `import()` só quando o `<html>` tem `abertura-on`. Quem não vê a abertura não baixa nada, e o JS inicial cresce só o pedaço que decide (~1 kB). As fontes são as que a home já carrega (Clash 200 e 700): a abertura espera por elas até 2,5 s, como no protótipo.

## Pergunta ao dono
1. **Lighthouse sempre vê a abertura** (cada medição é uma sessão nova). O LCP deve ficar parecido, porque a imagem pinta desde o começo, mas o TBT e o "Speed Index" pioram. Proposta: medir a home **com** abertura no marco 6 e aceitar Speed Index pior, desde que o LCP fique ≤ 2,5 s. Ok?
2. **A abertura toca no celular também?** O protótipo foi testado de 320×568 a 393×659. Recomendo que sim, com o desenho de celular do protótipo (o caminho e o tamanho mudam).

## Patterns to Mirror
| Category | Source | Pattern |
|---|---|---|
| Script antes da pintura | `apps/web/app/layout.tsx:43` + `apps/web/src/painel/tema.ts:102` | string gerada por função, `<script dangerouslySetInnerHTML>` |
| Conta pura do movimento | `apps/web/src/site/cena/rolagem.ts` | estado como função do progresso; o componente só aplica |
| Peça pesada sob demanda | `apps/web/src/site/CadeiraViva.tsx` | `import()` dentro do `useEffect`, só quando pode |
| Reduzir movimento | `apps/web/src/site/Revelar.tsx:27` | `matchMedia` antes de ligar qualquer coisa |
| Desenho da marca | `apps/web/src/componentes/MarcaDoBarChop.tsx` | viewBox 200, pino 69,52, lâmina girada −11° |
| Eventos entre peças da home | `apps/web/src/site/cena/topoClaro.ts` | `CustomEvent` no `document`, sem estado global |
| Testes | `apps/web/tests/site/rolagem-do-topo.test.ts`, `pode-ter-3d.test.ts` | função pura com tabela de casos |

## Files to Change
| File | Action | Why |
|---|---|---|
| `apps/web/src/site/abertura/deveAbrir.ts` | CREATE | decisão pura + o script inline gerado dela |
| `apps/web/src/site/abertura/lamina.ts` | CREATE | `laminaEm(t)`: barra → B |
| `apps/web/src/site/abertura/curvas.ts` | CREATE | as curvas do protótipo em bezier |
| `apps/web/src/site/abertura/linhaDoTempo.ts` | CREATE | `quadroDaAbertura(t, medidas)` e o caminho da navalha |
| `apps/web/src/site/abertura/tocar.ts` | CREATE | o relógio (rAF), aplicar o quadro, pular, terminar |
| `apps/web/src/site/AberturaDaHome.tsx` | CREATE | client: vê a classe, carrega `tocar.ts` por `import()` |
| `apps/web/src/site/NavalhaDaAbertura.tsx` | CREATE | o SVG da navalha em peças |
| `apps/web/src/site/GradeDaAgenda.tsx` | CREATE | a agenda do dia do fundo |
| `apps/web/src/site/Abertura.module.css` | CREATE | estados `abertura-on` / `abertura-fim`, cantos, botão |
| `apps/web/src/site/TopoDaHome.tsx` | UPDATE | grade, navalha, cantos e botão dentro do topo; `brightness` da cadeira |
| `apps/web/src/site/TopoDaHome.module.css` | UPDATE | o que esconde e posiciona com `abertura-on` |
| `apps/web/src/site/CabecalhoDaHome.tsx` | UPDATE | `data-marca-da-nav` no ícone |
| `apps/web/src/site/Home.tsx` | UPDATE | o script inline antes do topo |
| `apps/web/tests/site/deve-abrir.test.ts` | CREATE | tabela de casos + o script num DOM falso |
| `apps/web/tests/site/lamina.test.ts` | CREATE | pontas e meio da deformação |
| `apps/web/tests/site/linha-do-tempo.test.ts` | CREATE | contador 8→0, B no meio em ~2,2 s, pouso no ícone, fim em ~4,3 s, pular ×5 |
| `apps/web/tests/site/abertura-da-home.test.tsx` | CREATE | sem a classe nada carrega; botão "Pular abertura" acessível; teclas; reduzir movimento |

## Tasks
### Task 1: Quem vê (RED → GREEN)
- **Action**: `deveAbrir` com a tabela (reduzido, já viu, âncora, voltar) e o script inline. No DOM falso, o script põe a classe, grava a marca e solta a trava em 4,5 s.
- **Validate**: `pnpm --filter @barchop/web test -- tests/site/deve-abrir.test.ts`

### Task 2: Navalha e lâmina (RED → GREEN)
- **Action**: `laminaEm(0)` = a barra reta e `laminaEm(1)` = o `d` do B do `MarcaDoBarChop`. Depois, o `NavalhaDaAbertura` em peças.
- **Validate**: `pnpm --filter @barchop/web test -- tests/site/lamina.test.ts`

### Task 3: Linha do tempo (RED → GREEN)
- **Action**: `quadroDaAbertura` com o caminho do protótipo (computador e celular), os marcos de tempo e o pular. Os testes conferem nos segundos que importam: entrada, freio no meio, B formado, agenda cheia, pouso, fim.
- **Validate**: `pnpm --filter @barchop/web test -- tests/site/linha-do-tempo.test.ts`

### Task 4: No topo (RED → GREEN)
- **Action**:
  - pôr no topo: `GradeDaAgenda`, navalha, cantos e botão;
  - escrever o CSS dos dois estados;
  - criar o `AberturaDaHome` (`import()` só com a classe);
  - pôr `data-marca-da-nav` no cabeçalho;
  - pôr o script na `Home`.
- **Validate**: `pnpm --filter @barchop/web test -- tests/site/abertura-da-home.test.tsx tests/site/topo-da-home.test.tsx tests/site/home.test.tsx tests/site/cabecalho-da-home.test.tsx tests/site/cadeira-viva.test.tsx`

### Task 5: Conferir no navegador
- **Action**: build de produção local, como na lição de 12/11.
  - Conferir:
    - a 1ª visita toca, o F5 na mesma sessão não toca e uma aba anônima toca;
    - `#planos` vai direto, e "voltar" não toca;
    - pular pelo botão, pelas teclas, pela roda e pelo toque;
    - "reduzir movimento" desliga;
    - o 3D entra depois, sem salto;
    - o console fica limpo.
  - Telas: 1440×900, 1280×720, 375×812 e 320×568, com prints dos quadros-chave (`?quadro=` só no dev).
  - Lighthouse mobile com a abertura: LCP, CLS e TBT.
- **Validate**: prints e números, para o dono.

## Validation
```bash
pnpm --filter @barchop/web test -- tests/site/deve-abrir.test.ts tests/site/lamina.test.ts tests/site/linha-do-tempo.test.ts tests/site/abertura-da-home.test.tsx tests/site/topo-da-home.test.tsx tests/site/home.test.tsx tests/site/cabecalho-da-home.test.tsx tests/site/cadeira-viva.test.tsx
pnpm --filter @barchop/web exec tsc --noEmit
pnpm lint
```

## Risks
| Risk | Likelihood | Mitigation |
|---|---|---|
| LCP sobe porque o topo nasce escondido | Média | Imagem e "Bar/Chop" pintados desde o 1º quadro (brightness, não opacity); medir na Task 5 |
| JS falha e a página fica no escuro | Baixa | Trava de 4,5 s no script inline tira a classe; sem JS, o script nem roda e a classe nunca entra |
| Abertura irrita quem volta | Média | Só 1× por sessão, nunca no "voltar" nem com âncora, e pulável de 4 jeitos |
| Diferença de medida no celular (barra de endereço, `svh`) | Média | Medir o topo (não a janela) ao começar; prints em 320×568 |
| Linha do tempo própria sai diferente da do protótipo | Média | Mesmos tempos e curvas, conferidos quadro a quadro com o protótipo rodando lado a lado |
| Conflito com o topo preso do marco 3 | Baixa | A rolagem fica travada durante a abertura; a cena 3D só entra depois do `load` e não depende dela |

## Acceptance
- [ ] 1ª visita da sessão toca; F5, voltar e âncora não
- [ ] Pulável por botão, teclas, roda e toque; botão acessível pelo Tab
- [ ] Ausente com "reduzir movimento"; sem JS, a home é a de hoje
- [ ] O B pousa no ícone do cabeçalho sem salto
- [ ] Testes, tsc e lint passam; LCP mobile ≤ 2,5 s com a abertura
- [ ] Prints aprovados pelo dono
