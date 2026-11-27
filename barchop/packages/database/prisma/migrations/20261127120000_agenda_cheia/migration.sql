-- Aviso de agenda cheia pro dono (plano agenda-cheia-dono, marco 2 do
-- PRD agenda-cheia). A lotação da barbearia: desde quando o link não
-- oferece horário nenhum até o fim da janela de agendamento (nula = tem
-- horário), e o dia de São Paulo do último aviso aos donos — um por
-- lotação, no máximo um por dia.
--
-- Escrita à mão, como as anteriores: aplicar com `migrate deploy`.
-- Só acrescenta colunas anuláveis: a API anterior as ignora.

ALTER TABLE "barbearia" ADD COLUMN "agenda_cheia_desde" TIMESTAMPTZ;
ALTER TABLE "barbearia" ADD COLUMN "agenda_cheia_avisada_em" DATE;
