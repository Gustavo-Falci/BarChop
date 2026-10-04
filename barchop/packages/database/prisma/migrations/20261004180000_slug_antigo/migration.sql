-- Slugs que uma barbearia já teve (Onda 1, bloco E3).
--
-- O link da barbearia circula por WhatsApp, Instagram e pelos e-mails de
-- lembrete; trocar o slug não pode quebrar o que já foi enviado. A rota
-- pública do perfil acha a barbearia por um slug daqui e devolve o
-- atual, e o site redireciona.
--
-- Tabela, e não uma coluna `slug_antigo`: a coluna guardaria só a última
-- troca, e quem trocasse duas vezes perderia o primeiro link.
--
-- O slug atual de qualquer barbearia ganha do antigo: quem nasce ou
-- troca para um slug desta tabela apaga a linha na mesma transação.
-- Por isso a chave é o próprio slug — um slug antigo aponta pra uma
-- barbearia só.
--
-- Escrita à mão, e não gerada por `prisma migrate dev`: o `migrate dev`
-- propõe DERRUBAR `agendamento.periodo` (ver o aviso no fim de
-- 20260829120000_init/migration.sql). Aplicar com `migrate deploy`.
--
-- Desfazer (se um dia preciso, numa migration nova): remover a tabela
-- "slug_antigo".

CREATE TABLE "slug_antigo" (
    "slug" VARCHAR(80) NOT NULL,
    "barbearia_id" UUID NOT NULL,
    "criado_em" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "slug_antigo_pkey" PRIMARY KEY ("slug"),
    CONSTRAINT "slug_antigo_barbearia_id_fkey" FOREIGN KEY ("barbearia_id")
        REFERENCES "barbearia"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "slug_antigo_barbearia_id_idx" ON "slug_antigo"("barbearia_id");
