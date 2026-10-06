-- Áreas das Configurações decididas (painel v2, marco 2; decisão do dono
-- do produto, 2026-10-06): uma área conta como decidida quando foi
-- salva pelo menos uma vez, mesmo com o valor padrão. A API acrescenta
-- o nome da área no salvar (horarios, dados_do_negocio, comunicacao,
-- notificacoes — lista em @barchop/formato/src/areas.ts). Só cresce.
--
-- NOT NULL com DEFAULT constante: no Postgres 11+ é só catálogo, sem
-- reescrever a tabela. O backfill vem na migration seguinte, separado
-- da mudança de estrutura.
--
-- Escrita à mão, e não gerada por `prisma migrate dev`: o `migrate dev`
-- propõe DERRUBAR `agendamento.periodo` (ver o aviso no fim de
-- 20260829120000_init/migration.sql). Aplicar com `migrate deploy`.
--
-- Desfazer (se um dia preciso, numa migration nova):
--   ALTER TABLE "barbearia" DROP COLUMN "areas_decididas";

ALTER TABLE "barbearia" ADD COLUMN "areas_decididas" TEXT[] NOT NULL DEFAULT '{}';
