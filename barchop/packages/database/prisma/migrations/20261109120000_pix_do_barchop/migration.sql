-- Pagar o BarChop por Pix, conferido pelo Suporte (plano
-- .claude/plans/pix-do-barchop.plan.md, PR 1; decisões do dono de 08/11
-- e 09/11/2026).
--
-- O dono paga o QR que o painel gera (BR Code estático com o valor
-- exato, na chave do BarChop), toca "Já paguei", e o plano vale na hora,
-- aguardando a conferência do Suporte no extrato. Cada período é um Pix
-- novo: o Pix não renova sozinho.
--
-- Escrita à mão, e não gerada por `prisma migrate dev`: o `migrate dev`
-- propõe DERRUBAR `agendamento.periodo` (ver o aviso no fim de
-- 20260829120000_init/migration.sql). Aplicar com `migrate deploy`.
--
-- Só acrescenta: a API anterior não lê nada disto e segue funcionando.
--
-- Desfazer (se um dia preciso, numa migration nova):
--   DROP TABLE "pagamento_pix";
--   ALTER TABLE "assinatura" DROP COLUMN "forma";

-- Como a barbearia paga o BarChop. As que já existem pagam (ou vão
-- pagar) no cartão. A lista é FORMAS_DE_PAGAR_O_BARCHOP, em
-- packages/formato/src/planos.ts.
ALTER TABLE "assinatura"
    ADD COLUMN "forma" VARCHAR(10) NOT NULL DEFAULT 'cartao',
    ADD CONSTRAINT "assinatura_forma_check" CHECK ("forma" IN ('cartao', 'pix'));

CREATE TABLE "pagamento_pix" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "barbearia_id" UUID NOT NULL,
    -- O txid do QR (campo 62/05), derivado pela API: o mesmo QR a cada
    -- recarga da tela de Faturas.
    "identificador" VARCHAR(25) NOT NULL,
    "plano" TEXT NOT NULL,
    "ciclo" TEXT NOT NULL,
    "profissionais" SMALLINT NOT NULL,
    -- Sempre calculado pela API (precoDoPlano), nunca vindo do corpo.
    "valor_centavos" INTEGER NOT NULL,
    "periodo_comeca_em" TIMESTAMPTZ NOT NULL,
    "periodo_termina_em" TIMESTAMPTZ NOT NULL,
    "situacao" VARCHAR(20) NOT NULL DEFAULT 'aguardando',
    -- A resposta do Suporte na recusa: é o que o dono lê em Faturas.
    "resposta" VARCHAR(500),
    "criado_em" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "decidido_em" TIMESTAMPTZ,
    "decidido_por" UUID,
    -- O retrato da assinatura antes do Pix, pra recusa e o "Ainda não
    -- paguei" voltarem a ele. O fim do teste não entra: o Pix nunca mexe
    -- nele.
    "antes_situacao" TEXT NOT NULL,
    "antes_plano" TEXT NOT NULL,
    "antes_ciclo" TEXT NOT NULL,
    "antes_forma" VARCHAR(10) NOT NULL,
    "antes_periodo_termina_em" TIMESTAMPTZ,
    "antes_profissionais" SMALLINT,

    CONSTRAINT "pagamento_pix_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "pagamento_pix_barbearia_id_fkey" FOREIGN KEY ("barbearia_id")
        REFERENCES "barbearia"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "pagamento_pix_decidido_por_fkey" FOREIGN KEY ("decidido_por")
        REFERENCES "operador_suporte"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    -- As listas são as de packages/formato (SITUACOES_DO_PIX, IDS_DOS_PLANOS,
    -- CICLOS, FORMAS_DE_PAGAR_O_BARCHOP). O Grátis não se paga.
    CONSTRAINT "pagamento_pix_situacao_check"
        CHECK ("situacao" IN ('aguardando', 'confirmado', 'recusado', 'desfeito')),
    CONSTRAINT "pagamento_pix_plano_check" CHECK ("plano" IN ('essencial', 'completo')),
    CONSTRAINT "pagamento_pix_ciclo_check" CHECK ("ciclo" IN ('mensal', 'anual')),
    CONSTRAINT "pagamento_pix_profissionais_check" CHECK ("profissionais" >= 1),
    CONSTRAINT "pagamento_pix_valor_check" CHECK ("valor_centavos" >= 1),
    CONSTRAINT "pagamento_pix_periodo_check" CHECK ("periodo_comeca_em" < "periodo_termina_em"),
    CONSTRAINT "pagamento_pix_antes_situacao_check"
        CHECK ("antes_situacao" IN ('teste', 'ativa', 'em_atraso', 'cancelada', 'gratis')),
    CONSTRAINT "pagamento_pix_antes_forma_check" CHECK ("antes_forma" IN ('cartao', 'pix')),
    -- Decidido pelo Suporte (ou desfeito pelo dono) tem data.
    CONSTRAINT "pagamento_pix_decidido_check" CHECK ("situacao" = 'aguardando' OR "decidido_em" IS NOT NULL)
);

-- Um Pix em conferência por barbearia: o segundo "Já paguei" simultâneo
-- bate aqui.
CREATE UNIQUE INDEX "pagamento_pix_um_aguardando"
    ON "pagamento_pix"("barbearia_id") WHERE "situacao" = 'aguardando';

-- O identificador único só entre os aguardando: é o que o Suporte
-- procura no extrato, e são poucos de cada vez. Confirmado, recusado ou
-- desfeito saem: o identificador é derivado do pedido (sempre o mesmo pro
-- mesmo pedido), então um índice com os confirmados recusaria pra sempre
-- o pedido que um dia batesse com um deles.
CREATE UNIQUE INDEX "pagamento_pix_identificador_aguardando"
    ON "pagamento_pix"("identificador") WHERE "situacao" = 'aguardando';

-- A fila do Suporte e a lista do dono.
CREATE INDEX "pagamento_pix_situacao_criado_em_idx" ON "pagamento_pix"("situacao", "criado_em");
CREATE INDEX "pagamento_pix_barbearia_id_criado_em_idx" ON "pagamento_pix"("barbearia_id", "criado_em");
