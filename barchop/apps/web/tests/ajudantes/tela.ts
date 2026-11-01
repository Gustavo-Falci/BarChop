// O jsdom não tem `matchMedia`, e o painel o chama com `?.` — nos
// testes, a tela é sempre a do desktop. Este ajudante faz a tela ter a
// largura de um celular (390px por padrão) e devolve como desfazer, pra
// o `afterEach` chamar. Uma consulta `(max-width: Npx)` casa quando a
// largura cabe nela: a 390px valem a barra de baixo (900px) e a lista do
// celular da Tabela (640px); a 700px, só a barra de baixo.
export function comTelaDeCelular(largura = 390): () => void {
  const antes = Object.getOwnPropertyDescriptor(window, "matchMedia");
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (consulta: string): MediaQueryList => {
      const limite = /max-width:\s*(\d+)px/.exec(consulta);
      return {
        matches: limite ? largura <= Number(limite[1]) : false,
        media: consulta,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      };
    },
  });
  return () => {
    if (antes) Object.defineProperty(window, "matchMedia", antes);
    else delete (window as { matchMedia?: unknown }).matchMedia;
  };
}
