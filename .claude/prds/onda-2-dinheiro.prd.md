# BarChop — Onda 2: Dinheiro

**PRD-mãe**: `.claude/prds/barchop-saas.prd.md` (marco 2)
**Referências** (em `.claude/prds/referencias/`): `barbeiro-app-planos-da-barbearia.md` (módulo de planos que a barbearia vende ao cliente), `barbeiro-app-planos-do-saas.md` (o que o Barbeiro.app cobra da barbearia) e `pesquisa-de-precos-2026-10.md` (concorrentes + proposta de preços do BarChop)

## Problem
O dono de barbearia pequena controla o dinheiro no caderno e no app da maquininha: no fim do dia não sabe ao certo quanto entrou, quanto cada profissional fez e quanto um deve ao outro quando atendeu cliente alheio — a conta é feita de cabeça e gera erro e atrito na sociedade. Além disso, a barbearia não tem como vender plano recorrente aos clientes (receita previsível, cliente fiel), e o próprio BarChop não cobra nada, então não se paga nem pode abrir o cadastro para outras barbearias de verdade.

## Evidence
- GR Barber (piloto) controla o dinheiro em caderno/bloco de notas + o app da maquininha — relato do dono do BarChop.
- GR Barber tem dois barbeiros (o dono e um parceiro); cada um recebe direto dos próprios atendimentos, e a divisão depende de **quem é o cliente** e **quem atendeu**: cliente do dono atendido pelo dono → 100% dono; cliente do parceiro atendido pelo parceiro → 100% parceiro; cliente do dono atendido pelo parceiro → 60% dono / 40% parceiro; cliente do parceiro atendido pelo dono → 100% dono. Outras barbearias têm regras diferentes — o dono do BarChop afirma que precisa ser configurável.
- O Barbeiro.app (concorrente direto) já vende planos de assinatura da barbearia ao cliente final, com pagamento online em conta própria da barbearia (MercadoPago, Asaas, Stripe) — análise funcional de 12/10/2026.
- A GR Barber só começa o piloto quando o sistema estiver pronto, Onda 2 incluída — decisão do dono do BarChop.
- Disposição de outras barbearias pagarem pelo BarChop: Assumption — needs validation via conversão das primeiras contas do teste de 14 dias (sem entrevistas prévias, decisão do dono).
- Disposição dos clientes da GR Barber assinarem um plano: Assumption — needs validation via primeiros assinantes no piloto.

## Users
- **Primary**: dono de barbearia com 1 a ~6 profissionais que hoje fecha o dia no caderno e na maquininha e faz o acerto entre profissionais de cabeça; precisa disso todo fim de dia.
- **Secondary**: profissional da barbearia (vê o que fez e o que tem a receber/repassar); cliente final (assina o plano da barbearia pela página pública); o próprio BarChop (recebe a mensalidade das barbearias).
- **Not for**: redes com várias unidades e caixa centralizado complexo; barbearias que precisam de emissão fiscal integrada (NFS-e é Onda 5).

## Hypothesis
We believe **cobrança do próprio BarChop + caixa do dia com acerto automático entre profissionais + planos de assinatura vendidos pela barbearia** will **substituir o caderno no fechamento do dia, dar receita recorrente à barbearia e fazer o BarChop se pagar** for **donos de barbearia pequena**.
We'll know we're right when **a GR Barber fechar o dia no BarChop em ≥ 5 dias por semana durante o piloto sem voltar ao caderno, e a receita das assinaturas do BarChop cobrir o custo mensal da VM** (número de contas pagas necessário: TBD — depende dos preços).

## Success Metrics
| Metric | Target | How measured |
|---|---|---|
| Fechamento do dia no BarChop (GR Barber) | ≥ 5 dias/semana | Dias com fechamento registrado / dias com atendimento, janela de 30 dias |
| Acerto entre profissionais confiável | 0 divergência vs caderno nas 2 primeiras semanas | Dono compara o acerto do BarChop com o caderno em paralelo |
| Conversão do teste de 14 dias para plano pago | TBD — needs validation via primeiras contas externas | Contas pagantes / contas que terminaram o teste |
| Receita do BarChop vs custo da VM | receita mensal ≥ custo mensal da VM | Soma das mensalidades recebidas vs fatura da VM |
| Assinantes de planos da barbearia (GR Barber) | TBD — needs validation via primeiros 30 dias de vitrine | Assinaturas ativas no fim do mês |

## Scope
**MVP** — quatro marcos, nesta ordem (decisão do dono), cada um em produção antes do próximo:

1. **BarChop cobra a assinatura**: barbearia nova ganha 14 dias de teste com todas as funcionalidades e serviços liberados (decisão do dono); depois escolhe o plano grátis (com limites) ou um plano pago por profissional e paga online; tabela de preços e `/gratis` no site no lugar de "grátis durante o lançamento". Planos: Grátis (1 profissional), Essencial R$ 34,90 + R$ 10 por extra (até 3) e Completo R$ 44,90 + R$ 15 por extra (ver Open Questions para o que ainda falta conferir).
2. **Caixa do dia e comissões**: ao concluir um atendimento, fica registrado quanto foi cobrado, a forma de pagamento e quem recebeu; todo cliente "é de" um profissional — automaticamente de quem o atendeu primeiro, e **o dono pode trocar à mão** (requisito, não detalhe: os clientes que já existem quando o recurso entrar no ar seriam atribuídos por acaso); a barbearia configura as regras de divisão por combinação "de quem é o cliente × quem atendeu" (a da GR Barber tem que caber); fechar o dia mostra, por profissional, quanto recebeu, quanto lhe cabe e quanto deve repassar a quem — cada um recebe direto, então o fechamento é um **acerto por profissional**, não um caixa único.
3. **Planos de assinatura para o cliente** (modelo decidido pelo dono em 24/10/2026): há planos **da casa** e planos **de um barbeiro** — o cliente que gosta de um barbeiro assina direto com ele. Cada plano tem ciclo, preço, dias de teste e serviços incluídos com limite de usos por ciclo; a página pública mostra os dois tipos numa vitrine que pode ligar/desligar. O cliente paga online (Pix com QR a cada ciclo e cartão recorrente) **com o dinheiro caindo na conta de quem vende no provedor** — a do barbeiro, no plano dele; a conectada pelo dono, no plano da casa — ou no local, se permitido; o painel lista os assinantes por situação (ativa, em atraso, pendente, cancelada…); o BarChop **não** cobra taxa sobre essas vendas.
   - **Plano de barbeiro** vale só com aquele barbeiro: com outro, o atendimento é avulso e entra no caixa como hoje. A casa fica com o mesmo % da "parte da casa" do barbeiro sobre a mensalidade recebida — no acerto, o barbeiro deve isso à casa.
   - **Plano da casa** vale com qualquer profissional; quem atende ganha um **valor fixo por atendimento** definido pela barbearia — no acerto, a casa deve esse valor a ele.
   - **Quem vende**: o dono sempre; cada profissional só se o dono ligar "pode vender planos" para ele na Equipe. Quem vende conecta a própria conta no provedor.
   - **Provedores**: um conector por provedor, cada vendedor escolhe o seu. O marco 3 sai com o **Asaas** (o vendedor cola a chave de API; o BarChop registra o webhook pela API com um `authToken` próprio — sem CNPJ nem app registrado do BarChop). Mercado Pago, Stripe e InfinitePay (esta em "link por ciclo": a API dela não cria assinatura) entram depois, pelo mesmo conector. Pix Automático é extra: exige CNPJ ativo há mais de 6 meses de quem recebe.
4. **Relatórios**: o dono vê quanto entrou por período, por profissional e por forma de pagamento, e o histórico dos fechamentos e acertos. Recorte exato: TBD — needs validation via uso do caixa no piloto.

**Out of scope**
- Taxa do BarChop sobre vendas da barbearia — decisão do dono: o BarChop ganha só a mensalidade.
- Pagamento ou sinal online do agendamento avulso — continua na Onda 3; a Onda 2 só traz o pagamento online dos planos.
- Integração/conciliação com maquininha e "adquirentes e taxas" — o caixa registra a forma de pagamento, não lê a maquininha.
- Preço por forma de pagamento (desconto Pix, acréscimo) — não pedido.
- Agendamentos recorrentes automáticos — não pedido.
- Emissão fiscal (NFS-e) — Onda 5.
- Fidelidade, lista de espera, avaliações — Onda 3; loja/estoque — Onda 4.
- Extras do módulo do Barbeiro.app (pacote pré-pago, convênio, regras finas de uso, sugestão de preço, aba Receita, Pix Automático, selo "mais popular") — **pendentes**, não descartados (ver Open Questions).

## Delivery Milestones
<!-- Business outcomes, not engineering tasks. /plan turns each into a plan. -->
<!-- Status: pending | in-progress | complete -->

| # | Milestone | Outcome | Status | Plan |
|---|---|---|---|---|
| 1 | BarChop cobra a assinatura | Barbearia nova testa 14 dias, escolhe grátis ou plano pago por profissional e paga online; site mostra a tabela de preços e `/gratis` | complete — no ar desde 2026-10-15, testado com cobrança real em 16/10 (PRs #141 a #150) | `.claude/plans/cobranca-do-barchop.plan.md` |
| 2 | Caixa do dia e comissões | Dono fecha o dia no BarChop e vê o acerto por profissional segundo as regras da barbearia (de quem é o cliente × quem atendeu), sem conta de cabeça | complete — código pronto em 16/10 (PRs #153 a #160); entra no ar com o deploy do dono | `.claude/plans/caixa-do-dia.plan.md` |
| 3 | Planos de assinatura para o cliente | Cliente assina um plano da casa ou de um barbeiro na página pública e paga online (Pix/cartão, dinheiro na conta de quem vende) ou no local; dono acompanha os assinantes; o acerto inclui a parte da casa nos planos de barbeiro e o valor fixo nos planos da casa | in-progress — plano aprovado em 24/10 | `.claude/plans/planos-de-assinatura.plan.md` |
| 4 | Relatórios | Dono vê o que entrou por período, profissional e forma de pagamento, e o histórico dos fechamentos | pending | — |

## Open Questions
- [x] Preços e nomes dos planos do BarChop — decididos pelo dono em 12/10/2026: Grátis (1 profissional), Essencial R$ 34,90 + R$ 10 por profissional extra (até 3), Completo R$ 44,90 + R$ 15 por extra (sem limite); detalhes em `referencias/pesquisa-de-precos-2026-10.md`.
- [ ] Antes de fechar os preços: custo por mensagem do WhatsApp na Meta, taxa do provedor sobre a mensalidade e custo da VM (quantas contas pagas cobrem a infraestrutura).
- [x] O que acontece com a barbearia que termina o teste sem pagar, ou atrasa a mensalidade — decidido pelo dono em 13/10/2026: no atraso, tudo segue funcionando enquanto a Stripe tenta cobrar; teste vencido ou assinatura cancelada cai no Grátis, guarda os dados e não bloqueia a agenda do cliente final.
- [x] Provedor para o BarChop cobrar as barbearias: **Stripe**, conta de pessoa física (CPF), sem CNPJ — decisão do dono em 13/10/2026 (ADR-0010).
- [x] Provedor para quem vende planos receber dos clientes (marco 3) — decidido pelo dono em 24/10/2026: vários, um conector por provedor, cada vendedor escolhe; começa pelo **Asaas** (chave de API do vendedor, webhook criado pela API). Mercado Pago (OAuth exige app registrado do BarChop — conferir se dá com CPF) e Stripe Connect (conferir se conta brasileira com CPF pode ser plataforma; só cartão recorrente) ficam para depois.
- [ ] O BarChop tem CNPJ/razão social? Não trava o marco 1 (Stripe com CPF) nem o marco 3 com o Asaas (a conta é do vendedor); segue valendo para a verificação da Meta e os "a preencher" do site.
- [x] A GR Barber, como piloto, paga plano ou fica de graça? — decidido pelo dono em 13/10/2026: **paga**, sem cortesia.
- [x] Pix na assinatura do BarChop — conferido pelo dono em 14/10/2026: a conta da Stripe tem Pix, mas sem pagamento recorrente; a assinatura começa só com cartão (ADR-0010).
- [ ] Extras do módulo do Barbeiro.app — entram na Onda 2 ou depois: pacote pré-pago, convênio, regras finas de uso (dias permitidos, intervalo mínimo, agendamentos futuros simultâneos), sugestão de preço, aba Receita, Pix Automático, selo "mais popular".
- [x] De quem é a mensalidade no acerto — decidido pelo dono em 24/10/2026: o barbeiro vende plano próprio e recebe na conta dele (a casa fica com o % da "parte da casa" dele, cobrado no acerto); o plano de barbeiro vale só com ele; o plano da casa vale com qualquer um e paga valor fixo por atendimento a quem atendeu. A regra "de quem é o cliente × quem atendeu" não se aplica a atendimento pelo plano.
- [ ] Planos de barbeiro seguem o recurso `planosDaBarbearia` (hoje só no Completo) ou entram em outro plano do BarChop? Decidir no `/plan`.
- [x] Gorjeta e desconto — decidido pelo dono em 13/10/2026: a gorjeta vai 100% para quem atendeu (fora da regra de divisão); o desconto reduz o valor cobrado e a divisão é feita sobre o que foi pago.
- [ ] Quais relatórios o dono da GR Barber olharia de verdade (definir no piloto do caixa).

## Risks
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Sem CNPJ, nenhum provedor abre conta: trava o pagamento online do marco 3 | Low | High | Marco 1 com a Stripe em conta de pessoa física (ADR-0010); no marco 3 a conta é do vendedor e o Asaas aceita CPF; Pix Automático (exige CNPJ) fica como extra |
| Chave de API do vendedor vazada pelo BarChop dá acesso à conta dele no provedor | Medium | High | Chave cifrada no banco com segredo do ambiente; nunca volta para a tela (só mascarada); webhook validado pelo `authToken` e eventos deduplicados |
| Regras de divisão variam demais entre barbearias e a configuração não cobre a próxima | Medium | High | Regras configuráveis por combinação "de quem é o cliente × quem atendeu"; validar com a primeira barbearia externa |
| "Quem atendeu primeiro" atribui errado os clientes antigos quando o caixa entrar no ar | High | Medium | Dono troca o profissional do cliente à mão (requisito do marco 2) |
| Onda 2 ficou grande (gateway e planos subiram da Onda 3) e atrasa o início do piloto | High | High | Quatro marcos independentes, cada um em produção antes do próximo; extras do documento ficam pendentes |
| Dinheiro de cliente passando pelo BarChop traz risco regulatório e de estorno | Medium | High | Dinheiro dos planos cai direto na conta de quem vende (barbeiro ou casa) no provedor; o BarChop não guarda dinheiro nem dados de cartão |
| Acerto errado gera briga entre sócios e o dono volta ao caderno | Medium | High | Duas semanas em paralelo com o caderno na GR Barber antes de confiar só no BarChop |

---
*Status: marcos 1 e 2 completos; marco 3 com o modelo decidido em 24/10/2026, aguardando o `/plan`; marco 4 pendente.*
