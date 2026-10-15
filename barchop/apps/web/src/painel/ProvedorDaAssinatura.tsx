"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { ResumoDaAssinatura } from "@barchop/types";
import { useRequisicao } from "../api/useRequisicao";
import { useApiDoPainel } from "./ProvedorDoPainel";
import { usePainel } from "./SessaoDoPainel";

// A assinatura do BarChop, lida uma vez pro painel inteiro: a faixa do
// topo, o menu da conta e a tela do plano mostram a mesma. Só o dono a
// vê; pros outros papéis nem se pede, porque a API responderia 403.
interface AssinaturaDoPainel {
  // Nulo enquanto carrega, se falhou, ou pra quem não é dono.
  resumo: ResumoDaAssinatura | null;
  recarregar: () => void;
}

const Contexto = createContext<AssinaturaDoPainel>({ resumo: null, recarregar: () => {} });

export function ProvedorDaAssinatura({ children }: { children: ReactNode }) {
  const api = useApiDoPainel();
  const { perfil } = usePainel();
  const dono = perfil.papel === "dono";
  const { dados, recarregar } = useRequisicao(
    () => (dono ? api.barbeiro.assinatura() : Promise.resolve(null)),
    [dono]
  );

  return <Contexto.Provider value={{ resumo: dados, recarregar }}>{children}</Contexto.Provider>;
}

export function useAssinatura(): AssinaturaDoPainel {
  return useContext(Contexto);
}
