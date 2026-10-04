-- A página pública rica da barbearia (Onda 1, bloco E1): contatos,
-- comodidades, formas de pagamento e a categoria de cada serviço. Capa
-- e fotos entram no E2, junto com o upload.
--
-- Comodidades e formas de pagamento são listas fechadas. Os valores
-- moram em packages/formato/src/pagina.ts; os CHECKs abaixo repetem a
-- lista, e o teste "o banco aceita toda a lista do código"
-- (apps/api/tests/routers/pagina-da-barbearia.test.ts) é o que impede os
-- dois de divergirem. Valor novo = migration nova trocando o CHECK.
--
-- `instagram` é o @, sem o @ e sem URL: a página monta o link. O CHECK
-- repete o PADRAO_INSTAGRAM, pra nenhum caminho fora da rota gravar uma
-- URL que viraria link na página pública.
--
-- Escrita à mão, e não gerada por `prisma migrate dev`: o `migrate dev`
-- propõe DERRUBAR `agendamento.periodo` (ver o aviso no fim de
-- 20260829120000_init/migration.sql). Aplicar com `migrate deploy`.
--
-- Desfazer (se um dia preciso, numa migration nova):
--   ALTER TABLE "barbearia" DROP COLUMN "whatsapp", DROP COLUMN "instagram",
--     DROP COLUMN "comodidades", DROP COLUMN "formas_pagamento";
--   ALTER TABLE "servico" DROP COLUMN "categoria";

ALTER TABLE "barbearia"
  ADD COLUMN "whatsapp" VARCHAR(20),
  ADD COLUMN "instagram" VARCHAR(30)
    CONSTRAINT "barbearia_instagram_check" CHECK ("instagram" ~ '^[A-Za-z0-9._]{1,30}$'),
  ADD COLUMN "comodidades" TEXT[] NOT NULL DEFAULT '{}'
    CONSTRAINT "barbearia_comodidades_check" CHECK ("comodidades" <@ ARRAY[
      'wifi', 'ar_condicionado', 'estacionamento', 'acessibilidade',
      'cafe', 'bebidas', 'tv', 'espaco_kids'
    ]::TEXT[]),
  ADD COLUMN "formas_pagamento" TEXT[] NOT NULL DEFAULT '{}'
    CONSTRAINT "barbearia_formas_pagamento_check" CHECK ("formas_pagamento" <@ ARRAY[
      'pix', 'dinheiro', 'debito', 'credito'
    ]::TEXT[]);

ALTER TABLE "servico" ADD COLUMN "categoria" VARCHAR(60);
