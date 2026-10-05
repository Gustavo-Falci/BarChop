"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { apiDoSuporte } from "../sessao/cliente-da-api";

export type ApiDoSuporte = ReturnType<typeof apiDoSuporte>;

const Contexto = createContext<ApiDoSuporte | null>(null);

// O mesmo desenho do ProvedorDoPainel: o client de verdade montado uma
// vez, e o teste injeta o dublê por `valor`.
export function ProvedorDoSuporte({
  children,
  valor,
}: {
  children: ReactNode;
  valor?: ApiDoSuporte;
}) {
  const api = useMemo(() => valor ?? apiDoSuporte(), [valor]);

  return <Contexto.Provider value={api}>{children}</Contexto.Provider>;
}

export function useApiDoSuporte(): ApiDoSuporte {
  const api = useContext(Contexto);
  if (!api) {
    throw new Error("useApiDoSuporte precisa estar dentro de um ProvedorDoSuporte");
  }
  return api;
}
