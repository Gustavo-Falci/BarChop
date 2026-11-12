import type { Metadata } from "next";
import type { ReactNode } from "react";
import { baseDoSite } from "../../src/site/rastreadores";
import { RodapeDoSite } from "../../src/site/RodapeDoSite";

// Só no site: as páginas das barbearias moram em outro host, e a base
// daqui apontaria a prévia delas pro endereço errado.
export const metadata: Metadata = {
  metadataBase: baseDoSite(process.env.NEXT_PUBLIC_URL_DO_SITE),
};

// O site de marketing (ADR-0006), servido na raiz e no www. O cabeçalho
// fica com cada parte: a home desenha o dela (escuro sobre o topo) e as
// outras páginas, o de sempre, no layout do grupo (paginas). Estático:
// nada aqui lê header, cookie ou API, e nada importa do painel. O tema
// claro vem do script do layout raiz, que trava data-theme="light" no
// host do site (src/painel/tema.ts).
export default function LayoutDoSite({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <RodapeDoSite />
    </>
  );
}
