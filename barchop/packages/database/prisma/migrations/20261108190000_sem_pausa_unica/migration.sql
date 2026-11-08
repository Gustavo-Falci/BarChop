-- Contrair as várias pausas (PR 3 do plano .claude/plans/varias-pausas):
-- a pausa única de `jornada_profissional` (migration 20261008120000) sai.
-- Desde a migration 20261108130000 as pausas moram em
-- `pausa_da_jornada`, e a API do PR 3 não lê nem escreve mais estas
-- colunas. Antes deste PR, produção conferida em 08/11: as 8 pausas das
-- colunas antigas estavam também na tabela nova.
--
-- Deploy: as imagens de `migrar` e `api` montadas antes, e um `up -d`
-- só dos dois. A API de antes deste PR ainda pede estas colunas em toda
-- consulta da jornada: entre esta migration e a API nova subir, a
-- jornada e os horários dão erro por alguns segundos. Depois dela, a API
-- não volta pra uma imagem anterior sem uma migration que recrie as
-- colunas.
--
-- Escrita à mão, e não gerada por `prisma migrate dev`: o `migrate dev`
-- propõe DERRUBAR `agendamento.periodo` (ver o aviso no fim de
-- 20260829120000_init/migration.sql). Aplicar com `migrate deploy`.
--
-- Desfazer (se um dia preciso, numa migration nova): recriar as colunas
-- como em 20261008120000 e copiar a primeira pausa de cada dia:
--   UPDATE "jornada_profissional" j SET "pausa_inicio" = p."hora_inicio", "pausa_fim" = p."hora_fim"
--   FROM (SELECT DISTINCT ON ("jornada_id") "jornada_id", "hora_inicio", "hora_fim"
--         FROM "pausa_da_jornada" ORDER BY "jornada_id", "hora_inicio") p
--   WHERE p."jornada_id" = j."id";

-- O CHECK antes das colunas: ele as cita.
ALTER TABLE "jornada_profissional" DROP CONSTRAINT IF EXISTS "jornada_pausa_inteira";

ALTER TABLE "jornada_profissional"
    DROP COLUMN IF EXISTS "pausa_inicio",
    DROP COLUMN IF EXISTS "pausa_fim";
