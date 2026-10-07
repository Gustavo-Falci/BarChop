-- Exceções por data no horário da barbearia (painel v2, marco 3): fechar
-- num feriado ou mudar o horário de um dia. Na data, a exceção substitui
-- a linha do dia da semana em `horario_funcionamento`, pra toda a equipe,
-- no link e no painel. Exceção de uma pessoa só continua sendo bloqueio.
--
-- Uma por barbearia e data: mandar de novo substitui. Agendamentos já
-- marcados na data não são mexidos — a rota diz quantos ficam fora.
--
-- Escrita à mão, e não gerada por `prisma migrate dev`: o `migrate dev`
-- propõe DERRUBAR `agendamento.periodo` (ver o aviso no fim de
-- 20260829120000_init/migration.sql). Aplicar com `migrate deploy`.
--
-- Desfazer (se um dia preciso, numa migration nova):
--   DROP TABLE "excecao_horario";

CREATE TABLE "excecao_horario" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "barbearia_id" UUID NOT NULL,
    "data" DATE NOT NULL,
    "fechado" BOOLEAN NOT NULL DEFAULT false,
    "hora_abertura" TIME,
    "hora_fechamento" TIME,
    "motivo" VARCHAR(120),
    "criado_em" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "excecao_horario_pkey" PRIMARY KEY ("id"),
    -- Fechado sem horas; aberto com as duas, na ordem do relógio — os
    -- mesmos estados que o PUT deixa gravar.
    CONSTRAINT "excecao_horas_do_estado" CHECK (
        ("fechado" AND "hora_abertura" IS NULL AND "hora_fechamento" IS NULL)
        OR (
            NOT "fechado"
            AND "hora_abertura" IS NOT NULL
            AND "hora_fechamento" IS NOT NULL
            AND "hora_abertura" < "hora_fechamento"
        )
    )
);

CREATE UNIQUE INDEX "excecao_horario_barbearia_id_data_key"
    ON "excecao_horario" ("barbearia_id", "data");

ALTER TABLE "excecao_horario" ADD CONSTRAINT "excecao_horario_barbearia_id_fkey"
    FOREIGN KEY ("barbearia_id") REFERENCES "barbearia"("id") ON DELETE CASCADE ON UPDATE CASCADE;
