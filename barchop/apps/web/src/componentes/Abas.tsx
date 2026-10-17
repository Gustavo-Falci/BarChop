"use client";

import { useId, type ReactNode } from "react";
import estilos from "./Abas.module.css";

// Abas de uma tela comprida (análise de 17/10): cada grupo cabe numa
// altura de janela, em vez de seis seções empilhadas. O conteúdo da aba
// vem por `children`; quem decide qual está aberta é quem chama.
export function Abas<Id extends string>({
  rotulo,
  abas,
  atual,
  aoTrocar,
  children,
}: {
  rotulo: string;
  abas: readonly { id: Id; rotulo: string }[];
  atual: Id;
  aoTrocar: (id: Id) => void;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <>
      <div role="tablist" aria-label={rotulo} className={estilos.abas}>
        {abas.map((aba) => (
          <button
            key={aba.id}
            type="button"
            role="tab"
            id={`${id}-aba-${aba.id}`}
            aria-controls={`${id}-painel`}
            aria-selected={atual === aba.id}
            className={estilos.aba}
            onClick={() => aoTrocar(aba.id)}
          >
            {aba.rotulo}
          </button>
        ))}
      </div>
      {/* `key` na aba: trocar de aba remonta o painel e a entrada em
          fade (150ms) acontece de novo. */}
      <div
        key={atual}
        role="tabpanel"
        id={`${id}-painel`}
        aria-labelledby={`${id}-aba-${atual}`}
        className={estilos.painel}
      >
        {children}
      </div>
    </>
  );
}
