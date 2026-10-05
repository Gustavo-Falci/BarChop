-- Descrição e foto do serviço (tela de escolha de serviços, 2026-10-05).
--
-- `servico.descricao`: texto curto que o dono escreve e a página pública
-- mostra no cartão do serviço. Opcional; vazio vira null na API.
-- `servico.foto_chave`: chave da foto no armazenamento, como
-- `barbeiro.foto_chave`; a URL sai da config.
--
-- Nullable e sem DEFAULT: só catálogo no Postgres, sem reescrever a tabela.
--
-- Escrita à mão, e não gerada por `prisma migrate dev`: o `migrate dev`
-- propõe DERRUBAR `agendamento.periodo` (ver o aviso no fim de
-- 20260829120000_init/migration.sql). Aplicar com `migrate deploy`.
--
-- Desfazer (se um dia preciso, numa migration nova):
--   ALTER TABLE "servico" DROP COLUMN "descricao", DROP COLUMN "foto_chave";

ALTER TABLE "servico" ADD COLUMN "descricao" VARCHAR(300),
                      ADD COLUMN "foto_chave" VARCHAR(200);
