-- Quando a senha mudou pela última vez, no barbeiro e no cliente. O hook
-- de autenticação (apps/api/src/plugins/auth.ts) já lê o banco a cada
-- requisição; com esta coluna ele recusa token emitido antes da troca —
-- quem roubou uma sessão perde o acesso no instante em que a vítima
-- troca a senha, e não sete dias depois, quando o token venceria.
--
-- Escrita à mão, e não gerada por `prisma migrate dev`: o `migrate dev`
-- propõe DERRUBAR `agendamento.periodo` (ver o aviso no fim de
-- 20260829120000_init/migration.sql). Aplicar com `migrate deploy`.
--
-- Nula e sem default: no Postgres isso é só catálogo, sem reescrever a
-- tabela nem segurar trava. Nulo quer dizer "nunca trocou", e aí todo
-- token vale até expirar — o comportamento de antes desta coluna.
--
-- Desfazer (se um dia preciso, numa migration nova):
--   ALTER TABLE "barbeiro" DROP COLUMN "senha_alterada_em";
--   ALTER TABLE "cliente" DROP COLUMN "senha_alterada_em";

ALTER TABLE "barbeiro" ADD COLUMN "senha_alterada_em" TIMESTAMPTZ;

ALTER TABLE "cliente" ADD COLUMN "senha_alterada_em" TIMESTAMPTZ;
