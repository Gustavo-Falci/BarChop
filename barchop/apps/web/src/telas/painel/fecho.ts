// Onde o fecho (resumo e "Agendar") fica na coluna ao lado: alinhado ao
// topo do passo que está aberto, para ficar sempre na altura do que se
// está preenchendo.
//
// Função pura e separada do componente porque é a única parte disto que
// dá para provar sem um navegador — as medidas entram por parâmetro, e
// quem as lê do DOM é a tela.
export function deslocamentoDoFecho({
  topoDoPasso,
  altura,
  alturaDoFecho,
}: {
  // Distância do topo do passo aberto até o topo do quadro. `null`
  // quando não há passo aberto — o estado em que a tela termina.
  topoDoPasso: number | null;
  // Altura do quadro de passos.
  altura: number;
  alturaDoFecho: number;
}): number {
  if (topoDoPasso === null) return 0;

  // O fecho não passa do pé do quadro: alinhar pelo topo de um passo lá
  // embaixo o jogaria para fora e faria a página crescer só por causa
  // dele. Com o quadro mais baixo que o fecho, o limite é zero.
  const limite = Math.max(0, altura - alturaDoFecho);
  return Math.max(0, Math.min(topoDoPasso, limite));
}
