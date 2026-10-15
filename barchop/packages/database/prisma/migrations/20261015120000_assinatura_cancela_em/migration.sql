-- Quando a assinatura cancelada no Portal da Stripe acaba (plano
-- .claude/plans/cobranca-do-barchop.plan.md, PR 5). "Cancelar no fim do
-- período" deixa a Stripe `active` até lá, então a situação não muda: sem
-- esta coluna, a tela do plano anunciaria uma cobrança que não vem. O
-- webhook grava o `cancel_at` da assinatura relida; desistir de cancelar
-- volta a nulo.
--
-- Coluna nova e nula, sem DEFAULT: o ALTER não reescreve a tabela.
--
-- Desfazer (se um dia preciso, numa migration nova):
--   ALTER TABLE "assinatura" DROP COLUMN "cancela_em";

ALTER TABLE "assinatura" ADD COLUMN "cancela_em" TIMESTAMPTZ;
