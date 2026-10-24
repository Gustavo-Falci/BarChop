-- Os planos que a barbearia e os barbeiros vendem ao cliente (Onda 2,
-- marco 3; plano .claude/plans/planos-de-assinatura.plan.md, PR 2). A
-- conta mora em packages/formato/src/planos-do-cliente.ts; aqui, onde
-- ela fica gravada.
--
--   - `barbeiro.pode_vender_planos`: o dono liga por membro. O dono vende
--     sem ela.
--   - `barbearia.vitrine_de_planos`: os planos aparecem na página pública.
--   - `conexao_de_pagamento`: a conta de quem vende num provedor, com a
--     chave cifrada (AES-256-GCM, PR 8). `da_casa` = a conta que recebe os
--     planos da casa: uma por barbearia. Fora ela, uma por membro e
--     provedor (o dono pode ter a da casa e a dele).
--   - `plano_de_assinatura`: vendedor nulo = da casa. O fixo por
--     atendimento só existe no da casa.
--   - `plano_servico`: o que o plano cobre; usos nulo = ilimitado.
--   - `assinatura_do_cliente`: preço e ciclo congelados (mudar o plano
--     vale pra assinatura nova). Online tem conexão; no balcão, não. Uma
--     viva (não cancelada) por cliente e plano.
--   - `recebimento_do_plano`: cada mensalidade que entrou, no dia do
--     caixa, com a parte da casa congelada (`dividirMensalidade`).
--   - `uso_do_plano`: um por serviço coberto num atendimento pelo plano,
--     congelado no registro como as partes; sai junto com o pagamento
--     (desfazer o pagamento devolve o uso). `usosRestantes` conta por
--     aqui, no ciclo da assinatura.
--   - `evento_do_provedor`: a deduplicação do webhook, como `evento_stripe`.
--   - `pagamento.forma` passa a aceitar `plano` (FORMAS_DO_CAIXA), só no
--     atendimento todo pelo plano, sem dinheiro. Com serviço cobrado à
--     parte, a forma é a do dinheiro e `servicos_centavos` é o que foi
--     cobrado: o total por forma do caixa segue certo. "Pelo plano" =
--     `assinatura_id` preenchido.
--   - `pagamento_parte.motivo` ganha `plano` (o fixo do plano da casa).
--     `mensalidade` não vira parte: mora em `recebimento_do_plano`.
--
-- As listas dos CHECKs são CICLOS_DO_CLIENTE, SITUACOES_DO_ASSINANTE,
-- FORMAS_DA_ASSINATURA, PROVEDORES_DE_PAGAMENTO, MODOS_DA_CONEXAO,
-- FORMAS_DO_CAIXA, FORMAS_DE_PAGAMENTO e MAX_DIAS_DE_TESTE_DO_CLIENTE
-- (@barchop/formato); tests/banco-planos.test.ts impede código e banco de
-- divergirem. Dinheiro em centavos inteiros.
--
-- Membros, clientes, planos e assinaturas não são apagados (saem com
-- `ativo = false` / `cancelada`): as chaves pra eles são NO ACTION, como
-- no caixa, pra a cascata de apagar a barbearia passar.
--
-- Escrita à mão, como as outras desde a init: aplicar com `migrate deploy`.
--
-- Desfazer (se um dia preciso, numa migration nova):
--   DROP TABLE "uso_do_plano"; DROP TABLE "recebimento_do_plano";
--   ALTER TABLE "pagamento" DROP COLUMN "assinatura_id" (e os CHECKs de
--   forma e motivo voltam às listas da 20261017120000_caixa);
--   DROP TABLE "assinatura_do_cliente"; DROP TABLE "plano_servico";
--   DROP TABLE "plano_de_assinatura"; DROP TABLE "conexao_de_pagamento";
--   DROP TABLE "evento_do_provedor";
--   ALTER TABLE "barbearia" DROP COLUMN "vitrine_de_planos";
--   ALTER TABLE "barbeiro" DROP COLUMN "pode_vender_planos";

-- DEFAULT constante: o Postgres não reescreve a tabela.
ALTER TABLE "barbeiro" ADD COLUMN "pode_vender_planos" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "barbearia" ADD COLUMN "vitrine_de_planos" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "conexao_de_pagamento" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "barbearia_id" UUID NOT NULL,
    -- Quem conectou.
    "barbeiro_id" UUID NOT NULL,
    "da_casa" BOOLEAN NOT NULL DEFAULT false,
    "provedor" VARCHAR(20) NOT NULL,
    "modo" VARCHAR(10) NOT NULL,
    "chave_cifrada" BYTEA NOT NULL,
    -- Os 4 últimos caracteres, pra tela. A chave nunca volta.
    "chave_final" VARCHAR(4) NOT NULL,
    -- Hash do `authToken` do webhook; o token só existe no provedor.
    "webhook_token_hash" VARCHAR(128) NOT NULL,
    "id_externo_webhook" VARCHAR(100),
    "criado_em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conexao_de_pagamento_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "conexao_de_pagamento_barbearia_id_fkey" FOREIGN KEY ("barbearia_id")
        REFERENCES "barbearia"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "conexao_de_pagamento_barbeiro_id_fkey" FOREIGN KEY ("barbeiro_id")
        REFERENCES "barbeiro"("id") ON DELETE NO ACTION ON UPDATE CASCADE,
    CONSTRAINT "conexao_de_pagamento_provedor_check" CHECK ("provedor" IN ('asaas')),
    CONSTRAINT "conexao_de_pagamento_modo_check" CHECK ("modo" IN ('teste', 'real'))
);

CREATE UNIQUE INDEX "conexao_de_pagamento_da_casa_key" ON "conexao_de_pagamento"("barbearia_id") WHERE "da_casa";
CREATE UNIQUE INDEX "conexao_de_pagamento_barbeiro_provedor_key" ON "conexao_de_pagamento"("barbeiro_id", "provedor")
    WHERE NOT "da_casa";

CREATE TABLE "plano_de_assinatura" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "barbearia_id" UUID NOT NULL,
    -- Nulo = plano da casa.
    "vendedor_id" UUID,
    "nome" VARCHAR(80) NOT NULL,
    "descricao" VARCHAR(300),
    "ciclo" VARCHAR(20) NOT NULL,
    "preco_centavos" INTEGER NOT NULL,
    "dias_de_teste" SMALLINT NOT NULL DEFAULT 0,
    "fixo_por_atendimento_centavos" INTEGER,
    "aceita_online" BOOLEAN NOT NULL DEFAULT true,
    "aceita_no_balcao" BOOLEAN NOT NULL DEFAULT false,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ordem" SMALLINT NOT NULL DEFAULT 0,
    "criado_em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plano_de_assinatura_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "plano_de_assinatura_barbearia_id_fkey" FOREIGN KEY ("barbearia_id")
        REFERENCES "barbearia"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "plano_de_assinatura_vendedor_id_fkey" FOREIGN KEY ("vendedor_id")
        REFERENCES "barbeiro"("id") ON DELETE NO ACTION ON UPDATE CASCADE,
    CONSTRAINT "plano_de_assinatura_ciclo_check" CHECK ("ciclo" IN ('mensal', 'trimestral', 'anual')),
    CONSTRAINT "plano_de_assinatura_preco_check" CHECK ("preco_centavos" > 0),
    CONSTRAINT "plano_de_assinatura_dias_de_teste_check" CHECK ("dias_de_teste" BETWEEN 0 AND 30),
    -- Da casa tem fixo (0 vale); de barbeiro, não.
    CONSTRAINT "plano_de_assinatura_fixo_check" CHECK (
        ("vendedor_id" IS NULL AND "fixo_por_atendimento_centavos" IS NOT NULL AND "fixo_por_atendimento_centavos" >= 0)
        OR ("vendedor_id" IS NOT NULL AND "fixo_por_atendimento_centavos" IS NULL)
    ),
    CONSTRAINT "plano_de_assinatura_formas_check" CHECK ("aceita_online" OR "aceita_no_balcao")
);

CREATE INDEX "plano_de_assinatura_barbearia_id_idx" ON "plano_de_assinatura"("barbearia_id");
CREATE INDEX "plano_de_assinatura_vendedor_id_idx" ON "plano_de_assinatura"("vendedor_id");

CREATE TABLE "plano_servico" (
    "plano_id" UUID NOT NULL,
    "servico_id" UUID NOT NULL,
    -- Nulo = ilimitado.
    "usos_por_ciclo" SMALLINT,

    CONSTRAINT "plano_servico_pkey" PRIMARY KEY ("plano_id", "servico_id"),
    CONSTRAINT "plano_servico_plano_id_fkey" FOREIGN KEY ("plano_id")
        REFERENCES "plano_de_assinatura"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "plano_servico_servico_id_fkey" FOREIGN KEY ("servico_id")
        REFERENCES "servico"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "plano_servico_usos_check" CHECK ("usos_por_ciclo" IS NULL OR "usos_por_ciclo" >= 1)
);

CREATE INDEX "plano_servico_servico_id_idx" ON "plano_servico"("servico_id");

CREATE TABLE "assinatura_do_cliente" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "barbearia_id" UUID NOT NULL,
    "plano_id" UUID NOT NULL,
    "cliente_id" UUID NOT NULL,
    "situacao" VARCHAR(20) NOT NULL DEFAULT 'pendente',
    "forma" VARCHAR(20) NOT NULL,
    -- Congelados na assinatura.
    "preco_centavos" INTEGER NOT NULL,
    "ciclo" VARCHAR(20) NOT NULL,
    -- Online: a conta e a assinatura no provedor. No balcão: nulos.
    "conexao_id" UUID,
    "id_externo" VARCHAR(100),
    -- O ciclo atual; nulos enquanto pendente.
    "ciclo_comeca_em" DATE,
    "ciclo_termina_em" DATE,
    "cancelada_em" TIMESTAMPTZ,
    "criado_em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assinatura_do_cliente_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "assinatura_do_cliente_barbearia_id_fkey" FOREIGN KEY ("barbearia_id")
        REFERENCES "barbearia"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "assinatura_do_cliente_plano_id_fkey" FOREIGN KEY ("plano_id")
        REFERENCES "plano_de_assinatura"("id") ON DELETE NO ACTION ON UPDATE CASCADE,
    CONSTRAINT "assinatura_do_cliente_cliente_id_fkey" FOREIGN KEY ("cliente_id")
        REFERENCES "cliente"("id") ON DELETE NO ACTION ON UPDATE CASCADE,
    CONSTRAINT "assinatura_do_cliente_conexao_id_fkey" FOREIGN KEY ("conexao_id")
        REFERENCES "conexao_de_pagamento"("id") ON DELETE NO ACTION ON UPDATE CASCADE,
    CONSTRAINT "assinatura_do_cliente_situacao_check"
        CHECK ("situacao" IN ('pendente', 'teste', 'ativa', 'em_atraso', 'cancelada')),
    CONSTRAINT "assinatura_do_cliente_forma_check" CHECK ("forma" IN ('online', 'no_balcao')),
    CONSTRAINT "assinatura_do_cliente_ciclo_check" CHECK ("ciclo" IN ('mensal', 'trimestral', 'anual')),
    CONSTRAINT "assinatura_do_cliente_preco_check" CHECK ("preco_centavos" > 0),
    CONSTRAINT "assinatura_do_cliente_conexao_check" CHECK (("forma" = 'online') = ("conexao_id" IS NOT NULL)),
    CONSTRAINT "assinatura_do_cliente_periodo_check" CHECK (
        ("ciclo_comeca_em" IS NULL AND "ciclo_termina_em" IS NULL)
        OR ("ciclo_comeca_em" IS NOT NULL AND "ciclo_termina_em" IS NOT NULL AND "ciclo_termina_em" > "ciclo_comeca_em")
    )
);

CREATE UNIQUE INDEX "assinatura_do_cliente_conexao_id_id_externo_key" ON "assinatura_do_cliente"("conexao_id", "id_externo");
CREATE UNIQUE INDEX "assinatura_do_cliente_viva_key" ON "assinatura_do_cliente"("plano_id", "cliente_id")
    WHERE "situacao" <> 'cancelada';
CREATE INDEX "assinatura_do_cliente_barbearia_id_idx" ON "assinatura_do_cliente"("barbearia_id");
CREATE INDEX "assinatura_do_cliente_cliente_id_idx" ON "assinatura_do_cliente"("cliente_id");

CREATE TABLE "recebimento_do_plano" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "barbearia_id" UUID NOT NULL,
    "assinatura_id" UUID NOT NULL,
    -- O dia do caixa: o da confirmação, ou o próximo aberto.
    "data" DATE NOT NULL,
    -- O dono da conta que recebeu, ou quem marcou "recebi" no balcão.
    "recebido_por_id" UUID NOT NULL,
    "valor_centavos" INTEGER NOT NULL,
    "casa_centavos" INTEGER NOT NULL,
    "forma" VARCHAR(20) NOT NULL,
    -- A cobrança no provedor; nulo no balcão.
    "id_externo" VARCHAR(100),
    "registrado_em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recebimento_do_plano_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "recebimento_do_plano_barbearia_id_fkey" FOREIGN KEY ("barbearia_id")
        REFERENCES "barbearia"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "recebimento_do_plano_assinatura_id_fkey" FOREIGN KEY ("assinatura_id")
        REFERENCES "assinatura_do_cliente"("id") ON DELETE NO ACTION ON UPDATE CASCADE,
    CONSTRAINT "recebimento_do_plano_recebido_por_id_fkey" FOREIGN KEY ("recebido_por_id")
        REFERENCES "barbeiro"("id") ON DELETE NO ACTION ON UPDATE CASCADE,
    CONSTRAINT "recebimento_do_plano_valores_check" CHECK (
        "valor_centavos" > 0 AND "casa_centavos" >= 0 AND "casa_centavos" <= "valor_centavos"
    ),
    CONSTRAINT "recebimento_do_plano_forma_check" CHECK ("forma" IN ('pix', 'dinheiro', 'debito', 'credito'))
);

-- A mesma cobrança não entra duas vezes (webhook repetido).
CREATE UNIQUE INDEX "recebimento_do_plano_assinatura_id_id_externo_key" ON "recebimento_do_plano"("assinatura_id", "id_externo");
-- O caixa do dia lê por aqui.
CREATE INDEX "recebimento_do_plano_barbearia_id_data_idx" ON "recebimento_do_plano"("barbearia_id", "data");

CREATE TABLE "evento_do_provedor" (
    "provedor" VARCHAR(20) NOT NULL,
    "id" VARCHAR(255) NOT NULL,
    "tipo" VARCHAR(100) NOT NULL,
    "recebido_em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evento_do_provedor_pkey" PRIMARY KEY ("provedor", "id"),
    CONSTRAINT "evento_do_provedor_provedor_check" CHECK ("provedor" IN ('asaas'))
);

ALTER TABLE "pagamento" ADD COLUMN "assinatura_id" UUID;
ALTER TABLE "pagamento" ADD CONSTRAINT "pagamento_assinatura_id_fkey" FOREIGN KEY ("assinatura_id")
    REFERENCES "assinatura_do_cliente"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
CREATE INDEX "pagamento_assinatura_id_idx" ON "pagamento"("assinatura_id");
ALTER TABLE "pagamento" DROP CONSTRAINT "pagamento_forma_check";
ALTER TABLE "pagamento" ADD CONSTRAINT "pagamento_forma_check"
    CHECK ("forma" IN ('pix', 'dinheiro', 'debito', 'credito', 'plano'));
-- `plano` = todo pelo plano: sem dinheiro e com a assinatura.
ALTER TABLE "pagamento" ADD CONSTRAINT "pagamento_pelo_plano_check" CHECK (
    "forma" <> 'plano' OR ("assinatura_id" IS NOT NULL AND "servicos_centavos" = 0 AND "gorjeta_centavos" = 0)
);

ALTER TABLE "pagamento_parte" DROP CONSTRAINT "pagamento_parte_motivo_check";
ALTER TABLE "pagamento_parte" ADD CONSTRAINT "pagamento_parte_motivo_check"
    CHECK ("motivo" IN ('atendimento', 'cliente', 'casa', 'gorjeta', 'plano'));

CREATE TABLE "uso_do_plano" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "pagamento_id" UUID NOT NULL,
    "assinatura_id" UUID NOT NULL,
    "servico_id" UUID NOT NULL,
    -- A do pagamento: o ciclo é contado por ela.
    "data" DATE NOT NULL,

    CONSTRAINT "uso_do_plano_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "uso_do_plano_pagamento_id_fkey" FOREIGN KEY ("pagamento_id")
        REFERENCES "pagamento"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "uso_do_plano_assinatura_id_fkey" FOREIGN KEY ("assinatura_id")
        REFERENCES "assinatura_do_cliente"("id") ON DELETE NO ACTION ON UPDATE CASCADE,
    CONSTRAINT "uso_do_plano_servico_id_fkey" FOREIGN KEY ("servico_id")
        REFERENCES "servico"("id") ON DELETE NO ACTION ON UPDATE CASCADE
);

CREATE INDEX "uso_do_plano_assinatura_id_data_idx" ON "uso_do_plano"("assinatura_id", "data");
CREATE INDEX "uso_do_plano_pagamento_id_idx" ON "uso_do_plano"("pagamento_id");
