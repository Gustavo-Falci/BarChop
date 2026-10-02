import type { ReactNode } from "react";

// Este layout só existe pra dar um ponto de entrada estático fora do
// grupo (guardado) — o tema em si (sistema, com troca manual salva em
// localStorage) mora em `src/painel/tema.ts`, aplicado dentro da árvore
// guardada. Este `<div>` não carrega classe nem atributo de tema.
export default function LayoutPainel({ children }: { children: ReactNode }) {
  return <div>{children}</div>;
}
