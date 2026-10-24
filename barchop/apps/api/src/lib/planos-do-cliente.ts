// Os planos que a barbearia e os barbeiros vendem ao cliente (Onda 2,
// marco 3). A conta mora em @barchop/formato (planos-do-cliente.ts);
// aqui, o que a API lê do banco pra mais de uma rota.

// A conta que recebe a mensalidade de um plano: a da casa pro plano da
// casa; a pessoal do vendedor pro plano dele. A conta pessoal do dono
// não recebe plano da casa, nem a da casa o plano dele. Sobre as contas
// já lidas da barbearia (a vitrine lê todas de uma vez); o "assinar
// online" (PR 10) usa a mesma regra.
export function temContaQueRecebe(
  contas: readonly { barbeiroId: string; daCasa: boolean }[],
  vendedorId: string | null
): boolean {
  return contas.some((conta) => (vendedorId === null ? conta.daCasa : !conta.daCasa && conta.barbeiroId === vendedorId));
}
