import {
  normalizarAparencia,
  paletaDaAparencia,
  personalizada,
  type Aparencia,
  type CoresDaPagina,
} from "@barchop/formato";

// A Aparência na página pública (plano aparencia.plan.md, marco C). O
// layout de /[slug] põe na página o que sai daqui: um <style> com a
// paleta da barbearia e um <script> com o modo padrão. Barbearia que
// nunca mexeu continua com os tokens de hoje — os dois saem vazios.

const HEX = /^#[0-9A-F]{6}$/;

// Mesma conversão do app/tokens-css.ts: `paperSoft` → `--cor-paper-soft`.
// Só passa hex: o CSS entra por dangerouslySetInnerHTML, e o que não
// for cor some aqui mesmo que tenha passado por todo o resto.
function vars(cores: CoresDaPagina): string {
  return Object.entries(cores)
    .filter(([, valor]) => HEX.test(valor))
    .map(([nome, valor]) => `  --cor-${nome.replace(/[A-Z]/g, (letra) => `-${letra.toLowerCase()}`)}: ${valor};`)
    .join("\n");
}

// Os três blocos do tokens-css.ts, na mesma forma e com a mesma
// especificidade: vindo depois no documento, cada um cobre o seu par. Sem
// um deles, o escuro do sistema (ou do botão) voltaria pra paleta da casa.
export function cssDaAparencia(valor: Aparencia): string {
  // Normaliza de novo: quem chama pode ter um objeto que não passou pela
  // API (a prévia do painel, no marco E).
  const aparencia = normalizarAparencia(valor);
  if (aparencia.tema === "barchop" && !personalizada(aparencia)) return "";
  const { claro, escuro } = paletaDaAparencia(aparencia);
  return `:root {
${vars(claro)}
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
${vars(escuro)}
  }
}

[data-theme="dark"] {
${vars(escuro)}
}`;
}

// Onde o visitante guarda a escolha do botão lua/sol: uma por
// barbearia, e nunca a `painel.tema` (a escolha do barbeiro não vaza pra
// página pública — regra do #96).
export function chaveDoModo(slug: string): string {
  return `pagina.${slug}.modo`;
}

// JSON dentro de <script>: sem "<", nada fecha a tag antes da hora.
function emScript(valor: string): string {
  return JSON.stringify(valor).replace(/</g, "\\u003c");
}

// Roda no começo do <body>, antes do conteúdo: o tema certo já na
// primeira pintura. O script de tema do layout raiz tirou o data-theme
// das rotas públicas; aqui ele volta quando o dono fixou um modo, ou o
// visitante escolheu um pelo botão. Automático e sem botão (o padrão):
// nenhum script — fica o prefers-color-scheme, como sempre.
export function scriptDoModo(slug: string, valor: Aparencia): string {
  const aparencia = normalizarAparencia(valor);
  if (aparencia.modoPadrao === "automatico" && !aparencia.clienteTrocaModo) return "";
  return `(function(){try{
  var modo = ${emScript(aparencia.modoPadrao)};
  if (${aparencia.clienteTrocaModo ? "true" : "false"}) {
    var escolhido = localStorage.getItem(${emScript(chaveDoModo(slug))});
    if (escolhido === "claro" || escolhido === "escuro") modo = escolhido;
  }
  var raiz = document.documentElement;
  if (modo === "claro") raiz.setAttribute("data-theme", "light");
  else if (modo === "escuro") raiz.setAttribute("data-theme", "dark");
  else raiz.removeAttribute("data-theme");
}catch(e){}})();`;
}
