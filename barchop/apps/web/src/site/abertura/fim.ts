import { CLASSE_DA_ABERTURA } from "./script";

// Quem precisa da tela parada (a cadeira 3D do marco 3) espera a abertura
// acabar: a classe sai do <html> no fim, ao pular ou pela trava do
// script. Sem abertura, segue na hora.
export function depoisDaAbertura(): Promise<void> {
  const html = document.documentElement;
  if (!html.classList.contains(CLASSE_DA_ABERTURA)) return Promise.resolve();
  return new Promise((resolve) => {
    const observador = new MutationObserver(() => {
      if (html.classList.contains(CLASSE_DA_ABERTURA)) return;
      observador.disconnect();
      resolve();
    });
    observador.observe(html, { attributes: true, attributeFilter: ["class"] });
  });
}
