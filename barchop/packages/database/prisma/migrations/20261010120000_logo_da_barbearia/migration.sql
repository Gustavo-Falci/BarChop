-- A logo da barbearia como arquivo (bloco da marca, 2026-10-08): a
-- chave no armazenamento, como a capa, e o formato da moldura que o
-- navegador detectou e o dono confirmou. A lista do CHECK é a de
-- FORMATOS_DA_LOGO em packages/formato/src/pagina.ts.
--
-- `logo_url` sai: era um texto com URL que só a API escrevia (nenhuma
-- tela usava nem gravava). Decisão do dono: apagar a coluna.
--
-- Escrita à mão, e não gerada por `prisma migrate dev`: o `migrate dev`
-- propõe DERRUBAR `agendamento.periodo` (ver o aviso no fim de
-- 20260829120000_init/migration.sql). Aplicar com `migrate deploy`.
--
-- Desfazer (se um dia preciso, numa migration nova):
--   ALTER TABLE "barbearia"
--     DROP COLUMN "logo_chave", DROP COLUMN "logo_formato",
--     ADD COLUMN "logo_url" TEXT;

ALTER TABLE "barbearia"
  ADD COLUMN "logo_chave" VARCHAR(200),
  ADD COLUMN "logo_formato" TEXT
    CONSTRAINT "barbearia_logo_formato_check"
      CHECK ("logo_formato" IN ('redonda', 'quadrada', 'livre')),
  DROP COLUMN "logo_url";
