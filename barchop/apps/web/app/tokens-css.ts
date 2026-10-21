import {
  borderWidth,
  colors,
  fontSize,
  radius,
  spacing,
} from "@barchop/design-tokens";

import { CURVA, DESLIZE, DURACAO, ESCALA, curvaCss, emMs } from "../src/movimento/tokens";

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

// A profundidade vem de sombra difusa, não mais do deslocamento sólido.
// Três degraus: o cartão (1), o que flutua sobre a tela — menu, janela —
// (2), e o botão, que continua afundando nos 2px da sua sombra. No
// escuro a sombra é mais densa (preto sobre quase preto) e o cartão
// ganha um fio claro de 2,5% no topo, que é o que o separa do fundo.
const SOMBRAS = {
  claro: {
    "sombra-1": "0 1px 2px rgba(38, 34, 28, 0.05), 0 8px 24px -16px rgba(38, 34, 28, 0.22)",
    "sombra-2": "0 2px 6px rgba(38, 34, 28, 0.06), 0 18px 40px -12px rgba(38, 34, 28, 0.28)",
    "sombra-botao": "0 2px 0 rgba(38, 34, 28, 0.22)",
  },
  escuro: {
    "sombra-1": "inset 0 1px 0 rgba(255, 255, 255, 0.025), 0 14px 32px -20px rgba(0, 0, 0, 0.75)",
    "sombra-2": "inset 0 1px 0 rgba(255, 255, 255, 0.04), 0 18px 44px -12px rgba(0, 0, 0, 0.8)",
    "sombra-botao": "0 2px 0 rgba(0, 0, 0, 0.35)",
  },
} as const;

function varsDeSombra(modo: keyof typeof SOMBRAS): string {
  return Object.entries(SOMBRAS[modo])
    .map(([nome, valor]) => `  --${nome}: ${valor};`)
    .join("\n");
}

// O movimento do painel: entrada que desacelera ao chegar, saída que
// acelera ao ir. Os números vêm de src/movimento/tokens.ts, os mesmos
// que a lib `motion` usa — CSS e JS não podem discordar do tempo.
const varsDeMovimento = `  --curva-entrada: ${curvaCss(CURVA.entrada)};
  --curva-saida: ${curvaCss(CURVA.saida)};
  --duracao-instante: ${emMs(DURACAO.instante)};
  --duracao-curta: ${emMs(DURACAO.curta)};
  --duracao-media: ${emMs(DURACAO.media)};
  --duracao-longa: ${emMs(DURACAO.longa)};
  --escala-janela: ${ESCALA.janela};
  --escala-aperto: ${ESCALA.aperto};
  --deslize-curto: ${DESLIZE.curto}px;
  --deslize-normal: ${DESLIZE.normal}px;`;

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
${varsDeSombra("claro")}
${varsDeMovimento}
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    color-scheme: dark;
${varsDeCores(colors.dark)}
${varsDeSombra("escuro")}
  }
}

[data-theme="dark"] {
  color-scheme: dark;
${varsDeCores(colors.dark)}
${varsDeSombra("escuro")}
}`;
