-- Várias pausas por dia na jornada de cada profissional (pedido do
-- barbeiro em produção, 08/11/2026; plano .claude/plans/varias-pausas).
-- Antes, cada dia guardava UMA pausa em `jornada_profissional`
-- (`pausa_inicio`/`pausa_fim`, migration 20261008120000).
--
-- Expandir e contrair: esta migration cria a tabela e copia as pausas
-- que já existem. As colunas antigas ficam, e a API segue gravando nelas
-- a primeira pausa do dia, até o PR que as derruba: se a API voltar pra
-- versão anterior, ela ainda vê a pausa principal.
--
-- Escrita à mão, e não gerada por `prisma migrate dev`: o `migrate dev`
-- propõe DERRUBAR `agendamento.periodo` (ver o aviso no fim de
-- 20260829120000_init/migration.sql). Aplicar com `migrate deploy`.
--
-- Desfazer (se um dia preciso, numa migration nova):
--   DROP TABLE "pausa_da_jornada";
--   DROP TYPE "faixa_de_hora";

-- Faixa de horas do relógio, meio-aberta como todo range do Postgres
-- ("[)"): 12:00–13:00 e 13:00–13:30 encostam, não se cruzam. Sem um tipo
-- assim não há range sobre TIME pra EXCLUDE comparar.
CREATE TYPE "faixa_de_hora" AS RANGE (subtype = time);

CREATE TABLE "pausa_da_jornada" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    -- As sete linhas da jornada existem desde o insert do membro (trigger
    -- da migration 20261004120000); a pausa vai junto quando ele sai.
    "jornada_id" UUID NOT NULL,
    "hora_inicio" TIME NOT NULL,
    "hora_fim" TIME NOT NULL,

    CONSTRAINT "pausa_da_jornada_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "pausa_da_jornada_jornada_id_fkey" FOREIGN KEY ("jornada_id")
        REFERENCES "jornada_profissional"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "pausa_na_ordem" CHECK ("hora_inicio" < "hora_fim"),
    -- Duas pausas do mesmo dia não se cruzam. O PUT recusa antes, com
    -- `pausas_se_cruzam`; esta é a rede pra quem escrever por fora dele.
    -- O índice da EXCLUDE começa por `jornada_id` (btree_gist, da init) e
    -- serve também à leitura por dia e ao CASCADE.
    CONSTRAINT "pausas_sem_cruzar" EXCLUDE USING gist (
        "jornada_id" WITH =,
        faixa_de_hora("hora_inicio", "hora_fim") WITH &&
    )
);

-- As pausas de hoje. O CHECK `jornada_pausa_inteira` já garante as duas
-- horas, a ordem e nada na folga, então a cópia não quebra as travas
-- novas; o filtro repete as condições por clareza.
INSERT INTO "pausa_da_jornada" ("jornada_id", "hora_inicio", "hora_fim")
SELECT "id", "pausa_inicio", "pausa_fim"
FROM "jornada_profissional"
WHERE "pausa_inicio" IS NOT NULL
  AND "pausa_fim" IS NOT NULL
  AND "modo" <> 'folga';
