import { normalizarTelefoneObrigatorio } from "@barchop/formato";

// Vazio vira null, que é o que a API aceita pra limpar o campo; string
// vazia seria 400 do pattern. Telefone sem DDD lança TelefoneInvalido,
// que a subtela transforma em erro no campo.
export function telefoneOuNulo(digitado: string): string | null {
  return digitado.trim() ? normalizarTelefoneObrigatorio(digitado) : null;
}

export const MENSAGEM_DO_TELEFONE = "Informe o DDD e o número, como (11) 99999-8888";
