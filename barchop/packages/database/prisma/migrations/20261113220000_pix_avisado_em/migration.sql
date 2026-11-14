-- Avisos e vencimento do Pix do BarChop (plano
-- .claude/plans/pix-do-barchop.plan.md, PR 4).
--
-- A varredura diária avisa o dono 5 dias antes do fim de um período
-- pago por Pix (sino e e-mail), uma vez só: `avisado_em` marca o
-- pagamento do período já avisado. Marca antes de mandar, como os
-- ciclos por link: rodar duas vezes no mesmo dia não repete o aviso.
--
-- Escrita à mão, como as anteriores (o `migrate dev` propõe derrubar
-- `agendamento.periodo`). Aplicar com `migrate deploy`, ANTES da API.
--
-- Só acrescenta: a API anterior não lê nada disto.
--
-- Desfazer (se um dia preciso, numa migration nova):
--   ALTER TABLE "pagamento_pix" DROP COLUMN "avisado_em";

ALTER TABLE "pagamento_pix" ADD COLUMN "avisado_em" TIMESTAMPTZ;
