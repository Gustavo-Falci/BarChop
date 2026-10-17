// O enum da API é vocabulário de banco, não de conversa: `no_show` e
// `concluido` em cru numa tela em português destoam do resto, e um
// status novo que a tela ainda não conhece cai no próprio valor cru em
// vez de quebrar. Promovido de MinhaConta.tsx (sub-projeto B) pra cá: a
// mesma regra vale no painel, e as telas que a ignoravam (o painel
// mostra o enum cru em cinco botões e numa coluna de histórico) não
// tinham como saber que a convenção já existia numa tela de outro
// sub-projeto.
const ROTULO_DO_STATUS: Record<string, string> = {
  pendente: "pendente",
  confirmado: "confirmado",
  concluido: "concluído",
  cancelado: "cancelado",
  no_show: "não compareceu",
};

export function rotuloDoStatus(status: string): string {
  return ROTULO_DO_STATUS[status] ?? status;
}

// A cor do status, a mesma em toda tela que mostra um agendamento (o
// detalhe, o histórico do cliente): o cliente pintava "confirmado" de
// verde e "concluído" de neutro, ao contrário do detalhe (17/10).
export const TOM_DO_STATUS: Record<string, "acento" | "neutro" | "ok" | "atencao" | "erro"> = {
  pendente: "atencao",
  confirmado: "acento",
  concluido: "ok",
  cancelado: "erro",
  no_show: "erro",
};
