import type { Metadata } from "next";

import { clashGrotesk, inter } from "./fontes";
import { cssDeTokens } from "./tokens-css";
import { SCRIPT_DA_BARRA } from "../src/painel/barra";
import { SCRIPT_DE_TEMA } from "../src/painel/tema";
import "./globals.css";

export const metadata: Metadata = {
  title: "BarChop",
  description: "Agenda de barbearia",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // As duas fontes entram como variável CSS, não como className de
    // família: o CSS Module de cada componente escolhe qual usar via
    // var(--fonte-display) ou var(--fonte-corpo).
    //
    // `suppressHydrationWarning` porque o SCRIPT_DE_TEMA abaixo roda no
    // <head> antes da primeira pintura e escreve `data-theme` neste
    // mesmo <html>. O HTML que o servidor manda não tem esse atributo —
    // ele não pode ter: o tema vem de localStorage e de matchMedia, que
    // só existem no navegador. Quando o React hidrata, acha um atributo
    // a mais do que renderizou e reclama em toda rota. Ele não desfaz a
    // diferença ("This won't be patched up"), então o tema continua
    // certo — o que se ganha é o console limpo.
    //
    // A prop vale só um nível: este <html>, não os filhos. Qualquer
    // divergência dentro do <body> continua sendo denunciada.
    <html
      lang="pt-BR"
      className={`${clashGrotesk.variable} ${inter.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_DE_TEMA }} />
        {/* Mesma razão do script acima, para a largura da lateral: o
            atributo precisa estar no <html> antes de o CSS que o lê ser
            aplicado, senão a barra pisca de larga para estreita. */}
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_DA_BARRA }} />
        <style dangerouslySetInnerHTML={{ __html: cssDeTokens }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
