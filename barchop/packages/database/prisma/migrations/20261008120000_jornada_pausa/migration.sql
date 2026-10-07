-- Pausa do almoço na jornada de cada profissional (painel v2, marco 3;
-- decisão do dono, 2026-10-07: a pausa é de cada um, por dia da semana).
--
-- `pausa_inicio` e `pausa_fim`: a faixa do dia em que o membro não
-- atende. Vale em qualquer modo que trabalhe (acompanha a barbearia ou
-- horário próprio); a disponibilidade trata como um intervalo ocupado,
-- igual a um bloqueio de horas, então pausa fora da janela do dia não
-- tem efeito. Folga não tem pausa.
--
-- Colunas anuláveis sem DEFAULT: só catálogo, sem reescrever a tabela.
--
-- Escrita à mão, e não gerada por `prisma migrate dev`: o `migrate dev`
-- propõe DERRUBAR `agendamento.periodo` (ver o aviso no fim de
-- 20260829120000_init/migration.sql). Aplicar com `migrate deploy`.
--
-- Desfazer (se um dia preciso, numa migration nova):
--   ALTER TABLE "jornada_profissional" DROP CONSTRAINT "jornada_pausa_inteira";
--   ALTER TABLE "jornada_profissional" DROP COLUMN "pausa_inicio", DROP COLUMN "pausa_fim";

ALTER TABLE "jornada_profissional"
    ADD COLUMN "pausa_inicio" TIME,
    ADD COLUMN "pausa_fim" TIME;

-- Pausa inteira ou nenhuma, na ordem do relógio, e nunca na folga: os
-- mesmos estados que o PUT /equipe/:id/jornada deixa gravar.
ALTER TABLE "jornada_profissional" ADD CONSTRAINT "jornada_pausa_inteira" CHECK (
    ("pausa_inicio" IS NULL AND "pausa_fim" IS NULL)
    OR (
        "modo" <> 'folga'
        AND "pausa_inicio" IS NOT NULL
        AND "pausa_fim" IS NOT NULL
        AND "pausa_inicio" < "pausa_fim"
    )
);
