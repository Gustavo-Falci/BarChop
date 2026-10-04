-- Capa da barbearia e foto do profissional (Onda 1, bloco E2).
--
-- Guarda-se a CHAVE do arquivo no armazenamento (Object Storage da OCI
-- em produção, uma pasta em desenvolvimento), nunca a URL: a URL pública
-- sai da configuração na hora de serializar. Assim trocar de bucket ou
-- de domínio não exige reescrever linha nenhuma, e as linhas gravadas em
-- desenvolvimento não ficam apontando pra localhost.
--
-- `barbeiro.foto_url` sai: nunca foi gravada por rota nenhuma (conferido
-- em 2026-10-04: zero linhas preenchidas no banco de desenvolvimento, e
-- produção ainda não existe).
--
-- Escrita à mão, e não gerada por `prisma migrate dev`: o `migrate dev`
-- propõe DERRUBAR `agendamento.periodo` (ver o aviso no fim de
-- 20260829120000_init/migration.sql). Aplicar com `migrate deploy`.
--
-- Desfazer (se um dia preciso, numa migration nova):
--   ALTER TABLE "barbearia" DROP COLUMN "capa_chave";
--   ALTER TABLE "barbeiro" DROP COLUMN "foto_chave", ADD COLUMN "foto_url" TEXT;

ALTER TABLE "barbearia" ADD COLUMN "capa_chave" VARCHAR(200);

ALTER TABLE "barbeiro" DROP COLUMN "foto_url", ADD COLUMN "foto_chave" VARCHAR(200);
