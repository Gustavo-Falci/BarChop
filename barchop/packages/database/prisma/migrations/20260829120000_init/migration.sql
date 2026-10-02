-- CreateEnum
CREATE TYPE "status_agendamento" AS ENUM ('pendente', 'confirmado', 'concluido', 'cancelado', 'no_show');

-- CreateEnum
CREATE TYPE "origem_agendamento" AS ENUM ('cliente', 'barbeiro');

-- CreateTable
CREATE TABLE "barbearia" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nome" VARCHAR(120) NOT NULL,
    "slug" VARCHAR(80) NOT NULL,
    "telefone" VARCHAR(20),
    "endereco" VARCHAR(255),
    "logo_url" TEXT,
    "criado_em" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "barbearia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "horario_funcionamento" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "barbearia_id" UUID NOT NULL,
    "dia_semana" SMALLINT NOT NULL,
    "hora_abertura" TIME,
    "hora_fechamento" TIME,
    "fechado" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "horario_funcionamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "barbeiro" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "barbearia_id" UUID NOT NULL,
    "nome" VARCHAR(120) NOT NULL,
    "email" VARCHAR(160),
    "senha_hash" TEXT NOT NULL,
    "telefone" VARCHAR(20),
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "barbeiro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cliente" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nome" VARCHAR(120) NOT NULL,
    "telefone" VARCHAR(20) NOT NULL,
    "email" VARCHAR(160),
    "senha_hash" TEXT,
    "criado_em" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "servico" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "barbearia_id" UUID NOT NULL,
    "nome" VARCHAR(120) NOT NULL,
    "duracao_minutos" SMALLINT NOT NULL,
    "preco" DECIMAL(10,2) NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "servico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agendamento" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "barbearia_id" UUID NOT NULL,
    "barbeiro_id" UUID NOT NULL,
    "cliente_id" UUID NOT NULL,
    "data" DATE NOT NULL,
    "hora_inicio" TIME NOT NULL,
    "hora_fim" TIME NOT NULL,
    "status" "status_agendamento" NOT NULL DEFAULT 'confirmado',
    "origem" "origem_agendamento" NOT NULL DEFAULT 'cliente',
    "observacoes" TEXT,
    "criado_em" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "agendamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agendamento_servico" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "agendamento_id" UUID NOT NULL,
    "servico_id" UUID NOT NULL,
    "preco_no_momento" DECIMAL(10,2) NOT NULL,
    "duracao_no_momento" SMALLINT NOT NULL,

    CONSTRAINT "agendamento_servico_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "barbearia_slug_key" ON "barbearia"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "horario_funcionamento_barbearia_id_dia_semana_key" ON "horario_funcionamento"("barbearia_id", "dia_semana");

-- CreateIndex
CREATE UNIQUE INDEX "barbeiro_email_key" ON "barbeiro"("email");

-- CreateIndex
CREATE INDEX "barbeiro_barbearia_id_idx" ON "barbeiro"("barbearia_id");

-- CreateIndex
CREATE UNIQUE INDEX "cliente_telefone_key" ON "cliente"("telefone");

-- CreateIndex
CREATE UNIQUE INDEX "cliente_email_key" ON "cliente"("email");

-- CreateIndex
CREATE INDEX "servico_barbearia_id_idx" ON "servico"("barbearia_id");

-- CreateIndex
CREATE INDEX "agendamento_barbeiro_id_data_idx" ON "agendamento"("barbeiro_id", "data");

-- CreateIndex
CREATE INDEX "agendamento_cliente_id_idx" ON "agendamento"("cliente_id");

-- CreateIndex
CREATE INDEX "agendamento_barbearia_id_data_idx" ON "agendamento"("barbearia_id", "data");

-- CreateIndex
CREATE INDEX "agendamento_servico_agendamento_id_idx" ON "agendamento_servico"("agendamento_id");

-- AddForeignKey
ALTER TABLE "horario_funcionamento" ADD CONSTRAINT "horario_funcionamento_barbearia_id_fkey" FOREIGN KEY ("barbearia_id") REFERENCES "barbearia"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "barbeiro" ADD CONSTRAINT "barbeiro_barbearia_id_fkey" FOREIGN KEY ("barbearia_id") REFERENCES "barbearia"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "servico" ADD CONSTRAINT "servico_barbearia_id_fkey" FOREIGN KEY ("barbearia_id") REFERENCES "barbearia"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agendamento" ADD CONSTRAINT "agendamento_barbearia_id_fkey" FOREIGN KEY ("barbearia_id") REFERENCES "barbearia"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agendamento" ADD CONSTRAINT "agendamento_barbeiro_id_fkey" FOREIGN KEY ("barbeiro_id") REFERENCES "barbeiro"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agendamento" ADD CONSTRAINT "agendamento_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agendamento_servico" ADD CONSTRAINT "agendamento_servico_agendamento_id_fkey" FOREIGN KEY ("agendamento_id") REFERENCES "agendamento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agendamento_servico" ADD CONSTRAINT "agendamento_servico_servico_id_fkey" FOREIGN KEY ("servico_id") REFERENCES "servico"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ============================================================
-- A PARTIR DAQUI: adicionado à mão, fora do que o Prisma gera.
-- Depois de rodar `prisma migrate dev --create-only`, cole este
-- bloco no final do migration.sql gerado, antes de aplicar.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "agendamento" ADD COLUMN "periodo" tsrange GENERATED ALWAYS AS (
  tsrange((data + hora_inicio)::timestamp, (data + hora_fim)::timestamp, '[)')
) STORED;

-- Trava no próprio banco contra dois agendamentos do mesmo
-- barbeiro se sobrepondo (cancelados não contam). Isso é a
-- garantia final além do cálculo feito em @barchop/scheduling.
ALTER TABLE "agendamento" ADD CONSTRAINT "sem_conflito_horario"
  EXCLUDE USING gist ("barbeiro_id" WITH =, "periodo" WITH &&)
  WHERE (status <> 'cancelado');

-- Nota: `prisma db pull` não vai reconhecer essa constraint nem
-- a coluna "periodo" como algo modelado no schema.prisma — elas
-- existem só no banco. Não rode `prisma db push` num schema
-- desatualizado sem cuidado, ou isso pode ser perdido.
