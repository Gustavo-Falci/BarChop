import { hkdfSync } from "node:crypto";

// O segredo do servidor e as chaves derivadas dele (auditoria de 15/11,
// SEC-015). Antes, o JWT_SECRET só precisava existir, e a mesma cadeia
// assinava os tokens e fazia o HMAC dos códigos de verificação.

// 32 caracteres: o `openssl rand -hex 48` que o infra/api.env.example
// manda usar dá 96. Segredo curto se quebra offline a partir de qualquer
// token — e com ele se forja token de qualquer tipo, suporte inclusive.
export const TAMANHO_MINIMO_DO_SEGREDO = 32;

// Lança quando falta ou é curto: é aqui que a API se recusa a subir,
// como faz com as outras variáveis de produção. A mensagem não leva o
// valor, nem um pedaço dele.
export function segredoDoServidor(ambiente: Record<string, string | undefined> = process.env): string {
  const segredo = ambiente.JWT_SECRET;
  if (!segredo) {
    throw new Error("JWT_SECRET não definido — veja apps/api/.env.example");
  }
  if (segredo.length < TAMANHO_MINIMO_DO_SEGREDO) {
    throw new Error(
      `JWT_SECRET curto demais: tem ${segredo.length} caracteres e o mínimo é ${TAMANHO_MINIMO_DO_SEGREDO}. ` +
        "Gere outro com `openssl rand -hex 48`."
    );
  }
  return segredo;
}

// A chave do HMAC dos códigos de verificação: derivada do segredo, com
// rótulo próprio. Quem vê um hash de código não aprende nada sobre a
// chave que assina os tokens, e vice-versa. Derivar, em vez de pedir
// outra variável, não acrescenta segredo nenhum pra guardar.
export function chaveDosCodigos(ambiente: Record<string, string | undefined> = process.env): Buffer {
  return Buffer.from(
    hkdfSync("sha256", segredoDoServidor(ambiente), Buffer.alloc(0), "barchop:codigo-de-verificacao", 32)
  );
}
