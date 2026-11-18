-- Profissional novo no meio do período pago (plano
-- .claude/plans/profissional-novo-pago.plan.md, PR 1).
--
-- `barbeiro.aguarda_pagamento`: o membro incluído ou reativado acima
-- do que a barbearia pagou fica inativo até o pagamento (cartão na hora,
-- Pix da diferença), mas já conta no plano. Nunca ativo e aguardando
-- juntos: liberar é virar os dois de uma vez.
--
-- `pagamento_pix.tipo`: `periodo` (o Pix de sempre, que paga um
-- período) ou `diferenca` (o profissional novo, até o fim do período
-- já pago).
--
-- Escrita à mão, como as anteriores (o `migrate dev` propõe derrubar
-- `agendamento.periodo`). Aplicar com `migrate deploy`, ANTES da API.
--
-- Só acrescenta, com padrão: a API anterior não lê nada disto.
--
-- Desfazer (se um dia preciso, numa migration nova):
--   ALTER TABLE "pagamento_pix" DROP COLUMN "tipo";
--   ALTER TABLE "barbeiro" DROP COLUMN "aguarda_pagamento";

ALTER TABLE "barbeiro"
    ADD COLUMN "aguarda_pagamento" BOOLEAN NOT NULL DEFAULT false,
    ADD CONSTRAINT "barbeiro_aguarda_pagamento_inativo_check" CHECK (NOT ("aguarda_pagamento" AND "ativo"));

ALTER TABLE "pagamento_pix"
    ADD COLUMN "tipo" VARCHAR(10) NOT NULL DEFAULT 'periodo',
    ADD CONSTRAINT "pagamento_pix_tipo_check" CHECK ("tipo" IN ('periodo', 'diferenca'));
