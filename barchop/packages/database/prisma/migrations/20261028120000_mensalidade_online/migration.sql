-- A mensalidade paga online e o cliente que assina online (Onda 2, marco
-- 3; plano .claude/plans/planos-de-assinatura.plan.md, PR 10a).
--
--   - `recebimento_do_plano.forma` ganha `online` (FORMAS_DA_MENSALIDADE):
--     a mensalidade caiu na conta de quem vende pelo provedor, e não na
--     mão de alguém da equipe. O caixa a soma numa linha "Online".
--   - `recebimento_do_plano.meio`: como o cliente pagou no provedor
--     (MEIOS_DO_ONLINE); só na online, e pode faltar.
--   - `recebimento_do_plano.recebido_por_id` fica anulável: no acerto,
--     quem recebeu a online é o dono da conta, e a do plano da casa é a
--     casa (nulo). Só a online fica sem; a online tem a cobrança do
--     provedor (`id_externo`).
--   - `assinatura_do_cliente.pago_ate`: o ciclo seguinte, pago antes da
--     renovação (cicloPagoOnline). Vem depois do ciclo de agora.
--   - `cliente.cpf`: o Asaas não cobra sem ele (conferido no PR 8);
--     guardado no checkout, só os 11 dígitos.
--
-- tests/banco-planos.test.ts ("mensalidade online") confere os CHECKs
-- contra as listas do @barchop/formato.
--
-- Desfazer (sem mensalidade online no banco):
--   ALTER TABLE "cliente" DROP COLUMN "cpf";
--   ALTER TABLE "assinatura_do_cliente" DROP COLUMN "pago_ate";
--   ALTER TABLE "recebimento_do_plano" DROP CONSTRAINT "recebimento_do_plano_online_check",
--       DROP COLUMN "meio", ALTER COLUMN "recebido_por_id" SET NOT NULL,
--       DROP CONSTRAINT "recebimento_do_plano_forma_check",
--       ADD CONSTRAINT "recebimento_do_plano_forma_check" CHECK ("forma" IN ('pix', 'dinheiro', 'debito', 'credito'));

ALTER TABLE "recebimento_do_plano"
    ALTER COLUMN "recebido_por_id" DROP NOT NULL,
    ADD COLUMN "meio" VARCHAR(20),
    DROP CONSTRAINT "recebimento_do_plano_forma_check",
    ADD CONSTRAINT "recebimento_do_plano_forma_check"
        CHECK ("forma" IN ('pix', 'dinheiro', 'debito', 'credito', 'online')),
    ADD CONSTRAINT "recebimento_do_plano_meio_check"
        CHECK ("meio" IN ('pix', 'cartao', 'boleto', 'outra')),
    ADD CONSTRAINT "recebimento_do_plano_online_check" CHECK (
        CASE WHEN "forma" = 'online'
            THEN "id_externo" IS NOT NULL
            ELSE "recebido_por_id" IS NOT NULL AND "meio" IS NULL
        END
    );

ALTER TABLE "assinatura_do_cliente"
    ADD COLUMN "pago_ate" DATE,
    ADD CONSTRAINT "assinatura_do_cliente_pago_ate_check"
        CHECK ("pago_ate" IS NULL OR ("ciclo_termina_em" IS NOT NULL AND "pago_ate" > "ciclo_termina_em"));

ALTER TABLE "cliente"
    ADD COLUMN "cpf" VARCHAR(11),
    ADD CONSTRAINT "cliente_cpf_check" CHECK ("cpf" ~ '^[0-9]{11}$');
