-- Regras de agendamento da barbearia (painel v2, marco 3, 3e): como o
-- cliente marca, remarca e cancela pelo link. Valem só pro cliente — o
-- painel encaixa livre. Os padrões reproduzem o comportamento de antes:
-- nenhuma barbearia muda de disponibilidade sem o dono decidir.
--
-- As listas de cada CHECK são as de packages/formato/src/regras.ts; o
-- teste tests/routers/regras-de-agendamento.test.ts compara os dois.
-- `janela_dias` nula = sem limite.
--
-- Escrita à mão, e não gerada por `prisma migrate dev`: o `migrate dev`
-- propõe DERRUBAR `agendamento.periodo` (ver o aviso no fim de
-- 20260829120000_init/migration.sql). Aplicar com `migrate deploy`.
--
-- Desfazer (se um dia preciso, numa migration nova):
--   ALTER TABLE "barbearia"
--     DROP COLUMN "intervalo_minutos", DROP COLUMN "antecedencia_minutos",
--     DROP COLUMN "aceita_mesmo_dia", DROP COLUMN "janela_dias",
--     DROP COLUMN "cabe_antes_de_fechar", DROP COLUMN "prazo_remarcar_horas",
--     DROP COLUMN "prazo_cancelar_horas";

ALTER TABLE "barbearia"
  ADD COLUMN "intervalo_minutos" SMALLINT NOT NULL DEFAULT 15
    CONSTRAINT "barbearia_intervalo_minutos_check"
      CHECK ("intervalo_minutos" IN (15, 30, 60)),
  ADD COLUMN "antecedencia_minutos" SMALLINT NOT NULL DEFAULT 0
    CONSTRAINT "barbearia_antecedencia_minutos_check"
      CHECK ("antecedencia_minutos" IN (0, 30, 60, 120, 240, 1440)),
  ADD COLUMN "aceita_mesmo_dia" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "janela_dias" SMALLINT
    CONSTRAINT "barbearia_janela_dias_check"
      CHECK ("janela_dias" IN (7, 14, 30, 60, 90)),
  ADD COLUMN "cabe_antes_de_fechar" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "prazo_remarcar_horas" SMALLINT NOT NULL DEFAULT 0
    CONSTRAINT "barbearia_prazo_remarcar_horas_check"
      CHECK ("prazo_remarcar_horas" IN (0, 1, 2, 6, 12, 24, 48)),
  ADD COLUMN "prazo_cancelar_horas" SMALLINT NOT NULL DEFAULT 0
    CONSTRAINT "barbearia_prazo_cancelar_horas_check"
      CHECK ("prazo_cancelar_horas" IN (0, 1, 2, 6, 12, 24, 48));
