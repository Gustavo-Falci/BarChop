# Plano: barrar a descida no Portal e mostrar "Reembolsada"

**Origem:** "O que falta" da cobrança (memória `plano-saas-ondas`, 16/10/2026), itens 2 e 3.
**Complexidade:** Média (item A) + Pequena (item B). Dois PRs, sem migração.

## Resumo
- **A.** Hoje o Portal da Stripe deixa o dono trocar o Completo pelo Essencial mesmo com mais de 3 profissionais. O Checkout já barra esse caso (`routers/assinatura.ts:57-62`, `limite_do_plano`), mas o Portal não. No Portal, quem tem mais de 3 profissionais vai ver só os preços do Completo.
- **B.** A tela de Faturas mostra "Paga" numa fatura reembolsada, porque a Stripe mantém a fatura `paid`. Ela passa a mostrar "Reembolsada", ou "Reembolsada em parte" quando o reembolso foi parcial.

## Padrões a seguir
| Categoria | Onde | Padrão |
|---|---|---|
| Adaptador | `apps/api/src/lib/cobranca.ts:134` (`Cobranca`) | Três adaptadores: Stripe, memória e desligada. A rota fala só com a interface. |
| Script idempotente | `apps/api/scripts/criar-precos-no-stripe.ts` | Acha pelo id ou chave fixa; só cria se faltar; roda uma vez por modo. |
| Regra do limite | `apps/api/src/lib/assinatura.ts:33` (`contarProfissionais`), `limiteDeProfissionais` de `@barchop/formato` | Quem conta: dono e profissional ativos. |
| Situação da fatura | `cobranca.ts:76` (`situacaoDaFatura`), `packages/types` `SituacaoDaFatura` | Função pura testada e rótulo em `Faturas.tsx:701` (`ROTULO_DA_SITUACAO`). |
| Testes | `apps/api/tests/lib/cobranca.test.ts`, `tests/routers/assinatura*.test.ts`, `apps/web/tests/telas/painel/faturas.test.tsx` | Vitest; rota com `cobrancaDeMemoria` (guarda as chamadas). |

## A. Portal sem a descida (PR 1)

**Como:** a sessão do Portal aceita `configuration`. Haverá uma segunda configuração, "sem descida", igual à padrão mas que só lista os 2 preços do Completo. A API usa essa configuração quando a barbearia tem **mais de 3 profissionais**. Nos outros casos usa a padrão, como hoje.

### Tarefas
1. **`cobranca.ts`**
   - `criarPortal({ customerId, urlDeVolta, semDescida })`.
   - Stripe: com `semDescida`, acha a configuração pelo metadata `barchop=sem_descida` e passa o `configuration`. O id fica em memória do processo.
   - Memória: guarda o `semDescida` recebido, para o teste da rota.
2. **Rota `POST /barbearias/me/assinatura/portal`**
   - `semDescida = contarProfissionais(barbeariaId) > limiteDeProfissionais("essencial")`.
   - Teste da rota: 4 profissionais → `semDescida: true`; 3 → `false`.
3. **Script `criar-precos-no-stripe`, novo passo:**
   - lê a configuração padrão;
   - cria ou atualiza a configuração `sem_descida` copiando `features`, `business_profile` e `default_return_url`, com `subscription_update.products` filtrado para o produto `barchop_completo`.
   - Pode rodar de novo sem duplicar nada. Uma função pura (`configuracaoSemDescida(padrao)`) monta os parâmetros e é testada.
4. **Rede de segurança:** se a descida passar mesmo assim (por exemplo, alguém troca pelo painel da Stripe), o sistema já trata o excedente. `foraDoLink` tira do link os profissionais que passam do limite e o painel mostra `excedente`. Nada novo aqui.

### Depois do merge (você faz)
- Deploy da `api` (não tem `migrar` novo).
- Rodar `criar-precos` uma vez no modo real (contêiner da API) e, se quiser, uma no de teste (seu PC). Ele cria a configuração `sem_descida`.
- **Se mudar o Portal padrão no painel da Stripe, rodar `criar-precos` de novo** para copiar a mudança.

## B. "Reembolsada" nas Faturas (PR 2)

**Como:** `listarFaturas` já lê a Stripe na hora, então não precisa de webhook novo. Na mesma listagem, pedir `expand: ["data.payments.data.payment.payment_intent.latest_charge"]` (ou, se a Stripe recusar uma expansão tão funda, uma chamada `charges.list({ customer })` cruzada pelo `payment_intent`). Com isso a fatura sabe quanto foi devolvido.

### Tarefas
1. `SituacaoDaFatura` ganha `"reembolsada"` e `"reembolsada_em_parte"` (`packages/types`).
2. Nova função pura `situacaoComReembolso(situacao, pago, devolvido)`: total → `reembolsada`; parte → `reembolsada_em_parte`; nada → a situação de antes. Teste em `cobranca.test.ts`.
3. `listarFaturas` (Stripe) usa essa função. `valorCentavos` continua sendo o valor pago.
4. **Web:** rótulos "Reembolsada" e "Reembolsada em parte" em `ROTULO_DA_SITUACAO`, com o estilo discreto, igual ao de "Anulada". Teste em `faturas.test.tsx`.
5. Conferir no navegador em 375 e 1440 com o `fetch` interceptado (nenhuma fatura real reembolsada fica visível, porque a `barbearia-teste` voltou ao Grátis).

## Validação
- `apps/api`: `npx vitest run tests/lib/cobranca.test.ts tests/routers/assinatura*.test.ts`, `tsc`, `eslint` nos arquivos tocados.
- `apps/web`: `npx vitest run tests/telas/painel/faturas*.test.ts*`, `tsc`.
- Fumaça no modo de teste da Stripe (seu PC):
  - rodar `criar-precos` → confirmar que a configuração `sem_descida` existe;
  - abrir o Portal com 4 profissionais → só aparece o Completo.

## Riscos
| Risco | Chance | O que fazer |
|---|---|---|
| A chave restrita `rk_live_` não ter permissão para configurações do Portal | Média | O script roda com a chave da VM. Se der 403, você libera "Billing portal: escrita" na chave restrita. |
| A configuração `sem_descida` desatualizar quando o Portal padrão mudar | Média | Rodar `criar-precos` de novo (fica no comentário do script e no RETOMAR AQUI). |
| A configuração não existir (script não rodado) | Baixa | A API cai na padrão e registra um aviso no log. O excedente segue tratado pelo `foraDoLink`. |
| Expansão funda recusada pela Stripe | Baixa | Plano B: `charges.list` por cliente. |

## Decisão sua (antes do código)
1. **Item A — caminho:** (a) configuração "sem descida" no Portal (recomendado: a descida nem aparece); ou (b) não barrar, só avisar na tela de Faturas que o Essencial tira profissionais do link.
2. **Item B:** mostrar também "Reembolsada em parte", ou só "Reembolsada" para o total?
