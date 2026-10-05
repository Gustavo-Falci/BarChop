-- Link único e troca pelo suporte (Onda 1, bloco F4; decisão do dono,
-- 2026-10-04).
--
-- O dono não troca mais o link sozinho: pede, e o suporte da plataforma
-- avalia. O suporte não é membro de barbearia nenhuma — conta própria,
-- criada só por comando (apps/api/scripts/criar-suporte.ts), nunca por
-- rota.
--
-- A unicidade "pra sempre" (o slug atual e os antigos de uma barbearia
-- nunca vão pra outra) não cabe numa constraint: são duas tabelas
-- (barbearia.slug e slug_antigo). Quem garante é a trava
-- `travarSlugs` (lib/slug.ts) nos caminhos que gravam slug.
--
-- Escrita à mão, e não gerada por `prisma migrate dev`: o `migrate dev`
-- propõe DERRUBAR `agendamento.periodo` (ver o aviso no fim de
-- 20260829120000_init/migration.sql). Aplicar com `migrate deploy`.

CREATE TABLE "operador_suporte" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nome" VARCHAR(120) NOT NULL,
    "email" VARCHAR(160) NOT NULL,
    "senha_hash" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "senha_alterada_em" TIMESTAMPTZ,
    "criado_em" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "operador_suporte_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "operador_suporte_email_key" ON "operador_suporte"("email");

CREATE TABLE "solicitacao_troca_link" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "barbearia_id" UUID NOT NULL,
    "slug_pedido" VARCHAR(80) NOT NULL,
    "motivo" VARCHAR(500),
    "status" VARCHAR(20) NOT NULL DEFAULT 'pendente',
    "resposta" VARCHAR(500),
    "criado_em" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "decidido_em" TIMESTAMPTZ,
    "decidido_por" UUID,

    CONSTRAINT "solicitacao_troca_link_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "solicitacao_troca_link_status_check"
        CHECK ("status" IN ('pendente', 'aprovada', 'recusada', 'cancelada')),
    CONSTRAINT "solicitacao_troca_link_barbearia_id_fkey" FOREIGN KEY ("barbearia_id")
        REFERENCES "barbearia"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "solicitacao_troca_link_decidido_por_fkey" FOREIGN KEY ("decidido_por")
        REFERENCES "operador_suporte"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- Uma pendente por barbearia: o segundo pedido simultâneo bate aqui.
CREATE UNIQUE INDEX "solicitacao_troca_link_uma_pendente"
    ON "solicitacao_troca_link"("barbearia_id") WHERE "status" = 'pendente';

CREATE INDEX "solicitacao_troca_link_status_criado_idx"
    ON "solicitacao_troca_link"("status", "criado_em");
