export type EstadoDaBarra = "expandida" | "recolhida";

export const CHAVE_DA_BARRA = "painel.barra";

export function lerBarra(): EstadoDaBarra | null {
  if (typeof window === "undefined") return null;
  const guardado = window.localStorage.getItem(CHAVE_DA_BARRA);
  return guardado === "expandida" || guardado === "recolhida" ? guardado : null;
}

export function gravarBarra(estado: EstadoDaBarra): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CHAVE_DA_BARRA, estado);
}

// Só o estado recolhido vira atributo. Expandida é o que o CSS já faz
// sem nenhuma marca — gravar "expandida" no <html> criaria um segundo
// estado para cada regra manter, sem nada em troca.
export function aplicarBarra(estado: EstadoDaBarra): void {
  if (estado === "recolhida") {
    document.documentElement.setAttribute("data-barra", "recolhida");
  } else {
    document.documentElement.removeAttribute("data-barra");
  }
}

// Roda no <head>, antes da primeira pintura — daí ser string e não
// componente. Sem ele a barra nasce com 260px e salta para 72px quando
// o React monta, que é o pisca que o estado gravado existe para evitar.
//
// Usa setAttribute("data-barra", ...) e não .dataset.barra de propósito:
// isto vira <script> literal no HTML e o teste verifica essa substring.
export const SCRIPT_DA_BARRA = `(function(){try{
  if (localStorage.getItem("${CHAVE_DA_BARRA}") === "recolhida") {
    document.documentElement.setAttribute("data-barra", "recolhida");
  }
}catch(e){}})();`;
