-- Backfill de `barbearia.areas_decididas` (painel v2, marco 2): quem já
-- salvou o horário de funcionamento antes de existir a marca — ou seja,
-- tem pelo menos um dia aberto com as duas horas — entra com
-- "horarios" decidido. As outras áreas não têm como ser deduzidas (um
-- campo vazio pode ser decisão ou esquecimento) e começam como faltando
-- até o dono salvar.
--
-- A tabela é pequena (uma linha por barbearia): um UPDATE só basta.
-- Idempotente: quem já tem "horarios" não muda.
--
-- Desfazer: não há o que desfazer — a marca a mais só soma uma área no
-- "X de N" do índice.

UPDATE "barbearia" AS b
SET "areas_decididas" = array_append(b."areas_decididas", 'horarios')
WHERE NOT ('horarios' = ANY (b."areas_decididas"))
  AND EXISTS (
    SELECT 1
    FROM "horario_funcionamento" AS h
    WHERE h."barbearia_id" = b."id"
      AND h."fechado" = false
      AND h."hora_abertura" IS NOT NULL
      AND h."hora_fechamento" IS NOT NULL
  );
