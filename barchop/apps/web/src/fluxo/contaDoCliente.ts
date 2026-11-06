import type { ErroDaApi } from "@barchop/api-client";
import {
  normalizarEmail,
  normalizarTelefoneObrigatorio,
  TelefoneInvalido,
} from "@barchop/formato";

// O que o Entrar e o Criar conta conferem igual. Os mesmos limites dos
// schemas de apps/api/src/routers/auth-cliente.ts: cortar na digitação
// evita o 400 que voltaria sem dizer qual campo passou do tamanho.
export const NOME_MAX = 120;
export const EMAIL_MAX = 160;
export const TELEFONE_MAX = 20;
export const SENHA_MAX = 200;
export const SENHA_MIN = 8;
// O mesmo PADRAO_EMAIL da API (apps/api/src/lib/padroes.ts).
const PARECE_EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export type Conferido = { valor: string; erro?: undefined } | { valor?: undefined; erro: string };

// A mesma normalização da API: é o e-mail em minúsculas que ela busca e
// que vira a chave do código.
export function conferirEmail(texto: string): Conferido {
  const normalizado = normalizarEmail(texto);
  if (!normalizado || !PARECE_EMAIL.test(normalizado)) {
    return { erro: "Informe um e-mail válido, como voce@exemplo.com" };
  }
  return { valor: normalizado };
}

// A mesma função que a API usa pra guardar o telefone.
export function conferirTelefone(texto: string): Conferido {
  try {
    return { valor: normalizarTelefoneObrigatorio(texto) };
  } catch (causa) {
    return {
      erro:
        causa instanceof TelefoneInvalido
          ? "Informe o DDD e o número, como (11) 99999-8888"
          : "Telefone inválido",
    };
  }
}

export function mensagemDoLimite(erro: ErroDaApi): string {
  // Dizer que foi o limite, e não "senha incorreta", é o que evita a
  // pessoa certa duvidar de uma senha que estava certa. A mensagem da
  // API já diz quanto esperar.
  return erro.mensagem || "Muitas tentativas. Espere um pouco antes de tentar de novo.";
}
