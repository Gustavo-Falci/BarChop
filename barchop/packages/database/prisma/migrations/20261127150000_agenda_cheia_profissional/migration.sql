-- Aviso de agenda cheia pro profissional (plano agenda-cheia-profissional,
-- marco 3 do PRD agenda-cheia). A lotação da agenda de cada profissional:
-- desde quando o link não oferece horário dele até o fim da janela (nula =
-- tem horário), e o dia de São Paulo do último aviso — um por lotação, no
-- máximo um por dia. As mesmas colunas que a barbearia ganhou no marco 2.
--
-- Escrita à mão, como as anteriores: aplicar com `migrate deploy`.
-- Só acrescenta colunas anuláveis: a API anterior as ignora.

ALTER TABLE "barbeiro" ADD COLUMN "agenda_cheia_desde" TIMESTAMPTZ;
ALTER TABLE "barbeiro" ADD COLUMN "agenda_cheia_avisada_em" DATE;
