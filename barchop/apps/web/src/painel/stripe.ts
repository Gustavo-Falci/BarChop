// O pagamento é todo nas páginas da Stripe (Checkout e Portal): o painel
// só leva o dono até lá. Num módulo à parte pra os testes trocarem a
// saída, que o jsdom não faz.
export function irParaAStripe(url: string): void {
  window.location.assign(url);
}
