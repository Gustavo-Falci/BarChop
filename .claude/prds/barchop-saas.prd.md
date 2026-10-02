# BarChop — SaaS de agendamento e gestão para barbearias

## Problem
Donos de barbearia pequena e média no Brasil agendam pelo WhatsApp ou em bloco de notas: marcam dois clientes no mesmo horário, sofrem com faltas sem aviso, gastam o dia respondendo "tem horário?" e não têm visão do dia nem histórico de cliente. Deixar sem solução custa horários vazios (receita perdida) e tempo do dono que deveria estar cortando cabelo.

## Evidence
- O barbeiro da GR Barber (piloto) registra agendamentos em bloco de notas e marca horário por WhatsApp, sem lembrete e sem histórico — validado em conversa direta.
- O Barbeiro.app (concorrente direto, 2024) tinha em 02/10/2026 802 contas, 167 ativas em 30 dias e 200 cadastros novos no mês: o mercado existe e paga.
- Taxa de faltas e tempo gasto agendando na GR Barber: Assumption — needs validation via medição no início do piloto (linha de base).
- Disposição de outras barbearias pagarem pelo BarChop: Assumption — needs validation via entrevistas com 3–5 barbearias após o piloto.

## Users
- **Primary**: dono de barbearia com 1 a ~6 profissionais, que hoje marca horário pelo WhatsApp; a necessidade aparece quando a agenda enche e começam conflitos e faltas.
- **Secondary**: profissional da barbearia (vê e gerencia a própria agenda) e recepção (balcão); cliente final, que agenda pela página pública da barbearia.
- **Not for**: redes grandes/franquias com dezenas de unidades; salões de beleza e estética em geral (fora do recorte barbearia por ora).

## Hypothesis
We believe **página pública por barbearia + agenda por profissional + lembrete automático** will **reduzir faltas e o tempo gasto marcando horário no WhatsApp** for **donos de barbearia pequena**.
We'll know we're right when **a GR Barber tiver ≥ 50% dos agendamentos feitos pelo próprio cliente e a taxa de faltas cair ≥ 30% em 60 dias de piloto**.

## Success Metrics
| Metric | Target | How measured |
|---|---|---|
| Agendamentos feitos pelo cliente (origem = cliente) | ≥ 50% do total | Contagem por origem no banco, janela de 30 dias |
| Taxa de faltas | queda ≥ 30% vs linha de base | Faltas / agendamentos, antes vs 60 dias de piloto |
| Uso contínuo do piloto | dono usa o painel ≥ 5 dias/semana | Logins/atividade no painel |
| Ativação de novas barbearias (pós-piloto) | TBD — needs validation via primeiras contas externas | Contas com ≥ 1 agendamento / contas criadas |

## Scope
**MVP** — Ondas 0 e 1: casa arrumada (conta e recuperação de senha do dono, slugs seguros, datas no passado recusadas), equipe com papéis e jornada por profissional, cliente escolhe o profissional, página pública rica no endereço próprio da barbearia, lembrete automático por e-mail e WhatsApp com confirmar/cancelar, cadastro self-service do dono com onboarding, painel do dia — rodando em produção com a GR Barber.

**Out of scope (MVP)**
- Caixa, comissões, relatórios e cobrança da assinatura do SaaS — Onda 2, só depois do piloto provar valor.
- Pagamento online, pacotes, clube de assinatura, fidelidade, lista de espera, avaliações — Onda 3.
- Indicação, loja, múltiplas unidades, campanhas, login social — Onda 4.
- IA no WhatsApp, NFS-e, domínio próprio, app do profissional — Onda 5 (diferenciais).
- Blog, páginas de comparação e de funcionalidade completas no site — crescem depois da landing mínima.

## Delivery Milestones
<!-- Business outcomes, not engineering tasks. /plan turns each into a plan. -->
<!-- Status: pending | in-progress | complete -->

| # | Milestone | Outcome | Status | Plan |
|---|---|---|---|---|
| 0 | Onda 0 — Casa arrumada | Dono recupera a própria senha; trocar senha derruba sessões; nenhum slug sombreia rotas do sistema; ninguém agenda ou remarca para o passado; documentação descreve o BarChop como SaaS | complete | `.claude/plans/onda-0-casa-arrumada.plan.md` |
| 1 | Onda 1 — Agenda que funciona (MVP + piloto) | Barbearia com vários profissionais e papéis; cliente agenda com o profissional que quer, na página da barbearia no endereço próprio; lembrete chega e cliente confirma/cancela; dono se cadastra e configura sozinho; GR Barber em produção | pending | — |
| 1s | Site de marketing (mínimo, em paralelo à Onda 1) | Visitante entende a promessa, vê preços e cria a conta da barbearia sem falar com ninguém | pending | — |
| 2 | Onda 2 — Dinheiro | Dono fecha o caixa do dia, vê comissões e relatórios; BarChop cobra a própria assinatura (grátis + planos por profissional, teste de 14 dias) | pending | — |
| 3 | Onda 3 — Retenção do cliente final | Cliente paga ou deixa sinal online, assina clube, acumula pontos, entra em lista de espera e avalia o atendimento | pending | — |
| 4 | Onda 4 — Crescimento | Indicação, loja com estoque, múltiplas unidades, campanhas, login com Google/Apple | pending | — |
| 5 | Onda 5 — Diferenciais | Assistente de IA no WhatsApp, NFS-e, domínio próprio, app do profissional | pending | — |

## Open Questions
- [ ] Qual é o diferencial do BarChop frente ao Barbeiro.app, Trinks e AppBarber (a promessa de uma frase do site)?
- [ ] Preço e nomes dos planos (o grátis tem quais limites?).
- [ ] Existe CNPJ para a verificação de negócio na Meta (pré-requisito do WhatsApp oficial)?
- [ ] Abrir para a 2ª barbearia só depois dos 60 dias de piloto, ou antes?
- [ ] Linha de base de faltas da GR Barber — como medir antes do lembrete existir?

## Risks
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Verificação da Meta / aprovação de templates demora semanas | High | High | Iniciar já, em paralelo; lembrete por e-mail sai primeiro |
| Escopo cresce em direção aos 13 módulos do concorrente | High | High | Não abrir onda nova antes do piloto rodar a Onda 1 |
| Piloto com uma barbearia só não generaliza | Medium | Medium | Entrevistar 3–5 barbearias antes da Onda 2 |
| Diferencial fraco frente a concorrente estabelecido | Medium | High | Responder a 1ª open question antes do site |
| Múltiplas unidades mudam o modelo de horários e equipe tarde demais | Medium | Medium | Jornada por profissional já desenhada pensando em unidade |

---
*Status: DRAFT — requirements only. Implementation planning pending via /plan.*
