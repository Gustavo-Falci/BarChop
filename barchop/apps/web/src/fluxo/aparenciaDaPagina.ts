import {
  misturar,
  normalizarAparencia,
  paletaDaAparencia,
  personalizada,
  textoDaMarca,
  type Aparencia,
  type Botao,
  type Cantos,
  type Cards,
  type CoresDaPagina,
} from "@barchop/formato";

// A Aparência na página pública (plano aparencia.plan.md, marcos C e G).
// O layout de /[slug] põe na página o que sai daqui: um <style> com a
// paleta e o ajuste fino da barbearia, e um <script> com o modo padrão.
// Barbearia que nunca mexeu continua com os tokens de hoje — os dois saem
// vazios.

// Maiúsculas ou minúsculas: os tokens da casa têm as duas (#3d3410). Um
// filtro só de maiúsculas tirava do bloco escuro as cores da casa, e o
// bloco claro vazava pro escuro.
const HEX = /^#[0-9A-F]{6}$/i;

// Mesma conversão do app/tokens-css.ts: `paperSoft` → `--cor-paper-soft`.
// Só passa hex: o CSS entra por dangerouslySetInnerHTML, e o que não
// for cor some aqui mesmo que tenha passado por todo o resto.
function vars(cores: Record<string, string>): string {
  return Object.entries(cores)
    .filter(([, valor]) => HEX.test(valor))
    .map(
      ([nome, valor]) =>
        `  --cor-${nome.replace(/[A-Z]/g, (letra) => `-${letra.toLowerCase()}`)}: ${valor.toUpperCase()};`
    )
    .join("\n");
}

// Além da paleta, duas cores que só o botão principal usa: a marca como
// texto (Contorno) e o fim do degradê (Gradiente) — puxado pro lado
// oposto do texto, então o texto só ganha contraste.
function comExtras(cores: CoresDaPagina): Record<string, string> {
  return {
    ...cores,
    accentText: textoDaMarca(cores),
    accentFim: misturar(cores.accent, cores.onAccent === "#FFFFFF" ? "#000000" : "#FFFFFF", 0.25),
  };
}

// O ajuste fino vira variáveis que os componentes leem com o valor de
// hoje como reserva (`var(--raio-botao, var(--raio-md))`): sem elas,
// nada muda — nem no painel, que usa os mesmos componentes. Trechos
// fixos por opção; nada do que o dono escolhe entra cru no CSS.
const DOS_CANTOS: Record<Cantos, string[]> = {
  arredondados: [],
  retos: ["--raio-botao: 4px;", "--raio-cartao: 4px;", "--raio-campo: 4px;"],
  pilula: ["--raio-botao: 999px;", "--raio-cartao: 20px;"],
};

const DO_BOTAO: Record<Botao, string[]> = {
  solido: [],
  contorno: [
    "--botao-fundo: var(--cor-surface);",
    "--botao-texto: var(--cor-accent-text);",
    "--botao-borda: var(--cor-accent-text);",
  ],
  gradiente: ["--botao-fundo: linear-gradient(135deg, var(--cor-accent), var(--cor-accent-fim));"],
};

const DOS_CARDS: Record<Cards, string[]> = {
  elevado: [],
  plano: ["--cartao-borda: transparent;", "--cartao-sombra: none;", "--cartao-sombra-hover: none;"],
  borda: ["--cartao-sombra: none;", "--cartao-sombra-hover: none;"],
};

// Os três blocos do tokens-css.ts, na mesma forma e com a mesma
// especificidade: vindo depois no documento, cada um cobre o seu par. Sem
// um deles, o escuro do sistema (ou do botão) voltaria pra paleta da casa.
function blocosDeCor(aparencia: Aparencia): string {
  const { claro, escuro } = paletaDaAparencia(aparencia);
  return `:root {
${vars(comExtras(claro))}
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
${vars(comExtras(escuro))}
  }
}

[data-theme="dark"] {
${vars(comExtras(escuro))}
}`;
}

export function cssDaAparencia(valor: Aparencia): string {
  // Normaliza de novo: quem chama pode ter um objeto que não passou pela
  // API (a prévia do painel, no marco E).
  const aparencia = normalizarAparencia(valor);
  const partes: string[] = [];

  // As cores saem quando o tema não é o da casa puro — ou quando o botão
  // precisa das duas cores extras, que dependem do modo.
  const coresDaCasa = aparencia.tema === "barchop" && !personalizada(aparencia);
  if (!coresDaCasa || aparencia.botao !== "solido") partes.push(blocosDeCor(aparencia));

  const ajuste = [...DOS_CANTOS[aparencia.cantos], ...DO_BOTAO[aparencia.botao], ...DOS_CARDS[aparencia.cards]];
  if (ajuste.length > 0) partes.push(`:root {\n${ajuste.map((linha) => `  ${linha}`).join("\n")}\n}`);

  return partes.join("\n\n");
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
