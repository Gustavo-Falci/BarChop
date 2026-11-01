"use client";

import { useCallback, useSyncExternalStore } from "react";

// O mesmo corte da barra inferior (NavegacaoDoPainel.module.css).
export const CONSULTA_DO_CELULAR = "(max-width: 900px)";

// Se uma consulta de mídia vale agora, acompanhando o giro e o
// redimensionar. Pro que o CSS não resolve sozinho: trocar um componente
// por outro, e não só o desenho. Sem `matchMedia` (jsdom, servidor), não
// vale — é o desktop.
export function useMidia(consulta: string): boolean {
  const assinar = useCallback(
    (avisar: () => void) => {
      const lista = window.matchMedia?.(consulta);
      if (!lista) return () => {};
      lista.addEventListener("change", avisar);
      return () => lista.removeEventListener("change", avisar);
    },
    [consulta]
  );
  return useSyncExternalStore(
    assinar,
    () => window.matchMedia?.(consulta).matches ?? false,
    () => false
  );
}

// Se a tela é a do celular (abaixo da barra inferior): a barra da agenda,
// o "Fechar o dia" do Caixa.
export function useTelaDeCelular(): boolean {
  return useMidia(CONSULTA_DO_CELULAR);
}
