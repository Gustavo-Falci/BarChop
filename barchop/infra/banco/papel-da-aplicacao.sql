-- Tira a aplicação do superusuário do Postgres (auditoria de segurança
-- de 15/11, SEC-010).
--
-- A API e a migração conectavam com o POSTGRES_USER, que é o superusuário
-- que a imagem cria. Um superusuário lê e escreve arquivos do servidor e
-- roda programas nele (`COPY ... PROGRAM`): uma injeção de SQL na API
-- virava execução de comando no contêiner do banco. Com um papel comum,
-- o pior que a aplicação alcança é o que ela já alcança — os dados dela.
--
-- O que este roteiro faz, numa transação só:
--   1. cria o papel `barchop_app` (ou só troca a senha, se já existe);
--   2. passa pra ele os esquemas `public` e `pgboss` e tudo o que há
--      dentro: tabelas, sequências, visões, tipos e funções;
--   3. deixa ele criar esquema no banco (o pg-boss cria o dele).
-- As extensões (pgcrypto, btree_gist) continuam do superusuário: já estão
-- instaladas, e as migrations só as criam "se não existir".
--
-- Não mexe em linha nenhuma. Rodar de novo não faz mal.
--
-- Como rodar: infra/README.md, "Papel do banco". Em resumo, com a API
-- parada, como o superusuário, com a senha vinda de uma variável:
--   psql -v ON_ERROR_STOP=1 -v senha="$APP_DB_PASSWORD" -f papel-da-aplicacao.sql
--
-- O backup continua com o superusuário: ele precisa ler tudo, e não
-- recebe nada de fora.

\if :{?senha}
\else
  \echo 'faltou a senha: psql -v senha=... (gere com openssl rand -hex 24)'
  \quit
\endif

BEGIN;

-- A senha chega pelo psql (:'senha' vira literal escapado). O DO não
-- enxerga variável do psql, então ela passa por uma configuração que só
-- vale nesta transação.
SELECT set_config('barchop.senha_do_app', :'senha', true) AS senha_recebida \gset
\unset senha_recebida

DO $$
DECLARE
  senha text := current_setting('barchop.senha_do_app');
BEGIN
  IF length(senha) < 24 THEN
    RAISE EXCEPTION 'senha curta demais: gere com openssl rand -hex 24';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'barchop_app') THEN
    EXECUTE format(
      'CREATE ROLE barchop_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L',
      senha
    );
  ELSE
    EXECUTE format(
      'ALTER ROLE barchop_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L',
      senha
    );
  END IF;
END
$$;

-- CREATE no banco: criar esquema (o do pg-boss, numa instalação nova).
DO $$
BEGIN
  EXECUTE format('GRANT CONNECT, CREATE, TEMPORARY ON DATABASE %I TO barchop_app', current_database());
END
$$;

DO $$
DECLARE
  esquema text;
  item record;
BEGIN
  FOREACH esquema IN ARRAY ARRAY['public', 'pgboss'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = esquema) THEN
      CONTINUE;
    END IF;

    EXECUTE format('ALTER SCHEMA %I OWNER TO barchop_app', esquema);

    -- Tabelas (comuns e particionadas), sequências, visões e visões
    -- materializadas. Os índices vão junto com a tabela. Fica de fora o
    -- que pertence a uma extensão.
    FOR item IN
      SELECT c.oid::regclass AS nome, c.relkind
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = esquema
        AND c.relkind IN ('r', 'p', 'S', 'v', 'm')
        AND NOT EXISTS (
          SELECT 1 FROM pg_depend d
          WHERE d.classid = 'pg_class'::regclass AND d.objid = c.oid AND d.deptype = 'e'
        )
        -- A sequência de uma coluna serial ou identity segue a tabela.
        AND NOT (
          c.relkind = 'S' AND EXISTS (
            SELECT 1 FROM pg_depend d
            WHERE d.classid = 'pg_class'::regclass AND d.objid = c.oid AND d.deptype IN ('a', 'i')
          )
        )
    LOOP
      EXECUTE format(
        'ALTER %s %s OWNER TO barchop_app',
        CASE item.relkind
          WHEN 'S' THEN 'SEQUENCE'
          WHEN 'v' THEN 'VIEW'
          WHEN 'm' THEN 'MATERIALIZED VIEW'
          ELSE 'TABLE'
        END,
        item.nome
      );
    END LOOP;

    -- Tipos próprios: enums, domínios e faixas. O tipo de linha de cada
    -- tabela já foi com ela.
    FOR item IN
      SELECT t.oid::regtype AS nome
      FROM pg_type t
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = esquema
        AND t.typtype IN ('e', 'd', 'r')
        AND NOT EXISTS (
          SELECT 1 FROM pg_depend d
          WHERE d.classid = 'pg_type'::regclass AND d.objid = t.oid AND d.deptype = 'e'
        )
    LOOP
      EXECUTE format('ALTER TYPE %s OWNER TO barchop_app', item.nome);
    END LOOP;

    -- Funções e procedimentos (os gatilhos das migrations e o que o
    -- pg-boss cria). As das extensões ficam com quem instalou.
    FOR item IN
      SELECT p.oid::regprocedure AS nome, p.prokind
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = esquema
        AND p.prokind IN ('f', 'p')
        AND NOT EXISTS (
          SELECT 1 FROM pg_depend d
          WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e'
        )
    LOOP
      EXECUTE format(
        'ALTER %s %s OWNER TO barchop_app',
        CASE item.prokind WHEN 'p' THEN 'PROCEDURE' ELSE 'FUNCTION' END,
        item.nome
      );
    END LOOP;
  END LOOP;
END
$$;

COMMIT;

-- Conferência: não pode sobrar nada do `public` nem do `pgboss` com
-- outro dono, fora o que é de extensão. Tem que devolver zero linhas.
SELECT n.nspname AS esquema, c.relname AS objeto, r.rolname AS dono
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_roles r ON r.oid = c.relowner
WHERE n.nspname IN ('public', 'pgboss')
  AND c.relkind IN ('r', 'p', 'S', 'v', 'm')
  AND r.rolname <> 'barchop_app'
  AND NOT EXISTS (
    SELECT 1 FROM pg_depend d
    WHERE d.classid = 'pg_class'::regclass AND d.objid = c.oid AND d.deptype = 'e'
  );
