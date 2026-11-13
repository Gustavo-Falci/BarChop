// A abertura da navalha (home nova, marco 5) toca só na primeira visita
// da sessão. Quem decide é este script, inline no começo da home, antes
// da primeira pintura (o mesmo jeito do SCRIPT_DE_TEMA): só ele vê a
// página antes de o topo aparecer, e é o que evita o pisca do topo
// pronto antes de a abertura ligar.
//
// Liga a classe no <html> quando:
// - a pessoa não pediu "reduzir movimento";
// - o endereço não tem âncora (#planos vai direto pra seção);
// - não é o voltar do navegador;
// - a sessão ainda não viu (sessionStorage; F5 e voltar à home não
//   repetem). Navegador que recusa o sessionStorage fica sem abertura.
//
// E solta uma trava: se o JS da abertura não marcar o <html> como VIVA
// até lá, a classe sai e a home aparece como sempre, nunca no escuro.

export const CHAVE_DA_ABERTURA = "barchop:abertura";
export const CLASSE_DA_ABERTURA = "abertura-on";
// O atributo que o JS da abertura põe no <html> quando começa a tocar.
export const VIVA = "data-abertura-viva";
export const TRAVA_DA_ABERTURA = 4500;

export const SCRIPT_DA_ABERTURA = `(function(){try{
  var d = document.documentElement;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  if (location.hash) return;
  var nav = performance.getEntriesByType && performance.getEntriesByType("navigation")[0];
  if (nav && nav.type === "back_forward") return;
  if (sessionStorage.getItem(${JSON.stringify(CHAVE_DA_ABERTURA)})) return;
  sessionStorage.setItem(${JSON.stringify(CHAVE_DA_ABERTURA)}, "1");
  d.classList.add(${JSON.stringify(CLASSE_DA_ABERTURA)});
  setTimeout(function(){
    if (!d.hasAttribute(${JSON.stringify(VIVA)})) d.classList.remove(${JSON.stringify(CLASSE_DA_ABERTURA)});
  }, ${TRAVA_DA_ABERTURA});
}catch(e){}})();`;
