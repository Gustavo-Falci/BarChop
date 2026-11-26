-- Conta as linhas de cada tabela da aplicação, uma por linha:
-- "esquema.tabela|linhas". Contagem exata (count(*)), não a estimativa
-- das estatísticas: serve pra comparar o banco antes e depois de uma
-- troca de versão maior do Postgres (infra/README.md, "Trocar a versão
-- maior do Postgres").
--
-- Só lê. Rodar como o superusuário, com a API parada, pra contagem não
-- mudar entre o antes e o depois:
--   psql -X -At -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f contar-linhas.sql

SELECT
  format('%I.%I', n.nspname, c.relname) AS tabela,
  (xpath(
    '/row/n/text()',
    query_to_xml(format('SELECT count(*) AS n FROM %I.%I', n.nspname, c.relname), false, true, '')
  ))[1]::text::bigint AS linhas
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind IN ('r', 'p')
  AND n.nspname IN ('public', 'pgboss')
ORDER BY 1;
