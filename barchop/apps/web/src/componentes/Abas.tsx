"use client";

import { useId, type ReactNode } from "react";
import { Indicador } from "../movimento/Indicador";
import estilos from "./Abas.module.css";

// Abas de uma tela comprida (análise de 17/10): cada grupo cabe numa
// altura de janela, em vez de seis seções empilhadas.
//
// Todos os painéis ficam montados, e os de fora da aba atual vão com
// `hidden`: desmontar apagaria o que a pessoa mudou e ainda não salvou
// (a semana da jornada, a marcação dos serviços) só por ela ter olhado
// outra aba.
export function Abas<Id extends string>({
  rotulo,
  abas,
  atual,
  aoTrocar,
  paineis,
}: {
  rotulo: string;
  abas: readonly { id: Id; rotulo: string }[];
  atual: Id;
  aoTrocar: (id: Id) => void;
  paineis: Record<Id, ReactNode>;
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
            aria-controls={`${id}-painel-${aba.id}`}
            aria-selected={atual === aba.id}
            className={estilos.aba}
            onClick={() => aoTrocar(aba.id)}
          >
            {atual === aba.id ? <Indicador grupo={id} className={estilos.traco} /> : null}
            {aba.rotulo}
          </button>
        ))}
      </div>
      {abas.map((aba) => (
        <div
          key={aba.id}
          role="tabpanel"
          id={`${id}-painel-${aba.id}`}
          aria-labelledby={`${id}-aba-${aba.id}`}
          hidden={atual !== aba.id}
          className={estilos.painel}
        >
          {paineis[aba.id]}
        </div>
      ))}
    </>
  );
}
