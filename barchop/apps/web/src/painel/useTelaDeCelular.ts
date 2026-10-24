"use client";

import { useSyncExternalStore } from "react";

// O mesmo corte da barra inferior (NavegacaoDoPainel.module.css).
export const CONSULTA_DO_CELULAR = "(max-width: 900px)";

function assinar(avisar: () => void): () => void {
  const consulta = window.matchMedia?.(CONSULTA_DO_CELULAR);
  if (!consulta) return () => {};
  consulta.addEventListener("change", avisar);
  return () => consulta.removeEventListener("change", avisar);
}

// Se a tela é a do celular, acompanhando o giro e o redimensionar. Pro
// que o CSS não resolve sozinho: trocar um componente por outro (a barra
// da agenda), e não só o desenho. Sem `matchMedia` (jsdom, servidor), é
// o desktop.
export function useTelaDeCelular(): boolean {
  return useSyncExternalStore(
    assinar,
    () => window.matchMedia?.(CONSULTA_DO_CELULAR).matches ?? false,
    () => false
  );
}
