-- A trilha de primeiros passos do dono (Onda 1, bloco F2).
--
-- O estado da trilha é derivado do que já existe (horário, serviço,
-- equipe, primeira reserva pelo link). Só dois passos não se deduzem e
-- precisam de marca gravada — no servidor, e não no navegador, porque o
-- dono troca de aparelho:
--   link_compartilhado_em: alguém da equipe copiou o link da barbearia;
--   trabalha_sozinho: o dono disse que não tem equipe (decisão do dono,
--     2026-10-04: sem isso o barbeiro solo nunca fecharia a trilha).
--
-- Backfill: barbearia que já recebeu agendamento feito pelo cliente
-- obviamente já divulgou o link — a GR Barber, migrada no G3, não deve
-- abrir o painel com "compartilhe o seu link".
--
-- Escrita à mão, e não gerada por `prisma migrate dev`: o `migrate dev`
-- propõe DERRUBAR `agendamento.periodo` (ver o aviso no fim de
-- 20260829120000_init/migration.sql). Aplicar com `migrate deploy`.

ALTER TABLE "barbearia"
    ADD COLUMN "link_compartilhado_em" TIMESTAMPTZ,
    ADD COLUMN "trabalha_sozinho" BOOLEAN NOT NULL DEFAULT false;

UPDATE "barbearia" b
SET "link_compartilhado_em" = now()
WHERE EXISTS (
    SELECT 1 FROM "agendamento" a
    WHERE a."barbearia_id" = b."id" AND a."origem" = 'cliente'
);
