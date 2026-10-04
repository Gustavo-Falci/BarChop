"use client";

import { createContext, useCallback, useContext, type ReactNode } from "react";
import { useParams } from "next/navigation";
import { noHostDaBarbearia } from "./endereco";

// De qual barbearia é o host que pediu a página — o que o proxy.ts disse
// no cabeçalho, lido pelo layout de /[slug] no servidor. Nulo fora do
// host de uma barbearia (o /[slug] do desenvolvimento, os testes).
const Contexto = createContext<string | null>(null);

export function ProvedorDoHost({
  barbearia,
  children,
}: {
  barbearia: string | null;
  children: ReactNode;
}) {
  return <Contexto.Provider value={barbearia}>{children}</Contexto.Provider>;
}

// Leva um caminho com o slug na frente pro que vale neste host: igual
// em /[slug], sem o slug no host da barbearia. Todo link e todo
// router.push do fluxo passa por aqui.
export function useNoHost(): (caminho: string) => string {
  const barbeariaDoHost = useContext(Contexto);
  const { slug } = useParams<{ slug: string }>();
  return useCallback(
    (caminho: string) => noHostDaBarbearia(caminho, slug, barbeariaDoHost),
    [slug, barbeariaDoHost]
  );
}
