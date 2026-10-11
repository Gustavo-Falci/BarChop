import localFont from "next/font/local";

// Clash Grotesk é self-hosted a partir do pacote completo do Fontshare
// que está em `font/` na raiz do monorepo, com a licença Indie junto
// (font/ClashGrotesk_Complete/License/FFL.txt). O `src` do
// next/font/local resolve relativo a este arquivo, e a doc instalada
// diz que a fonte pode morar em qualquer lugar do projeto — daí
// apontar pro pacote original em vez de duplicar os arquivos aqui.
//
// Só os dois pesos que os tokens citam: 700 no display e 600 no título
// menor. O resto do pacote fica pro Expo, no sub-projeto D, que precisa
// dos .otf.
export const clashGrotesk = localFont({
  src: [
    {
      path: "../../../font/ClashGrotesk_Complete/Fonts/WEB/fonts/ClashGrotesk-Semibold.woff2",
      weight: "600",
      style: "normal",
    },
    {
      path: "../../../font/ClashGrotesk_Complete/Fonts/WEB/fonts/ClashGrotesk-Bold.woff2",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--fonte-display",
  display: "swap",
});

// Inter também self-hosted, de `font/Inter/` (Inter 4.1 do rsms, licença
// OFL junto). Era next/font/google, que baixa no build: a VM sem acesso ao
// fonts.gstatic.com quebrou o build da imagem. Os arquivos são o recorte
// latino que o Google servia (mesmo unicode-range, via pyftsubset), nos
// dois pesos que os tokens citam.
export const inter = localFont({
  src: [
    {
      path: "../../../font/Inter/Inter-Regular-latin.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../../../font/Inter/Inter-SemiBold-latin.woff2",
      weight: "600",
      style: "normal",
    },
  ],
  // --fonte-inter, e não --fonte-corpo direto: a Aparência pode trocar a
  // fonte do texto e ainda querer a Inter nos títulos. O globals.css diz
  // que a --fonte-corpo é a Inter, e a página pública sobrescreve.
  variable: "--fonte-inter",
  display: "swap",
});

// As cinco fontes que a Aparência oferece pra página pública (marco F),
// do mesmo jeito que a Inter: recorte latino servido pelo Google, com a
// licença ao lado, no repositório — o build não depende de internet.
// Sem pré-carga: a @font-face entra em toda página, mas o navegador só
// baixa o arquivo quando alguém usa a família — o painel nunca usa.
// Cada chamada escrita por inteiro: o next/font lê as opções no build,
// estaticamente, e não aceita montá-las numa função.
export const roboto = localFont({
  src: [
    { path: "../../../font/Roboto/Roboto-Regular-latin.woff2", weight: "400", style: "normal" },
    { path: "../../../font/Roboto/Roboto-SemiBold-latin.woff2", weight: "600", style: "normal" },
    { path: "../../../font/Roboto/Roboto-Bold-latin.woff2", weight: "700", style: "normal" },
  ],
  variable: "--fonte-roboto",
  display: "swap",
  preload: false,
});

export const poppins = localFont({
  src: [
    { path: "../../../font/Poppins/Poppins-Regular-latin.woff2", weight: "400", style: "normal" },
    { path: "../../../font/Poppins/Poppins-SemiBold-latin.woff2", weight: "600", style: "normal" },
    { path: "../../../font/Poppins/Poppins-Bold-latin.woff2", weight: "700", style: "normal" },
  ],
  variable: "--fonte-poppins",
  display: "swap",
  preload: false,
});

export const montserrat = localFont({
  src: [
    { path: "../../../font/Montserrat/Montserrat-Regular-latin.woff2", weight: "400", style: "normal" },
    { path: "../../../font/Montserrat/Montserrat-SemiBold-latin.woff2", weight: "600", style: "normal" },
    { path: "../../../font/Montserrat/Montserrat-Bold-latin.woff2", weight: "700", style: "normal" },
  ],
  variable: "--fonte-montserrat",
  display: "swap",
  preload: false,
});

export const openSans = localFont({
  src: [
    { path: "../../../font/OpenSans/OpenSans-Regular-latin.woff2", weight: "400", style: "normal" },
    { path: "../../../font/OpenSans/OpenSans-SemiBold-latin.woff2", weight: "600", style: "normal" },
    { path: "../../../font/OpenSans/OpenSans-Bold-latin.woff2", weight: "700", style: "normal" },
  ],
  variable: "--fonte-open-sans",
  display: "swap",
  preload: false,
});

// A Lato não tem 600: o negrito de 700 serve também pros 600 da casa.
export const lato = localFont({
  src: [
    { path: "../../../font/Lato/Lato-Regular-latin.woff2", weight: "400", style: "normal" },
    { path: "../../../font/Lato/Lato-Bold-latin.woff2", weight: "600 700", style: "normal" },
  ],
  variable: "--fonte-lato",
  display: "swap",
  preload: false,
});

export const FONTES_DA_APARENCIA = [roboto, poppins, montserrat, openSans, lato];
