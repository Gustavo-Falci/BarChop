-- Quando o cliente confirmou presença pelo link do lembrete (Onda 1,
-- Bloco D3). Nula = não confirmou. Separada do `status`: `confirmado` já
-- quer dizer "agendamento de pé" desde a fase 1, e misturar os dois
-- faria todo agendamento antigo parecer confirmado pelo cliente.
--
-- Escrita à mão, e não gerada por `prisma migrate dev`: o `migrate dev`
-- propõe DERRUBAR `agendamento.periodo` (ver o aviso no fim de
-- 20260829120000_init/migration.sql). Aplicar com `migrate deploy`.
--
-- Desfazer (se um dia preciso, numa migration nova):
--   ALTER TABLE "agendamento" DROP COLUMN "presenca_confirmada_em";

ALTER TABLE "agendamento" ADD COLUMN "presenca_confirmada_em" TIMESTAMPTZ;
