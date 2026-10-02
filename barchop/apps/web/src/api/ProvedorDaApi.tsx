"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useParams } from "next/navigation";
import { apiDoCliente } from "../sessao/cliente-da-api";

// O que as telas do fluxo enxergam: as rotas públicas e as do cliente
// logado. `apiDoCliente` devolve o client inteiro justamente porque a
// mesma tela pode precisar das duas — pública antes de existir conta,
// do cliente depois do login.
export type ApiDoFluxo = ReturnType<typeof apiDoCliente>;

const Contexto = createContext<ApiDoFluxo | null>(null);

// `valor` existe pro teste passar o dublê. Em produção ninguém o
// informa, e o provider monta o client de verdade a partir do slug da
// rota — uma vez só, senão cada render criaria outro.
export function ProvedorDaApi({
  children,
  valor,
}: {
  children: ReactNode;
  valor?: ApiDoFluxo;
}) {
  const params = useParams<{ slug: string }>();
  const api = useMemo(
    () => valor ?? apiDoCliente(params.slug),
    [valor, params.slug]
  );

  return <Contexto.Provider value={api}>{children}</Contexto.Provider>;
}

export function useApi(): ApiDoFluxo {
  const api = useContext(Contexto);
  if (!api) {
    throw new Error("useApi precisa estar dentro de um ProvedorDaApi");
  }
  return api;
}
