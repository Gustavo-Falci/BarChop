import { Inter } from "next/font/google";
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

// Inter vem pelo next/font/google, que baixa no build e serve do
// próprio domínio — nenhuma requisição do visitante vai pro Google.
export const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "600"],
  variable: "--fonte-corpo",
  display: "swap",
});
