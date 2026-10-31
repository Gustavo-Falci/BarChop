-- A InfinitePay nos pagamentos online dos planos (plano
-- .claude/plans/pagamentos-online-infinitepay.plan.md, PR 3).
--
--   - `infinitepay` nos CHECKs de provedor da conexão e do evento
--     (PROVEDORES_DE_PAGAMENTO).
--   - `conexao_de_pagamento.infinite_tag` e `dias_para_cancelar`: só na
--     InfinitePay, e nela os dois (DIAS_PARA_CANCELAR, de 3 a 30). Ficam na
--     conexão desligada, pelo histórico: não são segredo.
--   - `link_do_ciclo`: a InfinitePay não renova sozinha, e o BarChop gera
--     um link de pagamento por assinatura e vencimento
--     (SITUACOES_DO_LINK). O `order_nsu` é a referência que vai no link e
--     volta no aviso: única. O link vale no mínimo R$ 1,00 (o da
--     InfinitePay) e até o dia `valido_ate`.
--
-- tests/banco-planos.test.ts confere os CHECKs contra as listas do
-- @barchop/formato.
--
-- Desfazer (só sem conexão nem evento da InfinitePay no banco: o CHECK de
-- volta recusa as linhas `infinitepay`):
--   DROP TABLE "link_do_ciclo";
--   ALTER TABLE "evento_do_provedor" DROP CONSTRAINT "evento_do_provedor_provedor_check",
--       ADD CONSTRAINT "evento_do_provedor_provedor_check" CHECK ("provedor" IN ('asaas', 'stripe'));
--   ALTER TABLE "conexao_de_pagamento" DROP CONSTRAINT "conexao_de_pagamento_infinitepay_check",
--       DROP CONSTRAINT "conexao_de_pagamento_provedor_check",
--       ADD CONSTRAINT "conexao_de_pagamento_provedor_check" CHECK ("provedor" IN ('asaas', 'stripe')),
--       DROP COLUMN "dias_para_cancelar", DROP COLUMN "infinite_tag";

ALTER TABLE "conexao_de_pagamento"
    ADD COLUMN "infinite_tag" VARCHAR(40),
    ADD COLUMN "dias_para_cancelar" SMALLINT,
    DROP CONSTRAINT "conexao_de_pagamento_provedor_check",
    ADD CONSTRAINT "conexao_de_pagamento_provedor_check" CHECK ("provedor" IN ('asaas', 'stripe', 'infinitepay')),
    -- O `IS NOT NULL` explícito: `NULL BETWEEN 3 AND 30` dá NULL, e o
    -- CHECK deixa passar o que dá NULL.
    ADD CONSTRAINT "conexao_de_pagamento_infinitepay_check" CHECK (
        CASE WHEN "provedor" = 'infinitepay'
            THEN "infinite_tag" IS NOT NULL AND "dias_para_cancelar" IS NOT NULL
                AND "dias_para_cancelar" BETWEEN 3 AND 30
            ELSE "infinite_tag" IS NULL AND "dias_para_cancelar" IS NULL
        END
    );

ALTER TABLE "evento_do_provedor"
    DROP CONSTRAINT "evento_do_provedor_provedor_check",
    ADD CONSTRAINT "evento_do_provedor_provedor_check" CHECK ("provedor" IN ('asaas', 'stripe', 'infinitepay'));

CREATE TABLE "link_do_ciclo" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "barbearia_id" UUID NOT NULL,
    "assinatura_id" UUID NOT NULL,
    "vencimento" DATE NOT NULL,
    "valor_centavos" INTEGER NOT NULL,
    "order_nsu" VARCHAR(100) NOT NULL,
    "url" VARCHAR(500) NOT NULL,
    "valido_ate" DATE NOT NULL,
    "situacao" VARCHAR(10) NOT NULL DEFAULT 'aberto',
    "transaction_nsu" VARCHAR(100),
    "slug" VARCHAR(100),
    "enviado_em" TIMESTAMPTZ,
    "reenviado_em" TIMESTAMPTZ,
    "pago_em" TIMESTAMPTZ,
    "criado_em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "link_do_ciclo_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "link_do_ciclo_situacao_check" CHECK ("situacao" IN ('aberto', 'pago', 'fechado')),
    CONSTRAINT "link_do_ciclo_valor_check" CHECK ("valor_centavos" >= 100),
    CONSTRAINT "link_do_ciclo_validade_check" CHECK ("valido_ate" >= "vencimento"),
    CONSTRAINT "link_do_ciclo_pago_check" CHECK (
        "situacao" <> 'pago' OR ("transaction_nsu" IS NOT NULL AND "pago_em" IS NOT NULL)
    )
);

CREATE UNIQUE INDEX "link_do_ciclo_order_nsu_key" ON "link_do_ciclo"("order_nsu");
CREATE UNIQUE INDEX "link_do_ciclo_assinatura_id_vencimento_key" ON "link_do_ciclo"("assinatura_id", "vencimento");
CREATE INDEX "link_do_ciclo_barbearia_id_situacao_idx" ON "link_do_ciclo"("barbearia_id", "situacao");

ALTER TABLE "link_do_ciclo" ADD CONSTRAINT "link_do_ciclo_barbearia_id_fkey"
    FOREIGN KEY ("barbearia_id") REFERENCES "barbearia"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "link_do_ciclo" ADD CONSTRAINT "link_do_ciclo_assinatura_id_fkey"
    FOREIGN KEY ("assinatura_id") REFERENCES "assinatura_do_cliente"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
