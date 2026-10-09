-- A categoria do serviço vira lista fechada (pedido do dono, 2026-10-09):
-- era texto livre, e um erro de digitação ("CEBELO") apareceu como seção
-- na página pública. A lista do CHECK é a de CATEGORIAS_DE_SERVICO em
-- packages/formato/src/pagina.ts.
--
-- Primeiro converte o texto que já existe, comparando sem acento e sem
-- caixa. A primeira regra que casa ganha: "Cabelo e barba" é combo, não
-- cabelo; "Pigmentação de barba" é química, não barba. O que não casa
-- com nada (o "CEBELO") fica sem categoria, e o dono escolhe no painel.
--
-- Escrita à mão, e não gerada por `prisma migrate dev`: o `migrate dev`
-- propõe DERRUBAR `agendamento.periodo` (ver o aviso no fim de
-- 20260829120000_init/migration.sql). Aplicar com `migrate deploy`.
--
-- Desfazer (se um dia preciso, numa migration nova):
--   ALTER TABLE "servico" DROP CONSTRAINT "servico_categoria_check";
-- O texto antigo não volta: a conversão é a correção.

UPDATE "servico"
SET "categoria" = CASE
    WHEN n ~ 'combo|pacote|\+|(cabelo|corte).*barba|barba.*(cabelo|corte)' THEN 'combo'
    WHEN n ~ 'infantil|kids|crianca' THEN 'infantil'
    WHEN n ~ 'sobrancelha' THEN 'sobrancelha'
    WHEN n ~ 'tratamento|hidrata|pigment|platinad|luzes|quimica|relaxa|progressiva|selagem|estetica|pele|coloracao|tintura' THEN 'quimica'
    WHEN n ~ 'barba|bigode|navalha' THEN 'barba'
    WHEN n ~ 'corte|cabelo|degrade|tesoura|maquina' THEN 'cabelo'
  END
FROM (
  SELECT
    "id",
    lower(translate(
      "categoria",
      'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç',
      'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc'
    )) AS n
  FROM "servico"
  WHERE "categoria" IS NOT NULL
) AS normalizada
WHERE "servico"."id" = normalizada."id";

ALTER TABLE "servico"
  ADD CONSTRAINT "servico_categoria_check"
    CHECK ("categoria" IN ('cabelo', 'barba', 'combo', 'sobrancelha', 'quimica', 'infantil'));
