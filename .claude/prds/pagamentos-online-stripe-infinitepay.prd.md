# BarChop — Pagamentos online: Stripe e InfinitePay

**PRD-mãe**: `.claude/prds/onda-2-dinheiro.prd.md` (marco 3, item "Provedores": "Mercado Pago, Stripe e InfinitePay … entram depois, pelo mesmo conector")
**Plano do marco 3** (o conector do Asaas que serve de base): `.claude/plans/planos-de-assinatura.plan.md`

## Problem
Hoje quem vende plano de assinatura (a casa ou o profissional) só recebe online conectando uma conta do Asaas. Uma barbearia ou um barbeiro que já recebe pela InfinitePay ou pela Stripe teria de abrir conta numa plataforma nova (com aprovação por documentos) só para vender planos pelo BarChop. O dono do BarChop quer que o sistema já tenha essas conexões prontas, para entregar quando um cliente precisar, sem forçar ninguém a trocar de plataforma.

## Evidence
- Ninguém pediu ainda e não há venda parada por isso. É uma decisão de produto do dono (30/10/2026): "quero que o sistema tenha essas integrações para que quando precisar o sistema consiga entregar esse serviço".
- Que barbearias e barbeiros já usam InfinitePay ou Stripe e evitariam o BarChop por ter de abrir conta no Asaas: Assumption — needs validation via conversa com as barbearias prospectadas ("por qual plataforma você já recebe?").
- O Barbeiro.app (concorrente direto) já recebe planos em conta própria da barbearia por MercadoPago, Asaas e Stripe. Análise funcional de 12/10/2026, no PRD-mãe.
- Documentação da InfinitePay (conferida em 30/10/2026, https://www.infinitepay.io/checkout-documentacao): "A API não tem cobrança recorrente". Só gera link de pagamento avulso (cartão em até 12x; Pix por link, com chave de API). O aviso de pagamento não é assinado, e a API não cancela nem estorna (só no app).
- Stripe: assinatura recorrente no cartão é pronta. O Pix em conta brasileira é só por convite, e o Pix recorrente não foi confirmado (https://docs.stripe.com/payments/pix). A conta Stripe do próprio BarChop tem Pix, mas sem recorrência (ADR-0010).

## Users
- **Primary**: quem vende plano no BarChop (dono da barbearia, no plano da casa; profissional com "pode vender planos" ligado, no plano dele) e já recebe pela Stripe ou pela InfinitePay. A necessidade aparece quando vai ligar o pagamento online de um plano em Pagamentos online.
- **Secondary**: o cliente final que assina o plano pela página pública e paga online.
- **Not for**: quem não vende planos. O escopo é **só os planos de assinatura** (decisão do dono em 30/10/2026). A cobrança que o BarChop faz das barbearias segue como está.

## Hypothesis
We believe **deixar quem vende conectar a plataforma que já usa (Stripe ou InfinitePay, além do Asaas)** will **tirar a barreira de abrir conta numa plataforma nova para vender planos** for **barbearias e barbeiros que já recebem por essas plataformas**.
We'll know we're right when **TBD — needs validation via prospecção (ex.: pelo menos 1 vendedor real recebendo por Stripe ou InfinitePay em N meses)**.

## Success Metrics
| Metric | Target | How measured |
|---|---|---|
| Vendedores com Stripe ou InfinitePay conectada | TBD — needs validation via prospecção | Contas conectadas por plataforma no banco |
| Ciclos da InfinitePay pagos pelo link | TBD — needs validation via primeiros assinantes | Links pagos / links enviados por ciclo |
| Pagamento online refletido no Caixa e no acerto | 0 divergência | Mesma conferência do aceite do marco 3 (pagamento no provedor × Caixa × acerto) |

## Scope
**MVP**: as duas plataformas entram como opções em Pagamentos online, com o mesmo comportamento do Asaas no resto do sistema (vitrine, Minha conta, painel de assinantes, Caixa, acerto do dia, sino). Ordem decidida pelo dono: **Stripe primeiro**.

- **Uma plataforma por vendedor** (decisão do dono em 30/10/2026): quem vende conecta o Asaas, a Stripe ou a InfinitePay, não duas ao mesmo tempo.
- **Stripe**: conectar a conta; o cliente assina online no cartão com renovação automática; cancelar pelo painel e pelo cliente; cada pagamento entra no Caixa e no acerto como o online do Asaas.
- **InfinitePay**: conectar a conta; **sem renovação automática**. A cada ciclo, o BarChop gera um link de pagamento e manda ao cliente **por e-mail e por WhatsApp** (o WhatsApp num botão à mão até a Meta aprovar o canal automático). Pago o link, o ciclo fica ativo e entra no Caixa e no acerto. Cancelar é parar de gerar links.
  - Ao escolher a InfinitePay, a tela de Pagamentos online **diz que ela não tem assinatura recorrente e explica como funciona** (link a cada ciclo, mandado ao cliente por e-mail e WhatsApp).

**Out of scope**
- Nenhum item listado (decisão do dono em 30/10/2026). O limite do escopo é o de cima: só os planos de assinatura.

## Delivery Milestones
<!-- Business outcomes, not engineering tasks. /plan turns each into a plan. -->
<!-- Status: pending | in-progress | complete -->

| # | Milestone | Outcome | Status | Plan |
|---|---|---|---|---|
| 1 | Stripe em Pagamentos online | Quem vende conecta a Stripe; o cliente assina no cartão com renovação automática; o pagamento cai na conta de quem vende e aparece no Caixa e no acerto; cancelar funciona pelo painel e pelo cliente | in-progress | `.claude/plans/pagamentos-online-stripe.plan.md` |
| 2 | InfinitePay em Pagamentos online (link por ciclo) | Quem vende conecta a InfinitePay e vê como funciona sem recorrência; a cada ciclo o cliente recebe o link por e-mail e WhatsApp; o link pago ativa o ciclo e entra no Caixa e no acerto | pending | — |

## Open Questions
- [x] **Como o vendedor conecta a Stripe** — decidido pelo dono em 30/10/2026: **colando uma chave**, como no Asaas (o BarChop cria o webhook pela API). Sem Stripe Connect.
- [ ] **Stripe só com cartão?** O Pix em conta brasileira é por convite. Se o vendedor tiver Pix liberado, entra no MVP ou fica para depois?
- [ ] **Como o vendedor conecta a InfinitePay**: só a InfiniteTag (que basta para o link, mas sem Pix) ou com a chave de API `inchk_` (Pix e opções do link)?
- [x] **WhatsApp do link da InfinitePay** — decidido pelo dono em 30/10/2026: enquanto o canal da Cloud API está desligado (`WHATSAPP_ATIVO=false`, ADR-0009), **botão "Mandar pelo WhatsApp" à mão** (`wa.me`), como no lembrete; o e-mail sai automático.
- [ ] **InfinitePay, link não pago**: quando o cliente fica "em atraso" e quando a assinatura é cancelada? Reenvia o link? Em que dias?
- [ ] **InfinitePay, o cliente também é avisado ao assinar** que não renova sozinho (na vitrine e na Minha conta)? Hoje a decisão cobre só a tela do vendedor.
- [x] **Trocar de plataforma com assinantes ativos** — resolvido pela regra que já existe (marco 3, decisão 6): uma conta ligada por vendedor, e desconectar só sem assinatura online viva. Para trocar, cancela as assinaturas, desconecta e conecta a outra.
- [ ] **Recurso do plano do BarChop**: Stripe e InfinitePay ficam nos mesmos planos do BarChop que o Asaas?

## Risks
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Aviso de pagamento da InfinitePay não é assinado: um aviso falso poderia ativar um ciclo | Média | Alto | Nunca confiar no aviso; confirmar o pagamento na API da InfinitePay antes de ativar |
| A API da InfinitePay muda ou tem pouca documentação (hosts diferentes em bibliotecas de terceiros) | Média | Médio | Seguir só a documentação oficial; teste ponta a ponta em produção como o do Asaas em 25/10 |
| InfinitePay não cancela nem estorna pela API | Certa | Baixo | O BarChop só para de gerar links; estorno fica no app da InfinitePay |
| WhatsApp automático depende da aprovação da Meta | Alta | Médio | Botão à mão (`wa.me`) até a Meta aprovar; e-mail sai desde o início |
| Cliente esquece de pagar o link e a assinatura cai mais que no recorrente | Média | Médio | Lembretes do link (pergunta do link não pago) |
| Chave da Stripe do vendedor vazada | Baixa | Alto | Mesmo cuidado da chave do Asaas (guardada cifrada, nunca exibida inteira) |
| Pix da Stripe em conta brasileira só por convite | Alta | Baixo | MVP no cartão; Pix como pergunta aberta |

---
*Status: DRAFT — requirements only. Implementation planning pending via /plan.*
