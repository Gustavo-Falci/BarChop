-- Desconectar a conta do provedor desliga a conexão em vez de apagar
-- (Onda 2, marco 3; plano .claude/plans/planos-de-assinatura.plan.md,
-- PR 9). A assinatura online cancelada segue apontando pra conexão em
-- que foi cobrada (CHECK `assinatura_do_cliente_conexao_check`), e a
-- chave estrangeira não deixa apagar.
--
--   - `desconectada_em`: nulo = ligada. Desligada, a chave cifrada é
--     apagada (fica vazia) e a conexão não serve pra nada além do
--     histórico.
--   - os índices de "uma por barbearia" (da casa) e "uma por membro e
--     provedor" passam a valer só entre as ligadas: depois de
--     desconectar, dá pra conectar de novo.
--
-- Desfazer à mão (sem conexão desligada no banco):
--   DROP INDEX "conexao_de_pagamento_da_casa_key";
--   DROP INDEX "conexao_de_pagamento_barbeiro_provedor_key";
--   CREATE UNIQUE INDEX "conexao_de_pagamento_da_casa_key" ON "conexao_de_pagamento"("barbearia_id") WHERE "da_casa";
--   CREATE UNIQUE INDEX "conexao_de_pagamento_barbeiro_provedor_key" ON "conexao_de_pagamento"("barbeiro_id", "provedor")
--       WHERE NOT "da_casa";
--   ALTER TABLE "conexao_de_pagamento" DROP COLUMN "desconectada_em";

ALTER TABLE "conexao_de_pagamento" ADD COLUMN "desconectada_em" TIMESTAMPTZ;

DROP INDEX "conexao_de_pagamento_da_casa_key";
DROP INDEX "conexao_de_pagamento_barbeiro_provedor_key";

CREATE UNIQUE INDEX "conexao_de_pagamento_da_casa_key" ON "conexao_de_pagamento"("barbearia_id")
    WHERE "da_casa" AND "desconectada_em" IS NULL;
CREATE UNIQUE INDEX "conexao_de_pagamento_barbeiro_provedor_key" ON "conexao_de_pagamento"("barbeiro_id", "provedor")
    WHERE NOT "da_casa" AND "desconectada_em" IS NULL;
