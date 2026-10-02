-- Cliente deixa de ser identidade global da plataforma e passa a
-- pertencer a uma barbearia. Sem isso a tela "Clientes" não fecha: um
-- cliente cadastrado à mão pelo barbeiro só apareceria na lista depois
-- do primeiro agendamento, e um telefone já usado em outra barbearia
-- bloquearia o cadastro aqui.

ALTER TABLE "cliente" ADD COLUMN "barbearia_id" UUID;

-- Backfill: quem já tem agendamento herda a barbearia do primeiro deles.
UPDATE "cliente" AS c
SET "barbearia_id" = (
  SELECT a."barbearia_id"
  FROM "agendamento" AS a
  WHERE a."cliente_id" = c."id"
  ORDER BY a."criado_em" ASC
  LIMIT 1
);

-- Cliente sem agendamento nenhum não tem dono dedutível. O SET NOT NULL
-- abaixo falha alto se sobrar algum, e é o comportamento desejado:
-- melhor a migration parar do que atribuir cadastro à barbearia errada.
ALTER TABLE "cliente" ALTER COLUMN "barbearia_id" SET NOT NULL;

ALTER TABLE "cliente" ADD CONSTRAINT "cliente_barbearia_id_fkey"
  FOREIGN KEY ("barbearia_id") REFERENCES "barbearia"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Os uniques globais saem; os compostos com a barbearia entram. Os
-- nomes são os que o Prisma gera pra @@unique([barbeariaId, telefone])
-- e @@unique([barbeariaId, email]) — nome divergente faria o
-- `migrate status` acusar drift.
DROP INDEX "cliente_telefone_key";
DROP INDEX "cliente_email_key";

CREATE UNIQUE INDEX "cliente_barbearia_id_telefone_key" ON "cliente"("barbearia_id", "telefone");
CREATE UNIQUE INDEX "cliente_barbearia_id_email_key" ON "cliente"("barbearia_id", "email");
CREATE INDEX "cliente_barbearia_id_idx" ON "cliente"("barbearia_id");
