-- O caixa do dia (Onda 2, marco 2; plano .claude/plans/caixa-do-dia.plan.md,
-- PR 2). A conta mora em packages/formato/src/caixa.ts; aqui, onde ela
-- fica gravada.
--
--   - `cliente.profissional_id`: de quem o cliente "é". Quem atendeu
--     primeiro, e o dono troca à mão. Sai nulo se o profissional for
--     apagado (só acontece junto com a barbearia).
--   - `barbeiro.parte_da_casa`: % que fica com a casa de tudo o que o
--     membro atende. 0 = nada.
--   - `regra_de_divisao`: a matriz "cliente de A, atendido por B" → % de
--     A. Par sem linha = 0.
--   - `pagamento`: um por agendamento, com o dia do caixa (a data do
--     agendamento), quem atendeu, de quem era o cliente e quem recebeu
--     — os três congelados no momento do registro.
--   - `pagamento_parte`: a divisão congelada do pagamento; beneficiário
--     nulo = a casa. Mudar as regras não refaz pagamento antigo.
--   - `fechamento_do_dia`: um por barbearia e dia, com a foto do acerto.
--
-- As listas dos CHECKs são FORMAS_DE_PAGAMENTO (pagina.ts) e
-- MOTIVOS_DA_PARTE (caixa.ts); tests/banco-caixa.test.ts impede código
-- e banco de divergirem. Dinheiro em centavos inteiros, como planos.ts.
--
-- Os clientes que já existem passam a ser de quem atendeu o 1º
-- agendamento CONCLUÍDO de cada um (decisão do plano, item 3); quem não
-- tem nenhum fica sem dono. Poucos clientes por barbearia: o UPDATE
-- roda junto com o DDL, como o INSERT da 20261014120000_assinatura.
--
-- Escrita à mão, como as outras desde a init (o `migrate dev` propõe
-- derrubar `agendamento.periodo`): aplicar com `migrate deploy`.
--
-- Desfazer (se um dia preciso, numa migration nova):
--   DROP TABLE "fechamento_do_dia"; DROP TABLE "pagamento_parte";
--   DROP TABLE "pagamento"; DROP TABLE "regra_de_divisao";
--   ALTER TABLE "barbeiro" DROP COLUMN "parte_da_casa";
--   ALTER TABLE "cliente" DROP COLUMN "profissional_id";

ALTER TABLE "cliente" ADD COLUMN "profissional_id" UUID;
ALTER TABLE "cliente" ADD CONSTRAINT "cliente_profissional_id_fkey" FOREIGN KEY ("profissional_id")
    REFERENCES "barbeiro"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "cliente_profissional_id_idx" ON "cliente"("profissional_id");

-- DEFAULT constante: o Postgres não reescreve a tabela.
ALTER TABLE "barbeiro" ADD COLUMN "parte_da_casa" SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE "barbeiro" ADD CONSTRAINT "barbeiro_parte_da_casa_check"
    CHECK ("parte_da_casa" BETWEEN 0 AND 100);

CREATE TABLE "regra_de_divisao" (
    "barbearia_id" UUID NOT NULL,
    "dono_do_cliente_id" UUID NOT NULL,
    "atendente_id" UUID NOT NULL,
    "percentual" SMALLINT NOT NULL,

    CONSTRAINT "regra_de_divisao_pkey" PRIMARY KEY ("barbearia_id", "dono_do_cliente_id", "atendente_id"),
    CONSTRAINT "regra_de_divisao_barbearia_id_fkey" FOREIGN KEY ("barbearia_id")
        REFERENCES "barbearia"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "regra_de_divisao_dono_do_cliente_id_fkey" FOREIGN KEY ("dono_do_cliente_id")
        REFERENCES "barbeiro"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "regra_de_divisao_atendente_id_fkey" FOREIGN KEY ("atendente_id")
        REFERENCES "barbeiro"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    -- Com o próprio cliente, quem atendeu fica com tudo: não há regra.
    CONSTRAINT "regra_de_divisao_par_check" CHECK ("dono_do_cliente_id" <> "atendente_id"),
    CONSTRAINT "regra_de_divisao_percentual_check" CHECK ("percentual" BETWEEN 0 AND 100)
);

CREATE TABLE "pagamento" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "barbearia_id" UUID NOT NULL,
    "agendamento_id" UUID NOT NULL,
    "data" DATE NOT NULL,
    "atendente_id" UUID NOT NULL,
    "dono_do_cliente_id" UUID,
    "recebido_por_id" UUID NOT NULL,
    "forma" TEXT NOT NULL,
    "servicos_centavos" INTEGER NOT NULL,
    "desconto_centavos" INTEGER NOT NULL DEFAULT 0,
    "gorjeta_centavos" INTEGER NOT NULL DEFAULT 0,
    "registrado_por_id" UUID NOT NULL,
    "registrado_em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pagamento_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "pagamento_barbearia_id_fkey" FOREIGN KEY ("barbearia_id")
        REFERENCES "barbearia"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "pagamento_agendamento_id_fkey" FOREIGN KEY ("agendamento_id")
        REFERENCES "agendamento"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    -- Membros não são apagados (saem com `ativo = false`). NO ACTION e
    -- não RESTRICT: a checagem fica pro fim do comando, então apagar a
    -- barbearia (que leva membros e pagamentos na mesma cascata) passa,
    -- e apagar um membro com pagamento continua recusado.
    CONSTRAINT "pagamento_atendente_id_fkey" FOREIGN KEY ("atendente_id")
        REFERENCES "barbeiro"("id") ON DELETE NO ACTION ON UPDATE CASCADE,
    CONSTRAINT "pagamento_dono_do_cliente_id_fkey" FOREIGN KEY ("dono_do_cliente_id")
        REFERENCES "barbeiro"("id") ON DELETE NO ACTION ON UPDATE CASCADE,
    CONSTRAINT "pagamento_recebido_por_id_fkey" FOREIGN KEY ("recebido_por_id")
        REFERENCES "barbeiro"("id") ON DELETE NO ACTION ON UPDATE CASCADE,
    CONSTRAINT "pagamento_registrado_por_id_fkey" FOREIGN KEY ("registrado_por_id")
        REFERENCES "barbeiro"("id") ON DELETE NO ACTION ON UPDATE CASCADE,
    CONSTRAINT "pagamento_forma_check" CHECK ("forma" IN ('pix', 'dinheiro', 'debito', 'credito')),
    CONSTRAINT "pagamento_valores_check" CHECK (
        "servicos_centavos" >= 0 AND "desconto_centavos" >= 0 AND "gorjeta_centavos" >= 0
        AND "desconto_centavos" <= "servicos_centavos"
    )
);

CREATE UNIQUE INDEX "pagamento_agendamento_id_key" ON "pagamento"("agendamento_id");
-- O caixa do dia lê por aqui.
CREATE INDEX "pagamento_barbearia_id_data_idx" ON "pagamento"("barbearia_id", "data");

CREATE TABLE "pagamento_parte" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "pagamento_id" UUID NOT NULL,
    "beneficiario_id" UUID,
    "motivo" TEXT NOT NULL,
    "valor_centavos" INTEGER NOT NULL,

    CONSTRAINT "pagamento_parte_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "pagamento_parte_pagamento_id_fkey" FOREIGN KEY ("pagamento_id")
        REFERENCES "pagamento"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "pagamento_parte_beneficiario_id_fkey" FOREIGN KEY ("beneficiario_id")
        REFERENCES "barbeiro"("id") ON DELETE NO ACTION ON UPDATE CASCADE,
    CONSTRAINT "pagamento_parte_motivo_check"
        CHECK ("motivo" IN ('atendimento', 'cliente', 'casa', 'gorjeta')),
    CONSTRAINT "pagamento_parte_valor_check" CHECK ("valor_centavos" >= 0)
);

CREATE INDEX "pagamento_parte_pagamento_id_idx" ON "pagamento_parte"("pagamento_id");

CREATE TABLE "fechamento_do_dia" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "barbearia_id" UUID NOT NULL,
    "data" DATE NOT NULL,
    "fechado_por_id" UUID NOT NULL,
    "fechado_em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acerto" JSONB NOT NULL,

    CONSTRAINT "fechamento_do_dia_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fechamento_do_dia_barbearia_id_fkey" FOREIGN KEY ("barbearia_id")
        REFERENCES "barbearia"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "fechamento_do_dia_fechado_por_id_fkey" FOREIGN KEY ("fechado_por_id")
        REFERENCES "barbeiro"("id") ON DELETE NO ACTION ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "fechamento_do_dia_barbearia_id_data_key" ON "fechamento_do_dia"("barbearia_id", "data");

-- De quem cada cliente atual é: quem atendeu o 1º concluído.
UPDATE "cliente" AS c
SET "profissional_id" = primeiro."barbeiro_id"
FROM (
    SELECT DISTINCT ON ("cliente_id") "cliente_id", "barbeiro_id"
    FROM "agendamento"
    WHERE "status" = 'concluido'
    ORDER BY "cliente_id", "data", "hora_inicio"
) AS primeiro
WHERE primeiro."cliente_id" = c."id";
