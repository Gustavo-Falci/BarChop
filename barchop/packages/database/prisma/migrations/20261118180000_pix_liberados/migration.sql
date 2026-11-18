-- Quem cada Pix liberou (plano .claude/plans/profissional-novo-pago.plan.md,
-- PR 3): o "Já paguei" (da diferença, ou de um período que começa hoje)
-- libera os membros que aguardavam pagamento; a recusa do Suporte, ou o
-- "Ainda não paguei", volta esses mesmos a aguardar.
--
-- Escrita à mão, como as anteriores. Aplicar com `migrate deploy`, ANTES
-- da API. Só acrescenta, com padrão: a API anterior não lê isto.
--
-- Desfazer (se um dia preciso, numa migration nova):
--   ALTER TABLE "pagamento_pix" DROP COLUMN "liberados";

ALTER TABLE "pagamento_pix" ADD COLUMN "liberados" UUID[] NOT NULL DEFAULT '{}';
