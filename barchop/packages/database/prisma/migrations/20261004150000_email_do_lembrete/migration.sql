-- O e-mail que o cliente digita ao marcar pela página pública, pra
-- receber o lembrete daquele agendamento (Onda 1, Bloco D4).
--
-- No agendamento, e NUNCA no cadastro do cliente: o cadastro é achado
-- pelo telefone, e o e-mail dele é o login do cliente (código por
-- e-mail). Gravar ali o que qualquer um digita deixaria quem sabe o
-- telefone de alguém trocar o e-mail dessa pessoa — e receber os links
-- de cancelar dela e entrar na conta dela. Aqui ele só serve a este
-- agendamento, que foi quem digitou que marcou.
--
-- O lembrete vai pra este e-mail; sem ele, pro e-mail do cadastro.
--
-- Escrita à mão, e não gerada por `prisma migrate dev`: o `migrate dev`
-- propõe DERRUBAR `agendamento.periodo` (ver o aviso no fim de
-- 20260829120000_init/migration.sql). Aplicar com `migrate deploy`.
--
-- Desfazer (se um dia preciso, numa migration nova):
--   ALTER TABLE "agendamento" DROP COLUMN "email_lembrete";

ALTER TABLE "agendamento" ADD COLUMN "email_lembrete" VARCHAR(160);
