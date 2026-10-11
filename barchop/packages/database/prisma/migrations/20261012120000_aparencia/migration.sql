-- A Aparência da página pública (plano .claude/plans/aparencia.plan.md,
-- marco B). Duas colunas JSON:
--   - `aparencia`: o que está no ar. Nula = o tema BarChop de sempre —
--     nenhuma barbearia muda de visual sem o dono publicar.
--   - `aparencia_rascunho`: o que o dono mexeu e ainda não publicou,
--     guardado até ele publicar ou descartar (decisão do dono,
--     2026-10-11). Nula = nada pendente.
--
-- Sem CHECK nos valores: quem valida é a API, contra as listas de
-- packages/formato/src/aparencia.ts, e quem lê normaliza (o que não se
-- conhece cai no padrão). O CHECK só garante que é um objeto.
--
-- Escrita à mão, como as outras desde a init: aplicar com `migrate deploy`.
--
-- Desfazer (se um dia preciso, numa migration nova):
--   ALTER TABLE "barbearia" DROP COLUMN "aparencia", DROP COLUMN "aparencia_rascunho";

ALTER TABLE "barbearia"
  ADD COLUMN "aparencia" JSONB
    CONSTRAINT "barbearia_aparencia_check"
      CHECK ("aparencia" IS NULL OR jsonb_typeof("aparencia") = 'object'),
  ADD COLUMN "aparencia_rascunho" JSONB
    CONSTRAINT "barbearia_aparencia_rascunho_check"
      CHECK ("aparencia_rascunho" IS NULL OR jsonb_typeof("aparencia_rascunho") = 'object');
