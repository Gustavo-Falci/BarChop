import type { ReactNode } from "react";
import { CabecalhoDoSite } from "../../../src/site/CabecalhoDoSite";

// As páginas do site que não são a home (preços, grátis, termos,
// privacidade) mantêm o cabeçalho claro de sempre. A home desenha o
// dela (CabecalhoDaHome), escuro sobre o topo. O grupo não entra na URL.
export default function LayoutDasPaginas({ children }: { children: ReactNode }) {
  return (
    <>
      <CabecalhoDoSite />
      {children}
    </>
  );
}
