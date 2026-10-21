-- A ordem que o cliente vê (plano .claude/plans/arrastar-e-reordenar.plan.md,
-- PR 1). Hoje nada se reordena: serviços saem por nome, a equipe por
-- entrada, as categorias na ordem fixa de CATEGORIAS_DE_SERVICO. O dono
-- passa a arrastar, e a ordem fica gravada aqui.
--
--   - `servico.ordem` e `barbeiro.ordem`: de 10 em 10 dentro da
--     barbearia (espaço pra encaixar sem renumerar tudo). Só exibição:
--     o limite do plano Grátis e o "qualquer um" continuam por
--     `criado_em` (lib/assinatura.ts, lib/disponibilidade.ts) —
--     reordenar não pode esconder do link quem estava visível.
--   - `barbearia.ordem_categorias`: as categorias na ordem escolhida.
--     Vazia = a ordem padrão de CATEGORIAS_DE_SERVICO; a que faltar vai
--     pro fim, na ordem padrão (`ordenarCategorias`, @barchop/formato).
--     O CHECK tem a mesma lista do `servico_categoria_check`
--     (20261011120000_categoria_fechada).
--
-- Quem nasce, nasce no fim: o trigger preenche a ordem no insert quando
-- ela não vem, como os triggers da 20261004120000 garantem a jornada e
-- os serviços — vale pro signup, pro convite, pro seed e pro Prisma cru
-- dos testes, sem cada rota lembrar. Dois inserts ao mesmo tempo podem
-- empatar; o desempate é o `id`, e reordenar renumera.
--
-- Os preenchimentos seguem a ordem que cada tela mostra hoje. Poucas
-- linhas por barbearia: rodam junto com o DDL, como o UPDATE da caixa.
--
-- Escrita à mão, como as outras desde a init (o `migrate dev` propõe
-- derrubar `agendamento.periodo`): aplicar com `migrate deploy`.
--
-- Desfazer (se um dia preciso, numa migration nova):
--   DROP TRIGGER "servico_nasce_no_fim" ON "servico";
--   DROP TRIGGER "barbeiro_nasce_no_fim" ON "barbeiro";
--   DROP FUNCTION "nasce_no_fim_da_ordem"();
--   ALTER TABLE "servico" DROP COLUMN "ordem";
--   ALTER TABLE "barbeiro" DROP COLUMN "ordem";
--   ALTER TABLE "barbearia" DROP COLUMN "ordem_categorias";

ALTER TABLE "servico" ADD COLUMN "ordem" SMALLINT;
ALTER TABLE "barbeiro" ADD COLUMN "ordem" SMALLINT;

-- Preenche a ordem dos serviços (a da lista do painel: ativos primeiro, por nome)
UPDATE "servico" AS s
SET "ordem" = o.posicao * 10
FROM (
  SELECT "id", row_number() OVER (
    PARTITION BY "barbearia_id" ORDER BY "ativo" DESC, "nome" ASC, "id" ASC
  ) AS posicao
  FROM "servico"
) AS o
WHERE s."id" = o."id";

-- Preenche a ordem da equipe (por entrada, a do link público)
UPDATE "barbeiro" AS b
SET "ordem" = o.posicao * 10
FROM (
  SELECT "id", row_number() OVER (
    PARTITION BY "barbearia_id" ORDER BY "criado_em" ASC, "id" ASC
  ) AS posicao
  FROM "barbeiro"
) AS o
WHERE b."id" = o."id";

ALTER TABLE "servico" ALTER COLUMN "ordem" SET NOT NULL;
ALTER TABLE "barbeiro" ALTER COLUMN "ordem" SET NOT NULL;

-- Uma função pras duas tabelas: as duas têm `barbearia_id` e `ordem`.
CREATE FUNCTION "nasce_no_fim_da_ordem"() RETURNS trigger AS $$
BEGIN
    IF NEW."ordem" IS NULL THEN
        EXECUTE format(
            'SELECT coalesce(max("ordem"), 0) + 10 FROM %I WHERE "barbearia_id" = $1',
            TG_TABLE_NAME
        ) INTO NEW."ordem" USING NEW."barbearia_id";
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "servico_nasce_no_fim"
    BEFORE INSERT ON "servico"
    FOR EACH ROW EXECUTE FUNCTION "nasce_no_fim_da_ordem"();

CREATE TRIGGER "barbeiro_nasce_no_fim"
    BEFORE INSERT ON "barbeiro"
    FOR EACH ROW EXECUTE FUNCTION "nasce_no_fim_da_ordem"();

-- DEFAULT constante: o Postgres não reescreve a tabela.
ALTER TABLE "barbearia"
  ADD COLUMN "ordem_categorias" TEXT[] NOT NULL DEFAULT '{}'
    CONSTRAINT "barbearia_ordem_categorias_check" CHECK ("ordem_categorias" <@ ARRAY[
      'cabelo', 'barba', 'combo', 'sobrancelha', 'quimica', 'infantil'
    ]::TEXT[]);
