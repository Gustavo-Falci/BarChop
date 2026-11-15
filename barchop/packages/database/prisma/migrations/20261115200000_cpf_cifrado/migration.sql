-- CPF cifrado (auditoria de segurança de 15/11, SEC-009). O CPF de quem
-- assina um plano online ficava em claro em "cliente"."cpf" — e, por
-- isso, em todo backup. Passa a ser guardado cifrado (AES-256-GCM com a
-- CHAVE_DE_CIFRA, a mesma das chaves de pagamento), numa coluna nova.
--
-- A coluna antiga fica, nula pra todo CPF novo. Os que já estavam em
-- claro a faxina diária cifra e apaga (apps/api/src/lib/cpf.ts): cifrar
-- pede a chave do ambiente, que o SQL não tem. Quando não sobrar nenhum
-- em claro, uma migration futura tira a coluna "cpf".
--
-- Escrita à mão, como as anteriores: aplicar com `migrate deploy`.
-- Só acrescenta: a API anterior ignora a coluna nova e segue lendo a
-- antiga.

ALTER TABLE "cliente" ADD COLUMN "cpf_cifrado" BYTEA;
