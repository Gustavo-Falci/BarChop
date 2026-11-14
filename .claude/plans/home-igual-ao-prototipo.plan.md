# Plano: Home igual ao protótipo

**Pedido do dono (14/11):** "Agora a Home tem que ser igualzinho no foi definido no barchop-prototipo que esta no repo." + "Tem tambem um efeito nos botoes no prototipo, quero esses efeitos no Home de producao".

**Fonte:** `barchop/barchop-prototipo/` (commit `83ad441`). É o desenho aprovado: não passa pelo canvas de novo. Antes, a home foi calibrada pelo template "Pente Fino" porque o protótipo não estava no disco (`home-nova-cadeira-viva.plan.md`).

## Decisões do dono (14/11)
1. **Seções a mais ficam** ("O que vem junto", "Planos", "Perguntas frequentes"), no estilo do protótipo.
2. **Cabeçalho = protótipo + Entrar:** pílula central "O problema / Como funciona / Começar" com a seção ativa marcada, "Criar barbearia" à direita, não some ao rolar; um "Entrar" discreto ao lado do botão.
3. **Textos do topo ficam os atuais** (chapéu, "e perde menos horário pra falta", "Ver como funciona").
4. **Efeitos dos botões do protótipo** na home.

## Comparação (1440×900, movimento ligado, 14/11)
Igual: modelo 3D (mesmo `cadeira.glb`), câmera, giro, aproximação, faixas da rolagem.
Diferente:
- Botões: sem o rótulo que sobe, sem o claro no hover.
- Cabeçalho: links Preços/Entrar, some ao descer.
- Topo: status "14:40" fixo (o protótipo calcula pela hora: `src/status.js`); grade da agenda quase invisível (no protótipo os blocos aparecem de leve); foco branco `0xffffff` (protótipo `0xfff1d8`, quente).
- Seções: miolo mais estreito, fundo em degradê rosado (protótipo: papel liso `#F7F4EE`), tamanhos de texto diferentes.
- Rolagem: nativa (protótipo: Lenis suave + barra própria fina).

## PRs (um por vez, merge só com "pode mergear")
1. **Botões** — `LinkDeAcao` ganha `rotuloQueSobe`: o rótulo sobe e uma cópia (span `aria-hidden`, não `::after`, pra o leitor de tela não ler duas vezes) entra por baixo no hover e no foco do teclado; ouro clareia (`#f2d360`) e contorno ganha borda clara no hover; aperto de 2px já existe. Curva e 0,55 s do protótipo. Sem efeito com "reduzir movimento". Usado em todos os convites da home e no cabeçalho da home.
2. **Cabeçalho** — pílula com as três âncoras e marca da seção ativa (IntersectionObserver), fica visível, "Entrar" ao lado do convite; celular sem a pílula (como o protótipo).
3. **Topo** — status pela hora (calculado no cliente depois da hidratação; o HTML do servidor sai com o texto neutro de exemplo), grade visível como no protótipo, foco quente. Mudar a luz exige refazer as imagens paradas (`foto-da-cadeira`) e conferir a troca imagem→3D em 1440×900 e 390×844.
4. **Seções** — miolo, fundo liso, tamanhos e espaços do `secoes.css`/`base.css` do protótipo; fecho e rodapé no formato do protótipo (crédito da cadeira e links legais ficam).
5. **Rolagem** — Lenis carregado depois do `load` (teto da home: nada no JS inicial) + barra própria; desligado com "reduzir movimento" e em toque.

Fora: `noindex`, rodapé "Protótipo descartável", fecho apontando pra `#topo`, `?tema=` do couro, abertura em toda visita (segue 1ª da sessão).

## Conferência de cada PR
Navegador a 1440×900, 390×844 e 320×568, movimento ligado e "reduzir movimento", lado a lado com o protótipo (`npx vite` numa cópia no scratchpad).
