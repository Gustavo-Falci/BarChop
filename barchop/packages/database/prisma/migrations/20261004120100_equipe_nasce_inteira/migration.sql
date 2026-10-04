-- Dado, separado do esquema (20261004120000_jornada_servicos_bloqueio):
-- os membros que já existiam ganham o que o trigger dá aos novos — sete
-- dias acompanhando a barbearia e todos os serviços dela. O
-- comportamento de hoje não muda: "acompanha a barbearia" em todo dia é
-- exatamente o que a disponibilidade já fazia.
--
-- ON CONFLICT porque a migration pode rodar num banco onde algum membro
-- foi criado depois do trigger existir.
--
-- Desfazer: esvaziar jornada_profissional e profissional_servico — o
-- comportamento volta a depender só do funcionamento, como antes.

INSERT INTO "jornada_profissional" ("barbeiro_id", "dia_semana")
SELECT b."id", dia
FROM "barbeiro" AS b
CROSS JOIN generate_series(0, 6) AS dia
ON CONFLICT ("barbeiro_id", "dia_semana") DO NOTHING;

INSERT INTO "profissional_servico" ("barbeiro_id", "servico_id")
SELECT b."id", s."id"
FROM "barbeiro" AS b
JOIN "servico" AS s ON s."barbearia_id" = b."barbearia_id"
ON CONFLICT DO NOTHING;
