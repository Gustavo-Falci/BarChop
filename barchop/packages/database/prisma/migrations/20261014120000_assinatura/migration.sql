-- A assinatura do BarChop (Onda 2, marco 1; plano
-- .claude/plans/cobranca-do-barchop.plan.md, PR 2).
--
--   - `assinatura`: uma por barbearia. Nasce no cadastro em teste de 14
--     dias. Sai junto com a barbearia (CASCADE).
--   - `evento_stripe`: os eventos do webhook já processados, pelo id do
--     evento — o mesmo evento entregue duas vezes só vale uma.
--
-- As listas de cada CHECK são as de packages/formato/src/planos.ts; o
-- teste "o banco aceita toda opção do código" (tests/routers/
-- assinatura.test.ts) impede os dois de divergirem.
--
-- As barbearias que já existem ganham 14 dias de teste a partir de agora
-- (o deploy desta migração), decisão do dono em 13/10/2026. Tabela nova:
-- o INSERT não trava a `barbearia`.
--
-- Escrita à mão, como as outras desde a init (o `migrate dev` propõe
-- derrubar `agendamento.periodo`): aplicar com `migrate deploy`.
--
-- Desfazer (se um dia preciso, numa migration nova):
--   DROP TABLE "assinatura"; DROP TABLE "evento_stripe";

CREATE TABLE "assinatura" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "barbearia_id" UUID NOT NULL,
    "situacao" TEXT NOT NULL DEFAULT 'teste',
    "plano" TEXT NOT NULL DEFAULT 'gratis',
    "ciclo" TEXT NOT NULL DEFAULT 'mensal',
    "teste_termina_em" TIMESTAMPTZ,
    "stripe_customer_id" VARCHAR(255),
    "stripe_subscription_id" VARCHAR(255),
    "profissionais_contratados" SMALLINT,
    "periodo_termina_em" TIMESTAMPTZ,
    "criada_em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizada_em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assinatura_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "assinatura_barbearia_id_fkey" FOREIGN KEY ("barbearia_id")
        REFERENCES "barbearia"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "assinatura_situacao_check"
        CHECK ("situacao" IN ('teste', 'ativa', 'em_atraso', 'cancelada', 'gratis')),
    CONSTRAINT "assinatura_plano_check"
        CHECK ("plano" IN ('gratis', 'essencial', 'completo')),
    CONSTRAINT "assinatura_ciclo_check"
        CHECK ("ciclo" IN ('mensal', 'anual')),
    -- Teste sem data de fim nunca acabaria.
    CONSTRAINT "assinatura_teste_tem_fim_check"
        CHECK ("situacao" <> 'teste' OR "teste_termina_em" IS NOT NULL),
    CONSTRAINT "assinatura_profissionais_contratados_check"
        CHECK ("profissionais_contratados" IS NULL OR "profissionais_contratados" >= 1)
);

CREATE UNIQUE INDEX "assinatura_barbearia_id_key" ON "assinatura"("barbearia_id");
-- O webhook acha a barbearia por eles.
CREATE UNIQUE INDEX "assinatura_stripe_customer_id_key" ON "assinatura"("stripe_customer_id");
CREATE UNIQUE INDEX "assinatura_stripe_subscription_id_key" ON "assinatura"("stripe_subscription_id");

CREATE TABLE "evento_stripe" (
    "id" VARCHAR(255) NOT NULL,
    "tipo" VARCHAR(100) NOT NULL,
    "processado_em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evento_stripe_pkey" PRIMARY KEY ("id")
);

INSERT INTO "assinatura" ("barbearia_id", "teste_termina_em")
SELECT "id", CURRENT_TIMESTAMP + INTERVAL '14 days' FROM "barbearia";
