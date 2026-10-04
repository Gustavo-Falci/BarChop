import type { PerfilPublicoBarbearia } from "@barchop/types";

type Profissional = PerfilPublicoBarbearia["barbeiros"][number];

// Quem faz TODOS os serviços escolhidos. A lista do perfil público já
// vem só com quem pode atender (o mesmo critério da API); aqui sai quem
// não faz algum dos serviços. É o mesmo corte que o "qualquer um" da API
// faz — a tela não pode oferecer quem a API recusaria.
export function profissionaisQueFazem(
  barbeiros: Profissional[],
  servicoIds: string[]
): Profissional[] {
  return barbeiros.filter((barbeiro) =>
    servicoIds.every((id) => barbeiro.servicoIds.includes(id))
  );
}
