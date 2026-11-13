import localFont from "next/font/local";

// Os pesos leves da Clash Grotesk, só no topo da home (home nova, marco
// 2): o 200 do "Bar" gigante e o 300 da metade leve da promessa. Do mesmo
// pacote do Fontshare que o app/fontes.ts usa (licença Indie em
// font/ClashGrotesk_Complete/License). Outra família, não mais pesos da
// --fonte-display: as outras páginas não baixam estes arquivos, e o
// next/font pré-carrega só na rota da home.
export const clashLeve = localFont({
  src: [
    {
      path: "../../../../font/ClashGrotesk_Complete/Fonts/WEB/fonts/ClashGrotesk-Extralight.woff2",
      weight: "200",
      style: "normal",
    },
    {
      path: "../../../../font/ClashGrotesk_Complete/Fonts/WEB/fonts/ClashGrotesk-Light.woff2",
      weight: "300",
      style: "normal",
    },
  ],
  variable: "--fonte-display-leve",
  display: "swap",
  // Sem pré-carga, como a Clash e a Inter do app/fontes.ts (marco 6).
  preload: false,
});
