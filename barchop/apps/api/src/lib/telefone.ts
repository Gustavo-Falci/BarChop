import * as formato from "@barchop/formato";
import { TelefoneInvalido } from "@barchop/formato";
import { ErroDeNegocio } from "./erro-negocio";

// A regra mora em @barchop/formato, porque as telas gravam no mesmo
// campo e precisam da mesma normalização. O que fica aqui é só a
// tradução: o pacote lança TelefoneInvalido, que não sabe o que é HTTP,
// e as rotas respondem 422 com `telefone_invalido` desde a fase 6.
function traduzindo<T>(executar: () => T): T {
  try {
    return executar();
  } catch (erro) {
    if (erro instanceof TelefoneInvalido) {
      throw new ErroDeNegocio(erro.message, "telefone_invalido");
    }
    throw erro;
  }
}

export function normalizarTelefone(
  telefone: string | null | undefined
): string | null {
  return traduzindo(() => formato.normalizarTelefone(telefone));
}

export function normalizarTelefoneObrigatorio(telefone: string): string {
  return traduzindo(() => formato.normalizarTelefoneObrigatorio(telefone));
}

// Não lança, então não passa pela tradução.
export const apenasDigitos = formato.apenasDigitos;
