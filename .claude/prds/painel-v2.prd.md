# Painel v2 do BarChop

## Problem
O dono da barbearia que entra no painel do BarChop encontra telas funcionais, mas cruas: Configurações é uma página longa sem dizer o que falta decidir, o "Hoje" mostra três números soltos, e as listas (serviços, clientes, equipe) não filtram nem agrupam. Comparado ao concorrente de referência (Barbeiro.app), o painel não passa a sensação de produto pronto — e sem isso o BarChop não se sustenta como SaaS vendido a outras barbearias além da GR Barber.

## Evidence
- Avaliação do dono do produto (2026-10-06) comparando 33 prints do painel do Barbeiro.app (`C:\Users\itconsol\Downloads\telas`) com o painel atual: "o nosso parece cru".
- Mesma avaliação já motivou o redesenho da página pública (PR #41) e da escolha de serviços (#42–#44).
- Assumption — sem feedback de barbeiro real ainda; validar com o dono da GR Barber no piloto (observar a primeira configuração sem ajuda).

## Users
- **Primary**: dono da barbearia — configura a casa no primeiro dia e abre o painel todo dia para ver o movimento. Piloto: dono da GR Barber.
- **Not for**: recepção e profissional não ganham telas próprias nesta leva; herdam as telas redesenhadas com as permissões que já têm. Operador do suporte (`/painel/suporte`) fica como está.

## Hypothesis
We believe **um painel organizado em decisões (Configurações que mostram o que vale hoje e o que falta, com a consequência de não decidir) e telas do dia mais claras** will **deixar o dono configurar e operar a barbearia sozinho** for **donos de barbearia que acabaram de se cadastrar**.
We'll know we're right when **uma barbearia nova chega a "todas as decisões tomadas" em Configurações no primeiro dia, sem pedir ajuda ao suporte**.

## Success Metrics
| Metric | Target | How measured |
|---|---|---|
| Barbearias novas com todas as áreas de Configurações decididas no 1º dia | TBD — needs validation via piloto GR Barber + primeiras barbearias | contador "X de N decididas" registrado por barbearia (data em que chegou a N) |
| Pedidos de ajuda ao suporte sobre configuração no 1º dia | 0 no piloto | contagem manual (canal de suporte) |
| Aprovação visual do dono do produto em cada tela, em 375px e 1440px | 100% das telas do escopo | revisão no navegador antes de cada merge |

## Scope
**MVP**

1. **Peças comuns do painel**, no estilo BarChop (papel/tinta, amarelo, borda grossa, sombra deslocada; tema escuro do painel continua): cabeçalho de página com selo de estado (Configurado / Faltando / Desligado) e ações; filtros em pílulas com contagem e cor por significado; seção numerada com régua; seletor em pílulas no lugar de select; estado vazio com ícone, frase e ação; tabela densa com agrupamento e paginação.
2. **Configurações como índice de decisões**: cada área em uma linha com o valor de hoje ou, se não decidida, a consequência de ficar assim + "Configurar →"; progresso "X de N decididas"; cada subtela com "Próxima área faltando →". Áreas desta leva:
   - **Horários** — rotina da semana com atalhos, pausa do almoço, exceções por dia, frase "Resultado: …", prévia do que o cliente vê.
   - **Regras de agendamento** (função nova) — intervalo entre horários, antecedência mínima, marcar no mesmo dia, até quando a agenda abre, serviço precisa caber antes de fechar, até quando o cliente remarca e até quando cancela sozinho.
   - **Dados do negócio** com abas **Identidade** (nome, link, descrição), **Marca** (logo, capa, prévia da página pública) e **Comodidades** (grade com ícones).
   - **Comunicação** — WhatsApp, telefone, e-mail e redes que aparecem na página pública.
   - **Notificações** — lembrete por e-mail (liga/desliga e antecedência) e avisos da equipe que já existem.
3. **Hoje**: cartão do link com QR e janela de compartilhar (copiar, WhatsApp, compartilhar, QR para baixar/imprimir), próximos atendimentos, barra de ocupação, primeiros passos no formato "X de N".
4. **Listas**: Serviços agrupados por categoria (faixa de preço por grupo, onde aparece), Clientes e Equipe com pílulas de filtro e tabela nova.
5. **Agenda**: faixa de resumo do dia, botão "Agora", "Bloquear" a partir da agenda, intervalo fechado (almoço) sombreado.

**Out of scope**
- Caixa, assinaturas, plano do SaaS, pagamentos online, adquirentes/taxas, fiscal — Onda 2 (dinheiro).
- "Ritmo" do cliente, segmentos Atrasados/Vão vencer/Sumiram, mensagens de reativação — Onda 3 (retenção); a lista de clientes ganha só o visual e filtros com os dados que já existem.
- Temas da página, cor da marca, layout dos serviços, domínio próprio — Onda 4.
- Conversas, automação de WhatsApp, assistente de IA, autoatendimento em tablet — Onda 5 / Meta em standby.
- App instalável e avisos push — sem onda definida.
- Fotos do espaço (galeria) — fica para depois da Marca; TBD se entra numa leva da página pública.
- Perfis de acesso personalizados — os três papéis atuais continuam; no máximo um cartão "Pode / Não pode" explicando cada um.
- Busca global (⌘K), sino de notificações, faixa de teste grátis — não nesta leva.
- Dados de exemplo no painel vazio — TBD (ver Open Questions).

## Delivery Milestones
<!-- Status: pending | in-progress | complete -->

| # | Milestone | Outcome | Status | Plan |
|---|---|---|---|---|
| 1 | Peças comuns | Telas novas e antigas passam a falar a mesma língua visual (cabeçalho, selo, pílulas, seção, vazio, tabela) | complete | `.claude/plans/painel-v2-pecas-comuns.plan.md` (PRs #45, #46, #47) |
| 2 | Configurações em decisões | Dono vê "X de N decididas", o que vale hoje e o que falta; Horários, Dados do negócio (3 abas), Comunicação e Notificações em subtelas | in-progress | `.claude/plans/painel-v2-configuracoes.plan.md` |
| 3 | Regras de agendamento | Dono decide intervalo, antecedência, janela da agenda e prazo para o cliente remarcar/cancelar; a página pública obedece. Inclui pausa do almoço e exceções por dia em Horários (movidos do marco 2: exigem mudar o modelo de horário) | in-progress | `.claude/plans/painel-v2-regras-de-agendamento.plan.md` |
| 4 | Hoje | Dono compartilha o link (QR, WhatsApp) e vê próximos atendimentos e ocupação sem sair da tela | complete | `.claude/plans/painel-v2-hoje.plan.md` (PRs #75, #76, `painel-v2-hoje-dia`) |
| 5 | Listas | Serviços por categoria, Clientes e Equipe com filtros em pílulas e tabela nova | pending | — |
| 6 | Agenda | Resumo do dia, "Agora" e "Bloquear" direto na agenda | pending | — |

## Open Questions
- [ ] Painel v2 entra antes ou depois do G1 (infra) e do piloto da GR Barber? Se antes, atrasa o piloto; se depois, o piloto vê o painel antigo.
- [ ] Quais áreas contam no "X de N decididas" e o que conta como "decidida" (ter salvo uma vez? valor diferente do padrão?).
- [x] Regras de agendamento: valores padrão para barbearias existentes (GR Barber) sem mudar o comportamento de hoje? — sim, todos os padrões reproduzem hoje (plano do marco 3).
- [x] Prazo de cancelamento/remarcação: o que o cliente vê quando passou do prazo? — botões somem, aviso + WhatsApp da casa (dono, 2026-10-07).
- [ ] Dados de exemplo no painel vazio valem a complexidade, ou basta estado vazio bom?
- [ ] "Fechado" na agenda e na prévia: só o intervalo do almoço ou também bloqueios/folgas?
- [ ] Comodidades: a lista atual do banco cobre as opções desejadas ou precisa crescer (o concorrente tem 23)?

## Risks
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Virar cópia do concorrente e perder a identidade BarChop | M | H | Peças comuns primeiro, com tokens BarChop; aprovação visual por tela |
| Escopo grande atrasar o piloto da GR Barber | H | H | Marcos independentes, um PR por item; decidir a ordem com o G1 (Open Question 1) |
| Regras de agendamento mudarem a disponibilidade de quem já agenda | M | H | Padrões que reproduzem o comportamento atual; testes da disponibilidade antes de ligar |
| Telas não vistas no navegador (extensão do Chrome falha nesta máquina) | M | M | Usar o Chrome DevTools do ECC (funcionou em 2026-10-06) e conta de teste local |
| Texto explicativo demais (o concorrente exagera) | M | L | Uma frase de consequência por item; controles falam por si |

---
*Status: DRAFT — requirements only. Implementation planning pending via /plan.*
