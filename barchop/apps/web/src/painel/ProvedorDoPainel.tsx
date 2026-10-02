"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { apiDoPainel } from "../sessao/cliente-da-api";

// O escopo do cliente logado fica de fora: o painel nunca chama rota de
// `clientes-me`, e expor o client inteiro convidaria a isso.
export type ApiDoPainel = ReturnType<typeof apiDoPainel>;

const Contexto = createContext<ApiDoPainel | null>(null);

// `valor` existe pro teste passar o dublê. Em produção ninguém informa,
// e o provedor monta o client de verdade uma vez só — senão cada render
// criaria outro.
export function ProvedorDoPainel({
  children,
  valor,
}: {
  children: ReactNode;
  valor?: ApiDoPainel;
}) {
  const api = useMemo(() => valor ?? apiDoPainel(), [valor]);

  return <Contexto.Provider value={api}>{children}</Contexto.Provider>;
}

export function useApiDoPainel(): ApiDoPainel {
  const api = useContext(Contexto);
  if (!api) {
    throw new Error("useApiDoPainel precisa estar dentro de um ProvedorDoPainel");
  }
  return api;
}
