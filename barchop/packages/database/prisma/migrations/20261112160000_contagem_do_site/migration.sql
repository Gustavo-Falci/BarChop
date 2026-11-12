-- Contagens agregadas do site (home nova, marco 1: linha de base de
-- visita → cadastro; plano .claude/plans/home-nova-linha-de-base.plan.md).
--
-- Uma linha por dia e evento, só o total. Nada que identifique quem
-- visitou: sem IP, sem navegador, sem id — por isso não pede cookie nem
-- consentimento. A lista de eventos mora no código
-- (EVENTOS_DO_SITE, apps/api/src/lib/contagem-do-site.ts).
--
-- Escrita à mão, como as anteriores: aplicar com `migrate deploy`.
-- Só acrescenta: a API anterior não lê nada disto.
--
-- Desfazer (se um dia preciso, numa migration nova):
--   DROP TABLE "contagem_do_site";

CREATE TABLE "contagem_do_site" (
    "dia" DATE NOT NULL,
    "evento" VARCHAR(40) NOT NULL,
    "total" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "contagem_do_site_pkey" PRIMARY KEY ("dia", "evento")
);
