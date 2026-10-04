-- Onda 1, bloco B: a semana de cada membro, os serviços que ele faz e
-- os bloqueios (folga, almoço, horário fechado).
--
-- Escrita à mão e aplicada com `migrate deploy`, como as anteriores: o
-- `migrate dev` propõe derrubar `agendamento.periodo` (ver o aviso no
-- fim de 20260829120000_init/migration.sql). Os triggers também não
-- têm representação no schema do Prisma — moram só aqui.
--
-- JORNADA. Sete linhas por membro, sempre, cada dia num de três modos:
-- `barbearia` acompanha o horário de funcionamento, `proprio` tem as
-- horas do membro, `folga` não atende. Não é cópia do funcionamento (a
-- decisão 4 do plano da Onda 1, revista): o signup cria a barbearia sem
-- horário, e a cópia daria ao dono uma semana de folga — e congelaria a
-- jornada de todo mundo quando o dono mudasse o horário. A janela que
-- vale num dia é a interseção da jornada com o funcionamento.
--
-- Quem garante as sete linhas e os serviços é o trigger do insert, e
-- não cada rota: o membro criado por qualquer caminho nasce inteiro.
--
-- Desfazer (numa migration nova): remover os dois triggers e as duas
-- funções, depois as tabelas bloqueio, profissional_servico e
-- jornada_profissional, e por fim o tipo modo_jornada.

CREATE TYPE "modo_jornada" AS ENUM ('barbearia', 'proprio', 'folga');

CREATE TABLE "jornada_profissional" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "barbeiro_id" UUID NOT NULL,
    "dia_semana" SMALLINT NOT NULL,
    "modo" "modo_jornada" NOT NULL DEFAULT 'barbearia',
    "hora_inicio" TIME,
    "hora_fim" TIME,

    CONSTRAINT "jornada_profissional_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "jornada_dia_da_semana" CHECK ("dia_semana" BETWEEN 0 AND 6),
    -- Hora só no modo próprio, e inteira: sem isto, "folga com hora" e
    -- "próprio sem fim" seriam estados que a disponibilidade teria de
    -- adivinhar.
    CONSTRAINT "jornada_horas_do_modo" CHECK (
        ("modo" = 'proprio' AND "hora_inicio" IS NOT NULL AND "hora_fim" IS NOT NULL AND "hora_inicio" < "hora_fim")
        OR ("modo" <> 'proprio' AND "hora_inicio" IS NULL AND "hora_fim" IS NULL)
    )
);

CREATE UNIQUE INDEX "jornada_profissional_barbeiro_id_dia_semana_key"
    ON "jornada_profissional" ("barbeiro_id", "dia_semana");

ALTER TABLE "jornada_profissional" ADD CONSTRAINT "jornada_profissional_barbeiro_id_fkey"
    FOREIGN KEY ("barbeiro_id") REFERENCES "barbeiro"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Serviço desativado continua na tabela (soft delete): reativá-lo não
-- pode deixar ninguém de fora.
CREATE TABLE "profissional_servico" (
    "barbeiro_id" UUID NOT NULL,
    "servico_id" UUID NOT NULL,

    CONSTRAINT "profissional_servico_pkey" PRIMARY KEY ("barbeiro_id", "servico_id")
);

CREATE INDEX "profissional_servico_servico_id_idx" ON "profissional_servico" ("servico_id");

ALTER TABLE "profissional_servico" ADD CONSTRAINT "profissional_servico_barbeiro_id_fkey"
    FOREIGN KEY ("barbeiro_id") REFERENCES "barbeiro"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "profissional_servico" ADD CONSTRAINT "profissional_servico_servico_id_fkey"
    FOREIGN KEY ("servico_id") REFERENCES "servico"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Um período de datas, com horas opcionais: sem horas é o dia inteiro
-- (férias, folga avulsa); com horas, a mesma faixa em cada dia do
-- período (almoço, consulta médica). `barbearia_id` junto pra a
-- listagem do painel não precisar passar pelo membro.
CREATE TABLE "bloqueio" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "barbearia_id" UUID NOT NULL,
    "barbeiro_id" UUID NOT NULL,
    "data_inicio" DATE NOT NULL,
    "data_fim" DATE NOT NULL,
    "hora_inicio" TIME,
    "hora_fim" TIME,
    "motivo" VARCHAR(120),
    "criado_em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bloqueio_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "bloqueio_periodo" CHECK ("data_inicio" <= "data_fim"),
    CONSTRAINT "bloqueio_horas" CHECK (
        ("hora_inicio" IS NULL AND "hora_fim" IS NULL)
        OR ("hora_inicio" IS NOT NULL AND "hora_fim" IS NOT NULL AND "hora_inicio" < "hora_fim")
    )
);

CREATE INDEX "bloqueio_barbeiro_id_data_inicio_data_fim_idx"
    ON "bloqueio" ("barbeiro_id", "data_inicio", "data_fim");
CREATE INDEX "bloqueio_barbearia_id_data_inicio_idx" ON "bloqueio" ("barbearia_id", "data_inicio");

ALTER TABLE "bloqueio" ADD CONSTRAINT "bloqueio_barbearia_id_fkey"
    FOREIGN KEY ("barbearia_id") REFERENCES "barbearia"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bloqueio" ADD CONSTRAINT "bloqueio_barbeiro_id_fkey"
    FOREIGN KEY ("barbeiro_id") REFERENCES "barbeiro"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Membro novo: sete dias acompanhando a barbearia e todos os serviços
-- que ela tem (os inativos também).
CREATE FUNCTION "membro_nasce_com_jornada_e_servicos"() RETURNS trigger AS $$
BEGIN
    INSERT INTO "jornada_profissional" ("barbeiro_id", "dia_semana")
    SELECT NEW."id", dia FROM generate_series(0, 6) AS dia;

    INSERT INTO "profissional_servico" ("barbeiro_id", "servico_id")
    SELECT NEW."id", s."id" FROM "servico" AS s WHERE s."barbearia_id" = NEW."barbearia_id";

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "membro_nasce_com_jornada_e_servicos"
    AFTER INSERT ON "barbeiro"
    FOR EACH ROW EXECUTE FUNCTION "membro_nasce_com_jornada_e_servicos"();

-- Serviço novo: entra pra equipe inteira, e não só pra quem atende —
-- senão a recepção que passa a atender sumiria da agenda sem serviço.
CREATE FUNCTION "servico_entra_para_a_equipe"() RETURNS trigger AS $$
BEGIN
    INSERT INTO "profissional_servico" ("barbeiro_id", "servico_id")
    SELECT b."id", NEW."id" FROM "barbeiro" AS b WHERE b."barbearia_id" = NEW."barbearia_id";

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "servico_entra_para_a_equipe"
    AFTER INSERT ON "servico"
    FOR EACH ROW EXECUTE FUNCTION "servico_entra_para_a_equipe"();
