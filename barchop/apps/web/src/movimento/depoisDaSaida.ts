// A janela (<dialog>) sai pelo CSS (globals.css: fade e escala com
// `overlay`/`display` allow-discrete), mas quem a abriu a desmonta no
// `close` — e a saída morreria no primeiro quadro. Daqui, o aviso de
// "fechou" só sai quando as animações do elemento acabam (motion PR 2).
//
// `getAnimations` também força o estilo novo: as transições do fechar já
// estão na lista quando ela volta. Sem a API (jsdom, navegador antigo)
// ou sem animação nenhuma (reduzir movimento as zera), avisa na hora.
export function depoisDaSaida(elemento: Element | null, feito: () => void): void {
  const animacoes = elemento?.getAnimations?.() ?? [];
  if (animacoes.length === 0) {
    feito();
    return;
  }
  // allSettled: uma animação cancelada rejeita o `finished`, e a janela
  // não pode ficar montada por isso.
  void Promise.allSettled(animacoes.map((animacao) => animacao.finished)).then(feito);
}
