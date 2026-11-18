# Plan: Profissional novo no meio do período pago

**Source**: decisões do dono em 18/11 (substitui o "PR 5 — Diferença de profissional no meio do período" de `.claude/plans/pix-do-barchop.plan.md`)
**Complexity**: Large (5 PRs, 1 migration)

## Summary

Hoje, incluir ou reativar um profissional com o plano pago **no cartão** só soma o proporcional na **próxima** fatura, e **no Pix** não cobra nada até a renovação. A partir daqui, o profissional novo só passa a valer depois de pago: no cartão a cobrança é na hora, e se o cartão recusar, a inclusão não acontece. No Pix, o profissional fica bloqueado até o "Já paguei" do Pix da diferença. Tirar alguém no meio do período não devolve nada, em nenhuma forma: a próxima cobrança já vem com um a menos.

## Decisões do dono (18/11)

1. **Pix:** incluir ou reativar acima do contratado exige o Pix da diferença, proporcional aos dias que faltam. Até o "Já paguei", o profissional fica **bloqueado**: aparece na Equipe como "aguardando pagamento", o convite não sai e ele não entra no painel nem aparece no link. Se o Suporte recusar o Pix (ou o dono tocar em "Ainda não paguei"), ele volta a ficar bloqueado.
2. **Cartão:** cobra **na hora**. Se o cartão recusar, a inclusão é recusada com aviso e nada fica pendurado.
3. **Tirar profissional:** sem devolução nem crédito, no cartão e no Pix. A próxima cobrança já vem com menos.

## Ideia central: o membro "aguardando pagamento"

Coluna nova `barbeiro.aguarda_pagamento` (boolean, padrão `false`). Um membro aguardando fica com `ativo = false`, e assim todos os bloqueios que já existem valem sem código novo: o login recusa (`routers/auth.ts:200`), o token recusa (`plugins/auth.ts:150`), e ele sai da agenda, do link e do `foraDoLink`. O que muda:
- **Conta no plano:** `contarProfissionais` passa a somar os aguardando, porque é por eles que se paga. `garantirVagaNoPlano` também os conta, então o 3º do Essencial (limite 2) segue recusado mesmo pendente.
- **Liberar** = `ativo = true`, `aguarda_pagamento = false` e o convite pra quem ainda não tem senha.
- **Voltar a bloquear** = o contrário, na recusa do Pix.
- **Desistir** (ação do dono na Equipe): o novo que nunca entrou é apagado. Quem estava sendo reativado volta a ficar inativo, só com `aguarda_pagamento = false`.

O cartão usa o mesmo estado por alguns segundos: cria o membro aguardando, cobra, libera. Assim não sobra membro pago e não liberado, nem liberado e não pago.

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| Rota de equipe | `apps/api/src/routers/equipe.ts:346` | transação com `garantirVagaNoPlano`, P2002 → 409 com código próprio, efeito de rede depois do commit |
| Rede fora da transação | `apps/api/src/routers/equipe.ts:398` | cancelar no provedor antes, fora da transação; falhou, nada muda |
| Pix "Já paguei" | `apps/api/src/routers/assinatura.ts:138` | trava `assinatura FOR UPDATE`, um aguardando por vez, colunas `antes_*`, valor recalculado no servidor |
| Volta do Pix | `apps/api/src/lib/pix.ts` (`voltarAoQueEra`) | recusa e "Ainda não paguei" voltam ao retrato de antes |
| Stripe | `apps/api/src/lib/cobranca.ts:355` (`atualizarQuantidade`) | interface `Cobranca` com dublê nos testes, `proration_behavior` explícito como no `trocar` (`cobranca.ts:543`) |
| Preço | `packages/formato/src/planos.ts:87` | função pura: `base + (n-1) * extra` |
| Erros | `ErroHttp(status, codigo, mensagem)` / `ErroDeNegocio` | código próprio pra tela dizer o que aconteceu |
| Testes | `apps/api/tests/routers/equipe.test.ts`, `pix-do-barchop.test.ts`, `assinatura-stripe.test.ts`, `tests/lib/cobranca.test.ts` | rota com banco de teste, Stripe dublê; função pura com tabela |

## Files to Change

| File | Action | Why |
|---|---|---|
| `packages/database/prisma/schema.prisma` + migration | UPDATE / CREATE | `barbeiro.aguarda_pagamento`; `pagamento_pix.tipo` (`periodo` \| `diferenca`, CHECK, padrão `periodo`) |
| `packages/formato/src/pix.ts` | UPDATE | `valorDaDiferenca` pura (junto do relógio de São Paulo do Pix) |
| `apps/api/src/lib/assinatura.ts` | UPDATE | conta os aguardando; `sincronizarQuantidade` só desce, com `none` |
| `apps/api/src/lib/cobranca.ts` | UPDATE | `subirQuantidade` (cobra na hora, falha sem aplicar), `previaDaSubida`, descida sem proporcional |
| `apps/api/src/lib/pix.ts` | UPDATE | cotação da diferença; liberar e bloquear de novo os aguardando |
| `apps/api/src/routers/equipe.ts` | UPDATE | inclusão e reativação pelo caminho pago; "Desistir"; prévia do valor |
| `apps/api/src/routers/assinatura.ts` | UPDATE | `GET`/`POST /barbearias/me/assinatura/pix/diferenca` |
| `apps/api/src/routers/suporte*.ts` | UPDATE | confirmar e recusar com o tipo `diferenca` |
| `packages/types` | UPDATE | membro com `aguardaPagamento`; `PagamentoPix.tipo`; resumo com a diferença pendente |
| `apps/web` (Equipe, Faturas, Suporte) | UPDATE | telas, depois do canvas |
| `apps/web/src/site/Termos.tsx`, `Precos.tsx`, `src/site/llms.ts` | UPDATE | texto novo das regras |

## Tasks

### PR 1 — Base: membro aguardando e valor da diferença (API, migration)
- **Migration:** `barbeiro.aguarda_pagamento boolean not null default false`, com CHECK `NOT (aguarda_pagamento AND ativo)`. `pagamento_pix.tipo varchar(10) not null default 'periodo'`, com CHECK na lista.
- **`valorDaDiferenca({ plano, ciclo, extras, agora, fim })`** em `@barchop/formato` (`src/pix.ts`): `extra do ciclo × extras × dias que faltam ÷ dias do ciclo`, arredondado pra cima no centavo, mínimo R$ 0,01. Conta os dias pelo calendário de São Paulo, como o `fimDoPeriodoDoPix`.
- `contarProfissionais` e `garantirVagaNoPlano` passam a contar `ativo OR aguarda_pagamento`.
- `serializarMembro` e a lista da equipe expõem `aguardaPagamento`.
- **Validate:** teste de tabela da função pura (dia cheio, último dia, anual, arredondamento); `equipe.test.ts` mostrando que o aguardando conta na vaga e não entra no login.

### PR 2 — Cartão: cobra na hora, recusa sem pendurar (API)
- **`Cobranca.subirQuantidade(assinaturaId, n)`:** `subscriptions.update` com `proration_behavior: "always_invoice"` e `payment_behavior: "error_if_incomplete"`. Se o cartão recusa ou o banco pede confirmação, a Stripe não aplica e lança um erro, que vira `402 cartao_recusado` com o valor e a mensagem.
- **`Cobranca.previaDaSubida`:** `invoices.createPreview` com a quantidade nova, pra tela dizer "R$ X agora no cartão final 4242". Rota: `GET /equipe/previa?acao=incluir|reativar`.
- **`POST /equipe` e reativação no `PATCH`**, quando há cartão `ativa` e o novo total passa do contratado:
  1. transação: confere a vaga e o e-mail, cria (ou marca) o membro aguardando;
  2. fora da transação: `subirQuantidade`;
  3. deu certo: libera, grava `profissionaisContratados` e manda o convite; recusou: apaga o novo (ou desmarca o reativado) e devolve o 402.
- Cartão `em_atraso` → `409 fatura_em_atraso` ("pague a fatura aberta antes de incluir alguém").
- **Descida** (`sincronizarQuantidade`): `proration_behavior: "none"`. A Stripe só usa o número novo na próxima fatura, sem crédito.
- **Vagas pagas no período** (achado ao fazer, 18/11): `profissionaisContratados` passa a ser as vagas já pagas no período. Quem sai desce a quantidade na Stripe sem crédito, mas a vaga segue paga: trocar um profissional no mesmo período não cobra de novo. O webhook só abaixa esse número na virada do período (mesma assinatura e mesmo `periodoTerminaEm` → o maior dos dois). Na Stripe, com vaga paga sobrando, sobe primeiro até ela sem cobrar e só cobra o que passar (`passosDaQuantidade`); a prévia desconta a parte já paga (`previaProporcional`). Rota da prévia: `GET /equipe/previa-da-inclusao`.
- **Webhook:** conferir que a fatura de proporcional (`billing_reason: subscription_update`) não mexe em `periodoTerminaEm` nem dispara aviso de renovação.
- **Validate:** `cobranca.test.ts` (parâmetros da subida e da descida); `equipe.test.ts` com dublê aceitando, recusando e lançando no meio.

### PR 3 — Pix: diferença obrigatória (API)
- **Inclusão e reativação com Pix vigente acima do contratado:** o membro nasce (ou fica) aguardando e o convite não sai. A resposta traz `aguardaPagamento: true`.
- **`GET /barbearias/me/assinatura/pix/diferenca`:** cotação com extras = (ativos + aguardando) − contratados, de hoje até `periodoTerminaEm`. QR com identificador estável.
- **`POST .../pix/diferenca` ("Já paguei"):** mesma trava e mesmo "um aguardando por vez" do Pix do período. Cria `pagamento_pix` com `tipo = 'diferenca'`, `antes_profissionais` = contratados, `profissionais` = novo total. Sobe `profissionaisContratados` e libera os aguardando, com convite pra quem não tem senha.
- **Recusa do Suporte e "Ainda não paguei"** do tipo `diferenca`: `voltarAoQueEra` desce os contratados, e os liberados por este Pix voltam a aguardar (`ativo = false`). Quem já tinha entrado perde o acesso na hora (o token é recusado).
- **Renovação:** o Pix do período seguinte já conta os aguardando, e pagar a renovação os libera.
- **Desistir:** `DELETE /equipe/:id/aguardando`, só para quem está aguardando.
- **Feito em 18/11, com o que apareceu no caminho:** (a) migration `20261118180000_pix_liberados` (`pagamento_pix.liberados`): a recusa volta a aguardar exatamente quem aquele Pix liberou, e quem já saiu fica de fora; (b) renovação **adiantada** com alguém aguardando → `409 diferenca_pendente` (senão as vagas do período seguinte apagariam a diferença do período de agora); um período que começa hoje (Pix vencido) libera quem aguarda; (c) a varredura de avisos filtra `tipo = periodo` (o Pix da diferença tem o mesmo fim e faria o aviso sair de novo); (d) `enviarConvite` foi pra `lib/convite.ts`; (e) Desistir apaga só quem nunca entrou (sem senha e sem agendamento); (f) a prévia da inclusão no Pix devolve o valor da diferença.
- **Validate:** `pix-do-barchop.test.ts` (cotação, "Já paguei" libera, recusa bloqueia de novo, desfazer, renovação libera, 409 com outro aguardando).

### PR 4 — Telas (web) — **canvas antes**
- **Equipe, no cartão:** confirmação antes de incluir ou reativar ("Incluir João cobra R$ 12,40 agora no cartão final 4242"). Se o cartão recusar, a mensagem leva a "Atualizar cartão" (Portal).
- **Equipe, no Pix:** depois de incluir, abre o Pix da diferença (QR, copia e cola, "Já paguei"). Na lista, o membro aparece com a marca "aguardando pagamento" e as ações "Pagar" e "Desistir".
- **Faturas:** a diferença pendente aparece no topo, com o mesmo QR. O histórico mostra o tipo ("Diferença · 1 profissional").
- **Suporte:** a fila mostra o tipo e quantos profissionais o Pix libera.
- **Validate:** testes das telas (Vitest + Testing Library), seguindo `docs/UI_UX_DESIGN_GUIDELINES.md`.

### PR 5 — Texto público (site)
- **Termos:** "Incluir um profissional com o plano pago cobra na hora o valor proporcional aos dias que faltam: no cartão, na hora da inclusão; no Pix, o profissional passa a valer depois do Pix da diferença. Tirar um profissional não devolve o período em curso: a próxima cobrança já vem com um a menos."
- **Preços**, perguntas de **Faturas** (`faturas.test.tsx:403`) e `llms.txt` com a mesma regra.
- **Validate:** testes das páginas e da lista do `llms.txt`.

**Ordem:** PR 1 → PR 2 e PR 3 (independentes) → PR 4 → PR 5. O PR 4 e o PR 5 sobem juntos pra produção: sem a tela, o 402 e o "aguardando" aparecem como erro genérico.

## Validation

```bash
# Só os testes afetados, mais tsc e lint (regra do repo)
pnpm --filter @barchop/formato test -- pix
pnpm --filter @barchop/api test -- equipe pix-do-barchop assinatura-stripe cobranca
pnpm --filter @barchop/web test -- equipe faturas suporte Termos Precos llms
pnpm -r exec tsc --noEmit
pnpm lint
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Stripe cobra, e a liberação no banco falha depois | Baixo | Log `error` com o id da fatura e o membro; o Suporte libera à mão. Teste com dublê lançando no meio |
| O banco pede 3DS na subida e `error_if_incomplete` recusa | Médio | Mensagem diz "o banco pediu confirmação: use outro cartão no Portal". Pagar com 3DS na própria Equipe fica pra depois |
| Pix da renovação em conferência impede o Pix da diferença ("um por vez") | Médio | 409 com texto claro; o membro fica aguardando até o Suporte decidir. Medir antes de mudar o índice |
| Recusa do Pix tira o acesso de quem já estava atendendo | Médio | É a regra decidida; o e-mail da recusa diz quem voltou a aguardar. Os agendamentos já marcados ficam |
| Fatura de proporcional mexer no período pelo webhook | Baixo | Teste com evento `invoice.paid` com `billing_reason: subscription_update` |
| Diferença de centavos (último dia) | Baixo | Mínimo R$ 0,01, arredondado pra cima; teste de tabela |
| Repositório público | — | Descrições dos PRs sem dado de cliente |

## Acceptance

- [ ] Cartão: incluir ou reativar cobra na hora; recusa → nada muda e a tela explica
- [ ] Pix: o membro novo fica aguardando até o "Já paguei" da diferença; recusa → aguardando de novo
- [ ] Tirar alguém não gera crédito nem devolução
- [ ] Termos, Preços, Faturas e `llms.txt` dizem a regra nova
- [ ] Canvas da Equipe e de Faturas aprovado antes do PR 4
- [ ] Testes afetados, `tsc` e lint verdes
