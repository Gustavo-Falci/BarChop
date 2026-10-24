// O jsdom não tem `matchMedia`, e o painel o chama com `?.` — nos
// testes, a tela é sempre a do desktop. Este ajudante faz a tela ser a de
// um celular (abaixo de 900px, o corte da barra inferior) e devolve como
// desfazer, pra o `afterEach` chamar.
export function comTelaDeCelular(): () => void {
  const antes = Object.getOwnPropertyDescriptor(window, "matchMedia");
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (consulta: string): MediaQueryList => ({
      matches: consulta.includes("max-width: 900px"),
      media: consulta,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
  return () => {
    if (antes) Object.defineProperty(window, "matchMedia", antes);
    else delete (window as { matchMedia?: unknown }).matchMedia;
  };
}
