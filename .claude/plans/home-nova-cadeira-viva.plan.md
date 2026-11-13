# Plan: Home nova — cadeira viva e rolagem

**Source PRD**: `.claude/prds/home-nova.prd.md`
**Selected Milestone**: 3 — Cadeira viva e rolagem
**Complexity**: Large

## Summary
A cadeira do topo da home passa a ser 3D (three.js) por cima da imagem parada do marco 2, que continua sendo a primeira pintura e o que fica em aparelho fraco, sem WebGL ou com "reduzir movimento". Rolar o topo prende a cena: a interface sai, "Bar" e "Chop" se afastam, a cadeira gira e se aproxima, o fundo e a névoa clareiam até o papel do site e "Soa familiar?" entra sem corte. O cabeçalho da home passa a seguir a névoa (escuro → claro) e some ao descer e volta ao subir.

## Fonte e calibragem
- **O protótipo `Documents/barchop-prototipo` não existe mais no disco.** A fonte deste plano é o template "Pente Fino" em `Downloads/arquivos` (o mesmo de onde o protótipo saiu): `src/gl/cadeira.js` (cena), `src/gl/estudio.js` (reflexos do cromo), `src/motion/hero.js` (rolagem), `src/motion/nav.js` (cabeçalho), `public/modelos/cadeira.glb` (o modelo, 641 kB, meshopt, sem texturas).
- O template **não** tem os ajustes do BarChop (couro conhaque como padrão, pé do feixe a 50,5%, fundo `#151412`, névoa até o papel do site). Esses ajustes se perderam com o protótipo e são **refeitos a partir da imagem parada já no ar** (`public/home/cadeira-*`, recorte `top: 34.56%` / `height: 65.44%`, `--foco-x: 50.5%`): ela é a referência da pose de repouso, não o template.
- O código é **reescrito** em TypeScript, CSS Module e tokens do site, como no marco 2 (sem copiar o template; nada roda de dentro de `Downloads`).

## Decisões de desenho
- **A imagem fica, o 3D entra por cima.** A `<picture>` do marco 2 continua no HTML do servidor (é o LCP). O `<canvas>` é absoluto por cima, nasce invisível e só aparece (fade de ~400 ms) depois do primeiro quadro desenhado na mesma pose; então a imagem some. CLS 0: o canvas não ocupa espaço.
- **A cena nasce acesa.** No template, quem acende a luz (`luz`, `contorno`, `chao`, `poeira` = 1) é a abertura, que é o marco 4. Aqui o estado de repouso já começa nesses valores; o marco 4 é que vai passar a começar do escuro.
- **Carregamento tardio.** `three`, o `GLTFLoader`, o decodificador meshopt e o `.glb` chegam por `import()` dentro de um `useEffect`, depois do `load` da página e num momento ocioso (`requestIdleCallback`, com `setTimeout` de reserva). Nada disso entra no JS inicial da home nem das outras páginas.
- **Quem fica só com a imagem** (resposta à pergunta aberta do PRD), em três portas:
  1. *Antes de baixar:* `prefers-reduced-motion: reduce`; sem WebGL2; `navigator.connection.saveData`; `deviceMemory < 4` ou `hardwareConcurrency < 4` quando o navegador informa; conexão `slow-2g`/`2g`.
  2. *Depois de carregar:* mede os primeiros ~30 quadros; se a mediana passar de 40 ms, descarta o renderer e volta para a imagem.
  3. *Durante:* `webglcontextlost` volta para a imagem.
  Uma função pura (`podeTer3D`) decide a porta 1; é ela que os testes cobrem.
- **"Reduzir movimento" = sem 3D e sem prender.** Com a preferência, nada é baixado: fica a imagem parada, o topo não é preso, a cadeira não olha o mouse, a rolagem é a normal. É o que o PRD pede ("nada anda, gira ou aproxima") e ainda economiza o peso.
- **Prender sem biblioteca.** O topo vira um invólucro mais alto (`100svh` + ~1,35 tela no computador, ~1,2 no celular) com a cena em `position: sticky`; o progresso (0..1) sai do `scrollY` num `requestAnimationFrame` e vira variáveis CSS (afastamento do nome, saída da interface, cor do fundo) e o estado da cena (giro, aproximação, névoa, poeira, chão). Sem Lenis (mexeria na rolagem da página inteira e nas âncoras) e, na recomendação, sem GSAP (ver Pergunta ao dono).
- **Cores da emenda.** O fundo interpola de `#151412` (dark.paperFim) até `--cor-paper` (`#F7F4EE`), e a névoa do three termina na mesma cor: sem faixa onde o escuro encontra o claro. A primeira seção ("Soa familiar?") sobe por cima do fim da névoa.
- **Mouse.** No computador (`pointer: fine`), a cadeira olha um pouco para o cursor, com mola (como no template). No toque, não.
- **Cabeçalho da home.** Passa a ouvir o progresso do topo (evento do topo no `document`, sem estado global): escuro até a névoa passar de ~0,62, claro depois. Sem 3D (imagem parada), continua o IntersectionObserver de hoje. Some ao descer e volta ao subir (acima de 140 px fica sempre visível), com e sem 3D; com "reduzir movimento" só troca, sem deslizar.
- **Peso** (resposta à pergunta aberta do PRD; números exatos medidos na Task 1):

  | Peça | Comprimido (estimado) |
  |---|---|
  | three (núcleo) + GLTFLoader + decodificador meshopt | ~190 kB |
  | `cadeira.glb` | 370 kB com gzip / 641 kB sem |
  | Código da cena e da rolagem | ~8 kB |
  | **Total, só depois do `load`, só em aparelho bom** | **~570 kB** |

  Acima dos 200–250 kB que o PRD estimava, por causa do modelo. **Teto proposto: 600 kB depois do `load` e zero no JS inicial**. O Caddy não tem `encode`; o Next comprime o que serve, mas isso é conferido na Task 1 com `curl -H 'Accept-Encoding: gzip'`. Se o `.glb` sair sem compressão, simplificar a malha (gltf-transform `simplify`) até ≤ 350 kB em vez de mexer no Caddy.
- **Crédito CC BY 4.0** já está no rodapé da home desde o marco 2; continua.

## Pergunta ao dono
1. **Prender a cena: código próprio ou GSAP?** Recomendo código próprio (`sticky` + `requestAnimationFrame`, +0 kB). A alternativa é GSAP com ScrollTrigger, como no template (+~45 kB, curvas prontas, menos código nosso).
2. **O protótipo existe em outro lugar** (outra máquina, nuvem)? Não travo esperando: sigo calibrando pela imagem parada.

## Patterns to Mirror
| Category | Source | Pattern |
|---|---|---|
| Componente client do site | `apps/web/src/site/Revelar.tsx:1` | `"use client"` só no pedaço que precisa; sai cedo sem IntersectionObserver |
| Reduzir movimento no JS | `apps/web/src/site/Revelar.tsx:27` | `window.matchMedia?.("(prefers-reduced-motion: reduce)")` antes de ligar qualquer coisa |
| Biblioteca pesada sob demanda | `apps/web/src/componentes/CodigoQr.tsx:17` | `await import("qrcode")` só quando precisa, tipo via `typeof import(...)` |
| Fora do JS inicial | `apps/web/src/movimento/ProvedorDeMovimento.tsx:8` | carregador `import()` declarado fora do componente |
| Cabeçalho da home | `apps/web/src/site/CabecalhoDaHome.tsx` | tema por `data-tema`; HTML do servidor sai escuro |
| Testes com observador falso | `apps/web/tests/site/cabecalho-da-home.test.tsx:16,48` | classe falsa + `vi.stubGlobal`; caso sem a API no navegador |
| Teste de CSS sem layout | `apps/web/tests/site/topo-da-home.test.tsx` | ler a regra do CSS quando o jsdom não mede |
| Gerar/preparar arquivo | `scripts/home/foto-da-cadeira.mts` | script `pnpm`, saída versionada em `public/home/` |

## Files to Change
| File | Action | Why |
|---|---|---|
| `apps/web/package.json` | UPDATE | `three` e `@types/three`, versão exata |
| `apps/web/public/home/cadeira.glb` | CREATE | o modelo (do template; simplificado só se passar do teto) |
| `apps/web/src/site/cena/rolagem.ts` | CREATE | puro: progresso → estado da cena e do CSS (faixas e curvas do `hero.js`) |
| `apps/web/src/site/cena/podeTer3D.ts` | CREATE | puro: a porta 1 do "aparelho fraco" |
| `apps/web/src/site/cena/cadeira.ts` | CREATE | a cena three (luz, chão, poeira, materiais couro conhaque/cromo/borracha, enquadramento, mouse, laço que para fora da tela) |
| `apps/web/src/site/cena/estudio.ts` | CREATE | o ambiente que o cromo reflete e o sprite da poeira |
| `apps/web/src/site/CadeiraViva.tsx` | CREATE | client: decide, carrega tarde, troca a imagem pelo canvas, mede os quadros, volta para a imagem |
| `apps/web/src/site/TopoDaHome.tsx` + `.module.css` | UPDATE | invólucro alto + cena `sticky`, `data-ui` na interface, variáveis do progresso, regras de "reduzir movimento" |
| `apps/web/src/site/CabecalhoDaHome.tsx` + `.module.css` | UPDATE | tema pelo progresso; some ao descer, volta ao subir |
| `apps/web/tests/site/rolagem-do-topo.test.ts` | CREATE | faixas do progresso |
| `apps/web/tests/site/pode-ter-3d.test.ts` | CREATE | as portas |
| `apps/web/tests/site/cadeira-viva.test.tsx` | CREATE | com "reduzir movimento" ou aparelho fraco não importa o three; a imagem fica; contexto perdido volta para a imagem |
| `apps/web/tests/site/cabecalho-da-home.test.tsx` | UPDATE | tema pelo progresso; esconder e voltar |
| `apps/web/tests/site/topo-da-home.test.tsx` | UPDATE | invólucro, `sticky`, nada preso com "reduzir movimento" |
| `.claude/prds/home-nova.prd.md` | UPDATE | marco 3 `in-progress` → `complete`; perguntas do peso e do aparelho fraco respondidas |

## Tasks
### Task 1: Modelo e peso
- **Action**: instalar `three` (exato); copiar o `.glb` para `public/home/`; medir o JS do 3D num `next build` (chunk do `import()`) e o `.glb` servido pelo `next start` com e sem `Accept-Encoding: gzip`. Se passar do teto, simplificar a malha.
- **Validate**: tabela de peso preenchida no plano; JS inicial da `/` igual ao do marco 2.

### Task 2: Rolagem pura (TDD)
- **Action**: testes primeiro (RED): progresso 0 = repouso; nome se afasta até 0,42; giro e aproximação até 0,72; névoa de 0,3 a 0,97; poeira e chão somem antes; fundo de `#151412` a `--cor-paper`; "claro" depois de 0,62. Depois `rolagem.ts` (GREEN).
- **Validate**: `vitest run tests/site/rolagem-do-topo.test.ts`.

### Task 3: Aparelho fraco (TDD)
- **Action**: testes das portas (reduzir movimento, sem WebGL2, economia de dados, memória/núcleos baixos, 2G, navegador que não informa = deixa), depois `podeTer3D.ts`.
- **Validate**: `vitest run tests/site/pode-ter-3d.test.ts`.

### Task 4: A cena
- **Action**: `cadeira.ts` e `estudio.ts` reescritos do template: couro conhaque fixo (sem temas), sem cadeira provisória (a imagem é a reserva), estado inicial aceso, névoa e fundo nas cores do site, `dispose()` para voltar à imagem. Calibrar câmera e posição até o quadro de repouso cair em cima da imagem parada em 1440×900 e 390×844.
- **Validate**: no navegador, canvas e imagem sobrepostos (diferença por screenshot) sem salto visível; `tsc`.

### Task 5: CadeiraViva e o topo preso (TDD)
- **Action**: testes primeiro (import do three trocado por dublê): com reduzir movimento não importa; com aparelho fraco não importa; com tudo certo importa depois do `load` e a imagem só some depois do 1º quadro; `webglcontextlost` e quadros lentos devolvem a imagem. Depois `CadeiraViva.tsx` e o `TopoDaHome` com invólucro `sticky`, `data-ui` e variáveis do progresso.
- **Validate**: `vitest run tests/site`.

### Task 6: Cabeçalho (TDD)
- **Action**: testes primeiro: tema segue o evento de progresso (com 3D) e o observador (sem); some ao descer além de 140 px, volta ao subir; com reduzir movimento troca sem transição. Depois o componente.
- **Validate**: `vitest run tests/site/cabecalho-da-home.test.tsx`.

### Task 7: Revisão no navegador e medição
- **Action**: 1440×900, 1280×720, 375×812, 393×659 e 320×568; com 3D, com 3D desligado à força (porta 1) e com "reduzir movimento" (emulação por CSS/teste, o chrome-devtools não emula a preferência); conferir a emenda escuro→claro, a âncora "Ver como funciona" com o topo preso e as outras páginas sem mudança.
- **Validate**: Lighthouse mobile em `next build && next start`: LCP ≤ 2,5 s, CLS ≤ 0,1, acessibilidade ≥ 95; trace de celular (4G lenta, CPU 4×) sem tarefa longa no carregamento do 3D acima de 200 ms.

## Validation
```bash
# de barchop/
pnpm --filter @barchop/web exec vitest run tests/site
pnpm --filter @barchop/web exec tsc --noEmit
npx eslint <arquivos tocados>
pnpm --filter @barchop/web build
```

## Risks
| Risk | Likelihood | Mitigation |
|---|---|---|
| A cadeira "pular" na troca imagem → 3D (calibragem perdida com o protótipo) | Alta | Calibrar pela imagem parada; fade de 400 ms; aceite com sobreposição nas duas telas de referência |
| Peso do modelo no celular | Média | Só depois do `load`, só em aparelho bom; teto de 600 kB; simplificar a malha se sair sem gzip |
| Rolagem presa travar no celular (barra do Safari) | Média | Alturas em `svh`; o progresso lê o invólucro, não o `innerHeight` |
| Âncora `#como-funciona` cair no meio da névoa | Média | O link pula o invólucro inteiro; conferir na Task 7 |
| Cor da emenda não bater e aparecer faixa | Média | Fundo e névoa terminam no mesmo `--cor-paper`; conferir por screenshot |
| Movimento incomodar quem tem sensibilidade | Baixa | "Reduzir movimento" nem baixa o 3D nem prende o topo |
| Tarefa longa ao compilar shaders atrasar o toque | Média | Carregar no ocioso; medir no trace; se passar, aquecer os materiais (`renderer.compile`) num quadro separado |

## Acceptance
- [x] Com 3D: a cadeira troca a imagem sem salto; rolar gira, aproxima e dissolve até "Soa familiar?" sem corte
- [x] Aparelho fraco, sem WebGL, contexto perdido ou quadros lentos: fica (ou volta) a imagem parada
- [x] "Reduzir movimento": nada baixa, nada é preso, nada gira
- [x] Cabeçalho escuro → claro com a névoa; some ao descer, volta ao subir
- [x] JS inicial da home: só +1,7 kB (CadeiraViva e as contas puras); 3D dentro do teto de peso
- [x] Aprovado pelo dono ("pode mergear" em 12/11)
- [x] Testes afetados, tsc, lint e build passando
- [x] Lighthouse mobile: acessibilidade, boas práticas e SEO 100 (a ferramenta não roda a categoria de desempenho)
- [ ] LCP ≤ 2,5 s no celular: 1,2 s com cache, mas **2,98 s com cache frio** (4G lenta, CPU 4×) — o 3D não entra no caminho (começa depois do `load`, +1,7 kB no JS inicial); medir em produção no marco 5
- [x] Patterns mirrored, not reinvented

## Notas da execução (12/11)
- **Peso medido** (`next build` + `next start`): chunk do three + cena **163 kB** comprimido (656 kB cru); `cadeira.glb` **372 kB** com gzip (o Next comprime `model/gltf-binary`; 641 kB cru). Total **~535 kB**, só depois do `load`. JS inicial da home: **+1,7 kB** comprimido. Nada de simplificar a malha.
- **Calibragem** pela imagem parada, sem o protótipo: com o pé do feixe a 0,505 da largura no computador e 0,5 no celular, a caixa do couro no 3D bate com a da imagem em **≤ 1 px** em 1440×900 e em ±2 px CSS em 390×844. A única diferença visível é a poeira no feixe.
- **Mudanças sobre o plano, vistas no navegador:**
  - o fundo do topo não vira papel: a camada escura (`--escuro`) some e deixa o degradê do próprio site (emenda sem faixa até no pé da tela, onde o papel já é `paperFim`);
  - a névoa exponencial nunca chega a 100%: sobrava um vulto da cadeira, então o canvas também apaga (`--canvas`, de 0,75 a 0,95);
  - com o 3D, as seções de baixo sobem por cima do topo preso a partir de 0,75 da rolagem (`margin-bottom: -34svh`, -30svh no celular), em vez de esperar ele soltar;
  - quem está no teclado com o foco no topo continua vendo a interface (`:focus-within`), e o cabeçalho escondido volta com o foco dentro dele.
- **Medições** (celular 390×844, 4G lenta, CPU 4×): LCP **1,2 s** e CLS **0** com cache, como o marco 2 mediu (1,3 s); com cache frio, LCP 2,98 s, por causa das fontes e do JS inicial que já estavam no caminho crítico (o 3D só começa depois do `load`). Tarefas longas ao entrar o 3D: 71 ms e 53 ms. Lighthouse mobile: acessibilidade, boas práticas e SEO 100; só o `llms.txt` falha, como no marco 2.
- **Conferido**: "reduzir movimento" (o navegador desta máquina já vem com a preferência ligada: nada baixa, trilho com a altura da tela), aparelho com 2 núcleos (fica a imagem), `/precos` sem o trilho.
- O jsdom não tem canvas: `tests/setup.ts` ganhou um `getContext` que devolve `null` (o que o jsdom já fazia, sem o aviso no console).
- Também conferido: 320×568 e 1280×720 (o couro do 3D bate com a imagem em ≤ 1 px), e o "Ver como funciona" com o topo preso (o título para a 88 px do alto; o cabeçalho some no salto, não cobre).
- O trecho creme entre o fim da névoa e "Soa familiar?" segue o conceito aprovado (`Downloads/arquivos/conceito/03-nevoa` e `04-cardapio`): vulto da cadeira na névoa, depois a seção sobe por cima. Puxar a seção mais cedo que 0,75 faz o texto entrar com a cadeira ainda à vista. Fica pro dono olhar no navegador.
