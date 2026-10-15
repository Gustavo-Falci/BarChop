# Plan: Faturas no modelo do Barbeiro.app

**Source**: pedido do dono em 15/10/2026 + `C:\Users\itconsol\Downloads\Telas_Assinatura_BarbeiroApp.docx` (24 capturas de admin.barbeiro.app/subscription)
**Substitui**: a tela `/painel/assinatura` do PR 5 (#145), ainda não mesclado
**Branch**: `tela-do-plano` (#145), que já traz o #144 por merge
**Complexity**: Large

## Summary
Não existe mais uma tela "Plano". Tudo da assinatura mora em **Faturas** (`/painel/faturas`), que é a entrada do menu da conta.
- **Sem plano pago:** a tela é um fluxo em 3 etapas, como no Barbeiro.app: **Plano → Pagamento → Acesso liberado**. O "Seu pedido" fica ao lado, com o comparativo de planos e as perguntas frequentes embaixo. Se o dono desistir no Checkout, volta para uma tela de "Checkout cancelado".
- **Com plano pago:** a tela mostra o plano atual e a lista das faturas, lida da Stripe. Trocar o cartão e cancelar continuam no Portal.

## Decisões do dono (15/10)
- Uma tela só, em Faturas. O item "Plano" sai do menu da conta.
- Pagamento: **Cartão** ativo. **Pix** e **Boleto** aparecem como no Barbeiro.app, mas desligados e com "Em breve". A conta Stripe não faz Pix recorrente, e o Boleto não está ativado.
- Com assinatura ativa: plano atual e lista de faturas (data, valor, situação, PDF).

## Mapeamento referência → BarChop
| Barbeiro.app | BarChop |
|---|---|
| 4 planos em cartões (Starter, Pro, WhatsApp, Enterprise) | 2 cartões pagos, **Essencial** e **Completo**, lidos de `planos.ts`. O Grátis só aparece no comparativo. |
| "Recomendado pelo seu uso no teste" (dias, profissionais, agendamentos, serviços) | Igual, com os números da barbearia no teste. Recomenda o Essencial até 3 profissionais e o Completo acima disso. |
| Cobrança Por mês / Por ano (−20%) e contador de profissionais | Mensal / Anual ("2 meses grátis") e o contador que já existe, com base + extra. |
| "Oferta do teste: 1º mês por R$ 9,90" | **Não entra.** Fica a decisão de 14/10: assinar no teste só cobra no fim dele. Em "Seu pedido" aparece "Hoje R$ 0,00 · depois R$ X/mês a partir de 29/10". |
| Seu pedido (Plano, Profissionais, Cobrança, Hoje, "No anual sairia… Trocar") | Igual. É a coluna da direita, que no celular desce para baixo da etapa. |
| "Nada foi apagado" | Só quando a barbearia está no Grátis (teste vencido ou assinatura cancelada). |
| Etapa 2: Cartão / Pix / Boleto + "Mudar plano" | Cartão selecionado. Pix e Boleto desligados, com "Em breve". O botão "Assinar o Essencial · R$ 0,00 hoje" abre o Checkout. |
| Checkout da Stripe | O Checkout que já existe (#144). |
| Checkout Cancelado (Ver planos / Voltar ao painel) | `/painel/faturas/cancelado`, com o mesmo texto e os mesmos dois botões. |
| Etapa 3: Acesso liberado | Volta do Checkout (`?ok=1`): espera o webhook com a consulta que já existe, depois mostra "Acesso liberado", com o plano, a 1ª cobrança e os botões Ver faturas / Ir para a agenda. |
| Comparar planos (recurso × plano, linha "Por mês") e garantias | Tabela Grátis / Essencial / Completo, montada de `planos.ts`. Só entram garantias verdadeiras: sem fidelidade, trocar de plano sem taxa, recibo em cada fatura, cartão pela Stripe. |
| Perguntas frequentes (recolhidas) | As 5 perguntas que já existem, recolhidas atrás de "Perguntas frequentes". |

## Patterns to Mirror
| Category | Source | Pattern |
|---|---|---|
| Tela do painel | `apps/web/src/telas/painel/Assinatura.tsx` | `CabecalhoDaPagina`, `useAssinatura`, `Botao`, `Aviso`, `irParaAStripe`; a consulta depois do Checkout (`CONSULTAS_NA_VOLTA`) |
| Rota só do dono | `apps/web/app/(painel)/painel/(guardado)/assinatura/page.tsx` | `"use client"` + `<SoDoDono>` |
| Escolha curta | `componentes/SeletorEmPilulas` | pílulas com `desligada` e `selo` (servem para Pix/Boleto "Em breve") |
| Rotas da API | `apps/api/src/routers/assinatura.ts` | `exigirPapel("dono")`, `conflito()`, `ErroDeNegocio` |
| Cobrança | `apps/api/src/lib/cobranca.ts` | interface `Cobranca` + `cobrancaDeMemoria` (testes) + `cobrancaDaStripe` + `cobrancaDesligada` |
| Cliente da API | `packages/api-client/src/barbeiro.ts:581` + `falso.ts:894` | método no `barbeiro` e o falso equivalente |
| Testes web | `apps/web/tests/telas/painel/assinatura.test.tsx` | vitest + Testing Library, api falsa; CSS de layout lido do `.module.css` (`assinatura-no-desktop.test.ts`) |
| Testes API | `apps/api/tests/routers/assinatura-stripe.test.ts` | `buildApp({ cobranca })` com `cobrancaDeMemoria` |
| Layout | memórias telas-horizontais e telas-sem-blocos | 2 colunas no desktop. Caixas só onde a referência pede decisão: os cartões dos planos, o plano escolhido e Seu pedido. O resto vai em linhas finas. |

## Files to Change
| File | Action | Why |
|---|---|---|
| `apps/api/src/routers/assinatura.ts` | UPDATE | volta do Checkout em `/painel/faturas?ok=1`; cancelar em `/painel/faturas/cancelado`; Portal volta para `/painel/faturas`; nova rota `GET /barbearias/me/assinatura/faturas` |
| `apps/api/src/lib/cobranca.ts` | UPDATE | `listarFaturas(customerId)` nas 3 implementações |
| `apps/api/src/lib/assinatura.ts` (ou onde o resumo é montado) | UPDATE | `usoNoTeste` no resumo: dias usados, agendamentos no período, serviços ativos |
| `apps/api/src/routers/webhook-stripe.ts` | UPDATE | link do aviso → `/painel/faturas` |
| `packages/types/src/*.ts` | UPDATE | `FaturaDaAssinatura`, `usoNoTeste` no `ResumoDaAssinatura` |
| `packages/api-client/src/barbeiro.ts`, `falso.ts` | UPDATE | `faturasDaAssinatura()` |
| `apps/web/app/(painel)/painel/(guardado)/faturas/page.tsx` | CREATE | rota da tela |
| `apps/web/app/(painel)/painel/(guardado)/faturas/cancelado/page.tsx` | CREATE | Checkout cancelado |
| `apps/web/app/(painel)/painel/(guardado)/assinatura/` | DELETE | a tela sai (nunca foi pro ar) |
| `apps/web/src/telas/painel/Faturas.tsx` + `.module.css` | CREATE (a partir de `Assinatura.tsx`) | fluxo de 3 etapas + Seu pedido + comparativo + FAQ; com plano pago, plano atual + faturas |
| `apps/web/src/telas/painel/CheckoutCancelado.tsx` | CREATE | tela do cancelado |
| `apps/web/src/telas/painel/Assinatura.tsx` + `.module.css` | DELETE | substituída |
| `apps/web/src/painel/BarraDoTopo.tsx` | UPDATE | menu da conta: sai "Plano"; "Faturas" vira link para `/painel/faturas` e aparece sempre para o dono |
| `apps/web/src/painel/FaixaDaAssinatura.tsx` | UPDATE | "Escolher plano" → `/painel/faturas` |
| `apps/web/src/painel/novidades.ts` | UPDATE | a novidade fala de Faturas |
| testes web (`assinatura*.test.tsx/ts`, `barra-do-topo`, `faixa-da-assinatura`) | UPDATE/RENAME | acompanhar |

## Tasks (TDD, um par RED/GREEN por task)

### Task 1: API: endereços de Faturas
- **Action**: as voltas do Checkout e do Portal e o link do aviso do webhook passam a apontar para `/painel/faturas` (cancelar → `/painel/faturas/cancelado`).
- **Validate**: `assinatura-stripe.test.ts` confere `urlDeSucesso`, `urlDeCancelamento`, `urlDeVolta` e o link da notificação.

### Task 2: API: lista de faturas
- **Action**: `Cobranca.listarFaturas(customerId)` lê as últimas 24 faturas com `stripe.invoices.list` e devolve `{ id, numero, emitidaEm, valorCentavos, situacao: paga|aberta|falhou|anulada, pdfUrl, reciboUrl }`. Rota `GET /barbearias/me/assinatura/faturas`, só do dono. Sem cliente na Stripe, devolve `[]`. Cobrança desligada: 503.
- **Mirror**: `criarPortal` / rota do portal.
- **Validate**: testes da rota (dono, profissional 403, sem cliente `[]`, mapeamento da situação) + chamada real na Stripe de teste.

### Task 3: API: uso no teste
- **Action**: `usoNoTeste` no resumo, só quando a situação é `teste`: `{ desde, dias, agendamentos, servicos }`. Os agendamentos contam do início do teste até agora, sem os cancelados. Os serviços contam só os ativos.
- **Validate**: teste da rota de resumo.

### Task 4: cliente da API e tipos
- **Action**: `faturasDaAssinatura()` no `barbeiro` e no falso; os novos tipos em `@barchop/types`.
- **Validate**: `tsc`.

### Task 5: tela Faturas, etapa 1 (Plano)
- **Action**: a nova tela `Faturas` com o cabeçalho (título "Faturas", selo da situação) e a trilha "1 Plano · 2 Pagamento · 3 Acesso liberado".
  - Cartões Essencial / Completo, com "Recomendado" no que cabe na equipe.
  - Faixa "Recomendado pelo seu uso no teste".
  - Plano escolhido com descrição, Mensal/Anual, contador, base + extra, "O que vem no plano" e o que falta para o outro plano.
  - Botão "Continuar com o Essencial · R$ X/mês".
  - Seu pedido ao lado, com "No anual sairia… Trocar".
  - Comparar planos com a linha "Por mês", as garantias e as perguntas frequentes recolhidas.
- **Mirror**: `Configurador` atual (estado, limites, `precoDoPlano`, `FOLGA_DO_TESTE`).
- **Validate**: testes de comportamento (recomendação, contador e limite, anual, Seu pedido acompanhando, comparativo vindo de `planos.ts`) + CSS de 2 colunas.

### Task 6: etapa 2 (Pagamento)
- **Action**: "Como você prefere pagar?", com Cartão (Acesso na hora) selecionado e Pix e Boleto desligados com "Em breve".
  - Texto: "Você termina na página segura da Stripe."
  - "← Mudar plano" volta para a etapa 1 sem perder a escolha.
  - O botão "Assinar o Essencial · R$ 0,00 hoje" (ou o valor de hoje) chama o Checkout que já existe.
  - Embaixo: "Hoje … · a partir de 29/10, R$ X/mês · cancele quando quiser".
- **Validate**: testes (Pix/Boleto desligados, Mudar plano mantém a escolha, pedido enviado ao Checkout).

### Task 7: etapa 3 (Acesso liberado) e Checkout cancelado
- **Action**:
  - `?ok=1`: a trilha marca a etapa 3. Enquanto o webhook não chega, mostra "Confirmando com a Stripe…" (consulta que já existe). Quando chega, mostra "Acesso liberado", com o plano, a 1ª cobrança e os botões Ver faturas / Ir para a agenda.
  - `/painel/faturas/cancelado`: tela do cancelado com Ver planos / Voltar ao painel.
- **Validate**: testes das duas telas.

### Task 8: com plano pago
- **Action**: plano atual (o cartão de hoje, com o aviso de atraso e de cancelamento) e a lista de faturas (data, valor, situação, PDF), com o vazio "Nenhuma fatura ainda" e "1ª cobrança em X". Gerenciar pagamento continua abrindo o Portal.
- **Validate**: testes (lista, vazio, erro da lista não esconde o plano).

### Task 9: menu, faixa, novidade e limpeza
- **Action**:
  - Menu da conta: só "Faturas", como link.
  - A faixa e o aviso levam a `/painel/faturas`.
  - A novidade é reescrita.
  - Saem `Assinatura.tsx`, a rota `/painel/assinatura` e os testes dela.
- **Validate**: testes da barra e da faixa; `grep painel/assinatura` sem resultado.

### Task 10: navegador
- **Action**: conferir as 3 etapas, o cancelado e o plano pago em 1440 e 375, nos temas escuro e claro. Assinar de verdade na Stripe de teste com o `stripe listen`.

## Validation
```bash
cd barchop
pnpm --filter api exec vitest run tests/routers/assinatura-stripe.test.ts tests/routers/assinatura.test.ts
pnpm --filter web exec vitest run tests/telas/painel tests/painel/barra-do-topo.test.tsx tests/painel/faixa-da-assinatura.test.tsx
pnpm -r type-check
pnpm -r lint
```

## Risks
| Risk | Likelihood | Mitigation |
|---|---|---|
| Pix/Boleto "Em breve" passam a impressão de que o BarChop aceita esses meios | Medium | Pílula desligada, com selo "Em breve" e nada clicável. Quando a conta Stripe tiver, liga sem mudar a tela. |
| A tela fica uma pilha de caixas (contra telas-sem-blocos) | Medium | Caixas só nos cartões de plano, no plano escolhido e em Seu pedido. O comparativo e as perguntas vão em linhas finas. |
| `usoNoTeste` pesa no resumo, que é lido em toda tela (faixa) | Low | Só 2 `count` com índice, e só em teste. Se pesar, vira rota própria. |
| Faturas da Stripe com formato novo (`parent`, `payments`) | Low | Ler só campos estáveis (`number`, `created`, `amount_paid/due`, `status`, `invoice_pdf`, `hosted_invoice_url`) e validar na Stripe de teste. |
| O #145 cresce muito para revisar | Medium | Commits RED/GREEN por task. A descrição do PR explica que a tela do plano foi substituída. |

## Acceptance
- [ ] Menu da conta tem só "Faturas", e ela abre `/painel/faturas`
- [ ] Sem plano pago: Plano → Pagamento → Acesso liberado, com Seu pedido sempre ao lado
- [ ] Pix e Boleto visíveis e desligados ("Em breve"); cartão vai ao Checkout
- [ ] Desistir no Checkout leva à tela de cancelado
- [ ] Com plano pago: plano atual + faturas da Stripe com PDF
- [ ] 1440 e 375, escuro e claro, sem vazar
- [ ] Testes afetados + tsc + lint verdes
