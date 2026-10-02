import {
  borderWidth,
  colors,
  fontSize,
  radius,
  spacing,
} from "@barchop/design-tokens";

// Os tokens são objetos JS puros (ver packages/design-tokens). No web
// a gente traduz pra CSS custom properties uma vez, no layout raiz,
// e daí em diante o CSS usa var(--cor-*) normalmente.
//
// O parâmetro é Record<string, string> e não Colors porque os tokens
// usam `as const`: colors.light e colors.dark acabam com tipos literais
// distintos, e o tipo Colors só descreve o claro.
function varsDeCores(tema: Record<string, string>): string {
  return Object.entries(tema)
    .map(([nome, valor]) => `  --cor-${kebab(nome)}: ${valor};`)
    .join("\n");
}

function kebab(nome: string): string {
  return nome.replace(/[A-Z]/g, (letra) => `-${letra.toLowerCase()}`);
}

// Os quatro grupos de medida viram custom property do mesmo jeito, só
// mudando o prefixo — o CSS Module de cada componente lê var(--espaco-md)
// em vez de repetir o número que o design system escolheu.
function varsEmPixels(
  prefixo: string,
  escala: Record<string, number>
): string {
  return Object.entries(escala)
    .map(([nome, valor]) => `  --${prefixo}-${nome}: ${valor}px;`)
    .join("\n");
}

const varsDeRaio = varsEmPixels("raio", radius);
const varsDeEspaco = varsEmPixels("espaco", spacing);
const varsDeBorda = varsEmPixels("borda", borderWidth);
const varsDeTexto = varsEmPixels("texto", fontSize);

// Três blocos, não dois. Sem a guarda :not([data-theme="light"]), quem
// escolheu claro continua escurecendo num sistema escuro, porque o
// @media venceria. Sem [data-theme="dark"], escolher escuro não faz
// nada num sistema claro. Quem escreve o atributo é o script inline do
// layout raiz — ver src/painel/tema.ts.
// `color-scheme` acompanha cada bloco porque ele é o que manda nas
// partes que o navegador desenha sozinho: o ícone do relógio do
// <input type="time">, o calendário do date, a barra de rolagem e o
// destaque de seleção. Sem ele, o relógio dos horários de
// funcionamento sai com as cores do modo claro sobre o fundo escuro e
// some. É a única propriedade daqui que não é custom property — e é de
// propósito: nenhuma variável alcança esses controles.
export const cssDeTokens = `:root {
  color-scheme: light;
${varsDeCores(colors.light)}
${varsDeRaio}
${varsDeEspaco}
${varsDeBorda}
${varsDeTexto}
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    color-scheme: dark;
${varsDeCores(colors.dark)}
  }
}

[data-theme="dark"] {
  color-scheme: dark;
${varsDeCores(colors.dark)}
}`;
