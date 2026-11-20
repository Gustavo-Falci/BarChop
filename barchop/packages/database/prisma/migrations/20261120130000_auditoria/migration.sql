-- Trilha de auditoria (auditoria de segurança de 15/11, SEC-008 e
-- SEC-009). O Suporte da plataforma confirma pagamentos, troca links e
-- publica avisos pra todos os donos, e nada registrava quem fez o quê.
-- Sem trilha não dá pra apurar um incidente nem responder a um titular
-- quem mexeu no dado dele.
--
-- Uma linha por ação. Só acrescenta: ninguém edita nem apaga por rota. A
-- faxina diária apaga o que passou de dois anos
-- (apps/api/src/lib/faxina.ts).
--
-- Sem chave estrangeira, de propósito: a linha tem que sobreviver à
-- exclusão do que ela descreve (a barbearia encerrada, o operador
-- removido). Os ids ficam como estavam.
--
-- `detalhe` leva o mínimo pra entender a ação (o link de antes e o de
-- depois, o valor do Pix). Nunca senha, token, código nem dado de
-- cliente final.
--
-- Escrita à mão, como as anteriores: aplicar com `migrate deploy`.
-- Só acrescenta: a API anterior não lê nada disto.
--
-- Desfazer (se um dia preciso, numa migration nova): remover a tabela
-- "auditoria".

CREATE TABLE "auditoria" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "criado_em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ator_tipo" VARCHAR(20) NOT NULL,
    "ator_id" UUID,
    "acao" VARCHAR(60) NOT NULL,
    "alvo_tipo" VARCHAR(40),
    "alvo_id" UUID,
    "barbearia_id" UUID,
    "detalhe" JSONB,
    "ip" VARCHAR(45),

    CONSTRAINT "auditoria_pkey" PRIMARY KEY ("id")
);

-- A faxina apaga por data; a apuração lê por data, por ator e por
-- barbearia.
CREATE INDEX "auditoria_criado_em_idx" ON "auditoria"("criado_em");
CREATE INDEX "auditoria_ator_id_criado_em_idx" ON "auditoria"("ator_id", "criado_em");
CREATE INDEX "auditoria_barbearia_id_criado_em_idx" ON "auditoria"("barbearia_id", "criado_em");
