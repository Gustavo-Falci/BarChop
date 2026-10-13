-- As notificações do sino do painel (plano .claude/plans/barra-do-topo.plan.md,
-- PR B) e os avisos que o suporte publica pra todas as barbearias.
--
--   - `notificacao`: uma linha por DESTINATÁRIO, e não por evento — o
--     "lida" é de cada pessoa, e a equipe de uma barbearia é pequena.
--     Texto gravado pronto: conta o que aconteceu na hora. Sai junto com
--     o membro (CASCADE no barbeiro).
--   - `aviso`: o que o suporte publicou. Cada membro ativo na hora ganha
--     a sua `notificacao` com o `aviso_id`; é por ele que o suporte conta
--     quantos leram.
--
-- Tabelas novas e vazias: CREATE TABLE e índices comuns não travam nada.
--
-- Escrita à mão, como as outras desde a init (o `migrate dev` propõe
-- derrubar `agendamento.periodo`): aplicar com `migrate deploy`.
--
-- Desfazer (se um dia preciso, numa migration nova):
--   DROP TABLE "notificacao"; DROP TABLE "aviso"; DROP TYPE "tipo_notificacao";

CREATE TYPE "tipo_notificacao" AS ENUM ('agendamento', 'pagamento', 'plataforma');

CREATE TABLE "aviso" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "titulo" VARCHAR(120) NOT NULL,
    "texto" VARCHAR(500) NOT NULL,
    "link" VARCHAR(300),
    "criado_por" UUID,
    "criado_em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "aviso_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "aviso_criado_por_fkey" FOREIGN KEY ("criado_por")
        REFERENCES "operador_suporte"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "aviso_criado_em_idx" ON "aviso"("criado_em" DESC);

CREATE TABLE "notificacao" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "barbeiro_id" UUID NOT NULL,
    "tipo" "tipo_notificacao" NOT NULL,
    "titulo" VARCHAR(120) NOT NULL,
    "texto" VARCHAR(500) NOT NULL,
    "link" VARCHAR(300),
    "aviso_id" UUID,
    "lida_em" TIMESTAMPTZ,
    "criada_em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notificacao_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "notificacao_barbeiro_id_fkey" FOREIGN KEY ("barbeiro_id")
        REFERENCES "barbeiro"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "notificacao_aviso_id_fkey" FOREIGN KEY ("aviso_id")
        REFERENCES "aviso"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- A lista do sino: as de um membro, da mais nova pra mais antiga.
CREATE INDEX "notificacao_barbeiro_id_criada_em_idx" ON "notificacao"("barbeiro_id", "criada_em" DESC);

-- A contagem do sino roda a cada minuto em cada painel aberto: parcial,
-- só com as não lidas, pra ela não crescer com o histórico. O Prisma
-- não descreve índice parcial — vive só aqui.
CREATE INDEX "notificacao_nao_lidas_idx" ON "notificacao"("barbeiro_id") WHERE "lida_em" IS NULL;

-- Quantos leram cada aviso (a tela do suporte).
CREATE INDEX "notificacao_aviso_id_idx" ON "notificacao"("aviso_id");
