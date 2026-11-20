-- Contadores de limite por conta (auditoria de segurança de 15/11,
-- SEC-002). Os limites por conta (login, definir senha, aceitar convite,
-- pedir código) moravam num LRU de 5.000 chaves em memória: inundar a
-- rota com chaves novas despejava a da conta-alvo, e reiniciar a API
-- zerava todas. Aqui não há despejo, e o contador sobrevive ao deploy.
--
-- `chave` é o SHA-256 da chave do contador ("login-barbeiro:<e-mail>"),
-- nunca o texto: a chave leva e-mail ou telefone de quem tentou entrar,
-- inclusive de quem nunca foi cliente.
--
-- Uma linha por chave, reaproveitada a cada janela: `expira_em` é o fim
-- da janela corrente. Linha vencida não vale nada e a faxina diária
-- apaga (apps/api/src/lib/faxina.ts).
--
-- Escrita à mão, como as anteriores: aplicar com `migrate deploy`.
-- Só acrescenta: a API anterior não lê nada disto.
--
-- Desfazer (se um dia preciso, numa migration nova):
--   DROP TABLE "contador_de_limite";

CREATE TABLE "contador_de_limite" (
    "chave" CHAR(64) NOT NULL,
    "contagem" INTEGER NOT NULL,
    "expira_em" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "contador_de_limite_pkey" PRIMARY KEY ("chave")
);

-- A faxina apaga por vencimento.
CREATE INDEX "contador_de_limite_expira_em_idx" ON "contador_de_limite"("expira_em");
