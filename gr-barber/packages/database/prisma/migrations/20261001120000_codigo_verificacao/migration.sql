-- Códigos de verificação: o código de seis dígitos que vai pro telefone
-- (cliente) ou pro e-mail (barbeiro) e volta pra provar posse — no
-- primeiro acesso e na recuperação de senha.
--
-- Escrita à mão, e não gerada por `prisma migrate dev`: o banco tem a
-- coluna `periodo` (tsrange gerada) e a constraint EXCLUDE
-- `sem_conflito_horario`, que não têm representação no schema
-- declarativo, e o `migrate dev` propõe DERRUBAR a coluna. Ver o aviso
-- no fim de 20260829120000_init/migration.sql.
--
-- Tabela nova e vazia: nada a travar nem a preencher, então o índice
-- vai junto, sem CONCURRENTLY.
--
-- `codigo_hash` e nunca o código: HMAC-SHA256 com o JWT_SECRET (ver
-- apps/api/src/lib/codigos.ts). Um backup vazado não entrega código
-- válido nenhum.
--
-- `barbearia_id` anulável: o cliente é por barbearia, o barbeiro não —
-- o e-mail dele é único na plataforma.
--
-- Desfazer (o Prisma não tem migration de volta): DROP TABLE
-- "codigo_verificacao"; e apagar a linha desta migration em
-- _prisma_migrations.
CREATE TABLE "codigo_verificacao" (
  "id"           UUID         NOT NULL DEFAULT gen_random_uuid(),
  "finalidade"   VARCHAR(40)  NOT NULL,
  "destino"      VARCHAR(160) NOT NULL,
  "barbearia_id" UUID,
  "codigo_hash"  TEXT         NOT NULL,
  "tentativas"   SMALLINT     NOT NULL DEFAULT 0,
  "expira_em"    TIMESTAMPTZ  NOT NULL,
  "usado_em"     TIMESTAMPTZ,
  "criado_em"    TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT "codigo_verificacao_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "codigo_verificacao_barbearia_id_fkey"
    FOREIGN KEY ("barbearia_id") REFERENCES "barbearia"("id") ON DELETE CASCADE
);

-- A busca é sempre "o código ativo mais recente deste alvo".
CREATE INDEX "codigo_verificacao_alvo_idx"
  ON "codigo_verificacao" ("finalidade", "destino", "barbearia_id", "criado_em" DESC);
