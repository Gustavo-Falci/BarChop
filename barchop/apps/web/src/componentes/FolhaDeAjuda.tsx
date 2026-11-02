"use client";

import type { ReactNode } from "react";
import { Folha } from "./Folha";

// Uma ajuda que abre numa folha (redesenho das Configurações, PR 9:
// Pagamentos online). Só mostra; fecha pelo X, pelo fundo ou pelo Esc.
// Quem abriu desmonta a folha no `aoFechar`.
export function FolhaDeAjuda({
  titulo,
  children,
  aoFechar,
}: {
  titulo: string;
  children: ReactNode;
  aoFechar: () => void;
}) {
  return (
    <Folha titulo={titulo} aoFechar={aoFechar}>
      {children}
    </Folha>
  );
}
