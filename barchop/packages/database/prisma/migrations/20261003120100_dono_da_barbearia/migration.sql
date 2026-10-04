-- Dado, separado do esquema (20261003120000_papel_do_membro): até a
-- Onda 1 cada barbearia tinha um barbeiro só, o que fez o signup. Ele
-- vira o dono. Onde por acaso houver mais de um, o mais antigo é o dono
-- — foi ele quem criou a conta; os outros ficam `profissional`.
--
-- Volume de piloto (uma linha por barbearia): um UPDATE só, sem lote.
--
-- Desfazer: não há o que desfazer sem perder informação — o papel
-- anterior era implícito. Se preciso, `UPDATE "barbeiro" SET "papel" =
-- 'profissional'` devolve todo mundo ao default.

UPDATE "barbeiro" AS b
SET "papel" = 'dono'
WHERE b."id" = (
  SELECT primeiro."id"
  FROM "barbeiro" AS primeiro
  WHERE primeiro."barbearia_id" = b."barbearia_id"
  ORDER BY primeiro."criado_em", primeiro."id"
  LIMIT 1
);
