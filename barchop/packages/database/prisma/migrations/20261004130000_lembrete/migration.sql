-- Lembrete do agendamento (Onda 1, Bloco D2).
--
-- `barbearia.lembrete_antecedencia_horas`: quanto antes do horário o
-- lembrete sai. Só 2, 12 ou 24 — as opções da tela de configuração; o
-- CHECK é o que impede um valor fora delas de chegar por outro caminho.
-- Default 24 preenche as barbearias que já existem.
--
-- `agendamento.lembrete_enviado_em`: a marca que torna o envio
-- idempotente. O pg-boss repete o trabalho que falha; o tratador
-- reivindica a marca (UPDATE ... WHERE lembrete_enviado_em IS NULL)
-- antes de mandar, e a devolve se o envio falhar. Nula = não enviado.
-- O horário de um agendamento não muda (remarcar cria outro), então uma
-- marca por agendamento basta.
--
-- Escrita à mão, e não gerada por `prisma migrate dev`: o `migrate dev`
-- propõe DERRUBAR `agendamento.periodo` (ver o aviso no fim de
-- 20260829120000_init/migration.sql). Aplicar com `migrate deploy`.
--
-- Desfazer (se um dia preciso, numa migration nova):
--   ALTER TABLE "barbearia" DROP COLUMN "lembrete_antecedencia_horas";
--   ALTER TABLE "agendamento" DROP COLUMN "lembrete_enviado_em";

ALTER TABLE "barbearia"
  ADD COLUMN "lembrete_antecedencia_horas" SMALLINT NOT NULL DEFAULT 24
  CONSTRAINT "barbearia_lembrete_antecedencia_horas_check"
    CHECK ("lembrete_antecedencia_horas" IN (2, 12, 24));

ALTER TABLE "agendamento" ADD COLUMN "lembrete_enviado_em" TIMESTAMPTZ;
