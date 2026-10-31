-- A Stripe nos pagamentos online dos planos (plano
-- .claude/plans/pagamentos-online-stripe.plan.md, PR 3).
--
--   - `conexao_de_pagamento.segredo_do_webhook_cifrado`: o segredo que
--     assina os eventos do webhook da Stripe (`whsec_`), cifrado como a
--     chave. A Stripe só mostra o segredo ao criar o webhook. Nulo no
--     Asaas (que usa o token do BarChop) e na conexão desligada.
--   - `stripe` nos CHECKs de provedor da conexão e do evento
--     (PROVEDORES_DE_PAGAMENTO).
--   - o índice de "uma por membro e provedor" vira "uma por membro": a
--     conta ligada é uma por vendedor, de qualquer provedor (decisão 8
--     do plano), e dois conectar ao mesmo tempo, um em cada provedor,
--     não deixam duas.
--
-- tests/banco-planos.test.ts confere os CHECKs contra as listas do
-- @barchop/formato.
--
-- Desfazer (só sem conexão nem evento da Stripe no banco: o CHECK de
-- volta recusa as linhas `stripe`):
--   DROP INDEX "conexao_de_pagamento_barbeiro_key";
--   CREATE UNIQUE INDEX "conexao_de_pagamento_barbeiro_provedor_key" ON "conexao_de_pagamento"("barbeiro_id", "provedor")
--       WHERE NOT "da_casa" AND "desconectada_em" IS NULL;
--   ALTER TABLE "evento_do_provedor" DROP CONSTRAINT "evento_do_provedor_provedor_check",
--       ADD CONSTRAINT "evento_do_provedor_provedor_check" CHECK ("provedor" IN ('asaas'));
--   ALTER TABLE "conexao_de_pagamento" DROP CONSTRAINT "conexao_de_pagamento_provedor_check",
--       ADD CONSTRAINT "conexao_de_pagamento_provedor_check" CHECK ("provedor" IN ('asaas')),
--       DROP COLUMN "segredo_do_webhook_cifrado";

ALTER TABLE "conexao_de_pagamento"
    ADD COLUMN "segredo_do_webhook_cifrado" BYTEA,
    DROP CONSTRAINT "conexao_de_pagamento_provedor_check",
    ADD CONSTRAINT "conexao_de_pagamento_provedor_check" CHECK ("provedor" IN ('asaas', 'stripe'));

ALTER TABLE "evento_do_provedor"
    DROP CONSTRAINT "evento_do_provedor_provedor_check",
    ADD CONSTRAINT "evento_do_provedor_provedor_check" CHECK ("provedor" IN ('asaas', 'stripe'));

DROP INDEX "conexao_de_pagamento_barbeiro_provedor_key";
CREATE UNIQUE INDEX "conexao_de_pagamento_barbeiro_key" ON "conexao_de_pagamento"("barbeiro_id")
    WHERE NOT "da_casa" AND "desconectada_em" IS NULL;
