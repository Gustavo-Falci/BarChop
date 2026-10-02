export type Tema = "claro" | "escuro";

export const CHAVE_DO_TEMA = "painel.tema";

// O atributo é em inglês porque é o que o CSS lê, e o que o resto do
// mundo espera encontrar num data-theme.
const ATRIBUTO: Record<Tema, string> = { claro: "light", escuro: "dark" };

export function lerTema(): Tema | null {
  if (typeof window === "undefined") return null;
  const guardado = window.localStorage.getItem(CHAVE_DO_TEMA);
  return guardado === "claro" || guardado === "escuro" ? guardado : null;
}

export function gravarTema(tema: Tema): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CHAVE_DO_TEMA, tema);
}

export function temaDoSistema(): Tema {
  if (typeof window === "undefined") return "claro";
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "escuro"
    : "claro";
}

// No <html>, e não numa div do layout do grupo: o body pinta o fundo da
// página lendo var(--cor-paper) do :root, e custom property redeclarada
// numa div não chega até ele.
export function aplicarTema(tema: Tema): void {
  document.documentElement.dataset.theme = ATRIBUTO[tema];
}

// Roda no <head>, antes da primeira pintura — daí ser string e não
// componente. `location.pathname` é a única informação de rota
// disponível antes de o React montar, e é o que evita o pisca.
//
// Usa setAttribute("data-theme", ...) em vez de .dataset.theme de
// propósito: isto é uma string que vira <script> literal no HTML, e o
// teste verifica o texto "data-theme" nela. .dataset.theme faz a mesma
// coisa no DOM, mas nunca produz essa substring — não troque um pelo
// outro achando que é limpeza.
export const SCRIPT_DE_TEMA = `(function(){try{
  var noPainel = location.pathname === "/painel" || location.pathname.indexOf("/painel/") === 0;
  if (!noPainel) { document.documentElement.setAttribute("data-theme", "light"); return; }
  var guardado = localStorage.getItem("${CHAVE_DO_TEMA}");
  var tema = guardado === "claro" || guardado === "escuro" ? guardado : null;
  if (!tema) {
    tema = matchMedia("(prefers-color-scheme: dark)").matches ? "escuro" : "claro";
    localStorage.setItem("${CHAVE_DO_TEMA}", tema);
  }
  document.documentElement.setAttribute("data-theme", tema === "escuro" ? "dark" : "light");
}catch(e){}})();`;
