-- Onda 1, bloco A: a barbearia vira equipe. Cada membro (a tabela segue
-- `barbeiro`, nome histórico) ganha um papel e diz se atende cliente — a
-- recepção usa o painel mas não aparece na agenda nem no fluxo público.
--
-- Escrita à mão e aplicada com `migrate deploy`, como as anteriores: o
-- `migrate dev` propõe derrubar `agendamento.periodo` (ver o aviso no
-- fim de 20260829120000_init/migration.sql).
--
-- Tudo aqui é só catálogo no Postgres 11+: coluna com default constante
-- não reescreve a tabela, e tirar o NOT NULL não varre linha nenhuma.
-- O default `profissional` vale pras linhas que já existem; quem vira
-- dono é a migration seguinte (dado separado de esquema).
--
-- `senha_hash` passa a aceitar nulo: o membro convidado existe antes de
-- definir a senha, e o login recusa conta sem senha.
--
-- Desfazer (numa migration nova; o SET NOT NULL falha se já houver
-- convidado sem senha — apague ou defina a senha deles antes):
--   ALTER TABLE "barbeiro" ALTER COLUMN "senha_hash" SET NOT NULL;
--   ALTER TABLE "barbeiro" DROP COLUMN "foto_url";
--   ALTER TABLE "barbeiro" DROP COLUMN "atende";
--   ALTER TABLE "barbeiro" DROP COLUMN "papel";
--   DROP TYPE "papel_membro";

CREATE TYPE "papel_membro" AS ENUM ('dono', 'profissional', 'recepcao');

ALTER TABLE "barbeiro" ADD COLUMN "papel" "papel_membro" NOT NULL DEFAULT 'profissional';

ALTER TABLE "barbeiro" ADD COLUMN "atende" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "barbeiro" ADD COLUMN "foto_url" TEXT;

ALTER TABLE "barbeiro" ALTER COLUMN "senha_hash" DROP NOT NULL;
