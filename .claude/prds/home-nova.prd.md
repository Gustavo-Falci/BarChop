# Home nova do barchop.com.br

## Problem
O dono de barbearia que chega ao barchop.com.br (pelo Instagram, por indicação ou pela busca) sem conhecer o produto encontra uma home correta, mas genérica: texto e cartões, igual a qualquer SaaS. Nada ali mostra a agenda se enchendo nem passa a ideia de produto feito para barbearia, e o visitante sai sem criar a conta. Com a marca nova definida e a cobrança entrando, o site vai começar a receber tráfego, e cada visita que sai sem cadastro é um cliente perdido.

## Evidence
- Avaliação do dono do produto (2026-11-12): a home atual é genérica e não passa "barbearia".
- Protótipo descartável (`Documents\barchop-prototipo`) construído e aprovado pelo dono do produto em 2026-11-12: abertura com a navalha atravessando a agenda e virando o B da marca, cadeira 3D sob o foco, rolagem que aproxima a cadeira e dissolve em névoa até as seções claras. Testado em "reduzir movimento" e em celulares de tela baixa (320×568 a 393×659).
- Assumption — sem números de visita nem de cadastro vindos da home (o site não tem analytics); validar via medição antes/depois (ver Open Questions).

## Users
- **Primary**: dono de barbearia que visita barchop.com.br pela primeira vez, quase sempre pelo celular, vindo do Instagram, de indicação ou da busca; decide em segundos se o produto é "pra barbearia de verdade" e se vale criar a conta.
- **Not for**: quem já usa o BarChop (vai direto ao painel ou ao link da própria barbearia); o cliente final da barbearia (usa a página pública da barbearia, não a home); as demais páginas do site (/precos, /gratis, termos, privacidade) ficam como estão.

## Hypothesis
We believe **uma home que mostra a agenda da barbearia se enchendo e assenta na cadeira vazia sob o foco, com a marca nova** will **fazer o dono de barbearia reconhecer o produto como feito para ele e criar a conta** for **donos de barbearia que chegam ao site sem conhecer o BarChop**.
We'll know we're right when **a taxa de visitas da home que terminam em "Criar barbearia" sobe em relação à home atual** (alvo TBD — needs validation via medição antes/depois).

## Success Metrics
| Metric | Target | How measured |
|---|---|---|
| Visitas da home → cadastro concluído | Maior que a taxa da home atual (linha de base medida pelo contador antes da troca; alvo numérico TBD depois de ver a linha de base) | Contador próprio no servidor, sem cookie e sem terceiros (marco 1) |
| Primeira pintura com o título e o botão de criar conta, no celular | LCP ≤ 2,5 s em celular médio (4G) | Lighthouse mobile na home em produção |
| Estabilidade do layout | CLS ≤ 0,1 | Lighthouse mobile |
| Acessibilidade | Lighthouse acessibilidade ≥ 95; com "reduzir movimento" nada anda, gira ou aproxima | Lighthouse + teste manual com a preferência ligada |
| Aprovação visual do dono do produto | 100% das telas em 375 px, telas baixas (320×568) e 1440 px | revisão no navegador antes de cada merge |

## Scope
**MVP** — a home de barchop.com.br com o visual do protótipo, reescrita no site real:
1. **Topo escuro com a marca**: "Bar" e "Chop" grandes, a frase "Sua barbearia agenda sozinha.", o texto de apoio, o botão de criar conta e o status "próximo horário livre", com o feixe de luz. O título e o botão aparecem prontos já na primeira pintura, sem depender de animação.
2. **Cadeira 3D sob o foco** (couro conhaque), que olha levemente para o cursor no computador. A base é uma imagem parada da mesma cena: ela aparece enquanto o 3D carrega e fica sozinha em aparelho fraco ou sem 3D.
3. **Rolagem do topo**: a cadeira gira e se aproxima, o fundo dissolve em névoa creme, e a seção "Soa familiar?" sobe por cima, sem corte entre o escuro e o claro.
4. **Abertura**: a navalha da marca atravessa a agenda do dia, deixando o rastro que vira horários marcados, fecha, vira o B e voa até o ícone da navegação. Toca só na primeira visita da sessão; pode ser pulada (botão, tecla, rolagem ou toque) e não acontece com "reduzir movimento".
4a. **Navegação da home**: escura sobre o topo escuro, clareia quando a névoa chega. As outras páginas mantêm o cabeçalho claro atual.
5. **"Reduzir movimento" e telas baixas** como no protótipo: sem abertura, sem giro nem aproximação na rolagem, nada parado piscando; a frase nunca encosta na navegação em celular baixo.
6. **O conteúdo atual da home continua** abaixo do topo (dores, como funciona, o que vem junto, planos, perguntas e o fecho), com o texto que já existe, no tema claro do site, **na linguagem do protótipo** (decisão do dono em 13/11): sem caixas, rótulo mono e título leve + forte, listas com fio em cima e o fecho no escuro.
7. **Contador de conversão**: o servidor conta visitas da home e cadastros que vieram dela, sem cookie e sem ferramenta de terceiros, e o dono do produto vê os números. Entra antes da troca, para medir a home atual.
8. **Crédito da cadeira 3D** ("Barber Chair", de sweedboy69, CC BY 4.0) visível no rodapé da home.

**Out of scope**
- Reescrever os textos da home — o texto atual só promete o que o produto faz; a mudança é visual.
- Botão "Ver como o cliente agenda" apontando para uma barbearia de exemplo — depende da Barbearia Exemplo, que terá PRD próprio.
- Escolha de couro da cadeira (preto, vinho) pelo visitante — o conhaque foi escolhido; as outras cores eram só para avaliação.
- Redesenho de /precos, /gratis, termos e privacidade — continuam no visual atual do site.
- Analytics de terceiros (Google Analytics, Plausible etc.) e funil completo — o contador próprio responde só "visita da home → cadastro".
- Imagem de compartilhamento (prévia no WhatsApp) com o visual novo — pode vir depois; a atual continua valendo.

## Delivery Milestones
<!-- Status: pending | in-progress | complete -->

| # | Milestone | Outcome | Status | Plan |
|---|---|---|---|---|
| 1 | Linha de base | O dono do produto vê quantas visitas a home atual recebe e quantas viram cadastro, sem cookie | complete | `.claude/plans/home-nova-linha-de-base.plan.md` |
| 2 | Topo novo, parado | O visitante vê o topo escuro com "Bar/Chop", a frase, o botão e a imagem da cadeira sob o foco, com a navegação escura que clareia; o resto da home segue como está | complete | `.claude/plans/home-nova-topo-parado.plan.md` |
| 3 | Cadeira viva e rolagem | A cadeira 3D substitui a imagem quando carrega (fica a imagem em aparelho fraco); rolar gira e aproxima a cadeira e dissolve na névoa até "Soa familiar?" | complete | `.claude/plans/home-nova-cadeira-viva.plan.md` |
| 4 | Seções no estilo novo | Abaixo do topo, todas as seções sem caixa: rótulo mono e título leve + forte subindo do desfoque, listas com fio em cima, planos sem cartão, fecho escuro (pedido do dono em 13/11) | complete | `.claude/plans/home-nova-secoes.plan.md` |
| 5 | Abertura da navalha | Na primeira visita da sessão, a navalha atravessa a agenda, vira o B e pousa no ícone da navegação; pulável; ausente com "reduzir movimento" | in-progress | `.claude/plans/home-nova-abertura.plan.md` |
| 6 | Medido e no ar | Lighthouse dentro das metas no celular, crédito da cadeira no rodapé, telas baixas e "reduzir movimento" conferidos em produção; contador comparando antes e depois | pending | — |

## Open Questions
- [x] Qual é o teto de peso aceitável só na home? — **600 kB comprimidos, todos depois do `load`, e zero no JS inicial** (marco 3). Medido: three + cena 163 kB, `cadeira.glb` 372 kB com gzip, ~535 kB no total; JS inicial +1,7 kB.
- [x] Qual o critério para "aparelho fraco" (fica só a imagem parada)? — (marco 3) antes de baixar: reduzir movimento, sem WebGL2, economia de dados, menos de 4 GB de memória ou 4 núcleos (quando o navegador informa), conexão 2G; depois: mediana dos 30 primeiros quadros acima de 40 ms ou contexto do WebGL perdido devolvem a imagem.
- [ ] O status "próximo horário livre" do topo mostra um exemplo fixo ou algo real? (no protótipo é exemplo, marcado como "Exemplo")
- [x] Quanto tempo de linha de base antes de trocar a home? — nenhum: o dono decidiu trocar já (12/11)

## Decisões (2026-11-12, dono do produto)
- Abertura toca só na primeira visita da sessão.
- Navegação da home escura sobre o topo, clareia com a névoa; demais páginas mantêm o cabeçalho claro.
- Celular fraco ou sem 3D: imagem parada da cena.
- Medição: contador próprio no servidor, sem cookie e sem terceiros.
- Sem esperar a linha de base: a home nova vai ao ar no marco 2. A comparação antes/depois fica sem base; o contador passa a medir a home nova desde a troca.

## Risks
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Home pesada demais no celular derruba a primeira pintura e a busca | Média | Alta | Título e botão no HTML do servidor; 3D e animações só depois da primeira pintura; metas de Lighthouse como critério de merge |
| Abertura longa irrita quem só quer criar a conta | Média | Média | Pulável por botão, tecla, rolagem e toque; decidir se toca só na primeira visita |
| Aparelho fraco ou sem WebGL mostra tela vazia | Baixa | Alta | Imagem parada da cena como base, 3D só por cima quando estiver pronto |
| Licença da cadeira (CC BY 4.0) sem crédito | Baixa | Média | Crédito no rodapé da home como item do MVP |
| Movimento incomoda quem tem sensibilidade | Baixa | Alta | "Reduzir movimento" desliga abertura, giro e aproximação (já validado no protótipo) |
| Pouco tráfego deixa a comparação antes/depois sem significado | Alta | Média | Contador entra primeiro (marco 1); comparar só com volume mínimo; tratar como sinal, não prova |

---
*Status: DRAFT — requirements only. Implementation planning pending via /plan.*
