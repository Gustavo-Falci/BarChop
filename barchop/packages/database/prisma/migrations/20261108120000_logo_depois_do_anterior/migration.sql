-- "Oferecer logo depois do anterior" (pedido do barbeiro em produção,
-- 08/11/2026): além da grade, o link oferece o minuto em que um
-- atendimento termina (09:40 quando o anterior sai às 09:40). Regra do
-- cliente, como as de 20261009120000_regras_de_agendamento; o painel
-- oferece sempre. Padrão desligado: nenhuma barbearia muda de
-- disponibilidade sem o dono decidir.
--
-- Escrita à mão, e não gerada por `prisma migrate dev`: o `migrate dev`
-- propõe DERRUBAR `agendamento.periodo` (ver o aviso no fim de
-- 20260829120000_init/migration.sql). Aplicar com `migrate deploy`.
--
-- Desfazer (se um dia preciso, numa migration nova):
--   ALTER TABLE "barbearia" DROP COLUMN "logo_depois_do_anterior";

ALTER TABLE "barbearia"
  ADD COLUMN "logo_depois_do_anterior" BOOLEAN NOT NULL DEFAULT false;
