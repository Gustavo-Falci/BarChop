-- ============================================================
-- BarChop — schema do banco de dados (PostgreSQL)
-- ============================================================
-- Modelo multi-tenant: Barbearia é o tenant raiz. Cliente pertence
-- a uma barbearia — o mesmo telefone em duas barbearias são dois
-- cadastros, e a busca por telefone é sempre dentro da barbearia.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS btree_gist; -- exclusion constraint com uuid + tsrange

CREATE TYPE status_agendamento AS ENUM (
  'pendente', 'confirmado', 'concluido', 'cancelado', 'no_show'
);

CREATE TYPE origem_agendamento AS ENUM (
  'cliente',   -- criado pelo próprio cliente (link público ou app)
  'barbeiro'   -- criado manualmente pelo barbeiro (walk-in, telefone)
);

-- ------------------------------------------------------------
-- Barbearia (tenant raiz)
-- ------------------------------------------------------------
CREATE TABLE barbearia (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome        VARCHAR(120) NOT NULL,
  slug        VARCHAR(80)  NOT NULL UNIQUE,  -- usado na URL pública de agendamento
  telefone    VARCHAR(20),
  endereco    VARCHAR(255),
  logo_url    TEXT,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- Horário de funcionamento (por dia da semana)
-- ------------------------------------------------------------
CREATE TABLE horario_funcionamento (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barbearia_id     UUID NOT NULL REFERENCES barbearia(id) ON DELETE CASCADE,
  dia_semana       SMALLINT NOT NULL CHECK (dia_semana BETWEEN 0 AND 6), -- 0 = domingo
  hora_abertura    TIME,
  hora_fechamento  TIME,
  fechado          BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (barbearia_id, dia_semana)
);

-- ------------------------------------------------------------
-- Barbeiro (funcionário da barbearia — MVP assume 1, mas o
-- modelo já suporta vários por barbearia)
-- ------------------------------------------------------------
CREATE TABLE barbeiro (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barbearia_id  UUID NOT NULL REFERENCES barbearia(id) ON DELETE CASCADE,
  nome          VARCHAR(120) NOT NULL,
  email         VARCHAR(160) UNIQUE,
  senha_hash    TEXT NOT NULL,
  telefone      VARCHAR(20),
  ativo         BOOLEAN NOT NULL DEFAULT true,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_barbeiro_barbearia ON barbeiro(barbearia_id);

-- ------------------------------------------------------------
-- Cliente (pertence a uma barbearia)
-- senha_hash nulo = cliente identificado só pelo telefone,
-- nunca criou conta no app opcional.
-- ------------------------------------------------------------
CREATE TABLE cliente (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barbearia_id  UUID NOT NULL REFERENCES barbearia(id) ON DELETE CASCADE,
  nome          VARCHAR(120) NOT NULL,
  telefone      VARCHAR(20)  NOT NULL,
  email         VARCHAR(160),
  senha_hash    TEXT,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (barbearia_id, telefone),
  UNIQUE (barbearia_id, email)
);

-- ------------------------------------------------------------
-- Serviço (oferecido por uma barbearia)
-- ------------------------------------------------------------
CREATE TABLE servico (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barbearia_id      UUID NOT NULL REFERENCES barbearia(id) ON DELETE CASCADE,
  nome              VARCHAR(120) NOT NULL,
  duracao_minutos   SMALLINT NOT NULL CHECK (duracao_minutos > 0),
  preco             NUMERIC(10,2) NOT NULL CHECK (preco >= 0),
  ativo             BOOLEAN NOT NULL DEFAULT true,
  criado_em         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_servico_barbearia ON servico(barbearia_id);

-- ------------------------------------------------------------
-- Agendamento
-- hora_fim é calculada pela aplicação (soma da duração dos
-- serviços escolhidos) e gravada aqui — não é derivada em
-- tempo real, pra permitir consultas de conflito simples.
-- ------------------------------------------------------------
CREATE TABLE agendamento (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barbearia_id  UUID NOT NULL REFERENCES barbearia(id) ON DELETE CASCADE,
  barbeiro_id   UUID NOT NULL REFERENCES barbeiro(id)  ON DELETE RESTRICT,
  cliente_id    UUID NOT NULL REFERENCES cliente(id)   ON DELETE RESTRICT,
  data          DATE NOT NULL,
  hora_inicio   TIME NOT NULL,
  hora_fim      TIME NOT NULL,
  status        status_agendamento NOT NULL DEFAULT 'confirmado',
  origem        origem_agendamento NOT NULL DEFAULT 'cliente',
  observacoes   TEXT,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),

  CHECK (hora_fim > hora_inicio),

  -- coluna gerada só pra alimentar a exclusion constraint abaixo
  periodo tsrange GENERATED ALWAYS AS (
    tsrange((data + hora_inicio)::timestamp, (data + hora_fim)::timestamp, '[)')
  ) STORED
);

CREATE INDEX idx_agendamento_barbeiro_data  ON agendamento(barbeiro_id, data);
CREATE INDEX idx_agendamento_cliente        ON agendamento(cliente_id);
CREATE INDEX idx_agendamento_barbearia_data ON agendamento(barbearia_id, data);

-- Trava de segurança no próprio banco: impede dois agendamentos
-- do mesmo barbeiro se sobrepondo no tempo (cancelados não contam).
-- Isso é além do cálculo de horários livres feito na aplicação —
-- é a garantia final contra condição de corrida (dois clientes
-- confirmando o mesmo horário ao mesmo tempo).
ALTER TABLE agendamento ADD CONSTRAINT sem_conflito_horario
  EXCLUDE USING gist (barbeiro_id WITH =, periodo WITH &&)
  WHERE (status <> 'cancelado');

-- ------------------------------------------------------------
-- Agendamento x Serviço (N:N — um agendamento pode ter vários
-- serviços). Preço e duração são "congelados" no momento da
-- criação, pra não mudar retroativamente se o serviço mudar.
-- ------------------------------------------------------------
CREATE TABLE agendamento_servico (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agendamento_id        UUID NOT NULL REFERENCES agendamento(id) ON DELETE CASCADE,
  servico_id            UUID NOT NULL REFERENCES servico(id)     ON DELETE RESTRICT,
  preco_no_momento      NUMERIC(10,2) NOT NULL,
  duracao_no_momento    SMALLINT NOT NULL
);
CREATE INDEX idx_agendamento_servico_agendamento ON agendamento_servico(agendamento_id);

-- ============================================================
-- Próximos passos sugeridos (fora do escopo deste schema):
--  - Tabela de lembretes enviados (auditoria de WhatsApp/push)
--  - Tabela cliente_barbearia, se precisar de notas do barbeiro
--    sobre um cliente específico
--  - Soft delete (deleted_at) em vez de exclusão física, se
--    precisar manter histórico completo mesmo após remoções
-- ============================================================
