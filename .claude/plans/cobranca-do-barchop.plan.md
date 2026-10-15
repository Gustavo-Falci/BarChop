# Plan: BarChop cobra a assinatura (Stripe)

**Source PRD**: `.claude/prds/onda-2-dinheiro.prd.md`
**Selected Milestone**: 1 — BarChop cobra a assinatura
**Complexity**: Large (6 PRs, 2 migrações: a 2ª, `cancela_em`, entrou no PR 5 por decisão do dono em 14/10)

## Summary
Toda barbearia passa a ter uma assinatura: 14 dias de teste com tudo liberado, depois Grátis (1 profissional) ou um plano pago por profissional (Essencial, Completo), mensal ou anual, pago online pela Stripe. O pagamento acontece todo nas páginas da Stripe (Checkout e Portal do cliente), então o BarChop não guarda cartão. A situação da assinatura chega pelo webhook. Os preços e limites ficam num módulo só, lido pelo site, pelo painel, pela API e pelo script que cria os preços na Stripe.

## Decisões já tomadas
- Provedor: **Stripe**, conta de pessoa física (CPF), sem precisar de CNPJ. Vira o ADR-0010 e substitui o ADR-0005 só na cobrança do SaaS; o dinheiro da barbearia (marco 3) segue em aberto.
- Preços (12/10): Grátis 1 profissional; Essencial R$ 34,90 + R$ 10 por extra, até 3; Completo R$ 44,90 + R$ 15 por extra, sem limite. Anual = 2 meses grátis (Essencial R$ 349/ano, Completo R$ 449/ano, com 1 profissional; extra anual = 10× o mensal).
- Teste de 14 dias = Completo sem limite, sem cartão.
- Marco 2 (registrado no PRD): gorjeta vai 100% para quem atendeu; o desconto reduz o valor que é dividido.

## Decisões propostas (confirmar ao aprovar o plano)
1. **Quem conta como profissional**: membro ativo com papel `dono` ou `profissional`. A recepção não conta e não paga.
2. **Barbearias que já existem** (teste1, barbearia-teste, gr-barber): ganham 14 dias de teste a partir do deploy da migração.
3. **Teste acabou sem pagar, ou a assinatura foi cancelada → Grátis.** Nada é apagado. Se a barbearia tem mais profissionais que o limite, só o dono mais antigo continua aparecendo no link público. Os outros ficam no painel e com a agenda, mas não recebem agendamento novo pelo link. Os horários já marcados continuam valendo. O painel mostra uma faixa explicando isso.
   - **Ajustes do dono (14/10, PR 3):**
     - **Quem fica:** se o dono mais antigo não atende, fica no link o profissional mais antigo que atende, para o link nunca ficar sem ninguém.
     - **Remarcar:** o cliente que já tem horário com quem saiu do link pode remarcar pela conta, com o mesmo profissional, respeitando o prazo de remarcar da barbearia. A busca de horários abre a agenda desse profissional só para o cliente dono do agendamento, com o parâmetro `remarcar` e o login dele.
4. **Pagamento atrasado**: a Stripe tenta cobrar de novo sozinha. Enquanto tenta, tudo continua funcionando e o painel mostra a faixa "pagamento pendente". Quando a Stripe desiste e cancela, a barbearia cai no Grátis (item 3).
5. **Formas de pagamento**: cartão. Pix Automático entra se a conta for elegível, porque a documentação e o suporte da Stripe se contradizem (ver Riscos). Boleto fica fora.
6. **Mudar a equipe com plano pago**: incluir ou reativar um profissional aumenta a quantidade na Stripe, com cobrança proporcional. No Essencial, o 4º profissional é recusado com o convite "suba para o Completo". No Grátis, o 2º é recusado com o convite "escolha um plano".
7. **Só o dono** vê e mexe na assinatura.
8. **Os recursos por plano** (WhatsApp, caixa, planos da barbearia) já entram no módulo como sinalizadores, mas hoje nada é bloqueado por eles, porque esses recursos ainda não existem. Cada marco liga o seu.

## Respondidas pelo dono (14/10, PR 4)
- **Assinar durante o teste só cobra quando ele acaba** (`trial_end` no Checkout). A Stripe exige pelo menos 48h até a cobrança; com menos que isso, cobra na hora.
- **Assinou durante o teste, vale o plano assinado na hora** (decisão do dono em 14/10, opção b). A Stripe diz `trialing`, a API grava `ativa`, e quem assina o Essencial no dia 2 sai do Completo do teste no mesmo instante. A tela do plano (PR 5) avisa quando vem a 1ª cobrança.

## Teste de fumaça do PR 4 (14/10, Stripe de teste)
- `criar-precos` rodou duas vezes no modo de teste: na 1ª, criou os 2 produtos e os 4 preços; na 2ª, os 4 estavam "já está certo".
- A `layout-dev` (banco dev) assinou o Essencial mensal com 2 profissionais pelo Checkout e pagou com o cartão 4242:
  - na Stripe: `trialing`, com `trial_end` no fim do teste, `essencial_mensal` × 2 e `metadata.barbeariaId`;
  - os eventos chegaram pelo Stripe CLI (`stripe listen --api-key`) com 200;
  - no banco: `ativa`, `essencial`, 2 profissionais contratados e `periodoTerminaEm`;
  - o evento repetido não foi aplicado duas vezes;
  - o dono recebeu o aviso "Assinatura ativa";
  - o 2º Checkout deu 409, e o Portal abriu.
- **Achado:** "cancelar no fim do período" no Portal não chega ao banco. A Stripe segue `active` até o fim, e a API não lê `cancel_at_period_end`. Até isso entrar, a tela não pode afirmar "próxima cobrança em X" para quem cancelou.

## Respondidas pelo dono (13/10)
- **GR Barber paga**, sem cortesia: não existe situação `cortesia`.
- `/precos` mostra a tabela; `/gratis` leva ao cadastro com o Grátis em destaque.
- As decisões propostas acima foram aceitas.

## Patterns to Mirror
| Category | Source | Pattern |
|---|---|---|
| Listas fechadas compartilhadas | `barchop/packages/formato/src/pagina.ts`, `regras.ts` | constantes `as const` + tipos exportados pelo `index.ts`; API e web leem do mesmo lugar (ADR-0007 — o módulo vai para `@barchop/formato`, porque `packages/config` só tem tooling) |
| Adaptador de provedor na instância | `barchop/apps/api/src/lib/canal.ts`, `app.ts:144-152` | interface + versão de memória para os testes + `xDoAmbiente()` que recusa subir em produção sem chave; `app.decorate("cobranca", …)` |
| Erro de negócio | `barchop/apps/api/src/lib/erro-negocio.ts` | `throw new ErroDeNegocio("mensagem", "codigo")` → 4xx com `{ erro }` |
| Transação | `barchop/apps/api/src/routers/auth.ts:85-108` | signup cria barbearia e dono em `prisma.$transaction`; a assinatura em teste nasce na mesma transação |
| Notificação na mesma transação | `barchop/apps/api/src/lib/notificacoes.ts` | o webhook que muda a situação cria uma notificação `pagamento` (o tipo já existe e ainda não tem emissor) |
| Rotas protegidas | `barchop/apps/api/src/app.ts:190-205` | `registrarRotasAssinatura(protegidas)`; webhook fora do escopo protegido, num escopo próprio com parser de corpo cru |
| Migração com CHECK | `migrations/20261013120000_notificacoes` | SQL à mão com CHECK para as listas fechadas e índice parcial |
| Testes de API | `barchop/apps/api/tests/routers/notificacoes.test.ts` | `buildApp` + `app.inject`, banco de teste, fixtures em `tests/helpers` |
| Testes de tela | `barchop/apps/web/tests/painel/sino-de-notificacoes.test.tsx` | Testing Library + `fetch` falso |
| Menu da conta | `barchop/apps/web/src/painel/BarraDoTopo.tsx:186-194` | "Faturas" está como "Em breve" e passa a ser link |

## Files to Change
| File | Action | Why |
|---|---|---|
| `barchop/packages/formato/src/planos.ts` (+ teste) | CREATE | preços, limites, recursos, `precoDoPlano()`, `planoEfetivo()`, `limiteDeProfissionais()` |
| `barchop/packages/formato/src/index.ts` | UPDATE | exporta os planos |
| `barchop/docs/adr/0010-stripe-na-cobranca-do-saas.md` | CREATE | Stripe na cobrança do SaaS; ADR-0005 passa a "parcialmente substituído" |
| `.claude/prds/onda-2-dinheiro.prd.md` | UPDATE | marco 1 em andamento; Stripe, gorjeta e desconto decididos |
| `barchop/packages/database/prisma/schema.prisma` | UPDATE | `Assinatura` (1:1 com a barbearia) e `EventoDaStripe` (idempotência) |
| `barchop/packages/database/prisma/migrations/2026101412xxxx_assinatura/migration.sql` | CREATE | tabelas + CHECK + teste de 14 dias para as barbearias existentes |
| `barchop/packages/database/prisma/migrations/20261015120000_assinatura_cancela_em/migration.sql` | CREATE | PR 5: quando acaba a assinatura cancelada no Portal (a Stripe segue `active` até lá) |
| `barchop/apps/api/src/routers/auth.ts` | UPDATE | signup cria a assinatura em teste |
| `barchop/apps/api/src/lib/assinatura.ts` | CREATE | ler a assinatura, contar profissionais, decidir quem fica visível no Grátis |
| `barchop/apps/api/src/routers/assinatura.ts` | CREATE | `GET /barbearias/me/assinatura`, `POST /barbearias/me/assinatura/checkout`, `POST /barbearias/me/assinatura/portal` (sob `/barbearias/me`, como a Aparência: a assinatura é da barbearia, não da pessoa) |
| `barchop/apps/api/src/routers/equipe.ts` | UPDATE | limite de profissionais + ajuste da quantidade na Stripe |
| `barchop/apps/api/src/routers/barbearias.ts`, `disponibilidade.ts`, `agendamentos.ts` (público) | UPDATE | no Grátis acima do limite, o link público mostra só o profissional que continua |
| `barchop/apps/api/src/lib/cobranca.ts` (+ `cobranca-stripe.ts`) | CREATE | interface + memória + Stripe |
| `barchop/apps/api/src/routers/webhook-stripe.ts` | CREATE | `POST /stripe/webhook`: assinatura verificada, evento processado uma vez só |
| `barchop/apps/api/scripts/criar-precos-no-stripe.ts` | CREATE | cria produtos e preços (graduados, por `lookup_key`) a partir de `planos.ts`; pode rodar de novo sem duplicar |
| `barchop/apps/api/src/app.ts`, `package.json`, `.env.example` | UPDATE | `app.cobranca`, rotas, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, dependência `stripe` |
| `barchop/apps/web/app/(painel)/painel/(guardado)/assinatura/page.tsx` | CREATE | rota da tela |
| `barchop/apps/web/src/telas/painel/Assinatura.tsx` (+ css, teste) | CREATE | configurador: plano em pílulas, profissionais −/+, Mensal/Anual, preço, Assinar / Gerenciar |
| `barchop/apps/web/src/painel/FaixaDaAssinatura.tsx` (+ teste) | CREATE | "Teste grátis: faltam N dias", "pagamento pendente", "no Grátis: X fora do link" |
| `barchop/apps/web/src/painel/BarraDoTopo.tsx`, `LayoutDoPainel`, `novidades.ts` | UPDATE | Faturas vira link; Plano no menu da conta; faixa; novidade |
| `barchop/apps/web/src/site/Home.tsx`, `app/(marketing)/precos`, `app/(marketing)/gratis`, `termos` | UPDATE/CREATE | sai o "grátis durante o lançamento", entra a tabela lida de `planos.ts`; termos ganham a seção de cobrança e cancelamento |

## Tasks (um PR cada, TDD com commit RED → GREEN)

### PR 1: Planos num lugar só (sem migração)
- **Action**: `planos.ts` com `PLANOS` (`gratis`, `essencial`, `completo`): nome, preço base em centavos, extra, limite, desconto anual e recursos. Funções:
  - `precoDoPlano(plano, ciclo, profissionais)`;
  - `limiteDeProfissionais(plano)`;
  - `planoEfetivo(assinatura, agora)`: teste vigente → completo; ativa ou em atraso → o plano contratado; senão → grátis.
  - ADR-0010 e PRD atualizado.
- **Mirror**: `regras.ts` (funções puras + constantes).
- **Validate**: teste unitário com os exemplos do PRD (GR Barber: Essencial R$ 44,90 e Completo R$ 59,90; 4 profissionais no Completo: R$ 89,90; anual) + tsc + lint.

### PR 2: Assinatura no banco (MIGRAÇÃO)
- **Action**:
  - Tabela `assinatura` com estas colunas:
    - `barbearia_id` único;
    - `plano` e `ciclo` (CHECK);
    - `situacao`: `teste | ativa | em_atraso | cancelada | gratis`;
    - `teste_termina_em`, `stripe_customer_id`, `stripe_subscription_id`, `profissionais_contratados`, `periodo_termina_em` e os timestamps.
  - Tabela `evento_stripe`, com o `id` do evento como chave primária.
  - A migração cria a assinatura de todas as barbearias existentes, em teste até `now() + 14 dias`.
  - O signup cria a assinatura na transação.
  - `GET /barbearias/me/assinatura` devolve situação, plano efetivo, dias de teste restantes, profissionais contados, limite e se há excedente.
- **Mirror**: migração do #136; transação do signup.
- **Validate**: testes de `auth-signup` e `assinatura` + tsc + lint. **Lembrar o `migrar` no deploy.**

### PR 3: Limite de profissionais
- **Action**:
  - Equipe: incluir, reativar ou mudar papel para atender acima do limite do plano efetivo dá `ErroDeNegocio("…", "limite_do_plano")`.
  - No Grátis com excedente: a página pública, a disponibilidade e o POST público de agendamento só enxergam o dono ativo mais antigo.
  - O painel continua mostrando todos.
- **Mirror**: filtros por `ativo` em `equipe.ts` e `disponibilidade.ts`.
- **Validate**: `equipe.test.ts`, `disponibilidade-*.test.ts`, `agendamentos-publico.test.ts`. Mexe no caminho da disponibilidade, então roda a suíte inteira da API (combinado).

### PR 4: Stripe (sem migração)
- **Action**:
  - `lib/cobranca.ts` com `criarCheckout`, `criarPortal`, `atualizarQuantidade` e `lerEvento`; versão de memória e versão Stripe.
  - Script `criar-precos-no-stripe` com preços graduados (1ª unidade = base, demais = extra), por `lookup_key` `essencial_mensal` etc.
  - Rotas checkout e portal.
  - Webhook (corpo cru, `constructEvent`, evento gravado em `evento_stripe` na mesma transação da mudança). Eventos tratados:
    - `checkout.session.completed`;
    - `customer.subscription.created`, `.updated` e `.deleted`;
    - `invoice.paid`;
    - `invoice.payment_failed`.
  - Equipe: com plano pago, mudar o número de profissionais chama `atualizarQuantidade`.
  - Notificação `pagamento` ao dono quando a situação muda.
  - A API recusa subir em produção sem as chaves.
- **Mirror**: `canal.ts` / `canalDoAmbiente`.
- **Validate**: testes do webhook com corpo assinado (`stripe.webhooks.generateTestHeaderString`), evento repetido não aplica duas vezes, assinatura inválida dá 400, checkout só para o dono + tsc + lint.

### PR 5: Tela do plano no painel
- **Action**:
  - `/painel/assinatura` no estilo da tela do Barbeiro.app, seguindo o combinado de telas sem caixas e horizontais:
    - plano em pílulas;
    - profissionais −/+, começando no número atual;
    - Mensal/Anual;
    - preço calculado por `precoDoPlano`;
    - "Assinar" leva ao Checkout da Stripe; com assinatura ativa, "Gerenciar pagamento e faturas" abre o Portal.
  - A volta do Checkout (`?ok=1`) mostra "Pagamento recebido" e consulta de novo até o webhook chegar.
  - Faixa no topo do painel (só o dono vê).
  - No menu da conta, "Faturas" vira link do Portal e entra "Plano".
  - Item novo em Novidades.
- **Validate**: testes das telas + tsc + lint + navegador em 375 e 1440.

### PR 6: Site e termos
- **Action**:
  - Home: sai "Grátis durante o lançamento", entra a tabela dos três planos lida de `planos.ts`, e o FAQ de preço é reescrito.
  - `/precos`, e `/gratis` conforme a resposta da pergunta em aberto.
  - Termos: cobrança recorrente, cancelamento quando quiser, o que acontece no fim do teste e no atraso, e a Stripe como processadora.
  - Política de privacidade: a Stripe como operadora.
- **Validate**: testes do site + tsc + lint + navegador.

## Antes do PR 4 (o dono faz na Stripe)
1. ~~Abrir a conta como pessoa física (CPF), com conta bancária no mesmo CPF.~~ Feito em 13/10.
2. ~~Ver se o **Pix** aparece como forma de pagamento para assinaturas (Pix Automático).~~ Conferido em 14/10: Pix habilitado, mas "Pagamentos recorrentes: Não" → segue só com cartão.
3. ~~Configurar o Portal do cliente: cancelar, trocar cartão, ver faturas.~~ Feito em 14/10.
4. Criar o endpoint do webhook `https://api.barchop.com.br/stripe/webhook`.
5. Gerar as chaves de teste para eu desenvolver (feito em 14/10: `STRIPE_SECRET_KEY` no `apps/api/.env`), e as de produção para o `.env` da VM.

## Validation
```bash
cd barchop
pnpm --filter @barchop/formato test
pnpm --filter api exec vitest run tests/routers/<afetados>
pnpm --filter web exec vitest run tests/<afetados>
pnpm -r type-check
pnpm -r lint
```

## Risks
| Risk | Likelihood | Mitigation |
|---|---|---|
| A Stripe Brasil não oferecer Pix recorrente para esta conta (a documentação de abr/2026 diz que sim, um artigo do suporte diz que não) | Medium | Começar com cartão; Pix entra como forma de pagamento no Dashboard sem mudar código, porque o Checkout usa as formas de pagamento ativadas na conta |
| Conta PF não poder virar PJ depois sem abrir conta nova (relato de fórum) | Medium | Assinaturas ficam ligadas por `stripe_customer_id`; mudar de conta = migrar clientes. Registrar no ADR-0010 |
| Webhook perdido ou fora de ordem deixa a situação errada | Medium | Sempre relê a assinatura na Stripe ao processar; evento idempotente; a tela consulta de novo depois do Checkout |
| Barbearias que já existem caírem no Grátis sem aviso | Low | 14 dias a partir do deploy + faixa no painel desde o primeiro dia |
| Preço na Stripe divergir de `planos.ts` | Low | O script lê `planos.ts`; teste compara `lookup_key` × módulo |
| Termos sem razão social/CNPJ | Medium | Vendedor = pessoa física; preencher os dados pessoais nos termos (o dono decide o que aparece) |
| `migrar` velho no deploy do PR 2 | Medium | Lembrar ao fechar o PR |

## Acceptance
- [ ] Barbearia nova nasce em teste de 14 dias com tudo liberado
- [ ] Dono assina Essencial ou Completo, mensal ou anual, pelo Checkout da Stripe e a situação vira `ativa` pelo webhook
- [ ] Teste vencido ou assinatura cancelada → Grátis, sem apagar nada
- [ ] Limite de profissionais aplicado na API; a quantidade na Stripe acompanha a equipe
- [ ] Site mostra a tabela lida de `planos.ts`; nenhum preço escrito à mão
- [ ] Validation passa em cada PR
