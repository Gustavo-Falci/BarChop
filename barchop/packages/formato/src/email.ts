// A coluna é VARCHAR com índice único simples — sem citext e sem índice
// funcional, o Postgres compara caixa a caixa. Sem normalizar,
// "Gu@Exemplo.com" e "gu@exemplo.com" viram duas contas distintas, e
// quem cadastrou numa não entra pela outra. A mesma função na gravação
// e na busca, senão a busca nunca acha o que a gravação guardou.
export function normalizarEmail(
  email: string | null | undefined
): string | null {
  return email ? email.trim().toLowerCase() : null;
}
