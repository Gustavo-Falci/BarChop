import type { ReactNode } from "react";
import { CabecalhoDoSite } from "../../src/site/CabecalhoDoSite";
import { RodapeDoSite } from "../../src/site/RodapeDoSite";

// O site de marketing (ADR-0006), servido na raiz e no www. Estático:
// nada aqui lê header, cookie ou API, e nada importa do painel. O tema
// claro já vem do script do layout raiz, que trava data-theme="light"
// em toda rota fora do /painel.
export default function LayoutDoSite({ children }: { children: ReactNode }) {
  return (
    <>
      <CabecalhoDoSite />
      {children}
      <RodapeDoSite />
    </>
  );
}
