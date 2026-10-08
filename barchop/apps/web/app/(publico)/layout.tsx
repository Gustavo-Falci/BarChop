import type { ReactNode } from "react";

// O fluxo do cliente segue o tema do sistema de quem abre (pedido do
// dono, 2026-10-08): quem usa o celular no escuro não leva um clarão ao
// abrir o link. Quem decide é o script de tema do layout raiz, que aqui
// não escreve data-theme nenhum — os tokens caem no prefers-color-scheme.
// Ver src/painel/tema.ts.
export default function LayoutPublico({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
